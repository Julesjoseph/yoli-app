// Contabilidad básica (sin dependencias, se prueba en Node): estado de resultados,
// cobros por forma de pago, gastos por categoría, cuentas por cobrar y por pagar.
//
// Cómo se calcula la ganancia (igual que en Reportes y en el Panel):
//   Ventas (con ITBIS, sin propina)
//   − ITBIS cobrado (es de la DGII)
//   = Ventas netas
//   − Comisiones de PedidosYa / Uber Eats
//   = Ingreso del negocio
//   − Gastos
//   = Ganancia
// La ley de propina (10 %) no es del negocio: se muestra aparte.
// Las ventas a crédito cuentan el día que se venden; los abonos no se vuelven a contar.
// Lo anulado no entra en ninguna suma (se muestra aparte, para la auditoría).

export interface AccOrder {
  id: string;
  location_id?: string | null;
  channel: string;
  status: string;
  total: number;
  tip_law: number;
  itbis: number;
  platform_commission: number;
  net_income: number;
  payment_method: string | null;
  created_at: string;
  external_ref?: string | null;
  void_reason?: string | null;
}

export interface AccExpense {
  id: string;
  location_id?: string | null;
  category: string;
  description: string | null;
  amount: number;
  spent_at: string;
  ncf?: string | null;
  supplier_rnc?: string | null;
  supplier_name?: string | null;
  voided?: boolean | number | null;
  void_reason?: string | null;
  paid?: boolean | number | null;
  due_date?: string | null;
}

export interface AccPayment {
  amount: number;
  method: string;
  voided?: boolean | number | null;
  created_at: string;
}

export const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'insumos', label: 'Insumos' },
  { value: 'nomina', label: 'Nómina' },
  { value: 'alquiler', label: 'Alquiler' },
  { value: 'servicios', label: 'Luz/agua/internet' },
  { value: 'gas', label: 'Gas' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'marketing', label: 'Publicidad' },
  { value: 'impuestos', label: 'Impuestos' },
  { value: 'otros', label: 'Otros' },
];
export const categoryLabel = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? v;

export const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  plataforma: 'PedidosYa / Uber Eats',
  credito: 'A crédito (por cobrar)',
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const yes = (v: boolean | number | null | undefined, dflt: boolean) => (v === null || v === undefined ? dflt : !!v);
export const isVoidedExpense = (e: AccExpense) => yes(e.voided, false);
export const isPaidExpense = (e: AccExpense) => yes(e.paid, true);

export interface Statement {
  orders: number;
  grossSales: number;
  itbis: number;
  netSales: number;
  commissions: number;
  income: number;
  tipLaw: number;
  expenses: number;
  expensesPaid: number;
  expensesPending: number;
  profit: number;
  margin: number;
  avgTicket: number;
  byPayment: { method: string; label: string; amount: number; orders: number }[];
  byCategory: { category: string; label: string; amount: number; count: number }[];
  creditPayments: number;
  voidedOrders: { count: number; amount: number };
  voidedExpenses: { count: number; amount: number };
}

