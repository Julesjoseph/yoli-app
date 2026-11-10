import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { foodIcon } from '@/components/brand-icons';
import { IngredientForm } from '@/components/ingredient-form';
import { ProductImage } from '@/components/product-image';
import { Button, Card, Chips, Divider, Field, Icon, IconBadge, Label, Row, Screen, SectionTitle } from '@/components/ui';
import {
  getComboLines,
  getProduct,
  getRecipe,
  listCatalogProducts,
  listCatalogCategories,
  listCatalogIngredients,
  recipeCost,
  saveProduct,
  uploadProductImage,
  type CatalogCategory,
  type CatalogProduct,
  type ComboLine,
  type CatalogIngredient,
} from '@/db/catalog';
import { useBusiness } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';
import { unitName } from '@/lib/units';

const GROUP_SUGGESTIONS = ['Acompañante', 'Bebida', 'Salsa', 'Proteína'];

interface Group {
  name: string;
  options: { item_product_id: string; extra: string }[];
}

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
  const [pricePy, setPricePy] = useState('');
  const [priceUe, setPriceUe] = useState('');
  const [category, setCategory] = useState<string>('');
  const [itbis, setItbis] = useState('0.18');
  const [active, setActive] = useState(true);
  const [recipe, setRecipe] = useState<{ ingredient_id: string; quantity: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [creatingIngredient, setCreatingIngredient] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [allRecipes, setAllRecipes] = useState<{ product_id: string; ingredient_id: string; quantity: number }[]>([]);
  const [includes, setIncludes] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [addingInclude, setAddingInclude] = useState(false);
  const [addingOption, setAddingOption] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  /** undefined = sin cambios; null = quitar foto; string = foto nueva. */
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const [savedImage, setSavedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      const [cats, ings, prods, recs] = await Promise.all([
        listCatalogCategories(db),
        listCatalogIngredients(db),
        listCatalogProducts(db),
        db.getAllAsync<{ product_id: string; ingredient_id: string; quantity: number }>('SELECT product_id, ingredient_id, quantity FROM recipe_items'),
      ]);
      setCategories(cats);
      setIngredients(ings);
      setProducts(prods.filter((p) => p.id !== id));
      setAllRecipes(recs);
      if (id) {
        const p = await getProduct(db, id);
        if (p) {
          setName(p.name);
          setPrice(String(p.price));
          setPricePy(p.price_pedidosya ? String(p.price_pedidosya) : '');
          setPriceUe(p.price_ubereats ? String(p.price_ubereats) : '');
          setCategory(p.category_id ?? '');
          setItbis(String(p.itbis_rate));
          setActive(!!p.active);
          setSavedImage(p.image_url);
        }
        const r = await getRecipe(db, id);
        setRecipe(r.map((x) => ({ ingredient_id: x.ingredient_id, quantity: String(x.quantity) })));
        const combo = await getComboLines(db, id);
        setIncludes(combo.filter((c) => !c.group_name).map((c) => c.item_product_id));
        const byGroup = new Map<string, Group>();
        for (const c of combo.filter((x) => x.group_name)) {
          const g = byGroup.get(c.group_name) ?? { name: c.group_name, options: [] };
          g.options.push({ item_product_id: c.item_product_id, extra: c.extra_price ? String(c.extra_price) : '' });
          byGroup.set(c.group_name, g);
        }
        setGroups([...byGroup.values()]);
      } else if (cats[0]) {
        setCategory(cats[0].id);
      }
    })();
  }, [db, id]);

  const priceN = num(price || '0');
  const itbisN = Number(itbis);
  const net = priceN / (1 + itbisN);
  const productCost = (pid: string) =>
    recipeCost(allRecipes.filter((r) => r.product_id === pid).map((r) => ({ ingredient_id: r.ingredient_id, quantity: r.quantity })), ingredients);
  const productName = (pid: string) => products.find((p) => p.id === pid)?.name ?? 'Producto';
  // Costo: la receta propia + lo que trae el combo + la primera opción de cada grupo (estimado).
  const cost =
    recipeCost(recipe.map((r) => ({ ingredient_id: r.ingredient_id, quantity: num(r.quantity || '0') })), ingredients) +
    includes.reduce((n, pid) => n + productCost(pid), 0) +
    groups.reduce((n, g) => n + (g.options[0] ? productCost(g.options[0].item_product_id) : 0), 0);
  const isCombo = includes.length > 0 || groups.length > 0;
  const updateGroup = (gi: number, fn: (g: Group) => Group) => setGroups((cur) => cur.map((g, i) => (i === gi ? fn(g) : g)));
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
        {
          id,
          name,
          price: priceN,
          category_id: category || null,
          itbis_rate: itbisN,
          active,
          image_url: image,
          price_pedidosya: pricePy.trim() ? num(pricePy) : null,
          price_ubereats: priceUe.trim() ? num(priceUe) : null,
        },
        recipe.map((r) => ({ ingredient_id: r.ingredient_id, quantity: num(r.quantity || '0') })),
        [
          ...includes.map<ComboLine>((pid) => ({ item_product_id: pid, group_name: '', extra_price: 0 })),
          ...groups.flatMap((g) =>
            g.options.map<ComboLine>((o) => ({
              item_product_id: o.item_product_id,
              group_name: g.name.trim() || 'Acompañante',
              extra_price: num(o.extra || '0'),
            })),
          ),
        ],
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
        <Label muted size={13}>Precio en delivery (déjalo vacío si es igual al del local)</Label>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="PedidosYa (RD$)" icon="moped" keyboardType="decimal-pad" value={pricePy} onChangeText={setPricePy} placeholder={price || '0.00'} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Uber Eats (RD$)" icon="truck-delivery-outline" keyboardType="decimal-pad" value={priceUe} onChangeText={setPriceUe} placeholder={price || '0.00'} />
          </View>
        </View>
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
          ¿Qué lleva un plato? Ej.: 2 piezas de pollo, 1 porción de arroz. Así el inventario se descuenta solo con cada
          venta y sabes tu ganancia.
        </Label>
        {recipe.map((r, idx) => {
          const ing = ingredients.find((i) => i.id === r.ingredient_id);
          return (
            <View key={r.ingredient_id} style={styles.recipeRow}>
              <IconBadge name={foodIcon(ing?.name ?? '')} color={t.success} size={36} />
              <Label bold size={15} style={{ flex: 1 }} numberOfLines={1}>{ing?.name ?? 'Insumo'}</Label>
              <View style={{ width: 110 }}>
                <Field
                  label={unitName(ing?.unit ?? '')}
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
        {creatingIngredient ? (
          <IngredientForm
            initial={{}}
            onCancel={() => setCreatingIngredient(false)}
            onSaved={async (newId) => {
              setIngredients(await listCatalogIngredients(db));
              setRecipe((cur) => [...cur, { ingredient_id: newId, quantity: '1' }]);
              setCreatingIngredient(false);
              setAdding(false);
            }}
          />
        ) : adding ? (
          <View style={{ gap: 10 }}>
            {unused.length ? (
              <Chips
                options={unused.map((i) => ({ value: i.id, label: i.name }))}
                value=""
                onChange={(v) => {
                  setRecipe((cur) => [...cur, { ingredient_id: v, quantity: '1' }]);
                  setAdding(false);
                }}
              />
            ) : (
              <Label muted size={14}>No hay más insumos guardados.</Label>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button variant="secondary" icon="plus-circle-outline" title="Crear insumo nuevo" onPress={() => setCreatingIngredient(true)} style={{ flex: 1 }} />
              <Button variant="ghost" title="Cancelar" onPress={() => setAdding(false)} />
            </View>
          </View>
        ) : (
          <Button variant="secondary" icon="plus" title="Agregar insumo a la receta" onPress={() => setAdding(true)} />
        )}
        <Divider />
        <Row><Label muted size={14}>Precio sin ITBIS</Label><Label size={14}>{formatRD(net || 0)}</Label></Row>
        <Row><Label muted size={14}>{isCombo ? "Costo estimado" : "Costo de la receta"}</Label><Label size={14}>{formatRD(cost)}</Label></Row>
        <Row>
          <Label bold size={16}>Margen</Label>
          <Label bold size={16} color={margin >= 50 ? t.success : margin >= 25 ? t.accent : t.danger}>
            {recipe.length || isCombo ? `${margin}% · ${formatRD(net - cost)}` : '—'}
          </Label>
        </Row>
      </Card>


      <SectionTitle icon="food-variant">Combo y acompañantes</SectionTitle>
      <Card style={{ gap: 12 }}>
        <Label muted size={13}>
          ¿Es un combo? Agrega lo que trae siempre y lo que el cliente puede elegir (acompañante, bebida…). Al vender, la
          caja pregunta qué eligió y descuenta del inventario lo correcto.
        </Label>

        <Label bold size={15}>Trae siempre</Label>
        {includes.map((pid) => (
          <View key={pid} style={styles.comboRow}>
            <ProductImage uri={products.find((p) => p.id === pid)?.image_url ?? null} name={productName(pid)} size={36} radius={10} />
            <Label size={15} style={{ flex: 1 }} numberOfLines={1}>{productName(pid)}</Label>
            <Pressable accessibilityLabel={`Quitar ${productName(pid)}`} hitSlop={8} onPress={() => setIncludes((cur) => cur.filter((x) => x !== pid))}>
              <Icon name="close-circle" color={t.danger} />
            </Pressable>
          </View>
        ))}
        {addingInclude ? (
          <Chips
            options={products.filter((p) => !includes.includes(p.id)).map((p) => ({ value: p.id, label: p.name }))}
            value=""
            onChange={(v) => {
              setIncludes((cur) => [...cur, v]);
              setAddingInclude(false);
            }}
          />
        ) : (
          <Button variant="secondary" icon="plus" title="Agregar producto que trae" onPress={() => setAddingInclude(true)} disabled={!products.length} />
        )}

        {groups.map((g, gi) => (
          <View key={gi} style={[styles.group, { borderColor: t.border, backgroundColor: t.background }]}>
            <Row>
              <Label bold size={15}>Para elegir {gi + 1}</Label>
              <Pressable accessibilityLabel="Quitar grupo" hitSlop={8} onPress={() => setGroups((cur) => cur.filter((_, i) => i !== gi))}>
                <Icon name="delete-outline" color={t.danger} />
              </Pressable>
            </Row>
            <Field label="Nombre del grupo" icon="format-list-bulleted" value={g.name} onChangeText={(v) => updateGroup(gi, (x) => ({ ...x, name: v }))} placeholder="Ej. Acompañante" />
            <Chips
              options={GROUP_SUGGESTIONS.map((n) => ({ value: n, label: n }))}
              value={g.name}
              onChange={(v) => updateGroup(gi, (x) => ({ ...x, name: v }))}
            />
            <Label muted size={13}>Opciones (el cliente elige una). Precio extra solo si cuesta más.</Label>
            {g.options.map((o, oi) => (
              <View key={o.item_product_id} style={[styles.comboRow, { alignItems: 'flex-end' }]}>
                <Label size={15} style={{ flex: 1, paddingBottom: 14 }} numberOfLines={2}>{productName(o.item_product_id)}</Label>
                <View style={{ width: 120 }}>
                  <Field
                    label="Extra RD$"
                    keyboardType="decimal-pad"
                    value={o.extra}
                    placeholder="0"
                    onChangeText={(v) => updateGroup(gi, (x) => ({ ...x, options: x.options.map((y, j) => (j === oi ? { ...y, extra: v } : y)) }))}
                  />
                </View>
                <Pressable
                  accessibilityLabel={`Quitar ${productName(o.item_product_id)}`}
                  hitSlop={8}
                  style={{ paddingBottom: 14 }}
                  onPress={() => updateGroup(gi, (x) => ({ ...x, options: x.options.filter((_, j) => j !== oi) }))}>
                  <Icon name="close-circle" color={t.danger} />
                </Pressable>
              </View>
            ))}
            {addingOption === gi ? (
              <Chips
                options={products.filter((p) => !g.options.some((o) => o.item_product_id === p.id)).map((p) => ({ value: p.id, label: p.name }))}
                value=""
                onChange={(v) => {
                  updateGroup(gi, (x) => ({ ...x, options: [...x.options, { item_product_id: v, extra: '' }] }));
                  setAddingOption(null);
                }}
              />
            ) : (
              <Button variant="secondary" size="sm" icon="plus" title="Agregar opción" onPress={() => setAddingOption(gi)} disabled={!products.length} />
            )}
          </View>
        ))}
        <Button
          variant="secondary"
          icon="playlist-plus"
          title={groups.length ? 'Agregar otro grupo para elegir' : 'Agregar algo para elegir (acompañante, bebida…)'}
          onPress={() => setGroups((cur) => [...cur, { name: GROUP_SUGGESTIONS[cur.length] ?? '', options: [] }])}
          disabled={!products.length}
        />
        {!products.length ? (
          <Label muted size={13}>Primero crea los productos que van en el combo (ej. Papas fritas, Tostones, Refresco).</Label>
        ) : null}
      </Card>

      {msg ? <Label color={t.danger} size={14}>{msg}</Label> : null}
      <Button size="lg" icon="content-save" title={saving ? 'Guardando…' : 'Guardar producto'} onPress={save} disabled={saving || uploading || !name.trim() || !price} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  recipeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  comboRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  group: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
});
