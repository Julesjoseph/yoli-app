import type { Channel } from './calc';

/**
 * Cálculos del panel de administración (sin dependencias, se prueba en Node).
 * Recibe las ventas y gastos crudos y devuelve totales, ventas por día,
 * por local, por canal y los productos más vendidos.
 */

export type DashPeriod = 'hoy' | '7d' | '30d';

export interface DashOrder {
  id: string;
  location_id: string;
  channel: Channel;
  total: number;
  tip_law: number;
  itbis: number;
  platform_commission: number;
  net_income: number;
  created_at: string;
}
export interface DashExpense {
  location_id: string | null;
  amount: number;
  spent_at: string; // YYYY-MM-DD
}
export interface DashItem {
  order_id: string;
  name: string;
  quantity: number;
  unit_price: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Primer instante del período (en hora local del equipo). */
export function dashStart(period: DashPeriod, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === '7d') d.setDate(d.getDate() - 6);
  if (period === '30d') d.setDate(d.getDate() - 29);
  return d;
}

export function buildDashboard(
  input: {
    orders: DashOrder[];
    expenses: DashExpense[];
    items: DashItem[];
    locations: { id: string; name: string }[];
  },
  period: DashPeriod,
  now = new Date(),
) {
  const start = dashStart(period, now);
  const startKey = dayKey(start);
  const orders = input.orders.filter((o) => new Date(o.created_at) >= start);
  const expenses = input.expenses.filter((e) => e.spent_at >= startKey);
  const orderIds = new Set(orders.map((o) => o.id));

  // Días del período (o las horas si es hoy) con sus ventas.
  const buckets: { key: string; label: string; gross: number; orders: number }[] = [];
  if (period === 'hoy') {
    // De 6 a. m. a medianoche, o desde más temprano si hubo ventas antes.
    const first = Math.min(6, ...orders.map((o) => new Date(o.created_at).getHours()));
    for (let h = first; h <= 23; h++) buckets.push({ key: String(h), label: `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`, gross: 0, orders: 0 });
  } else {
    for (const d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      buckets.push({ key: dayKey(d), label: `${d.getDate()}/${d.getMonth() + 1}`, gross: 0, orders: 0 });
    }
  }

  const byLocation = new Map(input.locations.map((l) => [l.id, { id: l.id, name: l.name, gross: 0, orders: 0, expenses: 0, profit: 0 }]));
  const loc = (id: string | null) => {
    const key = id ?? 'sin-local';
    if (!byLocation.has(key)) byLocation.set(key, { id: key, name: 'Sin local', gross: 0, orders: 0, expenses: 0, profit: 0 });
    return byLocation.get(key)!;
  };
  const channels: Record<Channel, { orders: number; gross: number; commission: number }> = {
    local: { orders: 0, gross: 0, commission: 0 },
    para_llevar: { orders: 0, gross: 0, commission: 0 },
    pedidosya: { orders: 0, gross: 0, commission: 0 },
    ubereats: { orders: 0, gross: 0, commission: 0 },
  };

  let gross = 0;
  let itbis = 0;
  let net = 0;
  let commissions = 0;
  for (const o of orders) {
    const g = o.total - o.tip_law;
    gross += g;
    itbis += o.itbis;
    net += o.net_income;
    commissions += o.platform_commission;
    const c = channels[o.channel];
    if (c) {
      c.orders += 1;
      c.gross += g;
      c.commission += o.platform_commission;
    }
    const l = loc(o.location_id);
    l.gross += g;
    l.orders += 1;
    l.profit += o.net_income - o.itbis;
    const d = new Date(o.created_at);
    const b = buckets.find((x) => x.key === (period === 'hoy' ? String(d.getHours()) : dayKey(d)));
    if (b) {
      b.gross += g;
      b.orders += 1;
    }
  }
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  for (const e of expenses) {
    const l = loc(e.location_id);
    l.expenses += e.amount;
    l.profit -= e.amount;
  }

  const products = new Map<string, { name: string; qty: number; amount: number }>();
  for (const i of input.items) {
    if (!orderIds.has(i.order_id)) continue;
    const p = products.get(i.name) ?? { name: i.name, qty: 0, amount: 0 };
    p.qty += i.quantity;
    p.amount += i.quantity * i.unit_price;
    products.set(i.name, p);
  }

  return {
    orders: orders.length,
    gross: r2(gross),
    itbis: r2(itbis),
    commissions: r2(commissions),
    netIncome: r2(net),
    expenses: r2(expenseTotal),
    profit: r2(net - itbis - expenseTotal),
    avgTicket: orders.length ? r2(gross / orders.length) : 0,
    series: buckets.map((b) => ({ ...b, gross: r2(b.gross) })),
    channels,
    locations: [...byLocation.values()]
      .map((l) => ({ ...l, gross: r2(l.gross), expenses: r2(l.expenses), profit: r2(l.profit) }))
      .sort((a, b) => b.gross - a.gross),
    topProducts: [...products.values()].sort((a, b) => b.qty - a.qty).slice(0, 8),
  };
}

export type Dashboard = ReturnType<typeof buildDashboard>;
