import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Platform, Switch, View } from 'react-native';

import { ProductImage } from '@/components/product-image';
import { Button, Card, Divider, Icon, Label, Row, Screen, SectionTitle } from '@/components/ui';
import { copyImageFromUrl, saveCategory, saveProduct, setProductImage, setProductPedidosYaPrice } from '@/db/catalog';
import { listCategories, listProducts } from '@/db/repo';
import { canManage, useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';
import { menuImageUrl, parsePedidosYaMenu, type MenuItem } from '@/lib/pedidosya-menu';
import { normalizeName } from '@/lib/pedidosya-report';

async function readPicked(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web' && asset.file) return asset.file.text();
  const { File } = await import('expo-file-system');
  return new File(asset.uri).text();
}

const categoryName = (section: string) => section.replace(/\s*&\s*/g, ' & ').replace(/\s+/g, ' ').trim();

/** Mete en el catálogo el menú de PedidosYa: productos, precios, secciones y fotos. */
export default function ImportMenuScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [createNew, setCreateNew] = useState(true);
  const [photos, setPhotos] = useState(true);
  const [prices, setPrices] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  const [data, reload] = useFocusData(async () => {
    const [products, categories] = await Promise.all([listProducts(db), listCategories(db)]);
    return { products, categories };
  }, [db]);

  const products = data?.products ?? [];
  const byName = new Map(products.map((p) => [normalizeName(p.name), p]));
  const existing = (items ?? []).filter((i) => byName.has(normalizeName(i.name)));
  const fresh = (items ?? []).filter((i) => !byName.has(normalizeName(i.name)));
  const needPhoto = existing.filter((i) => i.image && !byName.get(normalizeName(i.name))?.image_url).length;

  async function pick() {
    setMsg(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/html', 'text/plain', 'application/json', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    try {
      const parsed = parsePedidosYaMenu(await readPicked(r.assets[0]));
      if (parsed.error) {
        setItems(null);
        return setMsg({ text: parsed.error });
      }
      setItems(parsed.items);
    } catch (e) {
      setMsg({ text: `No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  async function run() {
    if (!items || !data) return;
    setBusy(true);
    setMsg(null);
    let created = 0;
    let withPhoto = 0;
    let priced = 0;
    const errors: string[] = [];
    const cats = new Map(data.categories.map((c) => [normalizeName(c.name), c.id]));
    const todo = [...(createNew ? fresh : []), ...existing];
    for (let k = 0; k < todo.length; k++) {
      const it = todo[k];
      setProgress(`${k + 1} de ${todo.length}: ${it.name}`);
      try {
        const current = byName.get(normalizeName(it.name));
        const photo = photos && it.image ? menuImageUrl(it.image) : null;
        if (!current) {
          const cname = categoryName(it.section);
          let categoryId = cats.get(normalizeName(cname)) ?? null;
          if (!categoryId) {
            categoryId = await saveCategory(db, ctx, { name: cname, sort_order: cats.size });
            cats.set(normalizeName(cname), categoryId);
          }
          const price = it.price > 0 ? it.price : 1;
          await saveProduct(
            db,
            ctx,
            {
              id: randomUUID(),
              name: it.name,
              price,
              price_pedidosya: price,
              category_id: categoryId,
              itbis_rate: 0.18,
              delivery_itbis_exempt: true,
              active: true,
              image_url: photo ? await copyImageFromUrl(ctx, photo) : null,
            },
            [],
          );
          created++;
          if (photo) withPhoto++;
        } else {
          if (photo && !current.image_url) {
            await setProductImage(db, ctx, current.id, await copyImageFromUrl(ctx, photo));
            withPhoto++;
          }
          if (prices && it.price > 0 && current.price_pedidosya !== it.price) {
            await setProductPedidosYaPrice(db, ctx, current.id, it.price);
            priced++;
          }
        }
      } catch (e) {
        errors.push(`${it.name}: ${e instanceof Error ? e.message : String(e)}`);
        if (errors.length >= 3) break;
      }
    }
    setBusy(false);
    setProgress('');
    setItems(null);
    reload();
    const parts = [created && `${created} productos nuevos`, withPhoto && `${withPhoto} fotos`, priced && `${priced} precios de PedidosYa`].filter(Boolean);
    setMsg(
      errors.length
        ? { text: `Se hizo una parte (${parts.join(', ') || 'nada'}), pero hubo errores: ${errors.join(' · ')}` }
        : { text: `Listo: ${parts.join(', ') || 'no había nada que cambiar'}. Revisa en Catálogo el precio del local y la receta de cada producto.`, ok: true },
    );
  }

  if (!canManage(ctx)) {
    return (
      <Screen back title="Menú de PedidosYa">
        <Card><Label muted>Solo el dueño o el gerente puede cambiar el catálogo.</Label></Card>
      </Screen>
    );
  }

  return (
    <Screen back title="Menú de PedidosYa" subtitle="Productos, precios, secciones y fotos">
      <Card style={{ gap: 10 }}>
        <Label muted size={13}>
          1) En la PC abre tu tienda en pedidosya.com.do con Chrome y espera a que se vean los productos. 2) Aprieta
          Ctrl + S y guarda como "Página web completa". 3) Elige aquí ese archivo .html.
        </Label>
        <Button icon="file-upload-outline" title={items ? 'Elegir otro archivo' : 'Elegir la página guardada'} onPress={pick} disabled={busy} />
      </Card>

      {items ? (
        <>
          <SectionTitle icon="silverware-fork-knife">Tu menú en PedidosYa</SectionTitle>
          <Card style={{ gap: 8 }}>
            <Row><Label>Productos en el menú</Label><Label bold>{items.length}</Label></Row>
            <Row><Label muted>Ya están en YOLI</Label><Label muted>{existing.length}</Label></Row>
            <Row><Label muted>Nuevos</Label><Label muted>{fresh.length}</Label></Row>
            <Row><Label muted>Con foto</Label><Label muted>{items.filter((i) => i.image).length}</Label></Row>
            <Divider />
            <Row>
              <Label style={{ flex: 1 }}>Crear los {fresh.length} productos nuevos (con su sección como categoría)</Label>
              <Switch value={createNew} onValueChange={setCreateNew} trackColor={{ true: t.primary, false: t.backgroundSelected }} thumbColor="#FFFFFF" />
            </Row>
            <Row>
              <Label style={{ flex: 1 }}>Poner las fotos ({needPhoto} de productos que ya tienes y no tienen foto)</Label>
              <Switch value={photos} onValueChange={setPhotos} trackColor={{ true: t.primary, false: t.backgroundSelected }} thumbColor="#FFFFFF" />
            </Row>
            <Row>
              <Label style={{ flex: 1 }}>Actualizar el precio de PedidosYa de los que ya tienes</Label>
              <Switch value={prices} onValueChange={setPrices} trackColor={{ true: t.primary, false: t.backgroundSelected }} thumbColor="#FFFFFF" />
            </Row>
            <Label muted size={12}>
              Los productos nuevos se crean con el mismo precio en el local y en PedidosYa, y sin ITBIS en delivery. Si en el local cobras otro,
              cámbialo en Catálogo. Las fotos que ya tienes no se cambian.
            </Label>
          </Card>

          <Card style={{ gap: 8 }}>
            {items.slice(0, 8).map((i) => (
              <Row key={i.name} style={{ justifyContent: 'flex-start', gap: 10 }}>
                <ProductImage uri={i.image ? menuImageUrl(i.image, 120) : null} name={i.name} size={40} radius={10} />
                <Label size={14} style={{ flex: 1 }} numberOfLines={1}>{i.name}</Label>
                <Label size={14}>{formatRD(i.price)}</Label>
              </Row>
            ))}
            {items.length > 8 ? <Label muted size={13}>…y {items.length - 8} más</Label> : null}
          </Card>

          <Button size="lg" icon="database-import-outline" title={busy ? 'Importando…' : 'Importar menú'} onPress={run} disabled={busy} />
          {progress ? <Label muted size={13}>{progress}</Label> : null}
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
