import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// En la vista web prerenderizada no existe `window`: ahí no se guarda la sesión.
const canPersist = typeof window !== 'undefined';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
