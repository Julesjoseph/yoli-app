import type { Product } from '@/db/repo';

export interface ComboChoice {
  group: string;
  productId: string;
  name: string;
  extra: number;
}

/**
 * Producto listo para la orden con lo que eligió el cliente:
 * "Combo pica pollo (Tostones, Refresco)", con el precio extra sumado.
 * Cada combinación es una línea distinta de la orden.
 */
export function withChoices(p: Product, chosen: ComboChoice[]): Product {
  if (!chosen.length) return p;
  const extra = chosen.reduce((n, c) => n + c.extra, 0);
  const add = (v: number | null) => (v ? v + extra : v);
  return {
    ...p,
    id: [p.id, ...chosen.map((c) => c.productId)].join('|'),
    base_id: p.id,
    chosen: chosen.map((c) => c.productId),
    name: `${p.name} (${chosen.map((c) => c.name).join(', ')})`,
    price: p.price + extra,
    price_pedidosya: add(p.price_pedidosya),
    price_ubereats: add(p.price_ubereats),
  };
}
