import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Switch, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Card, Chips, Field, HeroCard, Icon, IconBadge, Label, Row, Screen, SectionTitle } from '@/components/ui';
import { getLocalProfile } from '@/db/business-profile';
import { listCatalogIngredients, type CatalogIngredient } from '@/db/catalog';
import { getSetting, setSettings } from '@/db/database';
import { getAiScanStatus, savePurchase, scanInvoice, type InvoiceFile } from '@/db/purchases';
import { canManage, useBusiness } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD, round2 } from '@/lib/calc';
import { cleanDate, cleanNcf, cleanRnc, invoiceTotal, matchIngredient, toPurchaseLines, type PurchaseLine, type ScannedInvoice } from '@/lib/invoice-scan';
import { parseInvoiceText, type TextCandidate } from '@/lib/invoice-text';
import { unitName, UNITS } from '@/lib/units';

const AI_KEY = 'factura_ia';

/** Lectura gratis en el celular (ML Kit en Android, Vision en iPhone). No existe en la PC. */
async function phoneOcr(uri: string): Promise<string[] | null> {
  if (Platform.OS === 'web') return null;
  try {
    const mod = await import('expo-text-extractor');
    if (!mod.isSupported) return null;
    return await mod.extractTextFromImage(uri);
  } catch {
    return null; // app vieja sin el módulo: hay que instalar el APK nuevo
  }
}

/** Achica la foto (las de celular pesan varios MB) y la pasa a base64. */
async function photoToFile(uri: string): Promise<InvoiceFile> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 1600 }).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
  if (!out.base64) throw new Error('No se pudo preparar la foto.');
  return { data: out.base64, media_type: 'image/jpeg' };
}

