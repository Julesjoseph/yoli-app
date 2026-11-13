/**
 * Lee el reporte "Detalle de pedidos" (orderDetails.csv) que se descarga del
 * Portal de PedidosYa, para meter esas ventas en YOLI sin la conexión directa.
 * Sin dependencias: se prueba en Node.
 */

export interface ReportItem {
  quantity: number;
  name: string;
}

export interface ReportOrder {
  /** Número de pedido de PedidosYa. */
  ref: string;
  storeId: string;
  status: 'entregado' | 'cancelado' | 'otro';
  statusText: string;
  /** Fecha en ISO (la del reporte es hora de República Dominicana). */
  createdAt: string;
  cash: boolean;
  /** Precio de los productos (Total parcial). */
  subtotal: number;
  /** Descuentos que pagó el negocio. */
  discount: number;
  /** Lo que le queda al negocio según PedidosYa (Ingreso estimado). */
  net: number;
  items: ReportItem[];
}

/** Separa un CSV respetando comillas. Detecta si va con coma o punto y coma. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.indexOf('\n') === -1 ? undefined : src.indexOf('\n'));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/** "1.020,00" → 1020 · "-208,42" → -208.42 · "" → 0 */
export function parseAmount(s: string | undefined): number {
  const t = (s ?? '').replace(/[^\d,.-]/g, '');
  if (!t) return 0;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** "1 Mangu de platano, 2 Coca Cola" → [{1, Mangu de platano}, {2, Coca Cola}] */
export function parseItems(s: string): ReportItem[] {
  // Se corta en cada coma que va seguida de "cantidad + espacio", fuera de corchetes.
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '[' || c === '(') depth++;
    if (c === ']' || c === ')') depth = Math.max(0, depth - 1);
    if (c === ',' && depth === 0 && /^,[\s,]*\d+\s+\S/.test(s.slice(i))) {
      parts.push(cur);
      cur = '';
      while (s[i + 1] === ',' || s[i + 1] === ' ') i++;
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts
    .map((p) => p.trim().replace(/[,\s]+$/, ''))
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(\d+)\s+(.+)$/);
      return m ? { quantity: Number(m[1]), name: m[2].trim() } : { quantity: 1, name: p };
    });
}

/** Nombre para comparar: sin acentos, sin mayúsculas, sin opciones entre corchetes. */
export function normalizeName(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9ñ+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const key = (s: string) => normalizeName(s).replace(/[^a-z0-9]/g, '');

/** "2026-11-07 21:54" (hora de RD) → ISO en UTC. */
export function rdDateToIso(s: string): string {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date().toISOString();
  const [, y, mo, d, h, mi, se] = m;
  return new Date(`${y}-${mo}-${d}T${h.padStart(2, '0')}:${mi}:${se ?? '00'}-04:00`).toISOString();
}

export function parsePedidosYaReport(text: string): { orders: ReportOrder[]; error?: string } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { orders: [], error: 'El archivo está vacío.' };
  const header = rows[0].map(key);
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(key(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const c = {
    ref: col('Nro de pedido', 'Número de pedido', 'Order ID'),
    store: col('ID de tienda'),
    status: col('Estado del pedido'),
    date: col('Fecha del pedido'),
    pay: col('Forma de pago'),
    subtotal: col('Total parcial'),
    discount: col('Descuento financiado por usted'),
    voucher: col('Vale financiado por usted'),
    net: col('Ingreso estimado'),
    items: col('Artículos del pedido'),
  };
  if (c.ref < 0 || c.items < 0 || c.subtotal < 0) {
    return {
      orders: [],
      error: 'Este no es el reporte de pedidos. En el Portal de PedidosYa descarga el "Detalle de pedidos" (uno por pedido, con sus artículos).',
    };
  }
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const orders = rows.slice(1).map<ReportOrder>((r) => {
    const statusText = get(r, c.status);
    const st = normalizeName(statusText);
    return {
      ref: get(r, c.ref),
      storeId: get(r, c.store),
      status: /entreg|deliver|complet/.test(st) ? 'entregado' : /cancel|rechaz|reject/.test(st) ? 'cancelado' : 'otro',
      statusText,
      createdAt: rdDateToIso(get(r, c.date)),
      cash: /efectivo|cash/i.test(get(r, c.pay)),
      subtotal: parseAmount(get(r, c.subtotal)),
      discount: parseAmount(get(r, c.discount)) + parseAmount(get(r, c.voucher)),
      net: parseAmount(get(r, c.net)),
      items: parseItems(get(r, c.items)),
    };
  });
  return { orders: orders.filter((o) => o.ref) };
}

/**
 * Reparte el "Total parcial" del pedido entre sus artículos. Si se conoce el
 * precio del producto en YOLI se usa como peso; si no, se reparte por igual.
 */
export function splitPrices(subtotal: number, lines: { quantity: number; knownPrice: number | null }[]): number[] {
  const known = lines.filter((l) => l.knownPrice && l.knownPrice > 0);
  const avg = known.length ? known.reduce((n, l) => n + (l.knownPrice as number), 0) / known.length : 1;
  const weights = lines.map((l) => (l.knownPrice && l.knownPrice > 0 ? l.knownPrice : avg));
  const sum = lines.reduce((n, l, k) => n + weights[k] * l.quantity, 0);
  if (sum <= 0) return lines.map(() => 0);
  const prices = weights.map((w) => Math.round(((w * subtotal) / sum) * 100) / 100);
  // Ajuste de centavos en la última línea para que cuadre exacto.
  const diff = Math.round((subtotal - lines.reduce((n, l, k) => n + prices[k] * l.quantity, 0)) * 100) / 100;
  const last = lines.length - 1;
  if (last >= 0 && diff !== 0 && lines[last].quantity > 0) prices[last] = Math.round((prices[last] + diff / lines[last].quantity) * 100) / 100;
  return prices;
}

/** Id fijo por pedido (así importar el mismo archivo dos veces no repite ventas). */
export function orderIdFromRef(ref: string): string {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  const s = `pedidosya-reporte:${ref}`;
  for (let i = 0; i < s.length; i++) {
    const k = s.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${'89ab'[parseInt(hex[16], 16) % 4]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
