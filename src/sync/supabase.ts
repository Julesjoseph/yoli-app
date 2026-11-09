import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_KEY, SUPABASE_URL } from './config';

// En la vista web prerenderizada no existe `window`: ahí no se guarda la sesión.
const canPersist = typeof window !== 'undefined';

const url = SUPABASE_URL;
const anonKey = SUPABASE_KEY;

/** Cliente de Supabase. Es null si todavía no se configuró (modo demo local). */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: canPersist ? AsyncStorage : undefined,
          autoRefreshToken: canPersist,
          persistSession: canPersist,
          detectSessionInUrl: false,
        },
      })
    : null;
