/** HTML del ticket térmico y de la factura en hoja carta (se puede probar en Node). */
import qrcode from 'qrcode-generator';

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
  /** Factura electrónica (e-CF) de esta venta, si se emitió. */
  invoice?: TicketInvoice | null;
}

export interface TicketInvoice {
  ecf_type: string;
  encf: string | null;
  customer_rnc: string | null;
  customer_name: string | null;
  security_code: string | null;
  environment: string | null;
  /** Enlace del QR que dio el proveedor (si no, se arma el de consulta de la DGII). */
  qr_url?: string | null;
  /** Cuándo se emitió (fecha de firma). */
  created_at?: string | null;
}

const two = (n: number) => String(n).padStart(2, '0');
const dmy = (d: Date) => `${two(d.getDate())}-${two(d.getMonth() + 1)}-${d.getFullYear()}`;

/**
 * Enlace del código QR de la representación impresa del e-CF (consulta del timbre
 * en la DGII). Si el proveedor ya dio uno, se usa ese.
 */
export function ecfQrUrl(inv: TicketInvoice, issuerRnc: string, total: number) {
  if (inv.qr_url) return inv.qr_url;
  const test = inv.environment !== 'produccion';
  const signed = new Date(inv.created_at ?? Date.now());
  const q = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const rnc = issuerRnc.replace(/\D/g, '');
  const amount = total.toFixed(2);
  // Factura de consumo menor de RD$250,000: consulta simplificada.
  if (inv.ecf_type === '32' && total < 250_000) {
    return `https://fc.dgii.gov.do/${test ? 'testecf' : 'ecf'}/ConsultaTimbreFC?${q({ RncEmisor: rnc, ENCF: inv.encf ?? '', MontoTotal: amount, CodigoSeguridad: inv.security_code ?? '' })}`;
  }
  return `https://ecf.dgii.gov.do/${test ? 'testecf' : 'ecf'}/ConsultaTimbre?${q({
    RncEmisor: rnc,
    ...(inv.customer_rnc ? { RncComprador: inv.customer_rnc } : {}),
    ENCF: inv.encf ?? '',
    FechaEmision: dmy(signed),
    MontoTotal: amount,
    FechaFirma: `${dmy(signed)} ${two(signed.getHours())}:${two(signed.getMinutes())}:${two(signed.getSeconds())}`,
    CodigoSeguridad: inv.security_code ?? '',
  })}`;
}

/** Código QR en SVG (se escala al ancho que le den). */
export function qrSvg(text: string) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
}

const signedAt = (inv: TicketInvoice) => {
  const d = new Date(inv.created_at ?? Date.now());
  return `${d.toLocaleDateString('es-DO')} ${d.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' })}`;
};

const ECF_TITLES: Record<string, string> = {
  '31': 'FACTURA DE CRÉDITO FISCAL ELECTRÓNICA',
  '32': 'FACTURA DE CONSUMO ELECTRÓNICA',
};

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
.qr { width: ${QR_VW}vw; margin: ${HR_VW}vw auto; } .qr svg { width: 100%; height: auto; display: block; }
</style></head><body>
<div class="c big">${esc(shop.businessName)}</div>
<div class="c">${esc(shop.locationName)}</div>
<div class="c">${header}</div>
<hr>
<div class="c b">${order.invoice ? ECF_TITLES[order.invoice.ecf_type] ?? 'COMPROBANTE FISCAL ELECTRÓNICO' : 'COMPROBANTE DE VENTA'}</div>
${order.invoice ? `<table>
<tr><td>e-NCF</td><td class="r b">${esc(order.invoice.encf ?? '')}</td></tr>
${order.invoice.customer_rnc ? `<tr><td>RNC cliente</td><td class="r">${esc(order.invoice.customer_rnc)}</td></tr>` : ''}
${order.invoice.customer_name ? `<tr><td colspan="2">${esc(order.invoice.customer_name)}</td></tr>` : ''}
</table>` : ''}
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
${order.invoice ? `<div class="qr">${qrSvg(ecfQrUrl(order.invoice, s.rnc, order.total))}</div>
${order.invoice.security_code ? `<div class="c">Código de seguridad: <b>${esc(order.invoice.security_code)}</b></div>` : ''}
<div class="c">Fecha de firma: ${esc(signedAt(order.invoice))}</div>` : ''}
${order.invoice?.environment === 'prueba' ? `<div class="c b">MODO PRUEBA · NO VÁLIDO ANTE LA DGII</div>` : ''}
${s.footer ? `<div class="c">${esc(s.footer)}</div>` : ''}
${order.invoice ? '' : '<div class="c" style="margin-top:4px">Este documento no es un comprobante fiscal</div>'}
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
const QR_VW = 42;

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
    (s.footer ? 1 : 0) + 2 + // pie
    (order.invoice ? 4 + (order.invoice.customer_rnc ? 2 : 0) + (order.invoice.environment === 'prueba' ? 2 : 0) : 0); // e-CF
  const qr = order.invoice ? (QR_VW + 2 * HR_VW) * vw : 0;
  const bigLines = 2 * line * BIG; // nombre del negocio y TOTAL
  const extras = 5 * (2 * HR_VW * vw + 0.3) + order.items.length * NAME_VW * vw + (2 * PAD_VW + END_VW) * vw;
  return Math.ceil(lines * line + bigLines + extras + qr + 2);
}

/**
 * Factura en hoja carta (8.5 × 11), para guardar en PDF, enviar por correo o
 * imprimir en una impresora normal. Lleva los datos que pide la DGII en la
 * representación impresa del e-CF.
 */
