import { supabase } from '@/sync/supabase';

/**
 * Factura electrónica (e-CF) de la DGII a través de un proveedor autorizado.
 * La app nunca habla con el proveedor ni ve su llave: le pide a la función
 * del servidor "emitir-ecf" que emita el comprobante (supabase/functions/emitir-ecf).
 */

export type EcfType = '31' | '32';

export const ECF_LABELS: Record<string, string> = {
  '31': 'Factura de Crédito Fiscal Electrónica',
  '32': 'Factura de Consumo Electrónica',
  '34': 'Nota de Crédito Electrónica',
};

/** Proveedores que YOLI SOFT sabe usar. "prueba" no envía nada a la DGII. */
export const PROVIDERS = [
  { value: 'prueba', label: 'Modo prueba', ready: true },
  { value: 'alanube', label: 'Alanube', ready: false },
] as const;

export interface EinvoiceSettings {
  provider: string;
  environment: 'prueba' | 'produccion';
  enabled: boolean;
  default_type: EcfType;
}

export interface Invoice {
  id: string;
  order_id: string;
  ecf_type: string;
  encf: string | null;
  customer_rnc: string | null;
  customer_name: string | null;
  provider: string | null;
  status: 'pendiente' | 'enviada' | 'aceptada' | 'rechazada';
  security_code: string | null;
  qr_url: string | null;
  environment: string | null;
  message: string | null;
  created_at: string;
}

const DEFAULTS: EinvoiceSettings = { provider: 'prueba', environment: 'prueba', enabled: false, default_type: '32' };

function friendly(message: string) {
  if (/einvoice|schema cache|does not exist/i.test(message)) return 'Falta un paso en Supabase: corre el archivo 0012_factura_electronica.sql.';
  if (/fetch|network|Failed to send/i.test(message)) return 'Necesitas internet para la factura electrónica.';
  return message;
}

export async function getEinvoiceSettings(
  businessId: string,
): Promise<{ settings: EinvoiceSettings; tokenSaved: boolean; error?: string }> {
  if (!supabase) return { settings: DEFAULTS, tokenSaved: false, error: 'Sin nube' };
  const [s, tk] = await Promise.all([
    supabase.from('einvoice_settings').select('provider, environment, enabled, default_type').eq('business_id', businessId).maybeSingle(),
    supabase.rpc('einvoice_token_saved', { p_business: businessId }),
  ]);
  if (s.error) return { settings: DEFAULTS, tokenSaved: false, error: friendly(s.error.message) };
  return { settings: { ...DEFAULTS, ...((s.data as Partial<EinvoiceSettings> | null) ?? {}) }, tokenSaved: tk.data === true };
}

export async function saveEinvoiceSettings(businessId: string, s: EinvoiceSettings, token?: string): Promise<string | null> {
  if (!supabase) return 'Sin nube';
  const { error } = await supabase
    .from('einvoice_settings')
    .upsert({ business_id: businessId, ...s, updated_at: new Date().toISOString() });
  if (error) return /row-level|permission/i.test(error.message) ? 'Solo el dueño puede cambiar esto.' : friendly(error.message);
  if (token !== undefined && token.trim()) {
    const r = await supabase.rpc('set_einvoice_token', { p_business: businessId, p_token: token });
    if (r.error) return friendly(r.error.message);
  }
  return null;
}

export async function listInvoices(orderId: string): Promise<Invoice[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('invoices').select('*').eq('order_id', orderId).order('created_at');
  return (data ?? []) as Invoice[];
}

export async function emitInvoice(
  orderId: string,
  type: EcfType,
  customer?: { rnc: string; name: string },
): Promise<{ invoice?: Invoice; error?: string }> {
  if (!supabase) return { error: 'Sin nube' };
  const { data, error } = await supabase.functions.invoke('emitir-ecf', { body: { order_id: orderId, type, customer } });
  if (error) {
    // El mensaje del servidor viene en el cuerpo de la respuesta.
    let msg = error.message;
    let fromServer = false;
    try {
      const res = (error as { context?: Response }).context;
      if (res) {
        const body = (await res.json()) as { error?: string };
        if (body.error) {
          msg = body.error;
          fromServer = true;
        }
      }
    } catch {
      /* sin cuerpo */
    }
    if (!fromServer && /404|not found|Failed to send/i.test(msg)) {
      msg = 'Falta publicar la función "emitir-ecf" en Supabase, o no hay internet.';
    }
    return { error: friendly(msg) };
  }
  return { invoice: (data as { invoice: Invoice }).invoice };
}
