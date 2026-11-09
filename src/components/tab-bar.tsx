import type { BottomTabBarProps } from 'expo-router/tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui';
import { Mamey } from '@/constants/theme';
import { useCart } from '@/hooks/use-cart';

const ICONS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home-variant', label: 'Inicio' },
  caja: { icon: 'cart', label: 'Caja' },
  inventario: { icon: 'package-variant', label: 'Inventario' },
  reportes: { icon: 'chart-box', label: 'Reportes' },
  ajustes: { icon: 'account', label: 'Perfil' },
};

/** Barra inferior flotante color mamey, solo íconos, como en las apps de comida. */
export function FloatingTabBar({ state, navigateToTab, hidden }: BottomTabBarProps & { hidden: string[] }) {
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

const styles = StyleSheet.create({
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