export function buildStatement(input: { orders: AccOrder[]; expenses: AccExpense[]; payments?: AccPayment[] }): Statement {
  let grossSales = 0;
  let itbis = 0;
  let commissions = 0;
  let income = 0;
  let tipLaw = 0;
  let count = 0;
  const pay = new Map<string, { amount: number; orders: number }>();
  const voidedOrders = { count: 0, amount: 0 };
  for (const o of input.orders) {
    if (o.status === 'anulada') {
      voidedOrders.count += 1;
      voidedOrders.amount += o.total;
      continue;
    }
    if (o.status !== 'pagada') continue;
    count += 1;
    grossSales += o.total - o.tip_law;
    itbis += o.itbis;
    commissions += o.platform_commission;
    income += o.net_income - o.itbis;
    tipLaw += o.tip_law;
    const m = o.payment_method || 'efectivo';
    const p = pay.get(m) ?? { amount: 0, orders: 0 };
    // Lo que entra por la plataforma es lo que deposita (sin comisión); lo demás, lo que pagó el cliente.
    p.amount += m === 'plataforma' ? o.net_income : o.total;
    p.orders += 1;
    pay.set(m, p);
  }

  let expenses = 0;
  let expensesPending = 0;
  const cats = new Map<string, { amount: number; count: number }>();
  const voidedExpenses = { count: 0, amount: 0 };
  for (const e of input.expenses) {
    if (isVoidedExpense(e)) {
      voidedExpenses.count += 1;
      voidedExpenses.amount += e.amount;
      continue;
    }
    expenses += e.amount;
    if (!isPaidExpense(e)) expensesPending += e.amount;
    const c = cats.get(e.category) ?? { amount: 0, count: 0 };
    c.amount += e.amount;
    c.count += 1;
    cats.set(e.category, c);
  }

  const creditPayments = (input.payments ?? []).filter((p) => !yes(p.voided, false)).reduce((s, p) => s + p.amount, 0);
  const netSales = grossSales - itbis;
  const profit = income - expenses;
  const order = ['efectivo', 'tarjeta', 'transferencia', 'plataforma', 'credito'];
  return {
    orders: count,
    grossSales: r2(grossSales),
    itbis: r2(itbis),
    netSales: r2(netSales),
    commissions: r2(commissions),
    income: r2(income),
    tipLaw: r2(tipLaw),
    expenses: r2(expenses),
    expensesPaid: r2(expenses - expensesPending),
    expensesPending: r2(expensesPending),
    profit: r2(profit),
    // Margen sobre las ventas netas (sin ITBIS), que es lo que de verdad es del negocio.
    margin: netSales > 0 ? Math.round((profit / netSales) * 1000) / 10 : 0,
    avgTicket: count ? r2(grossSales / count) : 0,
    byPayment: [...pay.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([method, v]) => ({ method, label: PAYMENT_LABELS[method] ?? method, amount: r2(v.amount), orders: v.orders })),
    byCategory: [...cats.entries()]
      .map(([category, v]) => ({ category, label: categoryLabel(category), amount: r2(v.amount), count: v.count }))
      .sort((a, b) => b.amount - a.amount),
    creditPayments: r2(creditPayments),
    voidedOrders: { count: voidedOrders.count, amount: r2(voidedOrders.amount) },
    voidedExpenses: { count: voidedExpenses.count, amount: r2(voidedExpenses.amount) },
  };
}

export interface Payable {
  id: string;
  supplier: string;
  description: string | null;
  amount: number;
  spent_at: string;
  due_date: string | null;
  overdue: boolean;
  days: number | null;
}

/** Cuentas por pagar: gastos a crédito sin pagar (los vencidos primero). */
export function buildPayables(expenses: AccExpense[], today: string): { items: Payable[]; total: number; overdue: number } {
  const items = expenses
    .filter((e) => !isVoidedExpense(e) && !isPaidExpense(e))
    .map<Payable>((e) => {
      const due = e.due_date || null;
      const days = due ? Math.round((Date.parse(`${due}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000) : null;
      return {
        id: e.id,
        supplier: e.supplier_name || e.description || categoryLabel(e.category),
        description: e.description,
        amount: r2(e.amount),
        spent_at: e.spent_at,
        due_date: due,
        overdue: days !== null && days < 0,
        days,
      };
    })
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.spent_at.localeCompare(b.spent_at));
  return {
    items,
    total: r2(items.reduce((s, i) => s + i.amount, 0)),
    overdue: r2(items.filter((i) => i.overdue).reduce((s, i) => s + i.amount, 0)),
  };
}

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------

/** La semana del negocio va de miércoles a martes (0 = domingo … 3 = miércoles). */
export const WEEK_START_DAY = 3;

/** Primer día (miércoles, a medianoche) de la semana en que cae esta fecha. */
export function weekStart(d: Date): Date {
  const back = (d.getDay() - WEEK_START_DAY + 7) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}

/** "mié 11 nov – mar 17 nov" para una semana que empieza en `start`. */
export function weekLabel(start: Date): string {
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const f = (x: Date) => x.toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  return `${f(start)} – ${f(end)}`;
}

export type AccPeriod = 'hoy' | 'semana' | 'mes' | 'mes_pasado' | 'anio';

export const ACC_PERIODS: { value: AccPeriod; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Esta semana (mié–mar)' },
  { value: 'mes', label: 'Este mes' },
  { value: 'mes_pasado', label: 'Mes pasado' },
  { value: 'anio', label: 'Este año' },
];

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Del primer día (incluido) al día siguiente del último (sin incluir), en hora del equipo. */
export function periodRange(period: AccPeriod, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from = today;
  let to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (period === 'semana') from = weekStart(today); // de miércoles a martes
  if (period === 'mes') from = new Date(today.getFullYear(), today.getMonth(), 1);
  if (period === 'mes_pasado') {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    to = new Date(today.getFullYear(), today.getMonth(), 1);
  }
  if (period === 'anio') from = new Date(today.getFullYear(), 0, 1);
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 1);
  const fmt = (d: Date) => d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
  return {
    from,
    to,
    fromKey: dayKey(from),
    toKey: dayKey(to),
    label: dayKey(from) === dayKey(last) ? fmt(from) : `${fmt(from)} al ${fmt(last)}`,
  };
}
