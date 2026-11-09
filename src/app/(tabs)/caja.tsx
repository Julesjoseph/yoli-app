import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { CHANNEL_ICONS, foodIcon } from '@/components/brand-icons';
import { Button, Card, Chips, Divider, EmptyState, Field, Icon, IconBadge, Label, Row, Screen, useElevation } from '@/components/ui';
import { ChannelColors } from '@/constants/theme';
import { listCategories, listProducts, recordSale, type PaymentMethod, type Product } from '@/db/repo';
import { canManage, useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { CHANNEL_LABELS, computeOrderTotals, DELIVERY_CHANNELS, formatRD, type Channel } from '@/lib/calc';

const CHANNELS = (Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => ({
  value: c,
  label: CHANNEL_LABELS[c],
  icon: CHANNEL_ICONS[c],
  color: ChannelColors[c],
}));
const PAYMENTS = [
  { value: 'efectivo' as PaymentMethod, label: 'Efectivo', icon: 'cash' as const },
  { value: 'tarjeta' as PaymentMethod, label: 'Tarjeta', icon: 'credit-card' as const },
  { value: 'transferencia' as PaymentMethod, label: 'Transferencia', icon: 'bank-transfer' as const },
];

export default function PosScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const elevation = useElevation(2);
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [data] = useFocusData(async () => ({ products: await listProducts(db), categories: await listCategories(db) }), [db]);
  const [category, setCategory] = useState<string>('todas');
  const [cart, setCart] = useState<Record<string, { product: Product; quantity: number }>>({});
  const [channel, setChannel] = useState<Channel>('local');
  const [payment, setPayment] = useState<PaymentMethod>('efectivo');
  const [externalRef, setExternalRef] = useState('');
  const [saving, setSaving] = useState(false);

  const isDelivery = DELIVERY_CHANNELS.includes(channel);
  const lines = Object.values(cart);
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);
  const totals = useMemo(
    () =>
      computeOrderTotals(
        lines.map((l) => ({ unitPrice: l.product.price, quantity: l.quantity, itbisRate: l.product.itbis_rate })),
        channel,
      ),
    [lines, channel],
  );

  const categoryName = (id: string | null) => data?.categories.find((c) => c.id === id)?.name ?? '';
  const products = (data?.products ?? []).filter((p) => category === 'todas' || p.category_id === category);
  const add = (p: Product) => setCart((c) => ({ ...c, [p.id]: { product: p, quantity: (c[p.id]?.quantity ?? 0) + 1 } }));
  const remove = (id: string) =>
    setCart((c) => {
      const next = { ...c };
      if (next[id].quantity > 1) next[id] = { ...next[id], quantity: next[id].quantity - 1 };
      else delete next[id];
      return next;
    });

  async function charge() {
    setSaving(true);
    try {
      const { totals: saved } = await recordSale(db, ctx, {
        channel,
        lines,
        paymentMethod: isDelivery ? 'plataforma' : payment,
        externalRef,
      });
      setCart({});
      setExternalRef('');
      Alert.alert('✅ Venta registrada', `Total ${formatRD(saved.total)}\nNeto para el negocio ${formatRD(saved.netIncome)}`);
    } catch (e) {
      Alert.alert('No se pudo guardar', String(e));
    } finally {
      setSaving(false);
    }
  }

  const tileWidth = isTablet ? '31.5%' : '48%';
  const menu = (
    <View style={{ gap: 14, flex: isTablet ? 3 : undefined }}>
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
      ) : null}
      <View style={styles.grid}>
        {products.map((p) => {
          const qty = cart[p.id]?.quantity;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`Agregar ${p.name}`}
              onPress={() => add(p)}
              style={({ pressed }) => [
                styles.tile,
                {
                  width: tileWidth,
                  backgroundColor: t.backgroundElement,
                  borderColor: qty ? t.primary : t.border,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}>
              <Row>
                <IconBadge name={foodIcon(p.name + ' ' + categoryName(p.category_id))} color={t.primary} size={42} />
                {qty ? (
                  <View style={[styles.qty, { backgroundColor: t.primary }]}>
                    <Text style={styles.qtyText}>{qty}</Text>
                  </View>
                ) : (
                  <Icon name="plus-circle-outline" size={22} color={t.textSecondary} />
                )}
              </Row>
              <Label bold size={15} numberOfLines={2}>{p.name}</Label>
              <Text style={{ color: t.primary, fontWeight: '800', fontSize: 16 }}>{formatRD(p.price)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const ticket = (
    <Card style={{ flex: isTablet ? 2 : undefined, alignSelf: 'flex-start', width: isTablet ? undefined : '100%', gap: 12 }}>
      <Row>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="receipt-text-outline" size={22} color={t.primary} />
          <Label bold size={19}>Orden</Label>
        </View>
        {lines.length > 0 ? (
          <Pressable onPress={() => setCart({})} accessibilityRole="button" hitSlop={8}>
            <Label color={t.danger} bold size={14}>Vaciar</Label>
          </Pressable>
        ) : null}
      </Row>
      <Chips options={CHANNELS} value={channel} onChange={setChannel} />
      {lines.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 18, gap: 6 }}>
          <Icon name="cart-outline" size={34} color={t.textSecondary} />
          <Label muted size={14}>Toca un producto para agregarlo</Label>
        </View>
      ) : null}
      {lines.map((l) => (
        <Row key={l.product.id}>
          <View style={{ flex: 1, gap: 2 }}>
            <Label bold size={15} numberOfLines={1}>{l.product.name}</Label>
            <Label muted size={13}>{formatRD(l.product.price)} c/u</Label>
          </View>
          <View style={[styles.stepper, { backgroundColor: t.backgroundSelected }]}>
            <Pressable onPress={() => remove(l.product.id)} accessibilityLabel={`Quitar uno de ${l.product.name}`} hitSlop={6}>
              <Icon name="minus" size={18} />
            </Pressable>
            <Label bold size={15}>{l.quantity}</Label>
            <Pressable onPress={() => add(l.product)} accessibilityLabel={`Agregar uno de ${l.product.name}`} hitSlop={6}>
              <Icon name="plus" size={18} />
            </Pressable>
          </View>
          <Label bold size={15} style={{ minWidth: 92, textAlign: 'right' }}>{formatRD(l.product.price * l.quantity)}</Label>
        </Row>
      ))}
      <Divider />
      <Row><Label muted size={14}>Subtotal</Label><Label muted size={14}>{formatRD(totals.subtotal)}</Label></Row>
      <Row><Label muted size={14}>ITBIS 18%</Label><Label muted size={14}>{formatRD(totals.itbis)}</Label></Row>
      {totals.tipLaw > 0 ? (
        <Row><Label muted size={14}>Propina legal 10%</Label><Label muted size={14}>{formatRD(totals.tipLaw)}</Label></Row>
      ) : null}
      <Row>
        <Label bold size={22}>Total</Label>
        <Text style={{ color: t.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 }}>{formatRD(totals.total)}</Text>
      </Row>
      {isDelivery ? (
        <Field
          label={`Número de pedido ${CHANNEL_LABELS[channel]}`}
          icon="pound"
          value={externalRef}
          onChangeText={setExternalRef}
          placeholder="Ej. 12345678"
        />
      ) : (
        <Chips options={PAYMENTS} value={payment} onChange={setPayment} />
      )}
      {isTablet ? (
        <Button size="lg" icon="check-circle" title={saving ? 'Guardando…' : `Cobrar ${formatRD(totals.total)}`} onPress={charge} disabled={lines.length === 0 || saving} />
      ) : null}
    </Card>
  );

  const footer =
    !isTablet && lines.length > 0 ? (
      <View style={[styles.footer, { backgroundColor: t.backgroundElement, borderColor: t.border }, elevation]}>
        <View style={{ flex: 1 }}>
          <Label muted size={13}>{itemCount} {itemCount === 1 ? 'artículo' : 'artículos'} · {CHANNEL_LABELS[channel]}</Label>
          <Text style={{ color: t.text, fontSize: 22, fontWeight: '900' }}>{formatRD(totals.total)}</Text>
        </View>
        <Button icon="check-circle" title={saving ? 'Guardando…' : 'Cobrar'} onPress={charge} disabled={saving} style={{ minWidth: 150 }} />
      </View>
    ) : null;

  return (
    <Screen title="Caja" subtitle={ctx.locationName} footer={footer}>
      {isTablet ? (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {menu}
          {ticket}
        </View>
      ) : (
        <>
          {menu}
          {ticket}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  tile: { borderRadius: 20, padding: 14, gap: 8, minHeight: 138, borderWidth: 1.5 },
  qty: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  qtyText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
