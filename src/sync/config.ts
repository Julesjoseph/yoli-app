/**
 * Proyecto de Supabase del negocio. La clave "publishable" es pública por diseño:
 * va dentro de la app y la seguridad la ponen las reglas RLS del servidor.
 * NUNCA pongas aquí la clave "secret" / "service_role".
 * Se puede cambiar con EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY en un archivo .env
 * (deja ambas vacías, EXPO_PUBLIC_SUPABASE_URL=, para probar en modo demo).
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://opwtnfflzdybdtvluedt.supabase.co';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_TJwfEsl_4aoIYAr4edj9IQ_PIjeOQnC';

/**
 * Cuenta de demostración en la nube (un negocio aparte, con datos de prueba).
 * Es pública a propósito: solo tiene acceso al "Negocio demo", nunca a los datos reales.
 * Se crea en Supabase con supabase/demo-en-la-nube.sql.
 */
export const DEMO_EMAIL = 'demo@yoli.app';
export const DEMO_PASSWORD = 'YoliDemo-2026';

/**
 * Contacto de YOLI para que los clientes renueven su suscripción.
 * WhatsApp en formato internacional sin "+" ni espacios (ej. '18095551234'). Vacío = no se muestra.
 */
export const SUPPORT_WHATSAPP = '';
export const SUPPORT_EMAIL = '';
