import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/auth';
import { ensureDemoData, getSetting, resetLocalData, setSettings } from '@/db/database';
import { getContext, type Context, type Role } from '@/db/repo';
import { pullCatalog, pullLocationActivity } from '@/sync/pull';
import { supabase } from '@/sync/supabase';
import { pushOutbox } from '@/sync/sync';

export interface LocationOption {
  id: string;
  name: string;
}

type Phase =
  | { kind: 'loading'; message?: string }
  | { kind: 'login' }
  | { kind: 'no-business' }
  | { kind: 'choose-location'; options: LocationOption[] }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; ctx: Context };

interface BusinessState {
  phase: Phase;
  chooseLocation(loc: LocationOption): Promise<void>;
  changeLocation(): Promise<void>;
  createBusiness(name: string, rnc: string, locationName: string): Promise<string | null>;
  reload(): void;
}

const BusinessContext = createContext<BusinessState | null>(null);

const ROLE_RANK: Record<Role, number> = { dueno: 4, gerente: 3, cajero: 2, cocina: 1 };

interface Membership {
  business_id: string;
  location_id: string | null;
  role: Role;
  businesses: { name: string } | null;
}

/** Locales que puede usar la persona según su(s) membresía(s). */
async function allowedLocations(db: SQLiteDatabase, rows: Membership[]): Promise<LocationOption[]> {
  const all = await db.getAllAsync<LocationOption>('SELECT id, name FROM locations ORDER BY name');
  if (rows.some((r) => r.location_id === null)) return all;
  const ids = new Set(rows.map((r) => r.location_id));
  return all.filter((l) => ids.has(l.id));
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const auth = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const userId = auth.session?.user.id;

  useEffect(() => {
    let cancelled = false;
    const set = (p: Phase) => !cancelled && setPhase(p);

    (async () => {
      if (auth.loading) return set({ kind: 'loading' });
      if (auth.demo) {
        await ensureDemoData(db);
        const ctx = await getContext(db);
        return set(ctx ? { kind: 'ready', ctx } : { kind: 'error', message: 'No se pudo preparar el modo demo.' });
      }
      if (auth.loading) return set({ kind: 'loading' });
      if (!userId || !supabase) return set({ kind: 'login' });

      set({ kind: 'loading', message: 'Cargando tu negocio…' });
      const cached = await getContext(db);
      const { data, error } = await supabase
        .from('members')
        .select('business_id, location_id, role, businesses(name)')
        .eq('user_id', userId);

      if (error) {
        // Sin internet: si este equipo ya estaba listo para esta persona, se sigue trabajando.
        if (cached && cached.userId === userId) return set({ kind: 'ready', ctx: cached });
        return set({ kind: 'error', message: 'Necesitas internet la primera vez que entras en este equipo.' });
      }
      const rows = (data ?? []) as unknown as Membership[];
      if (rows.length === 0) return set({ kind: 'no-business' });

      // Si pertenece a varios negocios, por ahora se usa el primero.
      const businessId = rows[0].business_id;
      const mine = rows.filter((r) => r.business_id === businessId);
      const role = mine.map((r) => r.role).sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0];

      const previousBusiness = await getSetting(db, 'business_id');
      if ((await getSetting(db, 'mode')) === 'demo' || (previousBusiness && previousBusiness !== businessId)) {
        // Antes de borrar otro negocio, intentar subir lo pendiente.
        if ((await getSetting(db, 'mode')) !== 'demo') await pushOutbox(db).catch(() => undefined);
        await resetLocalData(db);
      }

      try {
        await pullCatalog(db, businessId);
      } catch (e) {
        if (cached && cached.userId === userId) return set({ kind: 'ready', ctx: cached });
        return set({ kind: 'error', message: `No se pudo descargar el menú: ${String(e)}` });
      }
      await setSettings(db, {
        mode: 'cloud',
        user_id: userId,
        business_id: businessId,
        business_name: mine[0].businesses?.name ?? '',
        role,
      });

      const options = await allowedLocations(db, mine);
      const currentLoc = await getSetting(db, 'location_id');
      const current = options.find((o) => o.id === currentLoc);
      if (!current) {
        await setSettings(db, { location_id: null, location_name: null });
        if (options.length === 1) {
          await setSettings(db, { location_id: options[0].id, location_name: options[0].name });
        } else {
          return set({ kind: 'choose-location', options });
        }
      } else {
        await setSettings(db, { location_name: current.name });
      }

      const ctx = await getContext(db);
      if (!ctx) return set({ kind: 'error', message: 'Tu negocio no tiene locales activos.' });
      await pushOutbox(db).catch(() => undefined);
      await pullLocationActivity(db, ctx.businessId, ctx.locationId).catch(() => undefined);
      set({ kind: 'ready', ctx });
    })().catch((e) => set({ kind: 'error', message: String(e) }));

    return () => {
      cancelled = true;
    };
  }, [db, auth.demo, auth.loading, userId, version]);

  // Sincronización automática cada minuto y al volver a la app.
  const ready = phase.kind === 'ready' && !phase.ctx.demo;
  useEffect(() => {
    if (!ready) return;
    const run = () => pushOutbox(db).catch(() => undefined);
    const timer = setInterval(run, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [db, ready]);

  const value: BusinessState = {
    phase,
    reload,
    async chooseLocation(loc) {
      await setSettings(db, { location_id: loc.id, location_name: loc.name });
      reload();
    },
    async changeLocation() {
      await pushOutbox(db).catch(() => undefined);
      await setSettings(db, { location_id: null, location_name: null });
      reload();
    },
    async createBusiness(name, rnc, locationName) {
      if (!supabase) return null;
      const { error } = await supabase.rpc('create_business', {
        p_name: name.trim(),
        p_rnc: rnc.trim(),
        p_location_name: locationName.trim(),
      });
      if (error) return error.message;
      reload();
      return null;
    },
  };

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusinessState() {
  const s = useContext(BusinessContext);
  if (!s) throw new Error('useBusinessState fuera de BusinessProvider');
  return s;
}

/** Negocio/local/rol activo. Solo se usa dentro de las pantallas principales (fase "ready"). */
export function useBusiness(): Context {
  const { phase } = useBusinessState();
  if (phase.kind !== 'ready') throw new Error('El negocio aún no está listo');
  return phase.ctx;
}

export const canManage = (ctx: Context) => ctx.role === 'dueno' || ctx.role === 'gerente';

/** Carga datos cada vez que la pantalla se muestra. */
export function useFocusData<T>(load: () => Promise<T>, deps: unknown[]): [T | undefined, () => void] {
  const [data, setData] = useState<T>();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => {
    load().then(setData);
  }, deps);
  useFocusEffect(reload);
  return [data, reload];
}
