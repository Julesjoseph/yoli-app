import type { SQLiteDatabase } from 'expo-sqlite';

import { round2 } from '@/lib/calc';
import type { PurchaseLine, ScannedInvoice } from '@/lib/invoice-scan';
import { supabase } from '@/sync/supabase';

import { listCatalogIngredients, saveIngredient } from './catalog';
import { expenseRef } from './accounting';
import { addExpense, insertMovement, type Context } from './repo';

/** Imagen o PDF de la factura, en base64. */
export interface InvoiceFile {
  data: string;
  media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
}

/** Manda la factura a la función leer-factura (la llave de Anthropic vive en Supabase). */
export async function scanInvoice(db: SQLiteDatabase, ctx: Context, file: InvoiceFile): Promise<ScannedInvoice> {
  if (ctx.demo || !supabase) throw new Error('El escáner de facturas funciona con tu cuenta (no en el demo).');
  const ingredients = (await listCatalogIngredients(db)).map((i) => ({ id: i.id, name: i.name, unit: i.unit }));
  const { data, error } = await supabase.functions.invoke('leer-factura', {
    body: { business_id: ctx.businessId, file, ingredients },
  });
  if (error) {
    // El mensaje claro viene en el cuerpo de la respuesta.
    let message = error.message;
    let limitReached = false;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
      limitReached = !!body?.limit_reached;
    } catch {
      // sin cuerpo
    }
    if (limitReached) throw Object.assign(new Error(message), { limitReached: true });
    if (/not found|404/i.test(message)) message = 'Falta publicar la función leer-factura en Supabase.';
    if (/failed to send|fetch|network/i.test(message)) message = 'Necesitas internet para leer la factura.';
    throw new Error(message);
  }
  if (!data?.invoice) throw new Error(data?.error ?? 'No se pudo leer la factura.');
  return data.invoice as ScannedInvoice;
}

/**
 * Guarda la factura revisada: el gasto (con proveedor, RNC, NCF y fecha), los insumos nuevos,
 * la entrada de cada producto al inventario y el costo por unidad actualizado.
 */
export async function savePurchase(
  db: SQLiteDatabase,
  ctx: Context,
  input: {
    supplier: string;
    rnc: string | null;
    ncf: string | null;
    date: string | null;
    total: number;
    lines: PurchaseLine[];
    /** false = a crédito (queda en cuentas por pagar). */
    paid?: boolean;
    dueDate?: string | null;
  },
) {
  if (!(input.total > 0)) throw new Error('Revisa el total de la factura.');
  const stockLines = input.lines.filter((l) => l.target !== 'no' && l.quantity > 0 && l.name.trim());
  const existing = new Map((await listCatalogIngredients(db)).map((i) => [i.id, i]));

  // 1) Insumos nuevos y costo actualizado (necesita internet: el catálogo vive en la nube).
  const ids = new Map<string, string>();
  for (const l of stockLines) {
    const unitCost = l.cost > 0 ? round2(l.cost / l.quantity) : null;
    if (l.target === 'nuevo') {
      const id = await saveIngredient(db, ctx, { name: l.name, unit: l.unit, cost_per_unit: unitCost ?? 0, min_stock: 0 });
      ids.set(l.key, id);
    } else {
      const ing = existing.get(l.target);
      if (!ing) continue;
      ids.set(l.key, ing.id);
      if (unitCost !== null && Math.abs(unitCost - ing.cost_per_unit) > 0.009) {
        await saveIngredient(db, ctx, { id: ing.id, name: ing.name, unit: ing.unit, cost_per_unit: unitCost, min_stock: ing.min_stock });
      }
    }
  }

  // 2) El gasto y 3) la entrada al inventario.
  const exp = await addExpense(db, ctx, {
    category: 'insumos',
    description: `Factura ${input.supplier || 'de compra'}`.slice(0, 200),
    amount: round2(input.total),
    ncf: input.ncf ?? undefined,
    supplierRnc: input.rnc ?? undefined,
    spentAt: input.date,
    supplierName: input.supplier || null,
    paid: input.paid ?? true,
    dueDate: input.dueDate ?? null,
  });
  const expenseId = exp.id;
  // La nota lleva la referencia del gasto: si se anula, lo que entró sale del inventario.
  const note = [input.supplier, input.ncf, expenseRef(expenseId)].filter(Boolean).join(' · ');
  await db.withTransactionAsync(async () => {
    for (const l of stockLines) {
      const id = ids.get(l.key);
      if (id) await insertMovement(db, ctx, id, l.quantity, 'compra', { note });
    }
  });
  return { expenseId, stocked: stockLines.filter((l) => ids.has(l.key)).length };
}

/** Lecturas con IA usadas este mes y cuántas tiene el negocio (null si no aplica). */
export async function getAiScanStatus(ctx: Context): Promise<{ used: number; limit: number } | null> {
  if (ctx.demo || !supabase) return null;
  const { data, error } = await supabase.rpc('ai_scan_status', { b: ctx.businessId });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return null;
  return { used: Number(row.used), limit: Number(row.monthly_limit) };
}
