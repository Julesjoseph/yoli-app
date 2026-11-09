import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { CHANNEL_ICONS } from '@/components/brand-icons';
import { ProductImage } from '@/components/product-image';
import { Button, Card, Chips, Divider, EmptyState, Field, Icon, Label, Row } from '@/components/ui';
import { ChannelColors } from '@/constants/theme';
import { useAuth } from '@/auth/auth';
import { recordSale, type PaymentMethod } from '@/db/repo';
import { useBusiness } from '@/hooks/use-business';
import { useCart } from '@/hooks/use-cart';
import { useTheme } from '@/hooks/use-theme';
import { CHANNEL_LABELS, DELIVERY_CHANNELS, formatRD, type Channel } from '@/lib/calc';
import { getTicketSettings, printOrderTicket } from '@/printing/receipt';

export const CHANNEL_OPTIONS = (Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => ({
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

/** La orden en curso: líneas, canal, pago, totales y botón Cobrar. */
export function OrderPanel({ onCharged, compact }: { onCharged?: () => void; compact?: boolean }) {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const auth = useAuth();
  const cart = useCart();
  const t = useTheme();
  const [saving, setSaving] = useState(false);
  const isDelivery = DELIVERY_CHANNELS.includes(cart.channel);

  async function charge() {
    setSaving(true);
    try {
      const { order, totals } = await recordSale(db, ctx, {
        channel: cart.channel,
        lines: cart.lines,
        paymentMethod: isDelivery ? 'plataforma' : cart.payment,
        externalRef: cart.externalRef,
      });
      cart.clear();
      onCharged?.();
      const shop = {
        businessName: ctx.businessName,
        locationName: ctx.locationName,
        cashier: (auth.session?.user.user_metadata?.name as string | undefined) ?? undefined,
      };
      const print = () =>
        printOrderTicket(db, order.id, shop).catch((e) => Alert.alert('No se pudo imprimir', e instanceof Error ? e.message : String(e)));
      if ((await getTicketSettings(db)).autoPrint) {
        print();
      } else {
        Alert.alert('✅ Venta registrada', `Total ${formatRD(totals.total)}\nNeto para el negocio ${formatRD(totals.netIncome)}`, [
          { text: 'Listo', style: 'cancel' },
          { text: 'Imprimir ticket', onPress: print },
        ]);
      }
    } catch (e) {
      Alert.alert('No se pudo guardar', String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <Card style={{ gap: 0, paddingVertical: 6 }}>
        {cart.lines.length === 0 ? <EmptyState icon="cart-outline" text="La orden está vacía. Agrega productos desde el menú." /> : null}
        {cart.lines.map((l, i) => (
          <View key={l.product.id} style={[styles.line, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
            <ProductImage uri={l.product.image_url} name={l.product.name} size={compact ? 52 : 64} radius={14} />
            <View style={{ flex: 1, gap: 6 }}>
              <Row>
                <Label bold size={15} numberOfLines={2} style={{ flex: 1 }}>{l.product.name}</Label>
                <Pressable onPress={() => cart.removeAll(l.product.id)} accessibilityLabel={`Quitar ${l.product.name}`} hitSlop={8}>
                  <Icon name="close" size={18} color={t.textSecondary} />
                </Pressable>
              </Row>
              <Row>
                <Text style={{ color: t.primary, fontWeight: '900', fontSize: 15 }}>{formatRD(l.product.price * l.quantity)}</Text>
                <View style={[styles.stepper, { borderColor: t.border }]}>
                  <Pressable onPress={() => cart.remove(l.product.id)} accessibilityLabel="Uno menos" hitSlop={6}>
                    <Icon name="minus" size={18} color={t.primary} />
                  </Pressable>
                  <Label bold size={15} style={{ minWidth: 18, textAlign: 'center' }}>{l.quantity}</Label>
                  <Pressable onPress={() => cart.add(l.product)} accessibilityLabel="Uno más" hitSlop={6}>
                    <Icon name="plus" size={18} color={t.primary} />
                  </Pressable>
                </View>
              </Row>
            </View>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 12 }}>
        <Label bold size={16}>¿Dónde es la orden?</Label>
        <Chips options={CHANNEL_OPTIONS} value={cart.channel} onChange={cart.setChannel} />
        {isDelivery ? (
          <Field
            label={`Número de pedido ${CHANNEL_LABELS[cart.channel]}`}
            icon="pound"
            value={cart.externalRef}
            onChangeText={cart.setExternalRef}
            placeholder="Ej. 12345678"
          />
        ) : (
          <>
            <Label bold size={16}>Forma de pago</Label>
            <Chips options={PAYMENTS} value={cart.payment} onChange={cart.setPayment} />
          </>
        )}
      </Card>

      <Card style={{ gap: 8 }}>
        <Row><Label muted size={14}>Subtotal</Label><Label size={14}>{formatRD(cart.totals.subtotal)}</Label></Row>
        <Row><Label muted size={14}>ITBIS 18%</Label><Label size={14}>{formatRD(cart.totals.itbis)}</Label></Row>
        {cart.totals.tipLaw > 0 ? (
          <Row><Label muted size={14}>Propina legal 10%</Label><Label size={14}>{formatRD(cart.totals.tipLaw)}</Label></Row>
        ) : null}
        <Divider />
        <Row>
          <Label bold size={18}>Total a cobrar</Label>
          <Text style={{ color: t.text, fontSize: 24, fontWeight: '900' }}>{formatRD(cart.totals.total)}</Text>
        </Row>
      </Card>

      <Button
        size="lg"
        icon="check-circle"
        title={saving ? 'Guardando…' : `Cobrar ${formatRD(cart.totals.total)}`}
        onPress={charge}
        disabled={cart.lines.length === 0 || saving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5 },
});
