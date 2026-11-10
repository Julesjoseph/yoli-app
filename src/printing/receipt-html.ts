/** HTML del ticket térmico (sin dependencias, se puede probar en Node). */

export interface TicketSettings {
  /** Razón social (del perfil del negocio), opcional. */
  legalName?: string;
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
  const f = FONT_VW[s.width];
  const lines = order.items
    .map(
      (i) => `<tr><td colspan="2" class="name">${esc(i.name)}</td></tr>
<tr><td class="muted">${i.quantity} x ${money(i.unit_price)}</td><td class="r">${money(i.unit_price * i.quantity)}</td></tr>`,
    )
    .join('');
  const header = [s.legalName && esc(s.legalName), s.rnc && `RNC: ${esc(s.rnc)}`, s.address && esc(s.address), s.phone && `Tel: ${esc(s.phone)}`]
    .filter(Boolean)
    .map((x) => `<div>${x}</div>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${width}mm 200mm; margin: 0; }
/* Todo se mide en vw (ancho de la página), así llena el papel en el teléfono, la PC y la impresora. */
* { box-sizing: border-box; }
html, body { height: auto; overflow: hidden; }
body { margin: 0; padding: ${PAD_VW}vw; width: 100%; font-family: 'Courier New', monospace; font-size: ${f}vw; line-height: ${LINE}; color: #000; }
.c { text-align: center; } .r { text-align: right; white-space: nowrap; } .b { font-weight: bold; }
.big { font-size: ${f * BIG}vw; font-weight: bold; } .muted { color: #000; }
hr { border: 0; border-top: 1px dashed #000; margin: ${HR_VW}vw 0; }
table { width: 100%; border-collapse: collapse; } td { padding: 0; vertical-align: top; }
.name { padding-top: ${NAME_VW}vw; }
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
<div style="height:${END_VW}vw"></div>
</body></html>`;
}


/** Tamaños del ticket en vw (1vw = 1% del ancho del papel). */
const FONT_VW = { '80': 4.1, '58': 5 } as const;
const LINE = 1.35;
const BIG = 1.3;
const PAD_VW = 3;
const HR_VW = 1.2;
const NAME_VW = 0.8;
const END_VW = 5;

/** Largo del ticket en mm (con los mismos tamaños del CSS), para que la página sea justa. */
export function estimateTicketHeightMm(order: TicketOrder, s: TicketSettings) {
  const width = s.width === '58' ? 58 : 80;
  const vw = width / 100; // mm por vw
  const f = FONT_VW[s.width];
  const line = f * LINE * vw;
  const charsPerLine = Math.floor((100 - 2 * PAD_VW) / (f * 0.6));
  const itemLines = order.items.reduce((n, i) => n + Math.ceil(i.name.length / charsPerLine) + 1, 0);
  const lines =
    1 + [s.rnc, s.address, s.phone].filter(Boolean).length + // local y datos del negocio
    4 + (order.external_ref ? 1 : 0) + // título, orden, fecha, tipo
    1 + // atendió (si aplica; se deja espacio)
    itemLines +
    3 + (order.discount ? 1 : 0) + (order.tip_law ? 1 : 0) + (order.cash_received ? 2 : 0) + // totales y pago
    (s.footer ? 1 : 0) + 2; // pie
  const bigLines = 2 * line * BIG; // nombre del negocio y TOTAL
  const extras = 5 * (2 * HR_VW * vw + 0.3) + order.items.length * NAME_VW * vw + (2 * PAD_VW + END_VW) * vw;
  return Math.ceil(lines * line + bigLines + extras + 2);
}
