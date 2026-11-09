import type { BottomTabBarProps } from 'expo-router/tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { router } from 'expo-router';

import { Logo } from '@/components/logo';
import { Icon, type IconName } from '@/components/ui';
import { Mamey } from '@/constants/theme';
import { useBusiness } from '@/hooks/use-business';
import { useCart } from '@/hooks/use-cart';

const ICONS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home-variant', label: 'Inicio' },
  panel: { icon: 'view-dashboard', label: 'Panel' },
  caja: { icon: 'cart', label: 'Caja' },
  inventario: { icon: 'package-variant', label: 'Inventario' },
  reportes: { icon: 'chart-box', label: 'Reportes' },
  ajustes: { icon: 'account', label: 'Perfil' },
};

/** Ancho desde el que se usa el menú lateral (PC o tablet grande). */
export const SIDEBAR_MIN_WIDTH = 1000;

/** Barra inferior flotante color mamey, solo íconos, como en las apps de comida. */
export function FloatingTabBar(props: BottomTabBarProps & { hidden: string[]; sidebar?: boolean }) {
  if (props.sidebar) return <Sidebar {...props} />;
  return <BottomBar {...props} />;
}

function BottomBar({ state, navigateToTab, hidden }: BottomTabBarProps & { hidden: string[] }) {
  const insets = useSafeAreaInsets();
  const cart = useCart();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        {state.routes
          .filter((r) => ICONS[r.name] && !hidden.includes(r.name))
          .map((route) => {
            const focused = state.routes[state.index]?.key === route.key;
            const item = ICONS[route.name];
            const onPress = () => {
              if (!focused) navigateToTab(route.key);
            };
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: focused }}
                onPress={onPress}
                hitSlop={6}
                style={[styles.item, focused && styles.itemActive]}>
                <Icon name={item.icon} size={24} color={focused ? Mamey : '#FFFFFF'} />
                {route.name === 'caja' && cart.count > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{cart.count}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
      </View>
    </View>
  );
}

/** Menú lateral para la PC: logo, secciones con nombre y accesos de administración. */
function Sidebar({ state, navigateToTab, hidden }: BottomTabBarProps & { hidden: string[] }) {
  const cart = useCart();
  const ctx = useBusiness();
  const manager = !hidden.includes('panel');
  const extra: { icon: IconName; label: string; href: '/catalogo' | '/gastos' | '/impresora' | '/orden' }[] = [
    ...(manager
      ? [
          { icon: 'book-open-variant' as const, label: 'Catálogo', href: '/catalogo' as const },
          { icon: 'receipt-text-outline' as const, label: 'Gastos', href: '/gastos' as const },
        ]
      : []),
    { icon: 'printer-pos', label: 'Impresora', href: '/impresora' },
  ];
  return (
    <View style={styles.side}>
      <View style={{ paddingVertical: 18, alignItems: 'center' }}>
        <Logo size={34} color="#FFFFFF" />
      </View>
      <View style={{ gap: 4 }}>
        {state.routes
          .filter((r) => ICONS[r.name] && !hidden.includes(r.name))
          .map((route) => {
            const focused = state.routes[state.index]?.key === route.key;
            const item = ICONS[route.name];
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                onPress={() => !focused && navigateToTab(route.key)}
                style={({ hovered }: { hovered?: boolean }) => [styles.sideItem, focused ? styles.itemActive : hovered && { backgroundColor: '#FFFFFF22' }]}>
                <Icon name={item.icon} size={22} color={focused ? Mamey : '#FFFFFF'} />
                <Text style={[styles.sideText, focused && { color: Mamey }]}>{item.label}</Text>
                {route.name === 'caja' && cart.count > 0 ? (
                  <View style={[styles.sideBadge, { backgroundColor: focused ? Mamey : '#FFFFFF' }]}>
                    <Text style={{ color: focused ? '#FFFFFF' : Mamey, fontSize: 12, fontWeight: '900' }}>{cart.count}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
      </View>
      <View style={styles.sideDivider} />
      <View style={{ gap: 4 }}>
        {extra.map((e) => (
          <Pressable
            key={e.href}
            accessibilityRole="link"
            onPress={() => router.push(e.href)}
            style={({ hovered }: { hovered?: boolean }) => [styles.sideItem, hovered && { backgroundColor: '#FFFFFF22' }]}>
            <Icon name={e.icon} size={20} color="#FFFFFFD9" />
            <Text style={[styles.sideText, { fontWeight: '700', color: '#FFFFFFD9' }]}>{e.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <View style={styles.sideFooter}>
        <Text style={{ color: '#FFFFFF', fontWeight: '800' }} numberOfLines={1}>{ctx.businessName}</Text>
        <Text style={{ color: '#FFFFFFCC', fontSize: 12 }} numberOfLines={1}>{ctx.locationName}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  side: { width: 232, backgroundColor: Mamey, paddingHorizontal: 14, paddingBottom: 16 },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 12 },
  sideText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, flex: 1 },
  sideBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  sideDivider: { height: 1, backgroundColor: '#FFFFFF33', marginVertical: 14, marginHorizontal: 6 },
  sideFooter: { backgroundColor: '#FFFFFF22', borderRadius: 14, padding: 12, gap: 2 },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 16 },
  bar: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: Mamey,
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 8,
    ...Platform.select({
      android: { elevation: 10 },
      default: { shadowColor: '#7C2D12', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
    }),
  },
  item: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  itemActive: { backgroundColor: '#FFFFFF' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: Mamey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: Mamey, fontSize: 11, fontWeight: '900' },
});
