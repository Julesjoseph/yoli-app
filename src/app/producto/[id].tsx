import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { foodIcon } from '@/components/brand-icons';
import { ProductImage } from '@/components/product-image';
import { EmptyState, Icon, IconBadge, Label, useElevation } from '@/components/ui';
import { Mamey } from '@/constants/theme';
import { getRecipe, listCatalogIngredients } from '@/db/catalog';
import { listCategories, listProducts } from '@/db/repo';
import { useFocusData } from '@/hooks/use-business';
import { useCart } from '@/hooks/use-cart';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/caja'));

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const cart = useCart();
  const t = useTheme();
  const elevation = useElevation(2);
  const [qty, setQty] = useState(1);

  const [data] = useFocusData(async () => {
    const [products, categories, recipe, ingredients] = await Promise.all([
      listProducts(db),
      listCategories(db),
      getRecipe(db, id),
      listCatalogIngredients(db),
    ]);
    const product = products.find((p) => p.id === id) ?? null;
    return {
      product,
      category: categories.find((c) => c.id === product?.category_id)?.name ?? null,
      ingredients: recipe
        .map((r) => ingredients.find((i) => i.id === r.ingredient_id))
        .filter((i): i is NonNullable<typeof i> => !!i),
    };
  }, [db, id]);

  const product = data?.product;
  const inCart = product ? cart.qtyOf(product.id) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={[styles.hero, { backgroundColor: Mamey }]}>
          <SafeAreaView edges={['top']} style={styles.topBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={goBack} hitSlop={8} style={styles.round}>
              <Icon name="arrow-left" color="#FFFFFF" />
            </Pressable>
            <Text style={styles.topTitle}>Detalle</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver orden"
              onPress={() => router.push('/orden')}
              hitSlop={8}
              style={styles.round}>
              <Icon name="shopping-outline" color="#FFFFFF" />
              {cart.count ? (
                <View style={styles.badge}>
                  <Text style={{ color: Mamey, fontSize: 11, fontWeight: '900' }}>{cart.count}</Text>
                </View>
              ) : null}
            </Pressable>
          </SafeAreaView>
        </View>

        <View style={styles.imageWrap}>
          <View style={[styles.imageRing, { backgroundColor: t.background }, elevation]}>
            <ProductImage uri={product?.image_url} name={product?.name ?? ''} size={220} radius={110} />
          </View>
        </View>

        {data && !product ? (
          <EmptyState icon="food-off" text="Este producto ya no está en el menú." />
        ) : product ? (
          <View style={{ paddingHorizontal: 20, gap: 18 }}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              {data?.category ? (
                <View style={[styles.catPill, { backgroundColor: t.primarySoft }]}>
                  <Icon name={foodIcon(data.category)} size={14} color={t.primary} />
                  <Text style={{ color: t.primary, fontWeight: '800', fontSize: 12 }}>{data.category}</Text>
                </View>
              ) : null}
              <Text style={[styles.name, { color: t.text }]}>{product.name}</Text>
              <Text style={[styles.price, { color: t.primary }]}>{formatRD(cart.priceOf(product))}</Text>
              <Label muted size={13}>Precio con ITBIS incluido</Label>
              {inCart ? <Label size={13} color={t.success}>Ya tienes {inCart} en la orden</Label> : null}
            </View>

            {data && data.ingredients.length ? (
              <View style={{ gap: 10 }}>
                <Label bold size={17}>Ingredientes</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {data.ingredients.map((i) => (
                    <View key={i.id} style={[styles.ingredient, { backgroundColor: t.backgroundElement, borderColor: t.border }]}>
                      <IconBadge name={foodIcon(i.name)} color={t.primary} size={44} />
                      <Label size={12} numberOfLines={2} style={{ textAlign: 'center' }}>{i.name}</Label>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {product ? (
        <SafeAreaView edges={['bottom']} style={[styles.bar, { backgroundColor: t.backgroundElement, borderColor: t.border }, elevation]}>
          <View style={[styles.stepper, { backgroundColor: t.background, borderColor: t.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quitar uno"
              onPress={() => setQty((q) => Math.max(1, q - 1))}
              hitSlop={6}
              style={styles.stepBtn}>
              <Icon name="minus" color={t.text} />
            </Pressable>
            <Text style={{ color: t.text, fontWeight: '900', fontSize: 18, minWidth: 26, textAlign: 'center' }}>{qty}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Agregar uno"
              onPress={() => setQty((q) => q + 1)}
              hitSlop={6}
              style={[styles.stepBtn, { backgroundColor: t.primary }]}>
              <Icon name="plus" color="#FFFFFF" />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              cart.add(product, qty);
              goBack();
            }}
            style={({ pressed }) => [styles.cta, { backgroundColor: t.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Icon name="cart-plus" color="#FFFFFF" size={20} />
            <Text style={styles.ctaText} numberOfLines={1}>Agregar · {formatRD(cart.priceOf(product) * qty)}</Text>
          </Pressable>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 230, borderBottomLeftRadius: 140, borderBottomRightRadius: 140 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  topTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 18 },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF33', alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  imageWrap: { alignItems: 'center', marginTop: -150, marginBottom: 18 },
  imageRing: { padding: 8, borderRadius: 999 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  name: { fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  price: { fontSize: 28, fontWeight: '900' },
  ingredient: { width: 92, alignItems: 'center', gap: 6, padding: 10, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, padding: 5, borderWidth: StyleSheet.hairlineWidth },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cta: { flex: 1, height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
});
