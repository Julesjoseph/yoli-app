import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button, Card, Chips, Field, Label, Row, Screen } from '@/components/ui';
import { listCategories, listProducts, recordSale, type PaymentMethod, type Product } from '@/db/repo';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { CHANNEL_LABELS, computeOrderTotals, DELIVERY_CHANNELS, formatRD, type Channel } from '@/lib/calc';

const CHANNELS = (Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => ({ value: c, label: CHANNEL_LABELS[c] }));
const PAYMENTS: { value: PaymentMethod; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
];

export default function PosScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
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
  const totals = useMemo(
    () => computeOrderTotals(lines.map((l) => ({ unitPrice: l.product.price, quantity: l.quantity, itbisRate: l.product.itbis_rate })), channel),
    [lines, channel],
  );

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
      Alert.alert('Venta registrada', `Total ${formatRD(saved.total)}\nNeto para el negocio ${formatRD(saved.netIncome)}`);
    } catch (e) {
      Alert.alert('No se pudo guardar', String(e));
    } finally {
      setSaving(false);
    }
  }

  const menu = (
    <View style={{ gap: 12, flex: isTablet ? 3 : undefined }}>
      <Chips
        options={[{ value: 'todas', label: 'Todo' }, ...(data?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))]}
        value={category}
        onChange={setCategory}
      />
      <View style={styles.grid}>
        {products.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            onPress={() => add(p)}
            style={({ pressed }) => [styles.tile, { backgroundColor: t.backgroundElement, opacity: pressed ? 0.7 : 1, width: isTablet ? '31%' : '47%' }]}>
            <Label bold>{p.name}</Label>
            <Label muted>{formatRD(p.price)}</Label>
            {cart[p.id] ? <Label color={t.primary} bold>× {cart[p.id].quantity}</Label> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );

  const ticket = (
    <Card style={{ flex: isTablet ? 2 : undefined, alignSelf: 'flex-start', width: isTablet ? undefined : '100%' }}>
      <Label bold size={18}>Orden</Label>
      <Chips options={CHANNELS} value={channel} onChange={setChannel} />
      {lines.length === 0 ? <Label muted>Toca un producto para agregarlo</Label> : null}
      {lines.map((l) => (
        <Row key={l.product.id}>
          <Pressable onPress={() => remove(l.product.id)} accessibilityLabel={`Quitar ${l.product.name}`} style={{ flex: 1 }}>
            <Label>{l.quantity} × {l.product.name}</Label>
          </Pressable>
          <Label>{formatRD(l.product.price * l.quantity)}</Label>
        </Row>
      ))}
      <View style={{ height: 1, backgroundColor: t.border }} />
      <Row><Label muted>Subtotal</Label><Label muted>{formatRD(totals.subtotal)}</Label></Row>
      <Row><Label muted>ITBIS 18%</Label><Label muted>{formatRD(totals.itbis)}</Label></Row>
      {totals.tipLaw > 0 ? <Row><Label muted>Propina legal 10%</Label><Label muted>{formatRD(totals.tipLaw)}</Label></Row> : null}
      <Row><Label bold size={20}>Total</Label><Label bold size={20}>{formatRD(totals.total)}</Label></Row>
      {isDelivery ? (
        <Field label={`Número de pedido ${CHANNEL_LABELS[channel]}`} value={externalRef} onChangeText={setExternalRef} placeholder="Ej. 12345678" />
      ) : (
        <Chips options={PAYMENTS} value={payment} onChange={setPayment} />
      )}
      <Button title={saving ? 'Guardando…' : 'Cobrar'} onPress={charge} disabled={lines.length === 0 || saving} />
      {lines.length > 0 ? <Button title="Vaciar" variant="secondary" onPress={() => setCart({})} /> : null}
    </Card>
  );

  return (
    <Screen title="Caja">
      {isTablet ? <View style={{ flexDirection: 'row', gap: 16 }}>{menu}{ticket}</View> : <>{menu}{ticket}</>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { borderRadius: 14, padding: 12, gap: 4, minHeight: 90 },
});
