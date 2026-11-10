import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { foodIcon } from '@/components/brand-icons';
import { IngredientForm } from '@/components/ingredient-form';
import { ProductImage } from '@/components/product-image';
import { Button, Card, Chips, EmptyState, Field, Icon, IconBadge, Label, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import {
  listCatalogCategories,
  listCatalogIngredients,
  listCatalogProducts,
  loadSampleCatalog,
  recipeCost,
  saveCategory,
  type CatalogIngredient,
} from '@/db/catalog';
import { canManage, useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';
import { unitName } from '@/lib/units';

type Tab = 'productos' | 'insumos' | 'categorias';

const num = (s: string) => Number(s.replace(',', '.'));

export default function CatalogScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [tab, setTab] = useState<Tab>('productos');
  const [busy, setBusy] = useState(false);

  const [data, reload] = useFocusData(async () => {
    const [products, categories, ingredients, recipes] = await Promise.all([
      listCatalogProducts(db),
      listCatalogCategories(db),
      listCatalogIngredients(db),
      db.getAllAsync<{ product_id: string; ingredient_id: string; quantity: number }>(
        'SELECT product_id, ingredient_id, quantity FROM recipe_items',
      ),
    ]);
    return { products, categories, ingredients, recipes };
  }, [db]);

  if (!canManage(ctx)) {
    return (
      <Screen back title="Catálogo">
        <EmptyState icon="lock-outline" text="Solo el dueño o un gerente puede cambiar el catálogo." />
      </Screen>
    );
  }

  async function loadSample() {
    setBusy(true);
    try {
      await loadSampleCatalog(db, ctx);
      reload();
    } catch (e) {
      Alert.alert('No se pudo cargar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const products = data?.products ?? [];
  const categories = data?.categories ?? [];
  const ingredients = data?.ingredients ?? [];

  return (
    <Screen back title="Catálogo" subtitle={ctx.businessName}>
      <Chips
        options={[
          { value: 'productos', label: `Productos (${products.length})`, icon: 'food' },
          { value: 'insumos', label: `Insumos (${ingredients.length})`, icon: 'basket-outline' },
          { value: 'categorias', label: `Categorías (${categories.length})`, icon: 'shape-outline' },
        ]}
        value={tab}
        onChange={setTab}
        scroll
      />

      {tab === 'productos' ? (
        <>
          <Button icon="plus" title="Nuevo producto" onPress={() => router.push('/catalogo/producto')} />
          {products.length === 0 ? (
            <Card style={{ alignItems: 'center' }}>
              <EmptyState
                icon="book-open-variant"
                text={ctx.demo ? 'El catálogo del demo está vacío.' : 'Tu catálogo está vacío. Crea tu primer producto con el botón de arriba.'}
              />
              {/* La cuenta real empieza sin datos; el menú de ejemplo es solo para el demo. */}
              {ctx.demo ? (
                <Button
                  variant="secondary"
                  icon="auto-fix"
                  title={busy ? 'Cargando…' : 'Cargar menú de ejemplo'}
                  onPress={loadSample}
                  disabled={busy}
                  style={{ alignSelf: 'stretch' }}
                />
              ) : null}
            </Card>
          ) : null}
          {[...categories.map((c) => ({ id: c.id as string | null, name: c.name })), { id: null, name: 'Sin categoría' }].map((c) => {
            const items = products.filter((p) => p.category_id === c.id || (c.id === null && !categories.some((x) => x.id === p.category_id)));
            if (items.length === 0) return null;
            return (
              <View key={c.id ?? 'none'} style={{ gap: 10 }}>
                <SectionTitle icon={foodIcon(c.name)}>{c.name}</SectionTitle>
                <Card style={{ gap: 0, paddingVertical: 6 }}>
                  {items.map((p, i) => {
                    const recipe = (data?.recipes ?? [])
                      .filter((r) => r.product_id === p.id)
                      .map((r) => ({ ingredient_id: r.ingredient_id, quantity: r.quantity }));
                    const cost = recipeCost(recipe, ingredients);
                    const net = p.price / (1 + p.itbis_rate);
                    const margin = net > 0 && cost > 0 ? Math.round(((net - cost) / net) * 100) : null;
                    return (
                      <Pressable
                        key={p.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Editar ${p.name}`}
                        onPress={() => router.push({ pathname: '/catalogo/producto', params: { id: p.id } })}
                        style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }, !p.active && { opacity: 0.5 }]}>
                        <ProductImage uri={p.image_url} name={p.name + ' ' + c.name} size={48} radius={14} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Label bold size={15} numberOfLines={2}>{p.name}</Label>
                          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                            {!p.active ? <Pill text="OCULTO" color={t.textSecondary} /> : null}
                            {p.price_pedidosya || p.price_ubereats ? <Pill text="PRECIO DELIVERY" color={t.info} /> : null}
                            {p.delivery_itbis_exempt ? <Pill text="DELIVERY SIN ITBIS" color={t.success} /> : null}
                            {margin !== null ? (
                              <Pill text={`MARGEN ${margin}%`} color={margin >= 50 ? t.success : margin >= 25 ? t.accent : t.danger} />
                            ) : (
                              <Pill text="SIN RECETA" color={t.textSecondary} />
                            )}
                          </View>
                        </View>
                        <Label bold size={16} color={t.primary}>{formatRD(p.price)}</Label>
                        <Icon name="chevron-right" size={20} color={t.textSecondary} />
                      </Pressable>
                    );
                  })}
                </Card>
              </View>
            );
          })}
        </>
      ) : null}

      {tab === 'insumos' ? <Ingredients ingredients={ingredients} onSaved={reload} /> : null}
      {tab === 'categorias' ? <Categories categories={categories} onSaved={reload} /> : null}
    </Screen>
  );
}

function Ingredients({ ingredients, onSaved }: { ingredients: CatalogIngredient[]; onSaved: () => void }) {
  const t = useTheme();
  const [editing, setEditing] = useState<Partial<CatalogIngredient> | null>(null);

  return (
    <>
      {editing ? (
        <IngredientForm
          key={editing.id ?? 'nuevo'}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onSaved();
          }}
        />
      ) : (
        <Button icon="plus" title="Nuevo insumo" onPress={() => setEditing({})} />
      )}
      <Card style={{ gap: 0, paddingVertical: 6 }}>
        {ingredients.length === 0 ? <EmptyState icon="basket-outline" text="Todavía no hay insumos. Ej.: piezas de pollo, pan, queso, arroz." /> : null}
        {ingredients.map((i, idx) => (
          <Pressable
            key={i.id}
            accessibilityRole="button"
            onPress={() => setEditing(i)}
            style={[styles.item, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
            <IconBadge name={foodIcon(i.name)} color={t.success} size={38} />
            <View style={{ flex: 1 }}>
              <Label bold size={15}>{i.name}</Label>
              <Label muted size={13}>Se cuenta en {unitName(i.unit)} · aviso con menos de {i.min_stock}</Label>
            </View>
            <Label size={14}>{formatRD(i.cost_per_unit)} c/{unitName(i.unit, 1)}</Label>
            <Icon name="pencil-outline" size={18} color={t.textSecondary} />
          </Pressable>
        ))}
      </Card>
    </>
  );
}

function Categories({ categories, onSaved }: { categories: { id: string; name: string; sort_order: number }[]; onSaved: () => void }) {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  async function save() {
    try {
      const current = categories.find((c) => c.id === editId);
      await saveCategory(db, ctx, {
        id: editId ?? undefined,
        name,
        sort_order: current?.sort_order ?? categories.length + 1,
      });
      setName('');
      setEditId(null);
      setMsg('');
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <Card style={{ gap: 12 }}>
        <Field
          label={editId ? 'Cambiar nombre' : 'Nueva categoría'}
          icon="shape-outline"
          value={name}
          onChangeText={setName}
          placeholder="Ej. Desayunos"
        />
        {msg ? <Label color={t.danger} size={14}>{msg}</Label> : null}
        <Button icon={editId ? 'content-save' : 'plus'} title={editId ? 'Guardar' : 'Agregar categoría'} onPress={save} disabled={!name.trim()} />
        {editId ? <Button variant="ghost" title="Cancelar" onPress={() => { setEditId(null); setName(''); }} /> : null}
      </Card>
      <Card style={{ gap: 0, paddingVertical: 6 }}>
        {categories.map((c, idx) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            onPress={() => {
              setEditId(c.id);
              setName(c.name);
            }}
            style={[styles.item, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
            <IconBadge name={foodIcon(c.name)} color={t.primary} size={38} />
            <Label bold size={15} style={{ flex: 1 }}>{c.name}</Label>
            <Icon name="pencil-outline" size={18} color={t.textSecondary} />
          </Pressable>
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
});
