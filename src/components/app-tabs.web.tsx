import { Tabs } from 'expo-router/tabs';

import { Icon, type IconName } from '@/components/ui';
import type { Role } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';

const icon = (name: IconName) => ({ color }: { color: unknown }) => <Icon name={name} color={String(color)} size={24} />;

export default function AppTabs({ role }: { role: Role }) {
  const colors = useTheme();
  const manager = role === 'dueno' || role === 'gerente';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.backgroundElement, borderTopColor: colors.border },
        tabBarLabelStyle: { fontWeight: '700' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icon('home-variant') }} />
      <Tabs.Screen name="caja" options={{ title: 'Caja', tabBarIcon: icon('cash-register') }} />
      <Tabs.Screen name="inventario" options={{ title: 'Inventario', tabBarIcon: icon('package-variant') }} />
      <Tabs.Screen name="reportes" options={{ title: 'Reportes', href: manager ? undefined : null, tabBarIcon: icon('chart-box') }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: icon('cog') }} />
    </Tabs>
  );
}
