import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Card, Chips, EmptyState, Field, HeroCard, Icon, IconBadge, Label, Row, Screen, SectionTitle } from '@/components/ui';
import {
  addCustomerPayment,
  archiveCustomer,
  getCustomer,
  listCustomerMovements,
  saveCustomer,
  voidCustomerPayment,
  whatsappReminder,
  type CreditPayMethod,
} from '@/db/credit';
import { canManage, useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';

const METHODS: { value: CreditPayMethod; label: string; icon: 'cash' | 'credit-card' | 'bank-transfer' }[] = [
  { value: 'efectivo', label: 'Efectivo', icon: 'cash' },
  { value: 'tarjeta', label: 'Tarjeta', icon: 'credit-card' },
  { value: 'transferencia', label: 'Transferencia', icon: 'bank-transfer' },
];
const METHOD_LABEL: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
const when = (iso: string) =>
  new Date(iso).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Cuenta de un cliente a crédito: lo que debe, abonos y su historial. */
export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const manager = canManage(ctx);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<CreditPayMethod>('efectivo');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', limit: '' });
  const [busy, setBusy] = useState(false);

  const [data, reload] = useFocusData(async () => {
    const [customer, movements] = await Promise.all([getCustomer(db, id), listCustomerMovements(db, id)]);
    return { customer, movements };
  }, [db, id]);
  const c = data?.customer;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      reload();
    } catch (e) {
      Alert.alert('No se pudo', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const pay = () =>
    run(async () => {
      const n = Number(amount.replace(/,/g, ''));
      const r = await addCustomerPayment(db, ctx, { customerId: id, amount: n, method, note });
      setAmount('');
      setNote('');
      Alert.alert('✅ Abono registrado', `${formatRD(r.amount)} en ${METHOD_LABEL[method].toLowerCase()}.\n${r.balance > 0 ? `Todavía debe ${formatRD(r.balance)}.` : '¡Quedó al día!'}`);
    });

  function confirm(title: string, text: string, onYes: () => void) {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${text}`)) onYes();
      return;
    }
    Alert.alert(title, text, [
      { text: 'No', style: 'cancel' },
      { text: 'Sí', style: 'destructive', onPress: onYes },
    ]);
  }

  if (data && !c) {
    return (
      <Screen back title="Cliente">
        <EmptyState icon="account-question" text="No se encontró este cliente." />
      </Screen>
    );
  }

  const wa = c ? whatsappReminder(c, ctx.businessName) : null;
  const owes = (c?.balance ?? 0) > 0;
  const n = Number(amount.replace(/,/g, '')) || 0;

  return (
    <Screen back title={c?.name ?? 'Cliente'} subtitle={ctx.locationName}>
      <HeroCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={owes ? 'account-clock' : 'account-check'} color="#FFFFFF" size={20} />
          <Text style={{ color: '#FFFFFFE6', fontWeight: '700', fontSize: 15 }}>{owes ? 'Debe' : 'Está al día'}</Text>
        </View>
        <Text style={{ color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: -1 }} adjustsFontSizeToFit numberOfLines={1}>
          {formatRD(c?.balance ?? 0)}
        </Text>
        <Text style={{ color: '#FFFFFFE6', fontWeight: '700', fontSize: 13 }}>
          {c?.phone ? `📞 ${c.phone} · ` : ''}Compró {formatRD(c?.charged ?? 0)} · Abonó {formatRD(c?.paid ?? 0)}
          {c?.credit_limit ? ` · Límite ${formatRD(c.credit_limit)}` : ''}
        </Text>
      </HeroCard>

      {owes ? (
        <Card style={{ gap: 12 }}>
          <SectionTitle icon="cash-plus">Registrar abono</SectionTitle>
          <Chips
            options={[
              { value: String(c?.balance ?? 0), label: `Todo (${formatRD(c?.balance ?? 0)})` },
              ...[500, 1000, 2000].filter((v) => v < (c?.balance ?? 0)).map((v) => ({ value: String(v), label: formatRD(v).replace('.00', '') })),
            ]}
            value={amount}
            onChange={setAmount}
          />
          <Field label="Monto (RD$)" icon="cash" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
          <Chips options={METHODS} value={method} onChange={setMethod} />
          <Field label="Nota (opcional)" icon="text" value={note} onChangeText={setNote} placeholder="Ej. Pagó la quincena" />
          <Button icon="check-circle" title={n > 0 ? `Cobrar abono de ${formatRD(n)}` : 'Cobrar abono'} onPress={pay} disabled={!n || busy} />
          {wa ? <Button variant="secondary" icon="whatsapp" title="Recordarle por WhatsApp" onPress={() => Linking.openURL(wa)} /> : null}
        </Card>
      ) : null}

      <SectionTitle icon="history">Historial</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {data && !data.movements.length ? <EmptyState icon="history" text="Todavía no tiene compras a crédito." /> : null}
        {(data?.movements ?? []).map((m, i) => (
          <Pressable
            key={`${m.kind}-${m.id}`}
            accessibilityRole="button"
            onPress={() =>
              m.kind === 'venta'
                ? router.push({ pathname: '/venta/[id]', params: { id: m.id } })
                : confirm('¿Anular este abono?', `${formatRD(m.amount)} del ${when(m.created_at)}. El cliente vuelve a deber ese monto.`, () =>
                    run(() => voidCustomerPayment(db, ctx, m.id)),
                  )
            }
            style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
            <IconBadge name={m.kind === 'venta' ? 'cart-arrow-down' : 'cash-check'} color={m.kind === 'venta' ? t.danger : t.success} size={36} />
            <View style={{ flex: 1 }}>
              <Label bold size={14}>{m.kind === 'venta' ? 'Compra a crédito' : `Abono · ${METHOD_LABEL[m.method ?? ''] ?? m.method}`}</Label>
              <Label muted size={12} numberOfLines={1}>{[when(m.created_at), m.detail].filter(Boolean).join(' · ')}</Label>
            </View>
            <Label bold size={15} color={m.kind === 'venta' ? t.danger : t.success}>
              {m.kind === 'venta' ? '+' : '−'} {formatRD(m.amount)}
            </Label>
          </Pressable>
        ))}
      </Card>
      {data?.movements.some((m) => m.kind === 'abono') ? <Label muted size={12}>Toca un abono para anularlo si se registró por error.</Label> : null}

      <Card style={{ gap: 12 }}>
        {editing ? (
          <>
            <Field label="Nombre" icon="account" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
            <Field label="Teléfono (WhatsApp)" icon="phone" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} />
            {manager ? (
              <Field label="Límite de crédito RD$" icon="shield-check-outline" keyboardType="decimal-pad" value={form.limit} onChangeText={(v) => setForm({ ...form, limit: v })} placeholder="Sin límite" />
            ) : null}
            <Row style={{ gap: 8 }}>
              <Button variant="secondary" title="Cancelar" onPress={() => setEditing(false)} style={{ flex: 1 }} />
              <Button
                icon="content-save"
                title="Guardar"
                disabled={!form.name.trim() || busy}
                style={{ flex: 1 }}
                onPress={() =>
                  run(async () => {
                    await saveCustomer(db, ctx, {
                      id,
                      name: form.name,
                      phone: form.phone,
                      rnc: c?.rnc ?? undefined,
                      note: c?.note ?? undefined,
                      creditLimit: manager ? Number(form.limit.replace(/,/g, '')) || null : c?.credit_limit ?? null,
                    });
                    setEditing(false);
                  })
                }
              />
            </Row>
          </>
        ) : (
          <Button
            variant="secondary"
            icon="pencil"
            title="Editar cliente"
            onPress={() => {
              setForm({ name: c?.name ?? '', phone: c?.phone ?? '', limit: c?.credit_limit ? String(c.credit_limit) : '' });
              setEditing(true);
            }}
          />
        )}
        {manager && !owes ? (
          <Button
            variant="danger"
            icon="account-remove"
            title="Quitar cliente"
            onPress={() =>
              confirm('¿Quitar este cliente?', 'Ya no aparecerá en la lista. Su historial se conserva.', () =>
                run(async () => {
                  await archiveCustomer(db, ctx, id);
                  router.back();
                }),
              )
            }
          />
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
});
