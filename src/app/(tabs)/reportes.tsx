import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/text';

import { CHANNEL_ICONS } from '@/components/brand-icons';
import { Card, Chips, EmptyState, HeroCard, Icon, IconBadge, Label, ProgressBar, Row, Screen, SectionTitle, Stat } from '@/components/ui';
import { ChannelColors } from '@/constants/theme';
import { getReport, type Period } from '@/db/repo';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { CHANNEL_LABELS, formatRD, type Channel } from '@/lib/calc';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mes' },
];

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [period, setPeriod] = useState<Period>('hoy');
  const [data] = useFocusData(() => getReport(db, ctx, period), [db, ctx, period]);

  const r = data?.report;
  const maxChannel = r ? Math.max(1, ...Object.values(r.byChannel).map((c) => c.gross)) : 1;
  const margin = r && r.gross > 0 ? Math.round((r.profit / r.gross) * 100) : 0;

  return (
    <Screen title="Reportes" subtitle={ctx.locationName}>
      <Chips options={PERIODS} value={period} onChange={setPeriod} />
      {r ? (
        <>
          <HeroCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name={r.profit >= 0 ? 'trending-up' : 'trending-down'} color="#FFFFFF" size={22} />
              <Text style={{ color: '#FFFFFFE6', fontWeight: '700', fontSize: 15 }}>Ganancia</Text>
            </View>
            <Text style={{ color: '#FFFFFF', fontSize: 40, fontWeight: '900', letterSpacing: -1 }} adjustsFontSizeToFit numberOfLines={1}>
              {formatRD(r.profit)}
            </Text>
            <Text style={{ color: '#FFFFFFD9', fontSize: 14, fontWeight: '600' }}>
              {r.orders} {r.orders === 1 ? 'orden' : 'órdenes'} · margen {margin}%
            </Text>
          </HeroCard>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Stat icon="cash-multiple" label="Ventas" value={formatRD(r.gross)} color={t.success} />
            <Stat icon="moped" label="Comisiones" value={formatRD(r.commissions)} color={ChannelColors.pedidosya} />
            <Stat icon="bank" label="ITBIS a la DGII" value={formatRD(r.itbis)} color={t.info} />
            <Stat icon="receipt-text-outline" label="Gastos" value={formatRD(r.expenses)} color={t.accent} />
          </View>

          <SectionTitle icon="chart-box">Ventas por canal</SectionTitle>
          <Card style={{ gap: 16 }}>
            {(Object.keys(r.byChannel) as Channel[]).map((c) => {
              const s = r.byChannel[c];
              const color = ChannelColors[c];
              return (
                <View key={c} style={{ gap: 8 }}>
                  <Row>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <IconBadge name={CHANNEL_ICONS[c]} color={color} size={34} />
                      <View>
                        <Label bold size={15}>{CHANNEL_LABELS[c]}</Label>
                        <Label muted size={12}>
                          {s.orders} {s.orders === 1 ? 'orden' : 'órdenes'}
                          {s.commission > 0 ? ` · comisión ${formatRD(s.commission)}` : ''}
                        </Label>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Label bold size={15}>{formatRD(s.net)}</Label>
                      {s.commission > 0 ? <Label muted size={12}>de {formatRD(s.gross)}</Label> : null}
                    </View>
                  </Row>
                  <ProgressBar value={s.gross / maxChannel} color={color} />
                </View>
              );
            })}
          </Card>

          <SectionTitle icon="star-outline">Más vendidos</SectionTitle>
          <Card>
            {data.topProducts.length === 0 ? <EmptyState icon="chart-line" text="Sin ventas en este periodo." /> : null}
            {data.topProducts.map((p, i) => (
              <Row key={p.name} style={{ paddingVertical: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: i === 0 ? t.accent : t.backgroundSelected,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Text style={{ fontWeight: '900', color: i === 0 ? '#FFFFFF' : t.text }}>{i + 1}</Text>
                  </View>
                  <Label size={15} numberOfLines={1} style={{ flex: 1 }}>{p.name}</Label>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Label bold size={15}>{p.qty} uds</Label>
                  <Label muted size={12}>{formatRD(p.amount)}</Label>
                </View>
              </Row>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
