import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { foodIcon } from '@/components/brand-icons';
import { ProductImage } from '@/components/product-image';
import { Button, Card, Chips, Divider, Field, Icon, IconBadge, Label, Row, Screen, SectionTitle } from '@/components/ui';
import {
  getProduct,
  getRecipe,
  listCatalogCategories,
  listCatalogIngredients,
  recipeCost,
  saveProduct,
  uploadProductImage,
  type CatalogCategory,
  type CatalogIngredient,
} from '@/db/catalog';
import { useBusiness } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';

const ITBIS = [
  { value: '0.18', label: 'ITBIS 18%' },
  { value: '0.16', label: 'ITBIS 16%' },
  { value: '0', label: 'Exento' },
];

const num = (s: string) => Number(s.replace(',', '.'));

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();

  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [ingredients, setIngredients] = useState<CatalogIngredient[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<string>('');
  const [itbis, setItbis] = useState('0.18');
  const [active, setActive] = useState(true);
  const [recipe, setRecipe] = useState<{ ingredient_id: string; quantity: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  /** undefined = sin cambios; null = quitar foto; string = foto nueva. */
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const [savedImage, setSavedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      const [cats, ings] = await Promise.all([listCatalogCategories(db), listCatalogIngredients(db)]);
      setCategories(cats);
      setIngredients(ings);
      if (id) {
        const p = await getProduct(db, id);
        if (p) {
          setName(p.name);
          setPrice(String(p.price));
          setCategory(p.category_id ?? '');
          setItbis(String(p.itbis_rate));
          setActive(!!p.active);
          setSavedImage(p.image_url);
        }
        const r = await getRecipe(db, id);
        setRecipe(r.map((x) => ({ ingredient_id: x.ingredient_id, quantity: String(x.quantity) })));
      } else if (cats[0]) {
        setCategory(cats[0].id);
      }
    })();
  }, [db, id]);

  const priceN = num(price || '0');
  const itbisN = Number(itbis);
  const net = priceN / (1 + itbisN);
  const cost = recipeCost(recipe.map((r) => ({ ingredient_id: r.ingredient_id, quantity: num(r.quantity || '0') })), ingredients);
  const margin = net > 0 ? Math.round(((net - cost) / net) * 100) : 0;
  const unused = ingredients.filter((i) => !recipe.some((r) => r.ingredient_id === i.id));

  const shownImage = image === undefined ? savedImage : image;

  async function pickImage(camera: boolean) {
    const perm = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso necesario', camera ? 'Permite el uso de la cámara para tomar la foto.' : 'Permite el acceso a tus fotos.');
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true };
    const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    setMsg('');
    try {
      setImage(await uploadProductImage(ctx, result.assets[0]));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      await saveProduct(
        db,
        ctx,
        { id, name, price: priceN, category_id: category || null, itbis_rate: itbisN, active, image_url: image },
        recipe.map((r) => ({ ingredient_id: r.ingredient_id, quantity: num(r.quantity || '0') })),
      );
      router.back();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen back title={id ? 'Editar producto' : 'Nuevo producto'}>
      <Card style={{ gap: 14 }}>
        <Row style={{ justifyContent: 'flex-start', gap: 14 }}>
          <ProductImage uri={shownImage} name={name || 'producto'} size={96} radius={22} />
          <View style={{ flex: 1, gap: 4 }}>
            <Label bold size={18} numberOfLines={2}>{name || 'Producto sin nombre'}</Label>
            <Label color={t.primary} bold size={16}>{formatRD(priceN || 0)}</Label>
          </View>
        </Row>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            icon="image-outline"
            title={uploading ? 'Subiendo…' : shownImage ? 'Cambiar foto' : 'Elegir foto'}
            onPress={() => pickImage(false)}
            disabled={uploading}
            style={{ flex: 1 }}
          />
          <Button variant="secondary" icon="camera-outline" title="Cámara" onPress={() => pickImage(true)} disabled={uploading} />
          {shownImage ? (
            <Button variant="ghost" icon="delete-outline" title="Quitar" onPress={() => setImage(null)} disabled={uploading} />
          ) : null}
        </View>
        <Field label="Nombre" icon="food" value={name} onChangeText={setName} placeholder="Ej. Chimichurri especial" />
        <Field label="Precio de venta (RD$, con ITBIS)" icon="cash" keyboardType="decimal-pad" value={price} onChangeText={setPrice} placeholder="0.00" />
        <Label muted size={13}>Impuesto</Label>
        <Chips options={ITBIS} value={itbis} onChange={setItbis} />
        <Label muted size={13}>Categoría</Label>
        <Chips
          options={[...categories.map((c) => ({ value: c.id, label: c.name, icon: foodIcon(c.name) })), { value: '', label: 'Sin categoría' }]}
          value={category}
          onChange={setCategory}
        />
        <Row>
          <View style={{ flex: 1 }}>
            <Label bold size={15}>Disponible en la caja</Label>
            <Label muted size={13}>Si lo apagas, el producto se oculta pero no se borra.</Label>
          </View>
          <Switch value={active} onValueChange={setActive} trackColor={{ true: t.primary, false: t.backgroundSelected }} thumbColor="#FFFFFF" />
        </Row>
      </Card>

      <SectionTitle icon="chef-hat">Receta</SectionTitle>
      <Card style={{ gap: 12 }}>
        <Label muted size={13}>
          Indica cuánto de cada insumo lleva una unidad. Así el inventario se descuenta solo con cada venta y sabes tu
          costo.
        </Label>
        {recipe.map((r, idx) => {
          const ing = ingredients.find((i) => i.id === r.ingredient_id);
          return (
            <View key={r.ingredient_id} style={styles.recipeRow}>
              <IconBadge name={foodIcon(ing?.name ?? '')} color={t.success} size={36} />
              <Label bold size={15} style={{ flex: 1 }} numberOfLines={1}>{ing?.name ?? 'Insumo'}</Label>
              <View style={{ width: 110 }}>
                <Field
                  label={ing?.unit ?? ''}
                  keyboardType="decimal-pad"
                  value={r.quantity}
                  onChangeText={(v) => setRecipe((cur) => cur.map((x, i) => (i === idx ? { ...x, quantity: v } : x)))}
                />
              </View>
              <Pressable
                accessibilityLabel={`Quitar ${ing?.name ?? 'insumo'}`}
                hitSlop={8}
                onPress={() => setRecipe((cur) => cur.filter((_, i) => i !== idx))}>
                <Icon name="close-circle" color={t.danger} />
              </Pressable>
            </View>
          );
        })}
        {adding ? (
          unused.length ? (
            <Chips
              options={unused.map((i) => ({ value: i.id, label: i.name }))}
              value=""
              onChange={(v) => {
                setRecipe((cur) => [...cur, { ingredient_id: v, quantity: '1' }]);
                setAdding(false);
              }}
            />
          ) : (
            <Label muted size={14}>No hay más insumos. Créalos en Catálogo › Insumos.</Label>
          )
        ) : (
          <Button variant="secondary" icon="plus" title="Agregar insumo a la receta" onPress={() => setAdding(true)} />
        )}
        <Divider />
        <Row><Label muted size={14}>Precio sin ITBIS</Label><Label size={14}>{formatRD(net || 0)}</Label></Row>
        <Row><Label muted size={14}>Costo de la receta</Label><Label size={14}>{formatRD(cost)}</Label></Row>
        <Row>
          <Label bold size={16}>Margen</Label>
          <Label bold size={16} color={margin >= 50 ? t.success : margin >= 25 ? t.accent : t.danger}>
            {recipe.length ? `${margin}% · ${formatRD(net - cost)}` : '—'}
          </Label>
        </Row>
      </Card>

      {msg ? <Label color={t.danger} size={14}>{msg}</Label> : null}
      <Button size="lg" icon="content-save" title={saving ? 'Guardando…' : 'Guardar producto'} onPress={save} disabled={saving || uploading || !name.trim() || !price} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  recipeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
});
