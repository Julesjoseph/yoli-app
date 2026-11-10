/**
 * Cálculos de negocio puros (sin React ni base de datos) para poder probarlos.
 * Reglas de República Dominicana:
 *  - ITBIS 18% (los precios del menú se registran con ITBIS incluido).
 *  - 10% de ley de propina sobre el subtotal, solo para consumo en el local.
 */

export type Channel = 'local' | 'para_llevar' | 'pedidosya' | 'ubereats';

export const CHANNEL_LABELS: Record<Channel, string> = {
  local: 'Comedor',
  para_llevar: 'Para llevar',
  pedidosya: 'PedidosYa',
  ubereats: 'Uber Eats',
};

export const DELIVERY_CHANNELS: Channel[] = ['pedidosya', 'ubereats'];

/** ITBIS de un producto en un canal: puede estar exento solo en PedidosYa / Uber Eats. */
export function itbisFor(p: { itbis_rate: number; delivery_itbis_exempt?: number | boolean | null }, channel: Channel) {
  return DELIVERY_CHANNELS.includes(channel) && p.delivery_itbis_exempt ? 0 : p.itbis_rate;
}

export const TIP_LAW_RATE = 0.1;

export interface CartLine {
  unitPrice: number; // con ITBIS incluido
  quantity: number;
  itbisRate: number; // 0.18
}

/** Precio de un producto según el canal (PedidosYa y Uber Eats pueden tener su propio precio). */
export function priceFor(
  p: { price: number; price_pedidosya?: number | null; price_ubereats?: number | null },
  channel: Channel,
) {
  if (channel === 'pedidosya' && p.price_pedidosya) return p.price_pedidosya;
  if (channel === 'ubereats' && p.price_ubereats) return p.price_ubereats;
  return p.price;
}

export interface OrderTotals {
  discount: number; // descuento aplicado (con ITBIS)
  gross: number; // suma de precios del menú (con ITBIS), ya con el descuento
  subtotal: number; // sin ITBIS
  itbis: number;
  tipLaw: number;
  total: number; // lo que paga el cliente
  platformCommission: number;
  netIncome: number; // lo que le queda al negocio (sin propina ni comisión)
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeOrderTotals(
  lines: CartLine[],
  channel: Channel,
  opts: { commissionRate?: number; applyTipLaw?: boolean; discount?: number } = {},
): OrderTotals {
  let full = 0;
  let fullSubtotal = 0;
  for (const l of lines) {
    const lineGross = l.unitPrice * l.quantity;
    full += lineGross;
    fullSubtotal += lineGross / (1 + l.itbisRate);
  }
  // El descuento (en RD$, con ITBIS) baja el precio de toda la orden por igual,
  // así el ITBIS y la propina se calculan sobre lo que de verdad se cobra.
  const discount = round2(Math.min(Math.max(opts.discount ?? 0, 0), full));
  const factor = full > 0 ? (full - discount) / full : 1;
  const gross = round2(full - discount);
  const subtotal = round2(fullSubtotal * factor);
  const itbis = round2(gross - subtotal);

  const applyTip = channel === 'local' && (opts.applyTipLaw ?? true);
  const tipLaw = applyTip ? round2(subtotal * TIP_LAW_RATE) : 0;
  const total = round2(gross + tipLaw);

  const isDelivery = DELIVERY_CHANNELS.includes(channel);
  const platformCommission = isDelivery ? round2(gross * (opts.commissionRate ?? 0)) : 0;
  const netIncome = round2(gross - platformCommission);

  return { discount, gross, subtotal, itbis, tipLaw, total, platformCommission, netIncome };
}

export interface RecipeItem {
  productId: string;
  ingredientId: string;
  quantity: number;
}

/** Cuánto de cada ingrediente se consume al vender estas líneas. */
export function ingredientUsage(
  sold: { productId: string; quantity: number }[],
  recipes: RecipeItem[],
): Map<string, number> {
  const usage = new Map<string, number>();
  for (const s of sold) {
    for (const r of recipes) {
      if (r.productId !== s.productId) continue;
      usage.set(r.ingredientId, (usage.get(r.ingredientId) ?? 0) + r.quantity * s.quantity);
    }
  }
  return usage;
}

export interface OrderForReport {
  channel: Channel;
  total: number;
  tipLaw: number;
  itbis: number;
  platformCommission: number;
  netIncome: number;
}

export interface ChannelSummary {
  orders: number;
  gross: number;
  commission: number;
  net: number;
}

export interface ProfitReport {
  byChannel: Record<Channel, ChannelSummary>;
  orders: number;
  gross: number; // ventas con ITBIS, sin propina
  itbis: number; // ITBIS cobrado (se debe a la DGII)
  commissions: number;
  netIncome: number;
  expenses: number;
  profit: number; // ingreso neto - ITBIS - gastos
}

export function buildProfitReport(orders: OrderForReport[], expenseTotal: number): ProfitReport {
  const empty = (): ChannelSummary => ({ orders: 0, gross: 0, commission: 0, net: 0 });
  const byChannel: Record<Channel, ChannelSummary> = {
    local: empty(),
    para_llevar: empty(),
    pedidosya: empty(),
    ubereats: empty(),
  };
  let gross = 0;
  let itbis = 0;
  let commissions = 0;
  let netIncome = 0;
  for (const o of orders) {
    const g = o.total - o.tipLaw;
    const c = byChannel[o.channel];
    c.orders += 1;
    c.gross = round2(c.gross + g);
    c.commission = round2(c.commission + o.platformCommission);
    c.net = round2(c.net + o.netIncome);
    gross += g;
    itbis += o.itbis;
    commissions += o.platformCommission;
    netIncome += o.netIncome;
  }
  const profit = round2(netIncome - itbis - expenseTotal);
  return {
    byChannel,
    orders: orders.length,
    gross: round2(gross),
    itbis: round2(itbis),
    commissions: round2(commissions),
    netIncome: round2(netIncome),
    expenses: round2(expenseTotal),
    profit,
  };
}

export const formatRD = (n: number) =>
  'RD$ ' + n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
