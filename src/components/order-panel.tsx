import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';

import { CHANNEL_ICONS } from '@/components/brand-icons';
import { CustomerPicker } from '@/components/customer-picker';
import { getCustomer } from '@/db/credit';
import { ProductImage } from '@/components/product-image';
import { Button, Card, Chips, Divider, EmptyState, Field, Icon, Label, Row } from '@/components/ui';
import { ChannelColors } from '@/constants/theme';
import { useAuth } from '@/auth/auth';
import { recordSale, type PaymentMethod } from '@/db/repo';
import { useBusiness } from '@/hooks/use-business';
import { useCart } from '@/hooks/use-cart';
import { useTheme } from '@/hooks/use-theme';
import { CHANNEL_LABELS, DELIVERY_CHANNELS, formatRD, type Channel, parseAmount } from '@/lib/calc';
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
  { value: 'credito' as PaymentMethod, label: 'A crédito', icon: 'account-clock' as const },
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
  const cashMode = !isDelivery && cart.payment === 'efectivo';
  const received = cashMode ? parseAmount(cart.cashReceived) || 0 : 0;
  const short = received > 0 && received < cart.totals.total;
  const credit = !isDelivery && cart.payment === 'credito';

  async function charge() {
    setSaving(true);
    try {
      const { order, totals } = await recordSale(db, ctx, {
        channel: cart.channel,
        lines: cart.lines,
        paymentMethod: isDelivery ? 'plataforma' : cart.payment,
        externalRef: cart.externalRef,
        discount: cart.totals.discount,
        applyTipLaw: cart.tipLaw,
        cashReceived: received || null,
        customerId: credit ? cart.customerId : null,
      });
      const customer = credit && cart.customerId ? await getCustomer(db, cart.customerId) : null;
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
        const change = received ? `\nRecibido ${formatRD(received)} · Devuelta ${formatRD(received - totals.total)}` : '';
        const debt = customer ? `\nA crédito: ${customer.name} ahora debe ${formatRD(customer.balance)}` : '';
        Alert.alert('✅ Venta registrada', `Total ${formatRD(totals.total)}${change}${debt}`, [
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
              {l.product.extra ? (
                <Label muted size={12}>Incluye extra de {formatRD(l.product.extra.amount)} por unidad</Label>
              ) : null}
              <ExtraButton lineId={l.product.id} />
              <Row>
                <Text style={{ color: t.primary, fontWeight: '900', fontSize: 15 }}>{formatRD(cart.priceOf(l.product) * l.quantity)}</Text>
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
            {credit ? <CustomerPicker value={cart.customerId} onChange={cart.setCustomerId} total={cart.totals.total} /> : null}
            <DiscountPicker />
          </>
        )}
      </Card>

      <Card style={{ gap: 8 }}>
        {cart.totals.discount > 0 ? (
          <Row><Label size={14} color={t.success}>Descuento</Label><Label size={14} color={t.success}>−{formatRD(cart.totals.discount)}</Label></Row>
        ) : null}
        <Row><Label muted size={14}>Subtotal</Label><Label size={14}>{formatRD(cart.totals.subtotal)}</Label></Row>
        <Row><Label muted size={14}>ITBIS 18%</Label><Label size={14}>{formatRD(cart.totals.itbis)}</Label></Row>
        {cart.channel === 'local' ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: cart.tipLaw }}
            accessibilityLabel="Cobrar propina legal 10%"
            onPress={() => cart.setTipLaw(!cart.tipLaw)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name={cart.tipLaw ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={cart.tipLaw ? t.primary : t.textSecondary} />
            <Label muted size={14} style={{ flex: 1 }}>Propina legal 10%{cart.tipLaw ? '' : ' (no se cobra)'}</Label>
            <Label size={14} muted={!cart.tipLaw}>{formatRD(cart.totals.tipLaw)}</Label>
          </Pressable>
        ) : null}
        <Divider />
        <Row>
          <Label bold size={18}>Total a cobrar</Label>
          <Text style={{ color: t.text, fontSize: 24, fontWeight: '900' }}>{formatRD(cart.totals.total)}</Text>
        </Row>
      </Card>

      {cashMode && cart.lines.length ? <CashBox total={cart.totals.total} /> : null}

      <Button
        size="lg"
        icon="check-circle"
        title={saving ? 'Guardando…' : credit ? `Vender a crédito ${formatRD(cart.totals.total)}` : `Cobrar ${formatRD(cart.totals.total)}`}
        onPress={charge}
        disabled={cart.lines.length === 0 || saving || short || (credit && !cart.customerId)}
      />
    </View>
  );
}

const QUICK_EXTRAS = [25, 50, 100];

