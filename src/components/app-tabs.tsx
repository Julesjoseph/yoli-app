import { NativeTabs } from 'expo-router/native-tabs';

import type { Role } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';

/** Cajero y cocina no ven Reportes. Gastos y Catálogo se abren desde Inicio o Ajustes. */
export default function AppTabs({ role }: { role: Role }) {
  const colors = useTheme();
  const manager = role === 'dueno' || role === 'gerente';
  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.primary } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="caja">
        <NativeTabs.Trigger.Label>Caja</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="cart.fill" md="point_of_sale" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inventario">
        <NativeTabs.Trigger.Label>Inventario</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="shippingbox.fill" md="inventory_2" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reportes" hidden={!manager}>
        <NativeTabs.Trigger.Label>Reportes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar.fill" md="bar_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="ajustes">
        <NativeTabs.Trigger.Label>Ajustes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
