import { Tabs } from 'expo-router/tabs';

import type { Role } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';

export default function AppTabs({ role }: { role: Role }) {
  const colors = useTheme();
  const manager = role === 'dueno' || role === 'gerente';
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen name="index" options={{ title: 'Caja' }} />
      <Tabs.Screen name="inventario" options={{ title: 'Inventario' }} />
      <Tabs.Screen name="gastos" options={{ title: 'Gastos', href: manager ? undefined : null }} />
      <Tabs.Screen name="reportes" options={{ title: 'Reportes', href: manager ? undefined : null }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}
