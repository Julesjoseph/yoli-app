/** HTML del ticket térmico (sin dependencias, se puede probar en Node). */

export interface TicketSettings {
  rnc: string;
  address: string;
  phone: string;
  footer: string;
  width: '58' | '80';
  autoPrint: boolean;
}

export interface TicketOrder {
  id: string;
  channel: string;
  external_ref: string | null;
  subtotal: number;
  discount?: number;
  itbis: number;
  tip_law: number;
  total: number;
  payment_method: string;
  /** Efectivo que entregó el cliente y su devuelta (si se registró). */
  cash_received?: number | null;
  change_given?: number | null;
  created_at: string;
  items: { name: string; unit_price: number; quantity: number }[];
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  plataforma: 'Pagado en la plataforma',
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const money = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Número corto y legible de la orden (los últimos 6 caracteres del id). */
export const ticketNumber = (id: string) => id.replace(/-/g, '').slice(-6).toUpperCase();

export function buildReceiptHtml(
  order: TicketOrder,
  shop: { businessName: string; locationName: string; cashier?: string; channelLabel?: string },
  s: TicketSettings,
) {
  const date = new Date(order.created_at);
  const when = `${date.toLocaleDateString('es-DO')} ${date.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' })}`;
  const width = s.width === '58' ? 58 : 80;
  const font = s.width === '58' ? 11 : 13;
  const lines = order.items
    .map(
      (i) => `<tr><td colspan="2" class="name">${esc(i.name)}</td></tr>
<tr><td class="muted">${i.quantity} x ${money(i.unit_price)}</td><td class="r">${money(i.unit_price * i.quantity)}</td></tr>`,
    )
    .join('');
  const header = [s.rnc && `RNC: ${esc(s.rnc)}`, s.address && esc(s.address), s.phone && `Tel: ${esc(s.phone)}`]
    .filter(Boolean)
    .map((x) => `<div>${x}</div>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${width}mm 200mm; margin: 0; }
* { box-sizing: border-box; }
html, body { height: auto; overflow: hidden; }
body { margin: 0; padding: 3mm; width: ${width}mm; font-family: 'Courier New', monospace; font-size: ${font}px; color: #000; }
.c { text-align: center; } .r { text-align: right; white-space: nowrap; } .b { font-weight: bold; }
.big { font-size: ${font + 5}px; font-weight: bold; } .muted { color: #000; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
table { width: 100%; border-collapse: collapse; } td { padding: 1px 0; vertical-align: top; }
.name { padding-top: 4px; }
</style></head><body>
<div class="c big">${esc(shop.businessName)}</div>
<div class="c">${esc(shop.locationName)}</div>
<div class="c">${header}</div>
<hr>
<div class="c b">COMPROBANTE DE VENTA</div>
<table>
<tr><td>Orden</td><td class="r">#${ticketNumber(order.id)}</td></tr>
<tr><td>Fecha</td><td class="r">${esc(when)}</td></tr>
<tr><td>Tipo</td><td class="r">${esc(shop.channelLabel ?? order.channel)}</td></tr>
${order.external_ref ? `<tr><td>Pedido</td><td class="r">${esc(order.external_ref)}</td></tr>` : ''}
${shop.cashier ? `<tr><td>Atendió</td><td class="r">${esc(shop.cashier)}</td></tr>` : ''}
</table>
<hr>
<table>${lines}</table>
<hr>
<table>
${order.discount ? `<tr><td>Descuento</td><td class="r">-${money(order.discount)}</td></tr>` : ''}
<tr><td>Subtotal</td><td class="r">${money(order.subtotal)}</td></tr>
<tr><td>ITBIS 18%</td><td class="r">${money(order.itbis)}</td></tr>
${order.tip_law > 0 ? `<tr><td>Propina legal 10%</td><td class="r">${money(order.tip_law)}</td></tr>` : ''}
<tr><td class="big">TOTAL</td><td class="r big">${money(order.total)}</td></tr>
<tr><td>Pago</td><td class="r">${esc(PAYMENT_LABELS[order.payment_method] ?? order.payment_method)}</td></tr>
${order.cash_received ? `<tr><td>Recibido</td><td class="r">${money(order.cash_received)}</td></tr>
<tr><td class="b">Devuelta</td><td class="r b">${money(order.change_given ?? 0)}</td></tr>` : ''}
</table>
<hr>
${s.footer ? `<div class="c">${esc(s.footer)}</div>` : ''}
<div class="c" style="margin-top:4px">Este documento no es un comprobante fiscal</div>
<div style="height:6mm"></div>
</body></html>`;
}


/** Largo aproximado del ticket en mm, para generar la página del tamaño justo. */
export function estimateTicketHeightMm(order: TicketOrder, s: TicketSettings) {
  const font = s.width === '58' ? 11 : 13;
  const lineMm = (font * 1.45 * 25.4) / 96;
  const nameChars = s.width === '58' ? 24 : 34;
  const itemLines = order.items.reduce((n, i) => n + 1 + Math.ceil(i.name.length / nameChars), 0);
  const lines =
    3 + [s.rnc, s.address, s.phone].filter(Boolean).length + // encabezado
    5 + (order.external_ref ? 1 : 0) + // datos de la orden
    itemLines +
    5 + (order.discount ? 1 : 0) + (order.tip_law ? 1 : 0) + (order.cash_received ? 2 : 0) + // totales
    4; // pie
  return Math.ceil(lines * lineMm + 4 * 4 + 6 + 8);
}
