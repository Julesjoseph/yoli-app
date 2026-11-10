import { router, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/text';

import { useAuth } from '@/auth/auth';
import { CHANNEL_ICONS } from '@/components/brand-icons';
import { Card, EmptyState, HeroCard, Icon, IconBadge, Label, Pill, Row, Screen, SectionTitle, type IconName } from '@/components/ui';
import { ChannelColors } from '@/constants/theme';
import { getReport, listRecentOrders, listStock, pendingSyncCount, ROLE_LABELS } from '@/db/repo';
import { canManage, useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { CHANNEL_LABELS, formatRD } from '@/lib/calc';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' });

export default function HomeScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const auth = useAuth();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const manager = canManage(ctx);
  const firstName = ((auth.session?.user.user_metadata?.name as string | undefined) ?? '').split(' ')[0];

  const [data] = useFocusData(
    async () => {
      const [{ report }, stock, recent, pending] = await Promise.all([
        getReport(db, ctx, 'hoy'),
        listStock(db, ctx),
        listRecentOrders(db, ctx),
        pendingSyncCount(db),
      ]);
      return { report, low: stock.filter((s) => s.quantity <= s.min_stock), recent, pending };
    },
    [db, ctx],
  );

  const actions: { icon: IconName; label: string; hint: string; href: Href; color: string; show: boolean }[] = [
    { icon: 'cash-register', label: 'Nueva venta', hint: 'Abrir la caja', href: '/caja', color: t.primary, show: true },
    { icon: 'book-open-variant', label: 'Catálogo', hint: 'Productos y precios', href: '/catalogo', color: t.info, show: manager },
    { icon: 'receipt-text-outline', label: 'Registrar gasto', hint: 'Compras y pagos', href: '/gastos', color: t.accent, show: manager },
    { icon: 'package-variant', label: 'Inventario', hint: 'Stock e insumos', href: '/inventario', color: t.success, show: true },
  ];
  const visible = actions.filter((a) => a.show);
  const tileWidth = width >= 768 ? '23.5%' : '48%';

  const r = data?.report;
  const delivery = r ? r.byChannel.pedidosya.orders + r.byChannel.ubereats.orders : 0;

  return (
    <Screen
      title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
      subtitle={`${ctx.businessName} · ${ctx.locationName}`}>
      <HeroCard>
        <Row>
          <Text style={styles.heroLabel}>Ventas de hoy</Text>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>{ROLE_LABELS[ctx.role]}</Text>
          </View>
        </Row>
        <Text style={styles.heroValue} adjustsFontSizeToFit numberOfLines={1}>
          {formatRD(r?.gross ?? 0)}
        </Text>
        <View style={styles.heroStats}>
          <HeroStat icon="receipt" label="Órdenes" value={String(r?.orders ?? 0)} />
          <HeroStat icon="moped" label="Delivery" value={String(delivery)} />
          {manager ? (
            <HeroStat icon={r && r.profit < 0 ? 'trending-down' : 'trending-up'} label="Ganancia" value={formatRD(r?.profit ?? 0)} />
          ) : null}
        </View>
      </HeroCard>

      <SectionTitle icon="lightning-bolt">Accesos rápidos</SectionTitle>
      <View style={styles.grid}>
        {visible.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => router.push(a.href)}
            style={({ pressed }) => [{ width: tileWidth, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
            <Card style={{ gap: 12, minHeight: 128 }}>
              <IconBadge name={a.icon} color={a.color} size={44} />
              <View>
                <Label bold size={16}>{a.label}</Label>
                <Label muted size={13}>{a.hint}</Label>
              </View>
            </Card>
          </Pressable>
        ))}
      </View>

      {data && data.low.length > 0 ? (
        <Pressable onPress={() => router.push('/inventario')} accessibilityRole="button">
          <Card style={{ borderColor: t.danger, borderWidth: 1 }}>
            <Row>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <IconBadge name="alert-circle" color={t.danger} />
                <View style={{ flex: 1 }}>
                  <Label bold size={16}>
                    {data.low.length} {data.low.length === 1 ? 'insumo por agotarse' : 'insumos por agotarse'}
                  </Label>
                  <Label muted size={13} numberOfLines={1}>{data.low.slice(0, 3).map((s) => s.name).join(', ')}</Label>
                </View>
              </View>
              <Icon name="chevron-right" color={t.textSecondary} />
            </Row>
          </Card>
        </Pressable>
      ) : null}

      <SectionTitle
        icon="history"
        right={
          data && data.pending > 0 && !ctx.demo ? <Pill text={`${data.pending} POR SUBIR`} color={t.accent} /> : undefined
        }>
        Últimas ventas
      </SectionTitle>
      <Card style={{ gap: 0 }}>
        {data && data.recent.length === 0 ? <EmptyState icon="cart-outline" text="Aún no hay ventas. ¡Haz la primera desde la Caja!" /> : null}
        {(data?.recent ?? []).map((o, i) => (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityLabel={`Ver venta de ${formatRD(o.total)}`}
            onPress={() => router.push({ pathname: '/venta/[id]', params: { id: o.id } })}
            style={[styles.order, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
            <IconBadge name={CHANNEL_ICONS[o.channel]} color={ChannelColors[o.channel]} size={38} />
            <View style={{ flex: 1 }}>
              <Label bold size={15}>{CHANNEL_LABELS[o.channel]}</Label>
              <Label muted size={13}>
                {time(o.created_at)} · {o.items} {o.items === 1 ? 'artículo' : 'artículos'}
              </Label>
            </View>
            <Label bold size={16}>{formatRD(o.total)}</Label>
            <Icon name="chevron-right" size={20} color={t.textSecondary} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

function HeroStat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name={icon} size={13} color="#FFFFFFD9" />
        <Text style={styles.heroStatLabel}>{label}</Text>
      </View>
      <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroLabel: { color: '#FFFFFFE6', fontWeight: '700', fontSize: 15 },
  heroPill: { backgroundColor: '#FFFFFF33', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  heroPillText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  heroValue: { color: '#FFFFFF', fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 6 },
  heroStat: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    backgroundColor: '#FFFFFF26',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  heroStatLabel: { color: '#FFFFFFCC', fontSize: 11, fontWeight: '700' },
  heroStatValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  order: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
});