/** "Agregar extra": cobra algo más por un producto (ej. mangú con un poco más: +RD$50). */
function ExtraButton({ lineId }: { lineId: string }) {
  const cart = useCart();
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const value = parseAmount(amount) || 0;
  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
        <Icon name="plus-circle-outline" size={16} color={t.primary} />
        <Label size={13} bold color={t.primary}>Agregar extra</Label>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: 8, padding: 10, borderRadius: 12, backgroundColor: t.backgroundElement }}>
      <Label bold size={13}>Extra para 1 unidad</Label>
      <Chips options={QUICK_EXTRAS.map((q) => ({ value: String(q), label: `+RD$${q}` }))} value={amount} onChange={setAmount} />
      <Field label="Monto del extra (RD$)" icon="cash-plus" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="50" />
      <Field label="¿Qué lleva? (opcional)" icon="text" value={note} onChangeText={setNote} placeholder="Un poco más" />
      <Row style={{ gap: 8 }}>
        <Button size="sm" variant="ghost" title="Cancelar" onPress={() => setOpen(false)} />
        <Button
          size="sm"
          icon="plus"
          title={value > 0 ? `Agregar +${formatRD(value)}` : 'Agregar'}
          disabled={!(value > 0)}
          onPress={() => {
            cart.addExtra(lineId, value, note);
            setOpen(false);
            setAmount('');
            setNote('');
          }}
        />
      </Row>
    </View>
  );
}

/** Billetes dominicanos comunes para cobrar rápido. */
const BILLS = [100, 200, 500, 1000, 2000];

/** Cuánto entregó el cliente y cuánto se le devuelve. */
function CashBox({ total }: { total: number }) {
  const cart = useCart();
  const t = useTheme();
  const received = parseAmount(cart.cashReceived) || 0;
  const change = received - total;
  const options = [
    { value: String(total), label: 'Exacto' },
    ...BILLS.filter((b) => b > total).slice(0, 3).map((b) => ({ value: String(b), label: formatRD(b).replace('.00', '') })),
  ];
  return (
    <Card style={{ gap: 10 }}>
      <Label bold size={16}>Efectivo recibido</Label>
      <Chips options={options} value={cart.cashReceived} onChange={cart.setCashReceived} />
      <Field
        label="El cliente entregó (RD$)"
        icon="cash"
        keyboardType="decimal-pad"
        value={cart.cashReceived}
        onChangeText={cart.setCashReceived}
        placeholder="Opcional"
      />
      {received > 0 ? (
        <View style={[styles.change, { backgroundColor: change < 0 ? t.dangerSoft : t.successSoft }]}>
          <Label bold size={16} color={change < 0 ? t.danger : t.success}>{change < 0 ? 'Falta' : 'Devuelta'}</Label>
          <Text style={{ color: change < 0 ? t.danger : t.success, fontSize: 26, fontWeight: '900' }}>{formatRD(Math.abs(change))}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const QUICK = [0, 5, 10, 15, 20];

/** Descuento para comedor y para llevar: rápido por % o un monto en RD$. */
function DiscountPicker() {
  const cart = useCart();
  const t = useTheme();
  const { kind, value } = cart.discount;
  const [text, setText] = useState(value ? String(value) : '');
  const custom = kind === 'monto' || !QUICK.includes(value);
  return (
    <View style={{ gap: 10 }}>
      <Row>
        <Label bold size={16}>Descuento</Label>
        {cart.totals.discount > 0 ? <Label size={14} color={t.success} bold>−{formatRD(cart.totals.discount)}</Label> : null}
      </Row>
      <Chips
        options={[
          ...QUICK.map((q) => ({ value: String(q), label: q ? `${q}%` : 'Sin descuento' })),
          { value: 'otro', label: 'Otro', icon: 'pencil-outline' as const },
        ]}
        value={custom ? 'otro' : String(value)}
        onChange={(v) => {
          if (v === 'otro') {
            cart.setDiscount({ kind: 'monto', value: 0 });
            setText('');
          } else {
            cart.setDiscount({ kind: 'pct', value: Number(v) });
          }
        }}
      />
      {custom ? (
        <View style={{ gap: 8 }}>
          <Chips
            options={[
              { value: 'monto', label: 'Monto RD$' },
              { value: 'pct', label: 'Porcentaje %' },
            ]}
            value={kind}
            onChange={(k) => cart.setDiscount({ kind: k, value: parseAmount(text) || 0 })}
          />
          <Field
            label={kind === 'monto' ? 'Descuento en RD$' : 'Descuento en %'}
            icon="sale"
            keyboardType="decimal-pad"
            value={text}
            onChangeText={(v) => {
              setText(v);
              cart.setDiscount({ kind, value: parseAmount(v) || 0 });
            }}
            placeholder="0"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  change: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  line: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5 },
});
