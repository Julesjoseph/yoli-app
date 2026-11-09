import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { CHANNEL_ICONS } from '@/components/brand-icons';
import { Card, Chips, EmptyState, Icon, IconBadge, Label, Pill, Row, Screen, SectionTitle, type IconName } from '@/components/ui';
import { ChannelColors } from '@/constants/theme';
import { loadDashboard } from '@/db/dashboard';
import { canManage, useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { CHANNEL_LABELS, formatRD, type Channel } from '@/lib/calc';
import type { DashPeriod } from '@/lib/dashboard';

const PERIODS = [
  { value: 'hoy' as DashPeriod, label: 'Hoy' },
  { value: '7d' as DashPeriod, label: '7 días' },
  { value: '30d' as DashPeriod, label: '30 días' },
];

const hour = (iso: string) =>
  new Date(iso).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function AdminDashboard() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const [period, setPeriod] = useState<DashPeriod>('hoy');
  const [data, reload] = useFocusData(() => loadDashboard(db, ctx, period), [db, ctx, period]);

  // En la PC el panel se actualiza solo cada minuto.
  useEffect(() => {
    const id = setInterval(reload, 60_000);
    return () => clearInterval(id);
  }, [reload]);

  if (!canManage(ctx)) {
    return (
      <Screen title="Panel">
        <EmptyState icon="lock-outline" text="Solo el dueño o un gerente puede ver el panel." />
      </Screen>
    );
  }

  const d = data?.dash;
  const maxBar = Math.max(1, ...(d?.series ?? []).map((s) => s.gross));
  const maxLoc = Math.max(1, ...(d?.locations ?? []).map((l) => l.gross));
  const channels = (Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => ({ c, ...(d?.channels[c] ?? { orders: 0, gross: 0, commission: 0 }) }));
  const maxCh = Math.max(1, ...channels.map((c) => c.gross));

  const kpis: { icon: IconName; label: string; value: string; color: string; hint?: string }[] = [
    { icon: 'cash-multiple', label: 'Ventas', value: formatRD(d?.gross ?? 0), color: t.primary, hint: `${d?.orders ?? 0} órdenes` },
    { icon: 'receipt', label: 'Ticket promedio', value: formatRD(d?.avgTicket ?? 0), color: t.info },
    { icon: 'cart-arrow-down', label: 'Gastos', value: formatRD(d?.expenses ?? 0), color: t.accent, hint: `Comisiones ${formatRD(d?.commissions ?? 0)}` },
    {
      icon: d && d.profit < 0 ? 'trending-down' : 'trending-up',
      label: 'Ganancia',
      value: formatRD(d?.profit ?? 0),
      color: d && d.profit < 0 ? t.danger : t.success,
      hint: `ITBIS a pagar ${formatRD(d?.itbis ?? 0)}`,
    },
  ];

  const chart = (
    <Card style={{ gap: 12 }}>
      <Row>
        <Label bold size={16}>{period === 'hoy' ? 'Ventas por hora' : 'Ventas por día'}</Label>
        <Label muted size={13}>{formatRD(d?.gross ?? 0)}</Label>
      </Row>
      <View style={styles.chart}>
        {(d?.series ?? []).map((s, i, all) => (
          <View key={s.key} style={styles.barCol}>
            <View style={styles.barTrack}>
              <View
                style={{
                  height: `${Math.max(2, (s.gross / maxBar) * 100)}%`,
                  backgroundColor: s.gross ? t.primary : t.backgroundSelected,
                  borderRadius: 6,
                }}
              />
            </View>
            <Text style={[styles.barLabel, { color: t.textSecondary }]}>
              {i % Math.ceil(all.length / (wide ? 12 : 6)) !== 0 ? '' : s.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );

  const channelCard = (
    <Card style={{ gap: 12 }}>
      <Label bold size={16}>Ventas por canal</Label>
      {channels.map((c) => (
        <View key={c.c} style={{ gap: 6 }}>
          <Row>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name={CHANNEL_ICONS[c.c]} size={18} color={ChannelColors[c.c]} />
              <Label size={14} bold>{CHANNEL_LABELS[c.c]}</Label>
              <Label muted size={12}>{c.orders} órd.</Label>
            </View>
            <Label size={14} bold>{formatRD(c.gross)}</Label>
          </Row>
          <Bar value={c.gross / maxCh} color={ChannelColors[c.c]} />
          {c.commission > 0 ? <Label muted size={12}>Comisión {formatRD(c.commission)}</Label> : null}
        </View>
      ))}
    </Card>
  );

  const locationsCard = (
    <Card style={{ gap: 12 }}>
      <Label bold size={16}>Locales</Label>
      {(d?.locations ?? []).map((l) => (
        <View key={l.id} style={{ gap: 6 }}>
          <Row>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Icon name="storefront-outline" size={18} color={t.primary} />
              <Label size={14} bold numberOfLines={1}>{l.name}</Label>
              {l.id === ctx.locationId ? <Pill text="ACTUAL" color={t.info} /> : null}
            </View>
            <Label size={14} bold>{formatRD(l.gross)}</Label>
          </Row>
          <Bar value={l.gross / maxLoc} color={t.primary} />
          <Label muted size={12}>
            {l.orders} órdenes · gastos {formatRD(l.expenses)} · ganancia{' '}
            <Text style={{ color: l.profit < 0 ? t.danger : t.success, fontWeight: '700' }}>{formatRD(l.profit)}</Text>
          </Label>
        </View>
      ))}
    </Card>
  );

  const topCard = (
    <Card style={{ gap: 4 }}>
      <Label bold size={16}>Más vendidos</Label>
      {d && d.topProducts.length === 0 ? <EmptyState icon="food-outline" text="Todavía no hay ventas en este período." /> : null}
      {(d?.topProducts ?? []).map((p, i) => (
        <View key={p.name} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
          <View style={[styles.rank, { backgroundColor: i < 3 ? t.primary : t.backgroundSelected }]}>
            <Text style={{ color: i < 3 ? '#FFFFFF' : t.text, fontWeight: '900', fontSize: 12 }}>{i + 1}</Text>
          </View>
          <Label size={14} style={{ flex: 1 }} numberOfLines={1}>{p.name}</Label>
          <Label muted size={13}>{p.qty} u.</Label>
          <Label bold size={14} style={{ minWidth: 96, textAlign: 'right' }}>{formatRD(p.amount)}</Label>
        </View>
      ))}
    </Card>
  );

  const stockCard = (
    <Pressable onPress={() => router.push('/inventario')} accessibilityRole="button">
      <Card style={{ gap: 4 }}>
        <Row>
          <Label bold size={16}>Stock bajo · {ctx.locationName}</Label>
          <Icon name="chevron-right" color={t.textSecondary} />
        </Row>
        {data && data.lowStock.length === 0 ? <Label muted size={14}>Todo el inventario está por encima del mínimo.</Label> : null}
        {(data?.lowStock ?? []).slice(0, 6).map((s) => (
          <Row key={s.id} style={{ paddingVertical: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Icon name="alert-circle" size={16} color={t.danger} />
              <Label size={14} numberOfLines={1}>{s.name}</Label>
            </View>
            <Label size={13} color={t.danger}>{Math.round(s.quantity * 100) / 100} / {s.min_stock} {s.unit}</Label>
          </Row>
        ))}
      </Card>
    </Pressable>
  );

  const recentCard = (
    <Card style={{ gap: 0 }}>
      <Label bold size={16}>Últimas ventas</Label>
      {data && data.recent.length === 0 ? <EmptyState icon="cart-outline" text="Sin ventas en este período." /> : null}
      {(data?.recent ?? []).map((o, i) => (
        <View key={o.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
          <IconBadge name={CHANNEL_ICONS[o.channel]} color={ChannelColors[o.channel]} size={34} />
          <View style={{ flex: 1 }}>
            <Label bold size={14}>{CHANNEL_LABELS[o.channel]}</Label>
            <Label muted size={12} numberOfLines={1}>{hour(o.created_at)}{o.locationName ? ` · ${o.locationName}` : ''}</Label>
          </View>
          <Label bold size={14}>{formatRD(o.total)}</Label>
        </View>
      ))}
    </Card>
  );

  return (
    <Screen
      title={wide ? 'Panel de administración' : 'Panel'}
      subtitle={`${ctx.businessName} · ${data?.source === 'nube' ? 'todos los locales' : ctx.locationName}`}
      right={
        <Pressable onPress={reload} accessibilityRole="button" accessibilityLabel="Actualizar" hitSlop={8} style={[styles.refresh, { borderColor: t.border, backgroundColor: t.backgroundElement }]}>
          <Icon name="refresh" size={20} color={t.primary} />
        </Pressable>
      }>
      <Row style={{ flexWrap: 'wrap', gap: 8 }}>
        <Chips options={PERIODS} value={period} onChange={setPeriod} />
        {data ? (
          <Pill
            text={data.source === 'nube' ? 'EN VIVO · NUBE' : ctx.demo ? 'DEMO · ESTE EQUIPO' : 'SIN INTERNET · ESTE EQUIPO'}
            color={data.source === 'nube' ? t.success : t.accent}
          />
        ) : null}
      </Row>

      <View style={styles.kpis}>
        {kpis.map((k) => (
          <Card key={k.label} style={{ gap: 6, flexGrow: 1, flexBasis: wide ? 0 : '46%', minWidth: 150 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <IconBadge name={k.icon} color={k.color} size={32} />
              <Label muted size={13}>{k.label}</Label>
            </View>
            <Text style={{ color: t.text, fontSize: wide ? 26 : 20, fontWeight: '900' }} numberOfLines={1} adjustsFontSizeToFit>
              {k.value}
            </Text>
            {k.hint ? <Label muted size={12}>{k.hint}</Label> : null}
          </Card>
        ))}
      </View>

      {wide ? (
        <>
          <Columns left={chart} right={channelCard} ratio={[3, 2]} />
          <Columns left={<>{locationsCard}{topCard}</>} right={<>{stockCard}{recentCard}</>} ratio={[1, 1]} />
        </>
      ) : (
        <>
          {chart}
          <SectionTitle icon="chart-donut">Detalle</SectionTitle>
          {channelCard}
          {locationsCard}
          {topCard}
          {stockCard}
          {recentCard}
        </>
      )}
    </Screen>
  );
}

function Columns({ left, right, ratio }: { left: ReactNode; right: ReactNode; ratio: [number, number] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
      <View style={{ flex: ratio[0], gap: 14 }}>{left}</View>
      <View style={{ flex: ratio[1], gap: 14 }}>{right}</View>
    </View>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.backgroundSelected, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 190, gap: 4 },
  barCol: { flex: 1, height: '100%', alignItems: 'center', gap: 4 },
  barTrack: { flex: 1, width: '100%', maxWidth: 34, justifyContent: 'flex-end' },
  barLabel: { fontSize: 10, fontWeight: '600', width: 36, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  refresh: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
