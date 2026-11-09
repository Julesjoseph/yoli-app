import { Tabs } from 'expo-router/tabs';

import { FloatingTabBar } from '@/components/tab-bar';
import { canManage, useBusiness } from '@/hooks/use-business';

/** Pestañas con la barra flotante. Cajero y cocina no ven Reportes. */
export default function TabsLayout() {
  const ctx = useBusiness();
  const hidden = canManage(ctx) ? [] : ['reportes'];
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} hidden={hidden} />}>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="caja" options={{ title: 'Caja' }} />
      <Tabs.Screen name="inventario" options={{ title: 'Inventario' }} />
      <Tabs.Screen name="reportes" options={{ title: 'Reportes' }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
