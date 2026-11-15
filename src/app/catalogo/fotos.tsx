import * as ImagePicker from 'expo-image-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';

import { ProductImage } from '@/components/product-image';
import { Button, Card, Field, Icon, Label, Row, Screen, SectionTitle } from '@/components/ui';
import { setProductImage, uploadProductImage } from '@/db/catalog';
import { listProducts, type Product } from '@/db/repo';
import { canManage, useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { normalizeName } from '@/lib/pedidosya-report';

type Picked = { key: string; uri: string; base64?: string | null; fileName: string; productId: string | null };

/** Busca el producto por el nombre del archivo ("mangu-de-platano.jpg" → Mangu de platano). */
function guessProduct(fileName: string, products: Product[]): string | null {
  const base = normalizeName(fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '));
  if (!base || /^(img|image|imagen|photo|foto|screenshot|captura|whatsapp|pxl|dsc)\b/.test(base)) return null;
  const exact = products.find((p) => normalizeName(p.name) === base);
  if (exact) return exact.id;
  const partial = products.filter((p) => normalizeName(p.name).includes(base) || base.includes(normalizeName(p.name)));
  return partial.length === 1 ? partial[0].id : null;
}

/** Ponerle foto a muchos productos de una vez (por ejemplo, las fotos de tu menú de PedidosYa). */
export default function BulkPhotosScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  const [products, reload] = useFocusData(() => listProducts(db), [db]);
  const list = products ?? [];
  const withoutPhoto = list.filter((p) => !p.image_url);

  async function pick() {
    setMsg(null);
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('Permiso necesario', 'Permite el acceso a tus fotos.');
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 60,
      quality: 0.6,
      base64: true,
    });
    if (r.canceled) return;
    const taken = new Set(picked.map((p) => p.productId).filter(Boolean));
    const next = r.assets.map<Picked>((a, k) => {
      const fileName = a.fileName ?? `foto-${k + 1}`;
      let productId = guessProduct(fileName, list);
      if (productId && taken.has(productId)) productId = null;
      if (productId) taken.add(productId);
      return { key: `${Date.now()}-${k}`, uri: a.uri, base64: a.base64, fileName, productId };
    });
    setPicked((cur) => [...cur, ...next]);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    let done = 0;
    const left: Picked[] = [];
    for (const p of picked) {
      if (!p.productId) {
        left.push(p);
        continue;
      }
      try {
        const url = await uploadProductImage(ctx, { uri: p.uri, base64: p.base64 });
        await setProductImage(db, ctx, p.productId, url);
        done++;
      } catch (e) {
        left.push(p);
        setMsg({ text: e instanceof Error ? e.message : String(e) });
      }
    }
    setPicked(left);
    setBusy(false);
    if (done) setMsg({ text: `Listo: ${done} foto${done === 1 ? '' : 's'} guardada${done === 1 ? '' : 's'}.`, ok: true });
    reload();
  }

  const nameOf = (id: string | null) => list.find((p) => p.id === id)?.name;
  const options = list
    .filter((p) => !search.trim() || normalizeName(p.name).includes(normalizeName(search)))
    .sort((a, b) => Number(!!a.image_url) - Number(!!b.image_url))
    .slice(0, 30);
  const ready = picked.filter((p) => p.productId).length;

  if (!canManage(ctx)) {
    return (
      <Screen back title="Fotos de productos">
        <Card><Label muted>Solo el dueño o el gerente puede cambiar las fotos.</Label></Card>
      </Screen>
    );
  }

  return (
    <Screen back title="Fotos de productos" subtitle={`${withoutPhoto.length} producto${withoutPhoto.length === 1 ? '' : 's'} sin foto`}>
      <Card style={{ gap: 10 }}>
        <Label muted size={13}>
          Escoge varias fotos de tu galería (por ejemplo, las de tu menú de PedidosYa) y dile a cada una de qué producto es.
          Si el archivo se llama como el producto ("mangu de platano.jpg"), se enlaza solo.
        </Label>
        <Button icon="image-multiple-outline" title={picked.length ? 'Agregar más fotos' : 'Elegir fotos'} onPress={pick} disabled={busy} />
      </Card>

      {picked.length ? (
        <>
          <SectionTitle icon="image-outline">Fotos elegidas ({picked.length})</SectionTitle>
          <Card style={{ gap: 12 }}>
            {picked.map((p) => (
              <View key={p.key} style={{ gap: 8 }}>
                <Row style={{ justifyContent: 'flex-start', gap: 12 }}>
                  <ProductImage uri={p.uri} name={p.fileName} size={64} radius={12} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Label bold size={14} color={p.productId ? t.text : t.danger}>{nameOf(p.productId) ?? 'Sin producto'}</Label>
                    <Label muted size={12} numberOfLines={1}>{p.fileName}</Label>
                  </View>
                  <Button size="sm" variant="secondary" title={choosing === p.key ? 'Cerrar' : 'Cambiar'} onPress={() => { setChoosing(choosing === p.key ? null : p.key); setSearch(''); }} />
                  <Pressable onPress={() => setPicked((cur) => cur.filter((x) => x.key !== p.key))} hitSlop={8} accessibilityLabel="Quitar foto">
                    <Icon name="close" size={20} color={t.textSecondary} />
                  </Pressable>
                </Row>
                {choosing === p.key ? (
                  <View style={{ gap: 6 }}>
                    <Field label="Buscar producto" icon="magnify" value={search} onChangeText={setSearch} placeholder="Escribe parte del nombre" />
                    {options.map((o) => (
                      <Pressable
                        key={o.id}
                        onPress={() => { setPicked((cur) => cur.map((x) => (x.key === p.key ? { ...x, productId: o.id } : x))); setChoosing(null); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: t.backgroundSelected }}
                      >
                        <ProductImage uri={o.image_url} name={o.name} size={32} radius={8} />
                        <Label size={14} style={{ flex: 1 }}>{o.name}</Label>
                        {o.image_url ? <Label muted size={12}>ya tiene foto</Label> : null}
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
          <Button
            size="lg"
            icon="content-save"
            title={busy ? 'Guardando fotos…' : `Guardar ${ready} foto${ready === 1 ? '' : 's'}`}
            onPress={save}
            disabled={busy || !ready}
          />
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
