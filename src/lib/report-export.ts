// Reporte de contabilidad para descargar: PDF (HTML que se imprime) y Excel (hojas).
// Sin dependencias: se usa en la app y en las pruebas.

import {
  categoryLabel,
  PAYMENT_LABELS,
  type AccExpense,
  type AccOrder,
  type Payable,
  type Statement,
} from './accounting';
import type { Sheet } from './xlsx';

export interface ExportData {
  businessName: string;
  rnc?: string | null;
  scope: string;
  periodLabel: string;
  statement: Statement;
  orders: AccOrder[];
  expenses: AccExpense[];
  receivables: { items: { name: string; phone?: string | null; balance: number }[]; total: number };
  payables: { items: Payable[]; total: number; overdue: number };
  locations: { id: string; name: string }[];
}

const CHANNELS: Record<string, string> = { local: 'Comedor', para_llevar: 'Para llevar', pedidosya: 'PedidosYa', ubereats: 'Uber Eats' };
const money = (n: number) => 'RD$ ' + n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const dt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const isVoided = (e: AccExpense) => !!e.voided;
const isPending = (e: AccExpense) => e.paid === false || e.paid === 0;

/** Filas del estado de resultados (las mismas en el PDF y en Excel). */
export function statementRows(s: Statement): [string, number, boolean?][] {
  return [
    ['Ventas (con ITBIS, sin propina)', s.grossSales],
    ['− ITBIS cobrado (se paga a la DGII)', -s.itbis],
    ['= Ventas netas', s.netSales, true],
    ['− Comisiones de plataformas', -s.commissions],
    ['= Ingreso del negocio', s.income, true],
    ['− Gastos', -s.expenses],
    [s.profit >= 0 ? '= GANANCIA' : '= PÉRDIDA', s.profit, true],
  ];
}

