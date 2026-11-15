import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { enqueue, listStock, type Context } from './repo';

/** Lista de compras del local: lo que hay que comprar para el negocio. */

export interface ShoppingItem {
  id: string;
  business_id: string;
  location_id: string | null;
  name: string;
  quantity: string | null;
  note: string | null;
  done: number;
  deleted: number;
  done_at: string | null;
  created_at: string;
}

const toCloud = (i: ShoppingItem) => ({ ...i, done: !!i.done, deleted: !!i.deleted });

async function save(db: SQLiteDatabase, ctx: Context, item: ShoppingItem) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO shopping_items (id, business_id, location_id, name, quantity, note, done, deleted, done_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.business_id, item.location_id, item.name, item.quantity, item.note, item.done, item.deleted, item.done_at, item.created_at],
    );
    await enqueue(db, 'shopping_items', toCloud(item), ctx);
  });
}

/** Lo pendiente primero (lo más nuevo arriba) y luego lo ya comprado. */
export const listShopping = (db: SQLiteDatabase, ctx: Context) =>
  db.getAllAsync<ShoppingItem>(
    `SELECT * FROM shopping_items WHERE location_id = ? AND deleted = 0
      ORDER BY done, CASE WHEN done = 1 THEN done_at END DESC, created_at DESC`,
    [ctx.locationId],
  );

export async function addShoppingItem(db: SQLiteDatabase, ctx: Context, input: { name: string; quantity?: string; note?: string }) {
  const name = input.name.trim();
  if (!name) throw new Error('Escribe qué hay que comprar.');
  // Si ya está pendiente, solo se actualiza la cantidad.
  const same = await db.getFirstAsync<ShoppingItem>(
    'SELECT * FROM shopping_items WHERE location_id = ? AND deleted = 0 AND done = 0 AND lower(name) = lower(?)',
    [ctx.locationId, name],
  );
  const item: ShoppingItem = same
    ? { ...same, quantity: input.quantity?.trim() || same.quantity, note: input.note?.trim() || same.note }
    : {
        id: randomUUID(),
        business_id: ctx.businessId,
        location_id: ctx.locationId,
        name,
        quantity: input.quantity?.trim() || null,
        note: input.note?.trim() || null,
        done: 0,
        deleted: 0,
        done_at: null,
        created_at: new Date().toISOString(),
      };
  await save(db, ctx, item);
  return item;
}

export async function updateShoppingItem(db: SQLiteDatabase, ctx: Context, item: ShoppingItem, changes: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'note'>>) {
  await save(db, ctx, { ...item, ...changes });
}

export async function toggleShoppingItem(db: SQLiteDatabase, ctx: Context, item: ShoppingItem) {
  const done = item.done ? 0 : 1;
  await save(db, ctx, { ...item, done, done_at: done ? new Date().toISOString() : null });
}

export async function deleteShoppingItem(db: SQLiteDatabase, ctx: Context, item: ShoppingItem) {
  await save(db, ctx, { ...item, deleted: 1 });
}

/** Saca de la lista todo lo ya comprado. */
export async function clearBoughtItems(db: SQLiteDatabase, ctx: Context) {
  const bought = (await listShopping(db, ctx)).filter((i) => i.done);
  for (const i of bought) await save(db, ctx, { ...i, deleted: 1 });
  return bought.length;
}

/** Agrega los insumos que están por agotarse (stock ≤ mínimo) y que aún no están en la lista. */
export async function addLowStockItems(db: SQLiteDatabase, ctx: Context) {
  const [stock, current] = await Promise.all([listStock(db, ctx), listShopping(db, ctx)]);
  const pending = new Set(current.filter((i) => !i.done).map((i) => i.name.toLowerCase()));
  const low = stock.filter((s) => s.min_stock > 0 && s.quantity <= s.min_stock && !pending.has(s.name.toLowerCase()));
  for (const s of low) {
    const need = Math.max(s.min_stock * 2 - s.quantity, s.min_stock);
    const qty = `${Number.isInteger(need) ? need : need.toFixed(1)} ${s.unit}`;
    await addShoppingItem(db, ctx, { name: s.name, quantity: qty, note: 'Se está agotando' });
  }
  return low.length;
}

/** Texto para leer en voz alta. */
export function shoppingSpeech(items: Pick<ShoppingItem, 'name' | 'quantity' | 'done'>[]) {
  const pending = items.filter((i) => !i.done);
  if (!pending.length) return 'No tienes compras pendientes. ¡Todo está comprado!';
  const list = pending.map((i) => (i.quantity ? `${i.name}, ${i.quantity}` : i.name)).join('. ');
  return `Recordatorio de compras. Tienes ${pending.length} ${pending.length === 1 ? 'cosa' : 'cosas'} por comprar: ${list}.`;
}
