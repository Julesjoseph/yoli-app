// YOLI SOFT · Emite la factura electrónica (e-CF) de una venta con el proveedor
// autorizado por la DGII que configuró el negocio.
//
// La app llama:  supabase.functions.invoke('emitir-ecf', { body: { order_id, type, customer } })
// con la sesión del usuario. Aquí se revisa que la persona sea del negocio, se lee
// la llave del proveedor (que la app nunca ve) y se guarda el comprobante.
//
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type EcfType = '31' | '32';

interface Line {
  description: string;
  quantity: number;
  unitPrice: number; // con ITBIS, como se cobró
  itbisRate: number; // 0.18, 0.16 o 0
}
interface InvoiceRequest {
  type: EcfType;
  environment: 'prueba' | 'produccion';
  issuer: { rnc: string; legalName: string; tradeName: string; address: string };
  customer?: { rnc: string; name: string };
  lines: Line[];
  subtotal: number;
  itbis: number;
  tipLaw: number;
  total: number;
  paymentMethod: string;
  issuedAt: string;
  sequence: number;
}
interface InvoiceResult {
  status: 'enviada' | 'aceptada' | 'rechazada';
  encf?: string;
  securityCode?: string;
  qrUrl?: string;
  message?: string;
  raw?: unknown;
}
type Provider = (req: InvoiceRequest, token: string) => Promise<InvoiceResult>;

/** Modo prueba: arma el comprobante pero NO lo envía a la DGII. */
const prueba: Provider = async (req) => ({
  status: 'aceptada',
  encf: `E${req.type}${String(req.sequence).padStart(10, '0')}`,
  securityCode: crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase(),
  message: 'MODO PRUEBA: este comprobante NO es válido ante la DGII.',
});

// Aquí se agrega el conector del proveedor elegido (Alanube u otro) con su documentación.
const PROVIDERS: Record<string, Provider> = { prueba };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Usa POST' }, 405);

  // 1. ¿Quién llama?
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(jwt);
  const userId = who?.user?.id;
  if (!userId) return reply({ error: 'Inicia sesión otra vez.' }, 401);

  let body: { order_id?: string; type?: string; customer?: { rnc?: string; name?: string } };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Datos no válidos' }, 400);
  }
  const type = body.type === '31' ? '31' : '32';
  if (!body.order_id) return reply({ error: 'Falta la venta' }, 400);

  // 2. La venta y el negocio, y que la persona sea miembro.
  const { data: order } = await admin.from('orders').select('*').eq('id', body.order_id).maybeSingle();
  if (!order) return reply({ error: 'La venta todavía no ha subido a la nube. Espera un momento y vuelve a intentar.' }, 404);
  const b = order.business_id as string;
  const { data: member } = await admin.from('members').select('role').eq('business_id', b).eq('user_id', userId).limit(1).maybeSingle();
  if (!member) return reply({ error: 'No perteneces a este negocio.' }, 403);
  if (order.status !== 'pagada') return reply({ error: 'Esta venta está anulada.' }, 400);

  const { data: settings } = await admin.from('einvoice_settings').select('*').eq('business_id', b).maybeSingle();
  if (!settings?.enabled) return reply({ error: 'La factura electrónica no está activada. Actívala en Perfil › Factura electrónica.' }, 400);
  const provider = PROVIDERS[settings.provider];
  if (!provider) return reply({ error: `El proveedor "${settings.provider}" aún no está conectado en YOLI SOFT.` }, 400);

  const { data: biz } = await admin.from('businesses').select('*').eq('id', b).single();
  const issuerRnc = String(biz?.rnc ?? '').replace(/\D/g, '');
  if (issuerRnc.length !== 9 && issuerRnc.length !== 11) {
    return reply({ error: 'Pon el RNC del negocio en Perfil › Perfil del negocio.' }, 400);
  }
  let customer: InvoiceRequest['customer'];
  if (type === '31') {
    const rnc = String(body.customer?.rnc ?? '').replace(/\D/g, '');
    const name = String(body.customer?.name ?? '').trim();
    if ((rnc.length !== 9 && rnc.length !== 11) || !name) {
      return reply({ error: 'Para crédito fiscal escribe el RNC (9 dígitos) o cédula (11) y el nombre del cliente.' }, 400);
    }
    customer = { rnc, name };
  }

  // 3. ¿Ya tiene factura?
  const { data: existing } = await admin
    .from('invoices').select('*').eq('order_id', order.id).eq('ecf_type', type).in('status', ['enviada', 'aceptada']).maybeSingle();
  if (existing) return reply({ invoice: existing, already: true });

  const { data: items } = await admin.from('order_items').select('name, unit_price, quantity, product_id').eq('order_id', order.id);
  const { data: prods } = await admin.from('products').select('id, itbis_rate, delivery_itbis_exempt').eq('business_id', b);
  const delivery = order.channel === 'pedidosya' || order.channel === 'ubereats';
  const rateOf = (pid: string | null) => {
    const p = (prods ?? []).find((x) => x.id === pid);
    if (!p) return 0.18;
    return delivery && p.delivery_itbis_exempt ? 0 : Number(p.itbis_rate);
  };

  const { count } = await admin
    .from('invoices').select('id', { count: 'exact', head: true })
    .eq('business_id', b).eq('ecf_type', type).eq('environment', settings.environment);

  const request: InvoiceRequest = {
    type,
    environment: settings.environment,
    issuer: { rnc: issuerRnc, legalName: biz.legal_name || biz.name, tradeName: biz.name, address: biz.address ?? '' },
    customer,
    lines: (items ?? []).map((i) => ({ description: i.name, quantity: i.quantity, unitPrice: Number(i.unit_price), itbisRate: rateOf(i.product_id) })),
    subtotal: Number(order.subtotal),
    itbis: Number(order.itbis),
    tipLaw: Number(order.tip_law),
    total: Number(order.total),
    paymentMethod: order.payment_method ?? 'efectivo',
    issuedAt: new Date().toISOString(),
    sequence: (count ?? 0) + 1,
  };

  // 4. Enviar al proveedor con la llave guardada en el servidor.
  const { data: secret } = await admin.from('einvoice_secrets').select('api_token').eq('business_id', b).maybeSingle();
  if (settings.provider !== 'prueba' && !secret?.api_token) {
    return reply({ error: 'Falta la llave del proveedor. Ponla en Perfil › Factura electrónica.' }, 400);
  }
  let result: InvoiceResult;
  try {
    result = await provider(request, secret?.api_token ?? '');
  } catch (e) {
    return reply({ error: `El proveedor no respondió: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  const { data: saved, error } = await admin
    .from('invoices')
    .insert({
      business_id: b,
      order_id: order.id,
      ecf_type: type,
      encf: result.encf ?? null,
      customer_rnc: customer?.rnc ?? null,
      customer_name: customer?.name ?? null,
      provider: settings.provider,
      status: result.status,
      provider_response: result.raw ?? null,
      security_code: result.securityCode ?? null,
      qr_url: result.qrUrl ?? null,
      total: request.total,
      environment: settings.environment,
      message: result.message ?? null,
    })
    .select()
    .single();
  if (error) return reply({ error: error.message }, 500);
  return reply({ invoice: saved }, result.status === 'rechazada' ? 422 : 200);
});