export function buildReportSheets(d: ExportData): Sheet[] {
  const s = d.statement;
  const loc = new Map(d.locations.map((l) => [l.id, l.name]));
  const resumen: Sheet = {
    name: 'Resumen',
    widths: [44, 18],
    bold: [],
    rows: [
      ['Contabilidad', d.businessName],
      ['Período', d.periodLabel],
      ['Datos', d.scope],
      [],
      ['ESTADO DE RESULTADOS', 'RD$'],
    ],
  };
  resumen.bold!.push(4);
  for (const [label, value, strong] of statementRows(s)) {
    if (strong) resumen.bold!.push(resumen.rows.length);
    resumen.rows.push([label, value]);
  }
  resumen.rows.push(
    ['Margen sobre ventas netas (%)', s.margin],
    ['Órdenes', s.orders],
    ['Ticket promedio', s.avgTicket],
    ['Ley de propina cobrada (para el personal)', s.tipLaw],
    [],
  );
  resumen.bold!.push(resumen.rows.length);
  resumen.rows.push(['INGRESOS POR FORMA DE PAGO', 'RD$']);
  for (const p of s.byPayment) resumen.rows.push([`${p.label} (${p.orders})`, p.amount]);
  resumen.rows.push(['Abonos de clientes a crédito recibidos', s.creditPayments], []);
  resumen.bold!.push(resumen.rows.length);
  resumen.rows.push(['GASTOS POR CATEGORÍA', 'RD$']);
  for (const c of s.byCategory) resumen.rows.push([`${c.label} (${c.count})`, c.amount]);
  resumen.rows.push(['De esos, sin pagar todavía', s.expensesPending], []);
  resumen.bold!.push(resumen.rows.length);
  resumen.rows.push(['CUENTAS', 'RD$']);
  resumen.rows.push(['Por cobrar (clientes a crédito)', d.receivables.total], ['Por pagar (proveedores)', d.payables.total], ['Por pagar vencido', d.payables.overdue], []);
  resumen.bold!.push(resumen.rows.length);
  resumen.rows.push(['ANULADO (no cuenta, queda en auditoría)', 'RD$']);
  resumen.rows.push([`Ventas anuladas (${s.voidedOrders.count})`, s.voidedOrders.amount], [`Gastos anulados (${s.voidedExpenses.count})`, s.voidedExpenses.amount]);

  const ventas: Sheet = {
    name: 'Ventas',
    widths: [17, 14, 14, 12, 12, 12, 10, 12, 14, 14, 11, 24],
    rows: [['Fecha', 'Local', 'Canal', 'Pedido', 'Total', 'ITBIS', 'Propina', 'Comisión', 'Te queda (sin ITBIS)', 'Forma de pago', 'Estado', 'Motivo anulación']],
  };
  for (const o of d.orders) {
    ventas.rows.push([
      dt(o.created_at),
      loc.get(o.location_id ?? '') ?? '',
      CHANNELS[o.channel] ?? o.channel,
      o.external_ref ?? '',
      o.total,
      o.itbis,
      o.tip_law,
      o.platform_commission,
      r2(o.net_income - o.itbis),
      PAYMENT_LABELS[o.payment_method ?? ''] ?? o.payment_method ?? '',
      o.status === 'anulada' ? 'ANULADA' : 'Pagada',
      o.void_reason ?? '',
    ]);
  }

  const gastos: Sheet = {
    name: 'Gastos',
    widths: [12, 14, 16, 30, 24, 13, 15, 12, 12, 12, 24],
    rows: [['Fecha', 'Local', 'Categoría', 'Descripción', 'Proveedor', 'RNC', 'NCF', 'Monto', 'Pago', 'Vence', 'Anulado (motivo)']],
  };
  for (const e of d.expenses) {
    gastos.rows.push([
      e.spent_at,
      loc.get(e.location_id ?? '') ?? '',
      categoryLabel(e.category),
      e.description ?? '',
      e.supplier_name ?? '',
      e.supplier_rnc ?? '',
      e.ncf ?? '',
      e.amount,
      isPending(e) ? 'Por pagar' : 'Pagado',
      e.due_date ?? '',
      isVoided(e) ? `ANULADO: ${e.void_reason ?? ''}` : '',
    ]);
  }

  const cobrar: Sheet = {
    name: 'Por cobrar',
    widths: [30, 16, 16],
    rows: [['Cliente', 'Teléfono', 'Debe'], ...d.receivables.items.map((c) => [c.name, c.phone ?? '', c.balance]), ['TOTAL', '', d.receivables.total]],
    bold: [d.receivables.items.length + 1],
  };
  const pagar: Sheet = {
    name: 'Por pagar',
    widths: [30, 30, 12, 12, 14, 14],
    rows: [
      ['Proveedor', 'Descripción', 'Fecha', 'Vence', 'Estado', 'Monto'],
      ...d.payables.items.map((p) => [p.supplier, p.description ?? '', p.spent_at, p.due_date ?? '', p.overdue ? `Vencida (${-(p.days ?? 0)} días)` : 'Al día', p.amount]),
      ['TOTAL', '', '', '', '', d.payables.total],
    ],
    bold: [d.payables.items.length + 1],
  };
  return [resumen, ventas, gastos, cobrar, pagar];
}