async function pdfToFile(asset: DocumentPicker.DocumentPickerAsset): Promise<InvoiceFile> {
  if (Platform.OS === 'web' && asset.file) {
    const buf = new Uint8Array(await asset.file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { data: btoa(bin), media_type: 'application/pdf' };
  }
  const { File } = await import('expo-file-system');
  return { data: await new File(asset.uri).base64(), media_type: 'application/pdf' };
}

type Header = { supplier: string; rnc: string; ncf: string; date: string; total: string };

/** Escanear una factura de compra: se registra el gasto y los productos entran al inventario. */
export default function ScanInvoiceScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [phase, setPhase] = useState<'elegir' | 'leyendo' | 'revisar' | 'guardando'>('elegir');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [header, setHeader] = useState<Header>({ supplier: '', rnc: '', ncf: '', date: '', total: '' });
  const [itbis, setItbis] = useState<number | null>(null);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [ingredients, setIngredients] = useState<CatalogIngredient[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<TextCandidate[]>([]);
  const [aiChosen, setAiChosen] = useState(false);
  const [ai, setAi] = useState<{ used: number; limit: number } | null>(null);
  useEffect(() => {
    void getSetting(db, AI_KEY).then((v) => setAiChosen(v === '1'));
    void getAiScanStatus(ctx).then(setAi);
  }, [db, ctx]);
  // La IA solo se usa si el negocio la tiene activada (límite > 0) y le quedan lecturas este mes.
  const aiAvailable = !!ai && ai.limit > 0;
  const aiLeft = ai ? Math.max(0, ai.limit - ai.used) : 0;
  const useAi = aiAvailable && aiChosen && aiLeft > 0;

  if (!canManage(ctx)) {
    return (
      <Screen back title="Escanear factura">
        <Label muted>Solo el dueño o un gerente puede registrar facturas de compra.</Label>
      </Screen>
    );
  }

  /** Pone en pantalla lo leído para revisarlo. */
  function show(inv: ScannedInvoice, ings: CatalogIngredient[], found: TextCandidate[]) {
    const ls = toPurchaseLines(inv, ings);
    setIngredients(ings);
    setLines(ls);
    setCandidates(found);
    setItbis(inv.itbis);
    setNotes(inv.notes ?? '');
    setHeader({
      supplier: inv.supplier_name ?? '',
      rnc: cleanRnc(inv.supplier_rnc) ?? (inv.supplier_rnc ?? ''),
      ncf: cleanNcf(inv.ncf) ?? '',
      date: cleanDate(inv.date) ?? '',
      total: String(invoiceTotal(inv, ls) || ''),
    });
    setOpen(null);
    setPhase('revisar');
  }

  /** Lee la factura: con IA si está activada; si no, gratis en el celular. */
  async function read(get: () => Promise<{ uri: string | null; file: () => Promise<InvoiceFile> } | null>) {
    setError('');
    try {
      const picked = await get();
      if (!picked) return;
      setPhase('leyendo');
      const ings = await listCatalogIngredients(db);
      if (useAi) {
        try {
          const inv = await scanInvoice(db, ctx, await picked.file());
          if (!inv.is_invoice) throw new Error(inv.notes || 'Eso no parece una factura de compra. Prueba con otra foto.');
          setAi((a) => (a ? { ...a, used: a.used + 1 } : a));
          return show(inv, ings, []);
        } catch (e) {
          // Sin lecturas con IA este mes: se sigue con la lectura gratis.
          if (!(e as { limitReached?: boolean }).limitReached || !picked.uri) throw e;
          setAi((a) => (a ? { ...a, used: a.limit } : a));
        }
      }
      if (!picked.uri) throw new Error('La lectura gratis funciona con fotos. Para PDF activa la lectura con IA o toma una foto de la factura.');
      const blocks = await phoneOcr(picked.uri);
      if (!blocks) {
        throw new Error(
          Platform.OS === 'web'
            ? 'En la PC la lectura gratis no está disponible: escanea desde el celular o la tablet.'
            : 'Este celular no tiene el lector de texto. Instala la versión nueva de la app (APK).',
        );
      }
      if (!blocks.join('').trim()) throw new Error('No se encontró texto en la foto. Tómala de nuevo con más luz y más cerca.');
      const profile = await getLocalProfile(db).catch(() => null);
      const reading = parseInvoiceText(blocks, profile?.rnc);
      show(
        { ...reading.invoice, notes: 'Lectura gratis en el celular: revisa los datos y toca los productos de la lista «Texto encontrado» para agregarlos.' },
        ings,
        reading.candidates,
      );
    } catch (e) {
      setPhase('elegir');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function addCandidate(c: TextCandidate) {
    const match = matchIngredient(c.name, ingredients);
    const key = `c${Date.now()}`;
    setLines((ls) => [
      ...ls,
      { key, description: c.text, name: match?.name ?? c.name, quantity: c.quantity ?? 1, unit: match?.unit ?? 'unidad', cost: c.amount ?? 0, target: match?.id ?? 'nuevo' },
    ]);
    setCandidates((cs) => cs.filter((x) => x !== c));
    setOpen(key);
  }

  function addManual() {
    const key = `m${Date.now()}`;
    setLines((ls) => [...ls, { key, description: '', name: '', quantity: 1, unit: 'unidad', cost: 0, target: 'nuevo' }]);
    setOpen(key);
  }

  const camera = () =>
    read(async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) throw new Error('Permite la cámara para tomar la foto de la factura.');
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (r.canceled || !r.assets[0]) return null;
      const uri = r.assets[0].uri;
      setPreview(uri);
      return { uri, file: () => photoToFile(uri) };
    });
  const gallery = () =>
    read(async () => {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (r.canceled || !r.assets[0]) return null;
      const uri = r.assets[0].uri;
      setPreview(uri);
      return { uri, file: () => photoToFile(uri) };
    });
  const pdf = () =>
    read(async () => {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (r.canceled || !r.assets[0]) return null;
      setPreview(null);
      const asset = r.assets[0];
      return { uri: null, file: () => pdfToFile(asset) };
    });

  const update = (key: string, change: Partial<PurchaseLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const linesTotal = round2(lines.reduce((n, l) => n + l.cost, 0));
  const total = Number(header.total.replace(/,/g, '')) || 0;
  const toStock = lines.filter((l) => l.target !== 'no');

  async function save() {
    const date = header.date.trim();
    if (date && !cleanDate(date)) return Alert.alert('Revisa la fecha', 'Escríbela así: 2026-11-14 (año-mes-día) y que no sea en el futuro.');
    setPhase('guardando');
    try {
      const r = await savePurchase(db, ctx, {
        supplier: header.supplier.trim(),
        rnc: cleanRnc(header.rnc),
        ncf: cleanNcf(header.ncf),
        date: date || null,
        total,
        lines,
      });
      Alert.alert('✅ Factura registrada', `Gasto de ${formatRD(total)}${r.stocked ? ` y ${r.stocked} ${r.stocked === 1 ? 'producto' : 'productos'} al inventario` : ''}.`);
      router.back();
    } catch (e) {
      setPhase('revisar');
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : String(e));
    }
  }

  if (phase === 'leyendo' || phase === 'guardando') {
    return (
      <Screen back title="Escanear factura" subtitle={ctx.locationName}>
        <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 40 }}>
          <ActivityIndicator size="large" color={t.primary} />
          <Label bold size={17}>{phase === 'leyendo' ? 'Leyendo la factura…' : 'Guardando…'}</Label>
          <Label muted size={14} style={{ textAlign: 'center' }}>
            {phase === 'leyendo' ? 'Tarda unos segundos. Estamos sacando el proveedor, el NCF y cada producto.' : 'Registrando el gasto y la entrada al inventario.'}
          </Label>
        </Card>
      </Screen>
    );
  }

  if (phase === 'elegir') {
    return (
      <Screen back title="Escanear factura" subtitle={ctx.locationName}>
        <HeroCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="line-scan" color="#FFFFFF" size={22} />
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 18 }}>Factura de compra</Text>
          </View>
          <Text style={{ color: '#FFFFFFE6', fontSize: 14, lineHeight: 20 }}>
            Toma una foto de la factura. La app lee el proveedor, el RNC, el NCF, la fecha y el total. Tú revisas, agregas los productos, y con un toque se registra el gasto y los productos entran al inventario.
          </Text>
        </HeroCard>
        {error ? (
          <Card style={{ borderColor: t.danger, borderWidth: 1, gap: 4 }}>
            <Label bold color={t.danger}>No se pudo leer</Label>
            <Label size={14}>{error}</Label>
          </Card>
        ) : null}
        {Platform.OS !== 'web' ? <Button size="lg" icon="camera" title="Tomar foto de la factura" onPress={camera} /> : null}
        <Button variant={Platform.OS === 'web' ? 'primary' : 'secondary'} icon="image-multiple" title="Elegir foto de la galería" onPress={gallery} />
        {useAi ? <Button variant="secondary" icon="file-pdf-box" title="Subir factura en PDF" onPress={pdf} /> : null}
        <Label muted size={13}>Consejo: la factura completa, derecha, con buena luz y sin sombras. Si es larga, una foto por página.</Label>
        {aiAvailable ? (
        <Card style={{ gap: 8 }}>
          <Row>
            <View style={{ flex: 1, gap: 2 }}>
              <Label bold size={15}>Leer productos con IA</Label>
              <Label muted size={13}>
                {aiChosen
                  ? `Activado: la IA arma la lista de productos sola. Te quedan ${aiLeft} de ${ai!.limit} este mes.`
                  : `Apagado: el celular lee el proveedor, RNC, NCF, fecha y total gratis; los productos los tocas de la lista. Tienes ${aiLeft} lecturas con IA este mes.`}
              </Label>
            </View>
            <Switch
              value={aiChosen}
              onValueChange={(v) => {
                setAiChosen(v);
                void setSettings(db, { [AI_KEY]: v ? '1' : null });
              }}
              trackColor={{ true: t.primary, false: t.backgroundSelected }}
              thumbColor="#FFFFFF"
            />
          </Row>
        </Card>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen back title="Revisar factura" subtitle="Corrige lo que haga falta antes de guardar">
      {notes ? (
        <Card style={{ flexDirection: 'row', gap: 10, backgroundColor: t.primarySoft }}>
          <Icon name="information-outline" color={t.primary} />
          <Label size={14} style={{ flex: 1 }}>{notes}</Label>
        </Card>
      ) : null}

      <Card style={{ gap: 12 }}>
        <SectionTitle icon="store-outline">Proveedor</SectionTitle>
        <Field label="Nombre" icon="store" value={header.supplier} onChangeText={(v) => setHeader({ ...header, supplier: v })} placeholder="Ej. Distribuidora del Cibao" />
        <Row style={{ gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="RNC" icon="card-account-details-outline" keyboardType="number-pad" value={header.rnc} onChangeText={(v) => setHeader({ ...header, rnc: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Fecha" icon="calendar" value={header.date} onChangeText={(v) => setHeader({ ...header, date: v })} placeholder="2026-11-14" />
          </View>
        </Row>
        <Field label="NCF" icon="file-document-outline" autoCapitalize="characters" value={header.ncf} onChangeText={(v) => setHeader({ ...header, ncf: v })} placeholder="B0100000001" />
        <Field label="Total de la factura (RD$)" icon="cash" keyboardType="decimal-pad" value={header.total} onChangeText={(v) => setHeader({ ...header, total: v })} />
        <Label muted size={13}>
          Productos {formatRD(linesTotal)}{itbis ? ` · ITBIS ${formatRD(itbis)}` : ''}. Se guarda como gasto de Insumos.
        </Label>
      </Card>

      <SectionTitle icon="package-variant">{`Productos · ${toStock.length} al inventario`}</SectionTitle>
      {lines.map((l) => {
        const ing = ingredients.find((i) => i.id === l.target);
        const status = l.target === 'no' ? 'No va al inventario' : l.target === 'nuevo' ? 'Insumo nuevo' : `Suma a: ${ing?.name ?? '—'}`;
        const color = l.target === 'no' ? t.textSecondary : l.target === 'nuevo' ? t.info : t.success;
        const expanded = open === l.key;
        return (
          <Card key={l.key} style={{ gap: 10, opacity: l.target === 'no' ? 0.7 : 1 }}>
            <Pressable accessibilityRole="button" onPress={() => setOpen(expanded ? null : l.key)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <IconBadge name={l.target === 'no' ? 'minus-circle-outline' : l.target === 'nuevo' ? 'plus-circle-outline' : 'check-circle-outline'} color={color} size={36} />
              <View style={{ flex: 1 }}>
                <Label bold size={15}>{l.name || l.description}</Label>
                <Label muted size={12} numberOfLines={1}>
                  {l.quantity} {unitName(l.unit, l.quantity)} · {formatRD(l.cost)} · {l.description}
                </Label>
                <Label bold size={12} color={color}>{status}</Label>
              </View>
              <Icon name={expanded ? 'chevron-up' : 'pencil-outline'} size={20} color={t.textSecondary} />
            </Pressable>
            {expanded ? (
              <View style={{ gap: 10 }}>
                <Field label="Nombre en el inventario" icon="tag-outline" value={l.name} onChangeText={(v) => update(l.key, { name: v })} />
                <Row style={{ gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Field label="Cantidad" keyboardType="decimal-pad" value={String(l.quantity)} onChangeText={(v) => update(l.key, { quantity: Number(v.replace(',', '.')) || 0 })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="Costo RD$" keyboardType="decimal-pad" value={String(l.cost)} onChangeText={(v) => update(l.key, { cost: Number(v.replace(/,/g, '')) || 0 })} />
                  </View>
                </Row>
                <Chips scroll options={UNITS.map((u) => ({ value: u.value, label: u.many }))} value={l.unit} onChange={(u) => update(l.key, { unit: u })} />
                <Label bold size={13}>¿A dónde va?</Label>
                <Chips
                  scroll
                  options={[
                    { value: 'nuevo', label: 'Insumo nuevo', icon: 'plus' as const },
                    { value: 'no', label: 'No va al inventario', icon: 'close' as const },
                    ...ingredients.map((i) => ({ value: i.id, label: i.name })),
                  ]}
                  value={l.target}
                  onChange={(v) => update(l.key, { target: v, ...(ingredients.find((i) => i.id === v) ? { unit: ingredients.find((i) => i.id === v)!.unit } : {}) })}
                />
                {ing && ing.unit !== l.unit ? (
                  <Label size={12} color={t.danger}>Ese insumo se cuenta en {unitName(ing.unit)}: revisa que la cantidad esté en esa unidad.</Label>
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      })}

      {candidates.length ? (
        <Card style={{ gap: 10 }}>
          <SectionTitle icon="text-recognition">Texto encontrado</SectionTitle>
          <Label muted size={13}>Toca cada producto de la factura para agregarlo. Lo que no sea producto, ignóralo.</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {candidates.map((c) => (
              <Pressable
                key={c.text}
                accessibilityRole="button"
                accessibilityLabel={`Agregar ${c.name}`}
                onPress={() => addCandidate(c)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: t.backgroundSelected, paddingHorizontal: 12, paddingVertical: 7 }}>
                <Icon name="plus" size={16} color={t.primary} />
                <Label size={14}>{c.name}{c.amount ? ` · ${formatRD(c.amount)}` : ''}</Label>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}
      <Button variant="secondary" icon="plus" title="Agregar producto a mano" onPress={addManual} />

      <Button size="lg" icon="content-save" title={`Guardar gasto de ${formatRD(total)}`} onPress={save} disabled={!(total > 0)} />
      <Button variant="ghost" icon="camera-retake" title="Escanear otra" onPress={() => { setPhase('elegir'); setPreview(null); }} />
      {preview ? <Label muted size={12}>La foto no se guarda: solo se usa para leer los datos.</Label> : null}
      {!lines.length ? <Label muted size={12}>Sin productos se guarda solo el gasto (no entra nada al inventario).</Label> : null}
    </Screen>
  );
}