export function buildInvoiceLetterHtml(
  order: TicketOrder & { invoice: TicketInvoice },
  shop: { businessName: string; locationName: string; logoUrl?: string | null; email?: string; channelLabel?: string },
  s: TicketSettings,
) {
  const inv = order.invoice;
  const date = new Date(order.created_at);
  const prueba = inv.environment === 'prueba';
  const rows = order.items
    .map(
      (i) => `<tr><td class="n">${i.quantity}</td><td>${esc(i.name)}</td><td class="n">${money(i.unit_price)}</td><td class="n">${money(i.unit_price * i.quantity)}</td></tr>`,
    )
    .join('');
  const issuer = [
    s.legalName && s.legalName !== shop.businessName && `<div class="b">${esc(s.legalName)}</div>`,
    s.rnc && `<div>RNC: <b>${esc(s.rnc)}</b></div>`,
    s.address && `<div>${esc(s.address)}</div>`,
    s.phone && `<div>Tel.: ${esc(s.phone)}</div>`,
    shop.email && `<div>${esc(shop.email)}</div>`,
  ]
    .filter(Boolean)
    .join('');
  const total = (label: string, value: string, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="n">${value}</td></tr>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: letter; margin: 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #111; }
.b { font-weight: bold; } .n { text-align: right; white-space: nowrap; } .muted { color: #555; }
.top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.logo { max-height: 64px; max-width: 160px; margin-bottom: 6px; }
.name { font-size: 18pt; font-weight: bold; margin-bottom: 4px; }
.box { border: 1.5px solid #111; border-radius: 6px; padding: 10px 14px; min-width: 250px; }
.box .t { font-weight: bold; font-size: 11pt; text-align: center; margin-bottom: 6px; }
.box table td { padding: 2px 0; }
.sec { margin-top: 18px; }
.lbl { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .5px; color: #555; margin-bottom: 3px; }
table { width: 100%; border-collapse: collapse; }
.items th { text-align: left; font-size: 9pt; border-bottom: 1.5px solid #111; padding: 6px 4px; }
.items th.n { text-align: right; }
.items td { padding: 6px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
.bottom { display: flex; justify-content: space-between; gap: 24px; margin-top: 16px; align-items: flex-start; }
.qr { width: 120px; } .qr svg { width: 120px; height: 120px; display: block; }
.stamp { display: flex; gap: 12px; align-items: flex-start; font-size: 9.5pt; }
.totals { width: 280px; } .totals td { padding: 4px 0; } .totals .grand td { border-top: 1.5px solid #111; font-size: 13pt; font-weight: bold; padding-top: 8px; }
.test { margin-top: 18px; border: 1.5px dashed #b00; color: #b00; text-align: center; font-weight: bold; padding: 8px; }
.foot { margin-top: 24px; text-align: center; color: #555; font-size: 9pt; }
</style></head><body>
<div class="top">
  <div>
    ${shop.logoUrl ? `<img class="logo" src="${esc(shop.logoUrl)}">` : ''}
    <div class="name">${esc(shop.businessName)}</div>
    ${issuer}
    <div class="muted">${esc(shop.locationName)}</div>
  </div>
  <div class="box">
    <div class="t">${ECF_TITLES[inv.ecf_type] ?? 'COMPROBANTE FISCAL ELECTRÓNICO'}</div>
    <table>
      <tr><td>e-NCF</td><td class="n b">${esc(inv.encf ?? '')}</td></tr>
      <tr><td>Fecha de emisión</td><td class="n">${date.toLocaleDateString('es-DO')}</td></tr>
      <tr><td>Orden</td><td class="n">#${ticketNumber(order.id)}</td></tr>
    </table>
  </div>
</div>

<div class="sec">
  <div class="lbl">Cliente</div>
  ${inv.customer_name || inv.customer_rnc
    ? `<div class="b">${esc(inv.customer_name ?? '')}</div>${inv.customer_rnc ? `<div>RNC / Cédula: ${esc(inv.customer_rnc)}</div>` : ''}`
    : '<div>Consumidor final</div>'}
</div>

<div class="sec">
<table class="items">
  <thead><tr><th class="n" style="width:60px">Cant.</th><th>Descripción</th><th class="n" style="width:110px">Precio</th><th class="n" style="width:120px">Valor</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="muted" style="font-size:8.5pt;margin-top:4px">Precios con ITBIS incluido.</div>
</div>

<div class="bottom">
  <div class="stamp">
    <div class="qr">${qrSvg(ecfQrUrl(inv, s.rnc, order.total))}</div>
    <div>
      ${inv.security_code ? `<div>Código de seguridad:</div><div class="b" style="font-size:12pt;margin-bottom:6px">${esc(inv.security_code)}</div>` : ''}
      <div>Fecha de firma digital:</div><div class="b">${esc(signedAt(inv))}</div>
      <div style="margin-top:6px">Forma de pago: ${esc(PAYMENT_LABELS[order.payment_method] ?? order.payment_method)}</div>
    </div>
  </div>
  <table class="totals">
    ${order.discount ? total('Descuento', '-' + money(order.discount)) : ''}
    ${total('Subtotal (sin ITBIS)', money(order.subtotal))}
    ${total('ITBIS', money(order.itbis))}
    ${order.tip_law > 0 ? total('Propina legal 10%', money(order.tip_law)) : ''}
    ${total('TOTAL', money(order.total), 'grand')}
  </table>
</div>

${prueba ? '<div class="test">MODO PRUEBA · ESTE COMPROBANTE NO ES VÁLIDO ANTE LA DGII</div>' : ''}
<div class="foot">${s.footer ? esc(s.footer) : ''}</div>
</body></html>`;
}
