import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/text';

import { foodIcon } from '@/components/brand-icons';
import { CHANNEL_OPTIONS, OrderPanel } from '@/components/order-panel';
import { ProductImage } from '@/components/product-image';
import { Button, Card, Chips, EmptyState, HeroCard, Icon, IconButton, Label, Screen, SectionTitle, useElevation } from '@/components/ui';
import { Mamey } from '@/constants/theme';
import { listCategories, listProducts } from '@/db/repo';
import { canManage, useBusiness, useFocusData } from '@/hooks/use-business';
import { useCart } from '@/hooks/use-cart';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';

export default function MenuScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const cart = useCart();
  const t = useTheme();
  const elevation = useElevation(2);
  const { width } = useWindowDimensions();
  const isTablet = width >= 900;

  const [data] = useFocusData(async () => ({ products: await listProducts(db), categories: await listCategories(db) }), [db]);
  const [category, setCategory] = useState<string>('todas');

  const products = (data?.products ?? []).filter((p) => category === 'todas' || p.category_id === category);
  const categoryName =
    category === 'todas' ? 'Todo el menú' : (data?.categories.find((c) => c.id === category)?.name ?? 'Menú');
  const columns = isTablet ? 3 : width >= 600 ? 3 : 2;
  const tileWidth = `${(100 - (columns - 1) * 3.5) / columns}%` as const;

  const menu = (
    <View style={{ gap: 14, flex: isTablet ? 3 : undefined }}>
      <HeroCard style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="silverware-fork-knife" color="#FFFFFF" size={20} />
          <Text style={styles.heroTitle}>Nueva orden</Text>
        </View>
        <Text style={styles.heroSub}>¿Para dónde es?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {CHANNEL_OPTIONS.map((c) => {
            const selected = cart.channel === c.value;
            return (
              <Pressable
                key={c.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => cart.setChannel(c.value)}
                style={[styles.heroChip, selected && { backgroundColor: '#FFFFFF' }]}>
                <Icon name={c.icon} size={16} color={selected ? Mamey : '#FFFFFF'} />
                <Text style={{ color: selected ? Mamey : '#FFFFFF', fontWeight: '800', fontSize: 14 }}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </HeroCard>

      <Chips
        scroll
        options={[
          { value: 'todas', label: 'Todo', icon: 'view-grid-outline' as const },
          ...(data?.categories ?? []).map((c) => ({ value: c.id, label: c.name, icon: foodIcon(c.name) })),
        ]}
        value={category}
        onChange={setCategory}
      />

      {data && data.products.length === 0 ? (
        <Card style={{ alignItems: 'center' }}>
          <EmptyState
            icon="book-open-variant"
            text={canManage(ctx) ? 'Todavía no tienes productos. Crea tu menú en el Catálogo.' : 'Todavía no hay productos. Pide al dueño que cree el menú.'}
          />
          {canManage(ctx) ? (
            <Button icon="book-open-variant" title="Ir al Catálogo" onPress={() => router.push('/catalogo')} style={{ alignSelf: 'stretch' }} />
          ) : null}
        </Card>
      ) : (
        <SectionTitle>{categoryName}</SectionTitle>
      )}

      <View style={styles.grid}>
        {products.map((p) => {
          const qty = cart.qtyOf(p.id);
          return (
            <View key={p.id} style={{ width: tileWidth }}>
              <Card style={{ padding: 8, gap: 8, borderColor: qty ? t.primary : t.border, borderWidth: qty ? 1.5 : StyleSheet.hairlineWidth }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ver ${p.name}`}
                  onPress={() => router.push({ pathname: '/producto/[id]', params: { id: p.id } })}
                  style={({ pressed }) => ({ gap: 8, opacity: pressed ? 0.85 : 1 })}>
                  <View>
                    <ProductImage uri={p.image_url} name={p.name} radius={14} />
                    {qty ? (
                      <View style={[styles.qty, { backgroundColor: t.primary }]}>
                        <Text style={styles.qtyText}>×{qty}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ paddingHorizontal: 4, gap: 2, minHeight: 40 }}>
                    <Label bold size={14} numberOfLines={2}>{p.name}</Label>
                  </View>
                </Pressable>
                <View style={styles.priceRow}>
                  <Text style={{ color: t.text, fontWeight: '900', fontSize: 16 }}>{formatRD(cart.priceOf(p))}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Agregar ${p.name} a la orden`}
                    onPress={() => cart.add(p)}
                    hitSlop={6}
                    style={({ pressed }) => [styles.addBtn, { backgroundColor: t.primary, opacity: pressed ? 0.8 : 1 }]}>
                    <Icon name="cart-plus" size={20} color="#FFFFFF" />
                  </Pressable>
                </View>
              </Card>
            </View>
          );
        })}
      </View>
    </View>
  );

  const footer =
    !isTablet && cart.count > 0 ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/orden')}
        style={[styles.footer, { backgroundColor: t.text }, elevation]}>
        <View style={[styles.footerCount, { backgroundColor: t.primary }]}>
          <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>{cart.count}</Text>
        </View>
        <Text style={{ color: t.background, fontWeight: '800', fontSize: 16, flex: 1 }}>Ver orden</Text>
        <Text style={{ color: t.background, fontWeight: '900', fontSize: 17 }}>{formatRD(cart.totals.total)}</Text>
        <Icon name="chevron-right" color={t.background} />
      </Pressable>
    ) : null;

  return (
    <Screen
      title=""
      brand={{
        left: <IconButton icon="map-marker-outline" label={ctx.locationName} onPress={() => router.push('/ajustes')} />,
        right: <IconButton icon="shopping-outline" label="Ver orden" badge={cart.count} onPress={() => router.push('/orden')} />,
      }}
      footer={footer}>
      {isTablet ? (
        <View style={{ flexDirection: 'row', gap: 18 }}>
          {menu}
          <View style={{ flex: 2, gap: 10 }}>
            <SectionTitle icon="receipt-text-outline">Orden</SectionTitle>
            <OrderPanel compact />
          </View>
        </View>
      ) : (
        menu
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  heroSub: { color: '#FFFFFFD9', fontSize: 14, fontWeight: '600', marginTop: -6 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF33',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  qty: { position: 'absolute', top: 8, right: 8, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  qtyText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 2 },
  addBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  footer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  footerCount: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
