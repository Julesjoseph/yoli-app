// Saca los datos de una factura de compra dominicana del texto que lee el celular (gratis,
// sin internet). El texto llega en bloques sin posición, así que el encabezado (RNC, NCF,
// fecha, total) se saca con reglas y los productos quedan como sugerencias para tocar.
// Sin dependencias: se usa en la app y en las pruebas.

import type { ScannedInvoice } from './invoice-scan';

export interface TextCandidate {
  /** Texto de la línea, limpio. */
  text: string;
  /** Nombre sugerido para el inventario. */
  name: string;
  quantity: number | null;
  /** Último monto de la línea (importe), si tiene. */
  amount: number | null;
}

export interface TextReading {
  invoice: ScannedInvoice;
  candidates: TextCandidate[];
}

const AMOUNT = /(?:RD\$|\$)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2}|\d+,\d{2}(?!\d))/g;
const HEADER_WORDS =
  /\b(rnc|r\.n\.c|ncf|e-?ncf|comprobante|factura|fecha|vence|venc|valid|tel|telf|tel[eé]fono|cel|whatsapp|direcci[oó]n|dir\.|calle|av\.|avenida|c\/|sector|santo domingo|santiago|rep[uú]blica|cliente|comprador|vendedor|cajero|caja|ticket|recibo|subtotal|sub-total|total|itbis|impuesto|descuento|desc\.|efectivo|tarjeta|cambio|devuelta|pago|cr[eé]dito|contado|gracias|www|http|@|original|copia|p[aá]gina|cant|cantidad|descripci[oó]n|precio|importe|valor|c[oó]digo|ref|orden|no\.|n[uú]m)\b/i;

/** Número de un monto escrito como "1,250.00", "1250.00" o "1250,00". */
export function parseMoney(raw: string): number | null {
  let s = raw.replace(/RD\$|\$|\s/g, '');
  if (/^\d+,\d{2}$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function amountsIn(line: string): number[] {
  return [...line.matchAll(AMOUNT)].map((m) => parseMoney(m[1])).filter((n): n is number => n !== null && n > 0);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "14/11/2026", "14-11-26", "2026-11-14" → "2026-11-14". */
export function parseDate(text: string): string | null {
  let m = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = +m[1];
    const mo = +m[2];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  return null;
}

/** Nombre corto para el inventario a partir de una línea de factura. */
export function suggestName(text: string) {
  const s = text
    .replace(AMOUNT, ' ')
    .replace(/^\s*\d+([.,]\d+)?\s*(x|un|und|uds?|lbs?|kg|cj|caja|paq|gl)?\s+/i, '')
    .replace(/\b\d{5,}\b/g, ' ')
    .replace(/[|*_#=]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

export function parseInvoiceText(blocks: string[], ownRnc?: string | null): TextReading {
  const lines = blocks
    .flatMap((b) => b.split(/\n/))
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const all = lines.join('\n');
  const own = (ownRnc ?? '').replace(/\D/g, '');

  // NCF: B + 10 dígitos o E + 12 dígitos (a veces con espacios).
  let ncf: string | null = null;
  for (const m of all.matchAll(/\b([BE])[\s-]*(\d[\d \-]{9,16}\d)/g)) {
    const digits = m[2].replace(/\D/g, '');
    if ((m[1] === 'B' && digits.length === 10) || (m[1] === 'E' && digits.length === 12)) {
      ncf = `${m[1]}${digits}`;
      break;
    }
  }

  // RNC del proveedor: el primero que no sea del cliente ni el del propio negocio.
  let rnc: string | null = null;
  for (let i = 0; i < lines.length && !rnc; i++) {
    if (!/r\.?\s?n\.?\s?c|c[eé]dula/i.test(lines[i]) || /cliente|comprador/i.test(lines[i])) continue;
    const near = `${lines[i]} ${lines[i + 1] ?? ''}`;
    for (const m of near.matchAll(/\b(\d[\d-]{8,13}\d)\b/g)) {
      const d = m[1].replace(/-/g, '');
      if ((d.length === 9 || d.length === 11) && d !== own) {
        rnc = d;
        break;
      }
    }
  }

  // Fecha: la de la línea "Fecha" (no la de vencimiento); si no hay, la primera.
  const dateLine = lines.find((l) => /fecha/i.test(l) && !/venc|valid/i.test(l) && parseDate(l));
  const date = (dateLine && parseDate(dateLine)) ?? lines.filter((l) => !/venc|valid/i.test(l)).map(parseDate).find(Boolean) ?? null;

  // Totales: el monto en la línea (o la siguiente) de "Total", "ITBIS", "Subtotal".
  const amountAfter = (test: RegExp, skip?: RegExp) => {
    const found: number[] = [];
    lines.forEach((l, i) => {
      if (!test.test(l) || (skip && skip.test(l))) return;
      const a = amountsIn(l);
      if (a.length) found.push(a[a.length - 1]);
      else if (lines[i + 1]) {
        const b = amountsIn(lines[i + 1]);
        if (b.length) found.push(b[b.length - 1]);
      }
    });
    return found;
  };
  const totals = amountAfter(/\btotal\b/i, /sub-?\s?total|total\s+(itbis|desc|art|items|de\s+art)/i);
  const total = totals.length ? Math.max(...totals) : null;
  const itbis = amountAfter(/\bitbis\b|\bimpuesto/i, /exento/i)[0] ?? null;
  const subtotal = amountAfter(/sub-?\s?total/i)[0] ?? null;

  // Proveedor: la primera línea de arriba que parece un nombre.
  const supplier =
    lines
      .slice(0, 8)
      .find((l) => /[a-záéíóúñ]{3,}/i.test(l) && !HEADER_WORDS.test(l) && !/^\d/.test(l) && l.replace(/[^a-záéíóúñ]/gi, '').length >= 4) ?? null;

  // Productos posibles: líneas con palabras que no son del encabezado ni del pie.
  const seen = new Set<string>();
  const candidates: TextCandidate[] = [];
  for (const l of lines) {
    if (l === supplier || HEADER_WORDS.test(l)) continue;
    if (l.replace(/[^a-záéíóúñ]/gi, '').length < 3) continue;
    const name = suggestName(l);
    const key = name.toLowerCase();
    if (!name || name.length < 3 || seen.has(key)) continue;
    seen.add(key);
    const q = l.match(/^\s*(\d+(?:[.,]\d+)?)\s+(?=\D)/);
    const a = amountsIn(l);
    candidates.push({ text: l, name, quantity: q ? Number(q[1].replace(',', '.')) : null, amount: a.length ? a[a.length - 1] : null });
    if (candidates.length >= 60) break;
  }

  return {
    invoice: {
      is_invoice: !!(ncf || rnc || total),
      supplier_name: supplier,
      supplier_rnc: rnc,
      ncf,
      date,
      subtotal,
      itbis,
      total,
      items: [],
      notes: null,
    },
    candidates,
  };
}
