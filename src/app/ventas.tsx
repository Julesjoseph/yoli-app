import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CHANNEL_ICONS } from '@/components/brand-icons';
import { Card, Chips, EmptyState, Field, Icon, IconBadge, Label, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { ChannelColors } from '@/constants/theme';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { weekLabel, weekStart } from '@/lib/accounting';
import { CHANNEL_LABELS, formatRD, round2, type Channel } from '@/lib/calc';

type Sale = {
  id: string;
  channel: Channel;
  status: string;
  total: number;
  net_income: number;
  platform_commission: number;
  tip_law: number;
  payment_method: string | null;
  external_ref: string | null;
  created_at: string;
  items: string | null;
};

type Period = 'hoy' | 'ayer' | 'semana' | 'semana_pasada' | '30d' | 'dia';
type ChannelFilter = 'todos' | Channel;
type PayFilter = 'todos' | 'efectivo' | 'tarjeta' | 'transferencia' | 'credito' | 'plataforma';

const PAY_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  credito: 'A crédito',
  plataforma: 'Plataforma',
};

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const keyToDate = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const dayTitle = (k: string) => {
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  if (k === today) return 'Hoy';
  if (k === yesterday) return 'Ayer';
  const s = keyToDate(k).toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'short' }).replace(/\./g, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const time = (iso: string) => new Date(iso).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' });
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Todas las ventas de este local, por día, con filtros (fecha, canal, forma de pago y búsqueda). */
export default function SalesScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const params = useLocalSearchParams<{ dia?: string }>();
  const [period, setPeriod] = useState<Period>(params.dia ? 'dia' : 'semana');
  const [day, setDay] = useState<string | null>(params.dia ?? null);
  const [channel, setChannel] = useState<ChannelFilter>('todos');
  const [pay, setPay] = useState<PayFilter>('todos');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (params.dia) {
      setDay(params.dia);
      setPeriod('dia');
    }
  }, [params.dia]);

  const [sales] = useFocusData(
    () =>
      db.getAllAsync<Sale>(
        `SELECT o.id, o.channel, o.status, o.total, o.net_income, o.platform_commission, COALESCE(o.tip_law, 0) AS tip_law, o.payment_method, o.external_ref, o.created_at,
                GROUP_CONCAT(oi.quantity || '× ' || oi.name, ', ') AS items
           FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.location_id = ?
          GROUP BY o.id
          ORDER BY o.created_at DESC`,
        [ctx.locationId],
      ),
    [db, ctx.locationId],
  );

  const filtered = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let from: Date | null = null;
    let to: Date | null = null;
    if (period === 'hoy') from = startOfToday;
    if (period === 'ayer') {
      from = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate() - 1);
      to = startOfToday;
    }
    // La semana del negocio va de miércoles a martes.
    if (period === 'semana') from = weekStart(startOfToday);
    if (period === 'semana_pasada') {
      to = weekStart(startOfToday);
      from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 7);
    }
    if (period === '30d') from = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate() - 29);
    if (period === 'dia' && day) {
      from = keyToDate(day);
      to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
    }
    const q = norm(search.trim());
    return (sales ?? []).filter((s) => {
      const d = new Date(s.created_at);
      if (from && d < from) return false;
      if (to && d >= to) return false;
      if (channel !== 'todos' && s.channel !== channel) return false;
      if (pay !== 'todos' && s.payment_method !== pay) return false;
      if (q && !norm(`${s.external_ref ?? ''} ${s.items ?? ''}`).includes(q)) return false;
      return true;
    });
  }, [sales, period, day, channel, pay, search]);

  const paid = filtered.filter((s) => s.status === 'pagada');
  const gross = round2(paid.reduce((n, s) => n + s.total, 0));
  const net = round2(paid.reduce((n, s) => n + s.net_income, 0));
  const commission = round2(paid.reduce((n, s) => n + s.platform_commission, 0));
  const tips = round2(paid.reduce((n, s) => n + (s.tip_law ?? 0), 0));

  const days = useMemo(() => {
    const map = new Map<string, Sale[]>();
    for (const s of filtered) {
      const k = dayKey(new Date(s.created_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return [...map.entries()];
  }, [filtered]);

  // Totales por semana (miércoles a martes) cuando se ven varias semanas.
  const weeks = useMemo(() => {
    const map = new Map<string, { start: Date; count: number; gross: number; net: number }>();
    for (const s of filtered) {
      if (s.status !== 'pagada') continue;
      const start = weekStart(new Date(s.created_at));
      const k = dayKey(start);
      const w = map.get(k) ?? { start, count: 0, gross: 0, net: 0 };
      w.count += 1;
      w.gross += s.total;
      w.net += s.net_income;
      map.set(k, w);
    }
    return [...map.values()].sort((a, b) => b.start.getTime() - a.start.getTime());
  }, [filtered]);

  const thisWeek = weekStart(new Date());
  const lastWeek = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - 7);
  const periodOptions: { value: Period; label: string }[] = [
    { value: 'hoy', label: 'Hoy' },
    { value: 'ayer', label: 'Ayer' },
    { value: 'semana', label: 'Esta semana' },
    { value: 'semana_pasada', label: 'Semana pasada' },
    { value: '30d', label: '30 días' },
    ...(day ? [{ value: 'dia' as Period, label: keyToDate(day).toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short' }) }] : []),
  ];
  const channelOptions: { value: ChannelFilter; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    ...(Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => ({ value: c, label: CHANNEL_LABELS[c] })),
  ];
  const payOptions: { value: PayFilter; label: string }[] = [
    { value: 'todos', label: 'Todas' },
    ...(Object.keys(PAY_LABELS) as PayFilter[]).map((p) => ({ value: p, label: PAY_LABELS[p] })),
  ];

  return (
    <Screen back title="Ventas" subtitle={ctx.locationName}>
      <Card style={{ gap: 10 }}>
        <Chips scroll options={periodOptions} value={period} onChange={setPeriod} />
        <Label muted size={12} bold>CANAL</Label>
        <Chips scroll options={channelOptions} value={channel} onChange={setChannel} />
        <Label muted size={12} bold>FORMA DE PAGO</Label>
        <Chips scroll options={payOptions} value={pay} onChange={setPay} />
        <Field label="Buscar" icon="magnify" value={search} onChangeText={setSearch} placeholder="Número de pedido o producto" />
      </Card>

      <Card style={{ gap: 6 }}>
        <Row><Label>Cobrado</Label><Label bold size={18}>{formatRD(gross)}</Label></Row>
        <Row><Label muted>Órdenes</Label><Label muted>{paid.length}{filtered.length > paid.length ? ` (+${filtered.length - paid.length} anuladas)` : ''}</Label></Row>
        <Row><Label muted>Ticket promedio</Label><Label muted>{formatRD(paid.length ? gross / paid.length : 0)}</Label></Row>
        {tips > 0 ? <Row><Label muted>− Propina de ley</Label><Label muted>{formatRD(tips)}</Label></Row> : null}
        {commission > 0 ? <Row><Label muted>− Comisiones</Label><Label muted>{formatRD(commission)}</Label></Row> : null}
        <Row><Label bold>Te queda</Label><Label bold>{formatRD(net)}</Label></Row>
        <Label muted size={12}>Incluye el ITBIS (es de la DGII) y todavía no resta los gastos. La ganancia está en Contabilidad.</Label>
      </Card>

      {period === 'semana' || period === 'semana_pasada' ? (
        <Label muted size={13}>{weekLabel(period === 'semana' ? thisWeek : lastWeek)} · la semana va de miércoles a martes</Label>
      ) : null}

      {weeks.length > 1 ? (
        <>
          <SectionTitle icon="calendar-week">Por semana (mié–mar)</SectionTitle>
          <Card style={{ gap: 8 }}>
            {weeks.map((w) => (
              <View key={w.start.toISOString()} style={{ gap: 2 }}>
                <Row>
                  <Label bold size={14} style={{ flexShrink: 1 }}>{weekLabel(w.start)}</Label>
                  <Label bold size={14}>{formatRD(round2(w.gross))}</Label>
                </Row>
                <Label muted size={12}>{w.count} venta{w.count === 1 ? '' : 's'} · te queda {formatRD(round2(w.net))}</Label>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {sales && !filtered.length ? <EmptyState icon="cart-outline" text="No hay ventas con estos filtros." /> : null}

      {days.map(([k, list]) => {
        const dayPaid = list.filter((s) => s.status === 'pagada');
        return (
          <View key={k} style={{ gap: 8 }}>
            <SectionTitle
              icon="calendar-today"
              right={<Label bold size={14}>{formatRD(round2(dayPaid.reduce((n, s) => n + s.total, 0)))}</Label>}>
              {`${dayTitle(k)} · ${dayPaid.length} venta${dayPaid.length === 1 ? '' : 's'}`}
            </SectionTitle>
            <Card style={{ gap: 0 }}>
              {list.map((s, i) => (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver venta de ${formatRD(s.total)}`}
                  onPress={() => router.push({ pathname: '/venta/[id]', params: { id: s.id } })}
                  style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
                  <IconBadge name={CHANNEL_ICONS[s.channel]} color={ChannelColors[s.channel]} size={36} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Label bold size={14} numberOfLines={1} style={{ flexShrink: 1 }}>{CHANNEL_LABELS[s.channel]}</Label>
                      <Label muted size={12} numberOfLines={1} style={{ flexShrink: 0 }}>{time(s.created_at)}</Label>
                      {s.status !== 'pagada' ? <Pill text="ANULADA" color={t.danger} /> : null}
                    </View>
                    <Label muted size={12} numberOfLines={1}>
                      {[s.external_ref ? `#${s.external_ref}` : null, s.items].filter(Boolean).join(' · ') || 'Sin artículos'}
                    </Label>
                  </View>
                  <Label bold size={15} color={s.status !== 'pagada' ? t.textSecondary : undefined}>{formatRD(s.total)}</Label>
                  <Icon name="chevron-right" size={18} color={t.textSecondary} />
                </Pressable>
              ))}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
});
