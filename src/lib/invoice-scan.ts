// Lo que devuelve la lectura de una factura de compra (función leer-factura) y cómo se
// limpia antes de mostrarlo para revisar. Sin dependencias: se usa en la app y en las pruebas.

export interface ScannedItem {
  description: string;
  name: string;
  quantity: number;
  unit: string;
  unit_cost: number | null;
  line_total: number | null;
  ingredient_id: string | null;
  for_inventory: boolean;
}

export interface ScannedInvoice {
  is_invoice: boolean;
  supplier_name: string | null;
  supplier_rnc: string | null;
  ncf: string | null;
  date: string | null;
  subtotal: number | null;
  itbis: number | null;
  total: number | null;
  items: ScannedItem[];
  notes: string | null;
}

/** Una línea lista para revisar: a qué insumo va (existente, nuevo o ninguno) y cuánto costó. */
export interface PurchaseLine {
  key: string;
  description: string;
  name: string;
  quantity: number;
  unit: string;
  /** Costo total de la línea (RD$). */
  cost: number;
  /** 'nuevo' = crear insumo, 'no' = no va al inventario, o el id del insumo. */
  target: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** RNC (9) o cédula (11): solo dígitos. Si no cuadra, null. */
export function cleanRnc(v: string | null | undefined) {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length === 9 || d.length === 11 ? d : null;
}

/** NCF: B01/B02/B14/B15… (11 caracteres) o e-NCF E31/E32… (13). */
export function cleanNcf(v: string | null | undefined) {
  const s = (v ?? '').toUpperCase().replace(/[\s-]/g, '');
  return /^(B\d{10}|E\d{12})$/.test(s) ? s : s || null;
}

/** Fecha AAAA-MM-DD válida y que no esté en el futuro; si no, null. */
export function cleanDate(v: string | null | undefined, today = new Date()) {
  const m = (v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1 || d > today) return null;
  return v!;
}

/** Busca un insumo con el mismo nombre (sin importar acentos ni mayúsculas). */
export function matchIngredient<T extends { id: string; name: string }>(name: string, ingredients: T[]): T | null {
  const n = norm(name);
  if (!n) return null;
  return ingredients.find((i) => norm(i.name) === n) ?? null;
}

/** Convierte la lectura en líneas para revisar. Ids que no existen se ignoran. */
export function toPurchaseLines(inv: ScannedInvoice, ingredients: { id: string; name: string }[]): PurchaseLine[] {
  const ids = new Set(ingredients.map((i) => i.id));
  return (inv.items ?? []).map((it, k) => {
    const quantity = num(it.quantity) && it.quantity > 0 ? it.quantity : 1;
    const cost = round2(num(it.line_total) ?? (num(it.unit_cost) ?? 0) * quantity);
    const name = (it.name || it.description || '').trim();
    const known = it.ingredient_id && ids.has(it.ingredient_id) ? it.ingredient_id : matchIngredient(name, ingredients)?.id ?? null;
    return {
      key: `l${k}`,
      description: (it.description ?? '').trim(),
      name,
      quantity,
      unit: it.unit && it.unit !== 'otra' ? it.unit : 'unidad',
      cost: Math.max(0, cost),
      target: !it.for_inventory ? 'no' : known ?? 'nuevo',
    };
  });
}

/** Total de la factura: el que dice la factura o, si no se leyó, la suma de líneas + ITBIS. */
export function invoiceTotal(inv: ScannedInvoice, lines: PurchaseLine[]) {
  const t = num(inv.total);
  if (t && t > 0) return round2(t);
  return round2(lines.reduce((n, l) => n + l.cost, 0) + (num(inv.itbis) ?? 0));
}
