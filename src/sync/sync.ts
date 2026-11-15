import type { SQLiteDatabase } from 'expo-sqlite';

import { supabase } from './supabase';

const BATCH = 100;
// Orden de subida para respetar las llaves foráneas del servidor
const TABLE_ORDER = ['customers', 'orders', 'order_items', 'inventory_movements', 'expenses', 'customer_payments', 'shopping_items'];

// Aviso de "hay algo nuevo en este equipo" para subirlo al instante.
const localListeners = new Set<() => void>();
export function onLocalChange(listener: () => void) {
  localListeners.add(listener);
  return () => void localListeners.delete(listener);
}
export function notifyLocalChange() {
  localListeners.forEach((l) => l());
}

export type SyncResult = { pushed: number; pending: number; error?: string; offlineMode?: boolean };

/**
 * Sube a Supabase lo que se guardó en el teléfono. Si no hay internet,
 * falla sin perder nada: los cambios siguen en la cola y se reintentan.
 */
export async function pushOutbox(db: SQLiteDatabase): Promise<SyncResult> {
  const pending = async () =>
    (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox'))?.n ?? 0;
  if (!supabase) return { pushed: 0, pending: await pending(), offlineMode: true };
  // Los datos del modo demo nunca se suben a la nube.
  const mode = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'mode'");
  if (mode?.value === 'demo') return { pushed: 0, pending: await pending(), offlineMode: true };

  const rows = await db.getAllAsync<{ seq: number; table_name: string; payload: string }>(
    // Lo que ya falló varias veces va al final, para no tapar lo demás.
    'SELECT seq, table_name, payload FROM outbox ORDER BY (attempts >= 3), seq LIMIT ?',
    [BATCH],
  );
  let pushed = 0;
  let firstError: string | undefined;
  for (const table of TABLE_ORDER) {
    const group = rows.filter((r) => r.table_name === table);
    if (group.length === 0) continue;
    // Si una fila trae una columna y otra no (p. ej. "discount" solo cuando hay descuento),
    // la que no la trae usa el valor por defecto de la nube en vez de null.
    const { error } = await supabase.from(table).upsert(group.map((r) => JSON.parse(r.payload)), { defaultToNull: false });
    if (error) {
      await db.runAsync(
        `UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE seq IN (${group.map(() => '?').join(',')})`,
        [error.message, ...group.map((r) => r.seq)],
      );
      // Una tabla con error (p. ej. la nube aún sin la migración nueva) no frena a las demás.
      firstError ??= `${table}: ${error.message}`;
      continue;
    }
    await db.runAsync(
      `DELETE FROM outbox WHERE seq IN (${group.map(() => '?').join(',')})`,
      group.map((r) => r.seq),
    );
    pushed += group.length;
  }
  return { pushed, pending: await pending(), ...(firstError ? { error: firstError } : {}) };
}
