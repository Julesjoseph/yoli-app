import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Button, Card, Divider, Field, Icon, Label, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { getSetting, setSettings } from '@/db/database';
import { listProducts, recordImportedSale, type Product } from '@/db/repo';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD, priceFor } from '@/lib/calc';
import { saveProduct } from '@/db/catalog';
import {
  cleanProductName,
  estimatePrices,
  normalizeName,
  orderIdFromRef,
  parsePedidosYaReport,
  splitPrices,
  type ReportOrder,
} from '@/lib/pedidosya-report';
import { pushOutbox } from '@/sync/sync';

const MAP_KEY = 'pya_product_map';
/** '' = se importa sin producto (no descuenta inventario). */
type ProductMap = Record<string, string>;

async function readPicked(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web' && asset.file) return asset.file.text();
  const { File } = await import('expo-file-system');
  return new File(asset.uri).text();
}

/** Importa las ventas del reporte "Detalle de pedidos" del Portal de PedidosYa. */
export default function ImportPedidosYaScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [orders, setOrders] = useState<ReportOrder[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState<ProductMap>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  const [data, reload] = useFocusData(async () => {
    const [products, saved] = await Promise.all([listProducts(db), getSetting(db, MAP_KEY)]);
    const imported = await db.getAllAsync<{ external_ref: string }>("SELECT external_ref FROM orders WHERE channel = 'pedidosya' AND external_ref IS NOT NULL");
    let savedMap: ProductMap = {};
    try {
      savedMap = saved ? (JSON.parse(saved) as ProductMap) : {};
    } catch {
      /* mapa dañado: se empieza de cero */
    }
    return { products, savedMap, imported: new Set(imported.map((r) => r.external_ref)) };
  }, [db]);

  const products = data?.products ?? [];
  const byName = useMemo(() => new Map(products.map((p) => [normalizeName(p.name), p])), [products]);
  const fullMap = { ...(data?.savedMap ?? {}), ...map };
  const productFor = (name: string): Product | null | undefined => {
    const k = normalizeName(name);
    if (k in fullMap) return fullMap[k] ? products.find((p) => p.id === fullMap[k]) ?? undefined : null;
    return byName.get(k);
  };

  const delivered = (orders ?? []).filter((o) => o.status === 'entregado');
  const fresh = delivered.filter((o) => !data?.imported.has(o.ref));
  const cancelled = (orders ?? []).filter((o) => o.status === 'cancelado').length;
  const unknownNames = [...new Set(fresh.flatMap((o) => o.items.map((i) => i.name)))].filter((n) => productFor(n) === undefined);
  const sales = fresh.reduce((n, o) => n + o.subtotal - o.discount, 0);
  const net = fresh.reduce((n, o) => n + o.net, 0);
  const negative = fresh.filter((o) => o.net < 0);

  async function pick() {
    setMsg(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    try {
      const text = await readPicked(r.assets[0]);
      const parsed = parsePedidosYaReport(text);
      if (parsed.error) {
        setOrders(null);
        return setMsg({ text: parsed.error });
      }
      setFileName(r.assets[0].name);
      setOrders(parsed.orders);
    } catch (e) {
      setMsg({ text: `No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  async function createMissing() {
    if (!orders) return;
    setBusy(true);
    setMsg(null);
    const est = estimatePrices(orders);
    const created: ProductMap = {};
    const seen = new Set<string>();
    try {
      for (const name of unknownNames) {
        const k = normalizeName(name);
        if (seen.has(k)) continue;
        seen.add(k);
        const id = randomUUID();
        const price = est[k] && est[k] > 0 ? est[k] : 100;
        await saveProduct(db, ctx, { id, name: cleanProductName(name), price, price_pedidosya: price, category_id: null, itbis_rate: 0.18, active: true }, []);
        created[k] = id;
      }
      setMap((m) => ({ ...m, ...created }));
      await setSettings(db, { [MAP_KEY]: JSON.stringify({ ...fullMap, ...created }) });
      setMsg({ text: `Se crearon ${Object.keys(created).length} productos. Revisa sus precios, fotos y recetas en Catálogo.`, ok: true });
    } catch (e) {
      setMap((m) => ({ ...m, ...created }));
      setMsg({ text: `Se crearon ${Object.keys(created).length}, pero hubo un error: ${e instanceof Error ? e.message : String(e)}` });
    }
    setBusy(false);
    reload();
  }

  async function runImport() {
    setBusy(true);
    setMsg(null);
    try {
      await setSettings(db, { [MAP_KEY]: JSON.stringify(fullMap) });
      let done = 0;
      for (const o of fresh) {
        const lines = o.items.map((i) => ({ ...i, product: productFor(i.name) ?? null }));
        const prices = splitPrices(
          o.subtotal,
          lines.map((l) => ({ quantity: l.quantity, knownPrice: l.product ? priceFor(l.product, 'pedidosya') : null })),
        );
        const saved = await recordImportedSale(db, ctx, {
          id: orderIdFromRef(o.ref),
          channel: 'pedidosya',
          externalRef: o.ref,
          createdAt: o.createdAt,
          lines: lines.map((l, k) => ({ product: l.product, name: l.name, quantity: l.quantity, unitPrice: prices[k] })),
          discount: o.discount,
          netIncome: o.net,
        });
        if (saved) done++;
      }
      await pushOutbox(db).catch(() => undefined);
      setOrders(null);
      setMap({});
      setMsg({ text: `Listo: ${done} ventas de PedidosYa importadas en ${ctx.locationName}.`, ok: true });
      reload();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e) });
    }
    setBusy(false);
  }

  const choices = products.filter((p) => !search.trim() || normalizeName(p.name).includes(normalizeName(search))).slice(0, 30);

  return (
    <Screen back title="Importar de PedidosYa" subtitle={`Ventas del reporte · ${ctx.locationName}`}>
      <Card style={{ gap: 10 }}>
        <Label muted size={13}>
          En el Portal de PedidosYa ve a Reportes, descarga el "Detalle de pedidos" (orderDetails.csv) y súbelo aquí.
          Cada pedido entregado entra como venta de este local con su fecha, lo que te queda después de la comisión, y
          descuenta el inventario. Si subes el mismo archivo otra vez, no se repiten.
        </Label>
        <Button icon="file-upload-outline" title={orders ? 'Elegir otro archivo' : 'Elegir archivo del reporte'} onPress={pick} disabled={busy} />
      </Card>

      {orders ? (
        <>
          <SectionTitle icon="file-document-outline">{fileName || 'Reporte'}</SectionTitle>
          <Card style={{ gap: 8 }}>
            <Row><Label>Pedidos nuevos para importar</Label><Label bold>{fresh.length}</Label></Row>
            {delivered.length - fresh.length ? (
              <Row><Label muted>Ya estaban en YOLI</Label><Label muted>{delivered.length - fresh.length}</Label></Row>
            ) : null}
            {cancelled ? <Row><Label muted>Cancelados (no se importan)</Label><Label muted>{cancelled}</Label></Row> : null}
            <Divider />
            <Row><Label>Ventas</Label><Label bold>{formatRD(sales)}</Label></Row>
            <Row><Label>Te queda (según PedidosYa)</Label><Label bold color={t.success}>{formatRD(net)}</Label></Row>
            {negative.length ? (
              <Label size={13} color={t.danger}>
                Ojo: {negative.length === 1 ? 'el pedido' : 'los pedidos'} {negative.map((o) => o.ref).join(', ')} {negative.length === 1 ? 'tiene' : 'tienen'} ingreso
                negativo en PedidosYa (reembolso o reclamo). Se importa tal cual.
              </Label>
            ) : null}
          </Card>

          {unknownNames.length ? (
            <>
              <SectionTitle icon="link-variant">Productos sin enlazar ({unknownNames.length})</SectionTitle>
              <Card style={{ gap: 10 }}>
                <Label muted size={13}>
                  Estos nombres de PedidosYa no se parecen a ningún producto tuyo. Escoge cuál es, para que descuente su
                  receta del inventario. YOLI lo recuerda para la próxima vez.
                </Label>
                <Button
                  icon="plus-box-multiple-outline"
                  title={busy ? 'Creando…' : `Crear los ${unknownNames.length} productos que faltan`}
                  onPress={createMissing}
                  disabled={busy}
                />
                <Label muted size={12}>
                  Se crean con el nombre de PedidosYa y un precio sacado del reporte (puedes cambiarlo). Después les pones
                  foto y receta en Catálogo. O escoge uno por uno:
                </Label>
                {unknownNames.map((name) => (
                  <View key={name} style={{ gap: 6 }}>
                    <Row>
                      <Label bold size={14} style={{ flex: 1 }}>{name}</Label>
                      <Button size="sm" variant="secondary" title={picking === name ? 'Cerrar' : 'Elegir'} onPress={() => { setPicking(picking === name ? null : name); setSearch(''); }} />
                    </Row>
                    {picking === name ? (
                      <View style={{ gap: 6 }}>
                        <Field label="Buscar producto" icon="magnify" value={search} onChangeText={setSearch} placeholder="Escribe parte del nombre" />
                        {choices.map((p) => (
                          <Pressable
                            key={p.id}
                            onPress={() => { setMap((m) => ({ ...m, [normalizeName(name)]: p.id })); setPicking(null); }}
                            style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: t.backgroundSelected }}
                          >
                            <Label size={14}>{p.name} · {formatRD(priceFor(p, 'pedidosya'))}</Label>
                          </Pressable>
                        ))}
                        <Button size="sm" variant="ghost" title="No está en mi catálogo (importar sin descontar inventario)" onPress={() => { setMap((m) => ({ ...m, [normalizeName(name)]: '' })); setPicking(null); }} />
                      </View>
                    ) : null}
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {Object.keys(map).length ? (
            <Card style={{ gap: 6 }}>
              <Label bold size={14}>Enlazados ahora</Label>
              {Object.entries(map).map(([k, id]) => (
                <Row key={k} style={{ justifyContent: 'flex-start', gap: 8 }}>
                  <Icon name={id ? 'link-variant' : 'link-variant-off'} size={16} color={t.textSecondary} />
                  <Label size={13} style={{ flex: 1 }}>{k} → {id ? products.find((p) => p.id === id)?.name : 'sin producto'}</Label>
                </Row>
              ))}
            </Card>
          ) : null}

          <Button
            size="lg"
            icon="database-import-outline"
            title={busy ? 'Importando…' : unknownNames.length ? `Enlaza ${unknownNames.length} producto(s) para seguir` : `Importar ${fresh.length} ventas`}
            onPress={runImport}
            disabled={busy || !fresh.length || unknownNames.length > 0}
          />
          {!fresh.length ? <Pill text="NADA NUEVO EN ESTE ARCHIVO" color={t.info} /> : null}
        </>
      ) : null}

      {msg ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, padding: 10, backgroundColor: msg.ok ? t.successSoft : t.dangerSoft }}>
          <Icon name={msg.ok ? 'check-circle' : 'alert-circle'} size={18} color={msg.ok ? t.success : t.danger} />
          <Label size={14} color={msg.ok ? t.success : t.danger} style={{ flex: 1 }}>{msg.text}</Label>
        </View>
      ) : null}
    </Screen>
  );
}
