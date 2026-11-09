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

export const TIP_LAW_RATE = 0.1;

export interface CartLine {
  unitPrice: number; // con ITBIS incluido
  quantity: number;
  itbisRate: number; // 0.18
}

export interface OrderTotals {
  gross: number; // suma de precios del menú (con ITBIS)
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
  opts: { commissionRate?: number; applyTipLaw?: boolean } = {},
): OrderTotals {
  let gross = 0;
  let subtotal = 0;
  for (const l of lines) {
    const lineGross = l.unitPrice * l.quantity;
    gross += lineGross;
    subtotal += lineGross / (1 + l.itbisRate);
  }
  gross = round2(gross);
  subtotal = round2(subtotal);
  const itbis = round2(gross - subtotal);

  const applyTip = channel === 'local' && (opts.applyTipLaw ?? true);
  const tipLaw = applyTip ? round2(subtotal * TIP_LAW_RATE) : 0;
  const total = round2(gross + tipLaw);

  const isDelivery = DELIVERY_CHANNELS.includes(channel);
  const platformCommission = isDelivery ? round2(gross * (opts.commissionRate ?? 0)) : 0;
  const netIncome = round2(gross - platformCommission);

  return { gross, subtotal, itbis, tipLaw, total, platformCommission, netIncome };
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
