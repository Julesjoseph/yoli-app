import type { IconName } from '@/components/ui';
import type { Channel } from '@/lib/calc';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ícono según el nombre del producto o categoría (por palabras clave). */
export function foodIcon(name: string): IconName {
  const n = norm(name);
  if (/combo/.test(n)) return 'food';
  if (/hambur|burger|sandw|pan /.test(n)) return 'hamburger';
  if (/papa|frita|tostone/.test(n)) return 'french-fries';
  if (/pollo|chicken|alita/.test(n)) return 'food-drumstick';
  if (/arroz|bandera|moro|locrio/.test(n)) return 'rice';
  if (/cafe|capuch|expres/.test(n)) return 'coffee';
  if (/refresco|soda|cola|bebida|jugo|agua|batida/.test(n)) return 'cup';
  if (/comedor|almuerzo|plato/.test(n)) return 'silverware-fork-knife';
  if (/rapida/.test(n)) return 'hamburger';
  if (/ensalada|sopa|sancocho/.test(n)) return 'bowl-mix';
  return 'food-fork-drink';
}

export const CHANNEL_ICONS: Record<Channel, IconName> = {
  local: 'silverware-fork-knife',
  para_llevar: 'shopping',
  pedidosya: 'moped',
  ubereats: 'truck-delivery-outline',
};

export const EXPENSE_ICONS: Record<string, IconName> = {
  insumos: 'basket-outline',
  nomina: 'account-group',
  alquiler: 'store',
  servicios: 'lightning-bolt',
  gas: 'fire',
  mantenimiento: 'wrench',
  marketing: 'bullhorn',
  impuestos: 'bank',
  otros: 'dots-horizontal-circle-outline',
};