/** Reporte en hoja carta para imprimir o guardar como PDF. */
export function buildReportHtml(d: ExportData) {
  const s = d.statement;
  const row = (label: string, value: string, strong = false, cls = '') =>
    `<tr class="${strong ? 'b' : ''} ${cls}"><td>${esc(label)}</td><td class="n">${esc(value)}</td></tr>`;
  const table = (title: string, rows: string) => `<h2>${esc(title)}</h2><table>${rows}</table>`;
  const statement = statementRows(s)
    .map(([l, v, strong]) => row(l, money(Math.abs(v)).replace('RD$ ', v < 0 ? '−RD$ ' : 'RD$ '), !!strong, l.includes('GANANCIA') ? 'ok' : l.includes('PÉRDIDA') ? 'bad' : ''))
    .join('');
  const extra = [
    row('Margen sobre ventas netas', `${s.margin}%`),
    row('Órdenes', String(s.orders)),
    row('Ticket promedio', money(s.avgTicket)),
    row('Ley de propina cobrada (para el personal)', money(s.tipLaw)),
  ].join('');
  const pays = s.byPayment.map((p) => row(`${p.label} (${p.orders})`, money(p.amount))).join('') + row('Abonos de clientes a crédito recibidos', money(s.creditPayments));
  const cats = s.byCategory.map((c) => row(`${c.label} (${c.count})`, money(c.amount))).join('') + row('Total de gastos', money(s.expenses), true) + row('De esos, sin pagar todavía', money(s.expensesPending));
  const receivables =
    d.receivables.items.map((c) => row(c.name, money(c.balance))).join('') + row('Total por cobrar', money(d.receivables.total), true);
  const payables =
    d.payables.items
      .map((p) => row(`${p.supplier}${p.due_date ? ` · vence ${p.due_date}` : ''}${p.overdue ? ' (VENCIDA)' : ''}`, money(p.amount), false, p.overdue ? 'bad' : ''))
      .join('') + row('Total por pagar', money(d.payables.total), true);
  const voided =
    s.voidedOrders.count || s.voidedExpenses.count
      ? table(
          'Anulado (no cuenta en las sumas)',
          row(`Ventas anuladas (${s.voidedOrders.count})`, money(s.voidedOrders.amount)) + row(`Gastos anulados (${s.voidedExpenses.count})`, money(s.voidedExpenses.amount)),
        )
      : '';
  const expenseRows = d.expenses
    .filter((e) => !isVoided(e))
    .map(
      (e) =>
        `<tr><td>${esc(e.spent_at)}</td><td>${esc(categoryLabel(e.category))}</td><td>${esc([e.supplier_name, e.description].filter(Boolean).join(' · '))}</td><td>${esc(e.ncf ?? '')}</td><td class="n">${money(e.amount)}${isPending(e) ? ' *' : ''}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Contabilidad ${esc(d.periodLabel)}</title><style>
@page { size: letter; margin: 14mm; }
body { font-family: -apple-system, Roboto, Arial, sans-serif; color: #1c1917; font-size: 11pt; }
h1 { font-size: 18pt; margin: 0; color: #CC6600; } h2 { font-size: 12pt; margin: 18px 0 6px; border-bottom: 2px solid #CC6600; padding-bottom: 3px; }
.sub { color: #57534e; margin: 2px 0; } table { width: 100%; border-collapse: collapse; } td, th { padding: 4px 6px; border-bottom: 1px solid #e7e5e4; text-align: left; }
th { background: #f5f5f4; font-size: 9pt; } .n { text-align: right; white-space: nowrap; } .b td { font-weight: 700; } .ok td { color: #15803d; font-size: 13pt; } .bad td { color: #b91c1c; }
.grid { display: flex; gap: 16px; } .grid > div { flex: 1; } .small { font-size: 9pt; } .note { color: #78716c; font-size: 9pt; margin-top: 14px; }
</style></head><body>
<h1>${esc(d.businessName)}</h1>
${d.rnc ? `<p class="sub">RNC ${esc(d.rnc)}</p>` : ''}
<p class="sub"><b>Contabilidad</b> · ${esc(d.periodLabel)} · ${esc(d.scope)}</p>
${table('Estado de resultados', statement + extra)}
<div class="grid"><div>${table('Ingresos por forma de pago', pays)}</div><div>${table('Gastos por categoría', cats)}</div></div>
<div class="grid"><div>${table('Cuentas por cobrar', receivables)}</div><div>${table('Cuentas por pagar', payables)}</div></div>
${voided}
${expenseRows ? `<h2>Detalle de gastos</h2><table class="small"><tr><th>Fecha</th><th>Categoría</th><th>Proveedor / descripción</th><th>NCF</th><th class="n">Monto</th></tr>${expenseRows}</table><p class="note">* Sin pagar todavía (cuenta por pagar).</p>` : ''}
<p class="note">Generado por YOLI SOFT el ${esc(new Date().toLocaleString('es-DO'))}. La ganancia es: ventas sin ITBIS − comisiones − gastos. La ley de propina no es ingreso del negocio. Las ventas a crédito cuentan el día que se venden.</p>
</body></html>`;
}
