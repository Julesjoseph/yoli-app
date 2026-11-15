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
    // La misma fila puede venir varias veces (p. ej. anotar y luego marcar comprado):
    // la base no acepta repetidas en un mismo envío, así que se junta en la última versión.
    const byId = new Map<string, Record<string, unknown>>();
    group.forEach((r, i) => {
      const row = JSON.parse(r.payload) as Record<string, unknown>;
      const key = typeof row.id === 'string' ? row.id : `#${i}`;
      byId.set(key, { ...byId.get(key), ...row });
    });
    const { error } = await supabase.from(table).upsert([...byId.values()], { defaultToNull: false });
    if (error && table === 'inventory_movements' && (error.code === '23503' || /foreign key/i.test(error.message))) {
      // Un insumo que se eliminó: sus movimientos pendientes ya no tienen a dónde ir, se descartan.
      const ids = [...new Set([...byId.values()].map((r) => r.ingredient_id as string))];
      const { data: alive } = await supabase.from('ingredients').select('id').in('id', ids);
      const keep = new Set((alive ?? []).map((r) => r.id as string));
      const gone = group.filter((r) => !keep.has((JSON.parse(r.payload) as { ingredient_id: string }).ingredient_id));
      if (gone.length) {
        await db.runAsync(`DELETE FROM outbox WHERE seq IN (${gone.map(() => '?').join(',')})`, gone.map((r) => r.seq));
        notifyLocalChange();
        continue;
      }
    }
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
