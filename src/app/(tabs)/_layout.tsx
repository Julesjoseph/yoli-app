import { Tabs } from 'expo-router/tabs';
import { useWindowDimensions } from 'react-native';

import { FloatingTabBar, SIDEBAR_MIN_WIDTH } from '@/components/tab-bar';
import { canManage, useBusiness } from '@/hooks/use-business';

/**
 * Pestañas: barra flotante abajo en el teléfono y menú lateral en la PC o tablet grande.
 * Cajero y cocina no ven Panel ni Reportes.
 */
export default function TabsLayout() {
  const ctx = useBusiness();
  const { width } = useWindowDimensions();
  const sidebar = width >= SIDEBAR_MIN_WIDTH;
  const hidden = canManage(ctx) ? [] : ['panel', 'reportes'];
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarPosition: sidebar ? 'left' : 'bottom' }}
      tabBar={(props) => <FloatingTabBar {...props} hidden={hidden} sidebar={sidebar} />}>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="panel" options={{ title: 'Panel' }} />
      <Tabs.Screen name="caja" options={{ title: 'Caja' }} />
      <Tabs.Screen name="inventario" options={{ title: 'Inventario' }} />
      <Tabs.Screen name="reportes" options={{ title: 'Reportes' }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
