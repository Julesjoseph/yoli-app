import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { getContext, type Context } from '@/db/repo';

const BusinessContext = createContext<Context | null>(null);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [ctx, setCtx] = useState<Context | null>(null);
  useEffect(() => {
    getContext(db).then(setCtx);
  }, [db]);
  if (!ctx) return null;
  return <BusinessContext.Provider value={ctx}>{children}</BusinessContext.Provider>;
}

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness fuera de BusinessProvider');
  return ctx;
}

/** Carga datos cada vez que la pantalla se muestra. */
export function useFocusData<T>(load: () => Promise<T>, deps: unknown[]): [T | undefined, () => void] {
  const [data, setData] = useState<T>();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => { load().then(setData); }, deps);
  useFocusEffect(reload);
  return [data, reload];
}
