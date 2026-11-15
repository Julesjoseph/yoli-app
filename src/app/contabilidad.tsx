import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Card, Chips, EmptyState, HeroCard, Icon, IconBadge, Label, Pill, Row, Screen, SectionTitle, type IconName } from '@/components/ui';
import { loadAccounting, markCloudExpensePaid } from '@/db/accounting';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { ACC_PERIODS, periodRange, type AccPeriod } from '@/lib/accounting';
import { formatRD } from '@/lib/calc';
import { statementRows } from '@/lib/report-export';
import { exportAccounting } from '@/printing/accounting-export';

const PAY_ICONS: Record<string, IconName> = {
  efectivo: 'cash',
  tarjeta: 'credit-card-outline',
  transferencia: 'bank-transfer',
  plataforma: 'moped',
  credito: 'account-clock-outline',
};
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });

/** Contabilidad básica: ingresos, gastos, ganancia, cuentas por cobrar y por pagar, y descarga en PDF o Excel. */
export default function AccountingScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [period, setPeriod] = useState<AccPeriod>('mes');
  const [data, reload] = useFocusData(() => loadAccounting(db, ctx, period), [db, ctx, period]);
  const [busy, setBusy] = useState<'' | 'pdf' | 'excel' | string>('');
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const loading = !data || data.range.fromKey !== periodKey(period);
  const s = data?.statement;

  async function download(kind: 'pdf' | 'excel') {
    setBusy(kind);
    setMsg(null);
    try {
      await exportAccounting(db, ctx, kind, period, data);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e) });
    }
    setBusy('');
  }

  async function pay(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      await markCloudExpensePaid(db, ctx, id);
      setMsg({ text: 'Listo: quedó pagado.', ok: true });
      reload();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e) });
    }
    setBusy('');
  }

  return (
    <Screen back title="Contabilidad" subtitle={data ? (data.source === 'nube' ? 'Todos los locales' : `${ctx.locationName} · datos de este equipo`) : ctx.businessName}>
      <Chips scroll options={ACC_PERIODS} value={period} onChange={setPeriod} />
      {data ? <Label muted size={13} style={{ marginTop: -4 }}>{data.range.label}</Label> : null}
      {data?.source === 'equipo' && !ctx.demo ? (
        <Card style={{ backgroundColor: t.infoSoft }}>
          <Label size={13}>Sin internet: se muestra solo lo guardado en este equipo (este local, últimos 35 días). Con internet verás todos los locales y cualquier fecha.</Label>
        </Card>
      ) : null}

      {!s || loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={t.primary} />
      ) : (
        <>
          <HeroCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name={s.profit >= 0 ? 'trending-up' : 'trending-down'} color="#FFFFFF" size={22} />
              <Text style={{ color: '#FFFFFFE6', fontWeight: '700', fontSize: 15 }}>{s.profit >= 0 ? 'Ganancia' : 'Pérdida'}</Text>
            </View>
            <Text style={{ color: '#FFFFFF', fontSize: 38, fontWeight: '900', letterSpacing: -1 }} adjustsFontSizeToFit numberOfLines={1}>
              {formatRD(s.profit)}
            </Text>
            <Text style={{ color: '#FFFFFFD9', fontSize: 14, fontWeight: '600' }}>
              Ingresos {formatRD(s.income)} · Gastos {formatRD(s.expenses)} · margen {s.margin}%
            </Text>
          </HeroCard>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button style={{ flex: 1 }} variant="secondary" icon="file-pdf-box" title={busy === 'pdf' ? 'Creando…' : 'PDF'} disabled={!!busy} onPress={() => download('pdf')} />
            <Button style={{ flex: 1 }} variant="secondary" icon="microsoft-excel" title={busy === 'excel' ? 'Creando…' : 'Excel'} disabled={!!busy} onPress={() => download('excel')} />
          </View>
          {msg ? <Message msg={msg} /> : null}

          <SectionTitle icon="scale-balance">Estado de resultados</SectionTitle>
          <Card style={{ gap: 8 }}>
            {statementRows(s).map(([label, value, strong], i) => (
              <Row key={i} style={strong ? { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border, paddingTop: 8 } : undefined}>
                <Label size={strong ? 15 : 14} bold={strong} muted={!strong} style={{ flex: 1 }}>{label}</Label>
                <Label
                  size={strong ? 16 : 14}
                  bold={strong}
                  color={label.includes('GANANCIA') ? t.success : label.includes('PÉRDIDA') ? t.danger : undefined}>
                  {value < 0 ? `− ${formatRD(-value)}` : formatRD(value)}
                </Label>
              </Row>
            ))}
            <Row>
              <Label muted size={13}>{s.orders} {s.orders === 1 ? 'venta' : 'ventas'} · ticket promedio {formatRD(s.avgTicket)}</Label>
            </Row>
            {s.tipLaw > 0 ? (
              <Label muted size={13}>Ley de propina cobrada: {formatRD(s.tipLaw)} (es del personal, no entra en la ganancia).</Label>
            ) : null}
          </Card>

          <SectionTitle icon="cash-plus">Ingresos por forma de pago</SectionTitle>
          <Card style={{ gap: 10 }}>
            {s.byPayment.length === 0 ? <EmptyState icon="cash-remove" text="Sin ventas en este período." /> : null}
            {s.byPayment.map((p) => (
              <Row key={p.method}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <IconBadge name={PAY_ICONS[p.method] ?? 'cash'} color={p.method === 'credito' ? t.accent : t.success} size={32} />
                  <View style={{ flex: 1 }}>
                    <Label bold size={14}>{p.label}</Label>
                    <Label muted size={12}>{p.orders} {p.orders === 1 ? 'venta' : 'ventas'}{p.method === 'plataforma' ? ' · lo que deposita la plataforma' : ''}</Label>
                  </View>
                </View>
                <Label bold size={15}>{formatRD(p.amount)}</Label>
              </Row>
            ))}
            {s.creditPayments > 0 ? (
              <Row>
                <Label muted size={13} style={{ flex: 1 }}>Abonos recibidos de clientes a crédito</Label>
                <Label size={14}>{formatRD(s.creditPayments)}</Label>
              </Row>
            ) : null}
          </Card>

          <SectionTitle icon="cash-minus" right={<Pressable onPress={() => router.push('/gastos')}><Label bold size={13} color={t.primary}>Ver gastos</Label></Pressable>}>
            Gastos por categoría
          </SectionTitle>
          <Card style={{ gap: 8 }}>
            {s.byCategory.length === 0 ? <EmptyState icon="receipt-text-outline" text="Sin gastos en este período." /> : null}
            {s.byCategory.map((c) => (
              <View key={c.category} style={{ gap: 4 }}>
                <Row>
                  <Label size={14} style={{ flex: 1 }}>{c.label} <Label muted size={12}>({c.count})</Label></Label>
                  <Label bold size={14}>{formatRD(c.amount)}</Label>
                </Row>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: t.backgroundSelected, overflow: 'hidden' }}>
                  <View style={{ width: `${s.expenses ? Math.max(2, (c.amount / s.expenses) * 100) : 0}%`, height: 6, backgroundColor: t.accent }} />
                </View>
              </View>
            ))}
          </Card>

          <SectionTitle icon="account-arrow-left" right={<Pressable onPress={() => router.push('/credito')}><Label bold size={13} color={t.primary}>Ver clientes</Label></Pressable>}>
            Cuentas por cobrar
          </SectionTitle>
          <Card style={{ gap: 8 }}>
            <Row>
              <Label muted size={14}>Te deben</Label>
              <Label bold size={18} color={data.receivables.total > 0 ? t.accent : undefined}>{formatRD(data.receivables.total)}</Label>
            </Row>
            {data.receivables.items.slice(0, 5).map((c) => (
              <Pressable key={c.id} onPress={() => router.push({ pathname: '/credito/[id]', params: { id: c.id } })}>
                <Row>
                  <Label size={14} style={{ flex: 1 }} numberOfLines={1}>{c.name}</Label>
                  <Label size={14}>{formatRD(c.balance)}</Label>
                </Row>
              </Pressable>
            ))}
            {data.receivables.items.length > 5 ? <Label muted size={12}>y {data.receivables.items.length - 5} más…</Label> : null}
            {data.receivables.items.length === 0 ? <Label muted size={13}>Nadie te debe. 👍</Label> : null}
          </Card>

          <SectionTitle icon="account-arrow-right">Cuentas por pagar</SectionTitle>
          <Card style={{ gap: 10 }}>
            <Row>
              <Label muted size={14}>Le debes a proveedores</Label>
              <Label bold size={18} color={data.payables.total > 0 ? t.danger : undefined}>{formatRD(data.payables.total)}</Label>
            </Row>
            {data.payables.overdue > 0 ? <Label size={13} color={t.danger}>Vencido: {formatRD(data.payables.overdue)}</Label> : null}
            {data.payables.items.map((p) => (
              <View key={p.id} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border, paddingTop: 8, gap: 6 }}>
                <Pressable onPress={() => router.push({ pathname: '/gasto/[id]', params: { id: p.id } })}>
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Label bold size={14} numberOfLines={1}>{p.supplier}</Label>
                      <Label muted size={12}>
                        {shortDay(p.spent_at)}
                        {p.due_date ? ` · vence ${shortDay(p.due_date)}` : ''}
                      </Label>
                    </View>
                    {p.overdue ? <Pill text="VENCIDA" color={t.danger} /> : null}
                    <Label bold size={14}>{formatRD(p.amount)}</Label>
                  </Row>
                </Pressable>
                <Button size="sm" variant="secondary" icon="cash-check" title={busy === p.id ? 'Guardando…' : 'Ya lo pagué'} disabled={!!busy} onPress={() => pay(p.id)} />
              </View>
            ))}
            {data.payables.items.length === 0 ? (
              <Label muted size={13}>No le debes a nadie. Para anotar una compra a crédito, en Gastos elige "No, a crédito (por pagar)".</Label>
            ) : null}
          </Card>

          <Pressable onPress={() => router.push('/auditoria')} accessibilityRole="button">
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconBadge name="shield-search" color={t.info} size={38} />
              <View style={{ flex: 1 }}>
                <Label bold size={15}>Auditoría</Label>
                <Label muted size={13}>
                  {s.voidedOrders.count + s.voidedExpenses.count
                    ? `En este período: ${s.voidedOrders.count} ventas y ${s.voidedExpenses.count} gastos anulados`
                    : 'Ventas y gastos anulados, con el motivo y quién lo hizo'}
                </Label>
              </View>
              <Icon name="chevron-right" color={t.textSecondary} />
            </Card>
          </Pressable>

          <Label muted size={12}>
            Cómo se calcula: ventas sin ITBIS − comisiones de PedidosYa/Uber Eats − gastos. El ITBIS cobrado es de la DGII. Las ventas a crédito cuentan el día que se venden. Lo anulado no cuenta.
          </Label>
        </>
      )}
    </Screen>
  );
}

const periodKey = (p: AccPeriod) => periodRange(p).fromKey;

function Message({ msg }: { msg: { text: string; ok?: boolean } }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, padding: 10, backgroundColor: msg.ok ? t.successSoft : t.dangerSoft }}>
      <Icon name={msg.ok ? 'check-circle' : 'alert-circle'} size={18} color={msg.ok ? t.success : t.danger} />
      <Label size={14} color={msg.ok ? t.success : t.danger} style={{ flex: 1 }}>{msg.text}</Label>
    </View>
  );
}
