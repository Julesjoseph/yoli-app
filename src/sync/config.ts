/**
 * Proyecto de Supabase del negocio. La clave "publishable" es pública por diseño:
 * va dentro de la app y la seguridad la ponen las reglas RLS del servidor.
 * NUNCA pongas aquí la clave "secret" / "service_role".
 * Se puede cambiar con EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY en un archivo .env
 * (deja ambas vacías, EXPO_PUBLIC_SUPABASE_URL=, para probar en modo demo).
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://opwtnfflzdybdtvluedt.supabase.co';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_TJwfEsl_4aoIYAr4edj9IQ_PIjeOQnC';
