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
  { value: 'alanube', label: 'Alanube', ready: true },
  { value: 'api', label: 'Otro proveedor por API', ready: true },
  { value: 'manual', label: 'Otro proveedor (manual)', ready: true },
] as const;

export interface EinvoiceSettings {
  provider: string;
  environment: 'prueba' | 'produccion';
  enabled: boolean;
  default_type: EcfType;
  /** Próximo número de la secuencia autorizada por la DGII (sin "E32") y su vencimiento. */
  seq32_next: number | null;
  seq32_due: string | null;
  seq31_next: number | null;
  seq31_due: string | null;
  /** Id de la compañía en Alanube (solo si es una compañía asociada). */
  provider_company_id: string | null;
  /** Nombre del proveedor (manual o por API). */
  provider_name: string | null;
  /** Conector genérico por API (0015). */
  api_url: string | null;
  api_status_url: string | null;
  api_auth_header: string | null;
  api_auth_prefix: string | null;
  api_format: 'yoli' | 'alanube' | null;
  api_numbering: 'yoli' | 'proveedor' | null;
  api_response_map: ApiResponseMap | null;
}

/** Dónde está cada dato en la respuesta del proveedor (rutas tipo "data.encf"). Vacío = se busca solo. */
export interface ApiResponseMap {
  id?: string;
  encf?: string;
  securityCode?: string;
  qrUrl?: string;
  status?: string;
  message?: string;
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

const DEFAULTS: EinvoiceSettings = {
  provider: 'prueba',
  environment: 'prueba',
  enabled: false,
  default_type: '32',
  seq32_next: null,
  seq32_due: null,
  seq31_next: null,
  seq31_due: null,
  provider_company_id: null,
  provider_name: null,
  api_url: null,
  api_status_url: null,
  api_auth_header: null,
  api_auth_prefix: null,
  api_format: null,
  api_numbering: null,
  api_response_map: null,
};

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
    supabase.from('einvoice_settings').select('*').eq('business_id', businessId).maybeSingle(),
    supabase.rpc('einvoice_token_saved', { p_business: businessId }),
  ]);
  if (s.error) return { settings: DEFAULTS, tokenSaved: false, error: friendly(s.error.message) };
  return { settings: { ...DEFAULTS, ...((s.data as Partial<EinvoiceSettings> | null) ?? {}) }, tokenSaved: tk.data === true };
}

export async function saveEinvoiceSettings(businessId: string, s: EinvoiceSettings, token?: string): Promise<string | null> {
  if (!supabase) return 'Sin nube';
  const row: Record<string, unknown> = { ...s, business_id: businessId, updated_at: new Date().toISOString() };
  // Los campos de secuencias solo se envían si se usan (así funciona aunque falte 0013).
  for (const k of ['seq32_next', 'seq32_due', 'seq31_next', 'seq31_due', 'provider_company_id', 'provider_name']) {
    if (row[k] === null || row[k] === undefined || row[k] === '') delete row[k];
  }
  // Las columnas del conector por API solo se envían si se usa (así funciona aunque falte 0015).
  if (s.provider !== 'api') {
    for (const k of Object.keys(row)) if (k.startsWith('api_') && (row[k] === null || row[k] === undefined)) delete row[k];
  }
  const { error } = await supabase.from('einvoice_settings').upsert(row);
  if (error) {
    if (/api_/i.test(error.message)) return 'Falta un paso en Supabase: corre el archivo 0015_ecf_api.sql.';
    if (/provider_name/i.test(error.message)) return 'Falta un paso en Supabase: corre el archivo 0014_ecf_manual.sql.';
    if (/seq3|provider_company_id/i.test(error.message)) return 'Falta un paso en Supabase: corre el archivo 0013_secuencias_ecf.sql.';
    return /row-level|permission/i.test(error.message) ? 'Solo el dueño puede cambiar esto.' : friendly(error.message);
  }
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

/** Vuelve a preguntar al proveedor cómo va la factura (aceptada, rechazada…). */
export async function refreshInvoice(invoiceId: string): Promise<{ invoice?: Invoice; error?: string }> {
  if (!supabase) return { error: 'Sin nube' };
  const { data, error } = await supabase.functions.invoke('emitir-ecf', { body: { action: 'status', invoice_id: invoiceId } });
  if (error) return { error: friendly(error.message) };
  return { invoice: (data as { invoice: Invoice }).invoice };
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

/** Guarda la factura que el negocio ya emitió en su proveedor (registro manual). */
export async function recordManualInvoice(
  orderId: string,
  type: EcfType,
  encf: string,
  securityCode: string,
  customer?: { rnc: string; name: string },
): Promise<{ invoice?: Invoice; error?: string }> {
  if (!supabase) return { error: 'Sin nube' };
  const { data, error } = await supabase.rpc('record_manual_ecf', {
    p_order: orderId,
    p_type: type,
    p_encf: encf,
    p_security_code: securityCode,
    p_customer_rnc: customer?.rnc ?? null,
    p_customer_name: customer?.name ?? null,
  });
  if (error) {
    if (/record_manual_ecf|function .* does not exist|schema cache/i.test(error.message)) {
      return { error: 'Falta un paso en Supabase: corre el archivo 0014_ecf_manual.sql.' };
    }
    return { error: friendly(error.message) };
  }
  return { invoice: data as Invoice };
}

/** Quita una factura registrada a mano (si se escribió mal). Solo dueño o gerente. */
export async function deleteManualInvoice(invoiceId: string): Promise<string | null> {
  if (!supabase) return 'Sin nube';
  const { error } = await supabase.rpc('delete_manual_ecf', { p_invoice: invoiceId });
  return error ? friendly(error.message) : null;
}
