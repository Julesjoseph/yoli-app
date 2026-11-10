// YOLI SOFT · Emite la factura electrónica (e-CF) de una venta con el proveedor
// autorizado por la DGII que configuró el negocio (Alanube), o en modo prueba.
//
// La app llama:  supabase.functions.invoke('emitir-ecf', { body: { order_id, type, customer } })
//           o:   supabase.functions.invoke('emitir-ecf', { body: { action: 'status', invoice_id } })
// con la sesión del usuario. Aquí se revisa que la persona sea del negocio, se lee
// la llave del proveedor (que la app nunca ve) y se guarda el comprobante.
//
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { ALANUBE_PATH, ALANUBE_URL, alanubeError, buildAlanubePayload, readAlanubeResponse, type EcfInput } from './alanube.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Fecha de hoy en República Dominicana (AAAA-MM-DD). */
const todayRD = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);

async function callAlanube(method: 'GET' | 'POST', url: string, token: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text.slice(0, 300) };
  }
  return { ok: res.ok, status: res.status, json };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Usa POST' }, 405);

  // 1. ¿Quién llama?
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(jwt);
  const userId = who?.user?.id;
  if (!userId) return reply({ error: 'Inicia sesión otra vez.' }, 401);

  let body: { action?: string; invoice_id?: string; order_id?: string; type?: string; customer?: { rnc?: string; name?: string } };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Datos no válidos' }, 400);
  }
  const isMember = async (b: string) =>
    !!(await admin.from('members').select('role').eq('business_id', b).eq('user_id', userId).limit(1).maybeSingle()).data;

  // ---- Consultar el estado de una factura ya enviada ----
  if (body.action === 'status') {
    const { data: inv } = await admin.from('invoices').select('*').eq('id', body.invoice_id ?? '').maybeSingle();
    if (!inv || !(await isMember(inv.business_id))) return reply({ error: 'No se encontró la factura.' }, 404);
    const providerId = inv.provider_response?.id;
    if (inv.provider !== 'alanube' || !providerId) return reply({ invoice: inv });
    const { data: secret } = await admin.from('einvoice_secrets').select('api_token').eq('business_id', inv.business_id).maybeSingle();
    const env = inv.environment === 'produccion' ? 'produccion' : 'prueba';
    const r = await callAlanube('GET', `${ALANUBE_URL[env]}/${ALANUBE_PATH[inv.ecf_type]}/${providerId}?pdfType=pos`, secret?.api_token ?? '');
    if (!r.ok) return reply({ error: alanubeError(r.status, r.json) }, 502);
    const res = readAlanubeResponse(r.json);
    const { data: saved } = await admin
      .from('invoices')
      .update({
        status: res.status,
        security_code: res.securityCode ?? inv.security_code,
        qr_url: res.qrUrl ?? inv.qr_url,
        message: res.message ?? inv.message,
        provider_response: { ...r.json, id: providerId },
      })
      .eq('id', inv.id)
      .select()
      .single();
    return reply({ invoice: saved });
  }

  // ---- Emitir ----
  const type = body.type === '31' ? '31' : '32';
  if (!body.order_id) return reply({ error: 'Falta la venta' }, 400);

  // 2. La venta y el negocio, y que la persona sea miembro.
  const { data: order } = await admin.from('orders').select('*').eq('id', body.order_id).maybeSingle();
  if (!order) return reply({ error: 'La venta todavía no ha subido a la nube. Espera un momento y vuelve a intentar.' }, 404);
  const b = order.business_id as string;
  if (!(await isMember(b))) return reply({ error: 'No perteneces a este negocio.' }, 403);
  if (order.status !== 'pagada') return reply({ error: 'Esta venta está anulada.' }, 400);

  const { data: settings } = await admin.from('einvoice_settings').select('*').eq('business_id', b).maybeSingle();
  if (!settings?.enabled) return reply({ error: 'La factura electrónica no está activada. Actívala en Perfil › Factura electrónica.' }, 400);
  if (!['prueba', 'alanube'].includes(settings.provider)) {
    return reply({ error: `El proveedor "${settings.provider}" aún no está conectado en YOLI SOFT.` }, 400);
  }

  const { data: biz } = await admin.from('businesses').select('*').eq('id', b).single();
  const issuerRnc = String(biz?.rnc ?? '').replace(/\D/g, '');
  if (issuerRnc.length !== 9 && issuerRnc.length !== 11) {
    return reply({ error: 'Pon el RNC del negocio en Perfil › Perfil del negocio.' }, 400);
  }
  if (settings.provider === 'alanube' && !String(biz.address ?? '').trim()) {
    return reply({ error: 'Pon la dirección del negocio en Perfil › Perfil del negocio (la DGII la pide).' }, 400);
  }
  let customer: EcfInput['customer'];
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

  // 4. Número e-NCF.
  let encf: string;
  let sequenceDue: string | null = null;
  if (settings.provider === 'prueba') {
    const { count } = await admin
      .from('invoices').select('id', { count: 'exact', head: true })
      .eq('business_id', b).eq('ecf_type', type).eq('provider', 'prueba');
    encf = `E${type}${String((count ?? 0) + 1).padStart(10, '0')}`;
  } else {
    const { data: seq, error: seqError } = await admin.rpc('take_encf', { p_business: b, p_type: type }).single();
    if (seqError || !seq) {
      return reply({ error: `Falta la secuencia e-NCF tipo ${type}. Ponla en Perfil › Factura electrónica (la da la DGII).` }, 400);
    }
    encf = (seq as { encf: string }).encf;
    sequenceDue = (seq as { due: string | null }).due;
    if (sequenceDue && sequenceDue < todayRD()) {
      return reply({ error: `La secuencia e-NCF tipo ${type} venció el ${sequenceDue}. Pide una nueva a la DGII.` }, 400);
    }
  }

  const input: EcfInput = {
    type,
    encf,
    sequenceDue,
    issuer: {
      rnc: issuerRnc,
      legalName: biz.legal_name || biz.name,
      tradeName: biz.name,
      address: biz.address ?? '',
      phone: biz.phone ?? '',
      email: biz.email ?? '',
    },
    customer,
    lines: (items ?? []).map((i) => ({ description: i.name, quantity: i.quantity, unitPrice: Number(i.unit_price), itbisRate: rateOf(i.product_id) })),
    discount: Number(order.discount ?? 0),
    tipLaw: Number(order.tip_law ?? 0),
    paymentMethod: order.payment_method ?? 'efectivo',
    issuedOn: todayRD(),
    companyId: settings.provider_company_id || null,
  };

  // 5. Enviar al proveedor con la llave guardada en el servidor.
  let result: { status: 'enviada' | 'aceptada' | 'rechazada'; securityCode?: string; qrUrl?: string; message?: string };
  let raw: unknown = null;
  if (settings.provider === 'prueba') {
    result = {
      status: 'aceptada',
      securityCode: crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase(),
      message: 'MODO PRUEBA: este comprobante NO es válido ante la DGII.',
    };
    raw = { payload: buildAlanubePayload(input) };
  } else {
    const { data: secret } = await admin.from('einvoice_secrets').select('api_token').eq('business_id', b).maybeSingle();
    if (!secret?.api_token) return reply({ error: 'Falta la llave de Alanube. Ponla en Perfil › Factura electrónica.' }, 400);
    const env = settings.environment === 'produccion' ? 'produccion' : 'prueba';
    let r;
    try {
      r = await callAlanube('POST', `${ALANUBE_URL[env]}/${ALANUBE_PATH[type]}`, secret.api_token, buildAlanubePayload(input));
    } catch (e) {
      await admin.rpc('release_encf', { p_business: b, p_type: type, p_encf: encf });
      return reply({ error: `Alanube no respondió: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }
    if (!r.ok) {
      // No llegó a la DGII: el número se devuelve para no dejar huecos.
      await admin.rpc('release_encf', { p_business: b, p_type: type, p_encf: encf });
      await admin.from('invoices').insert({
        business_id: b, order_id: order.id, ecf_type: type, encf, provider: 'alanube', status: 'rechazada',
        customer_rnc: customer?.rnc ?? null, customer_name: customer?.name ?? null, total: Number(order.total),
        environment: settings.environment, message: alanubeError(r.status, r.json), provider_response: r.json,
      });
      return reply({ error: alanubeError(r.status, r.json) }, 422);
    }
    const res = readAlanubeResponse(r.json);
    result = res;
    raw = r.json;
    if (res.encf) encf = res.encf;
  }

  const { data: saved, error } = await admin
    .from('invoices')
    .insert({
      business_id: b,
      order_id: order.id,
      ecf_type: type,
      encf,
      customer_rnc: customer?.rnc ?? null,
      customer_name: customer?.name ?? null,
      provider: settings.provider,
      status: result.status,
      provider_response: raw,
      security_code: result.securityCode ?? null,
      qr_url: result.qrUrl ?? null,
      total: Number(order.total),
      environment: settings.provider === 'prueba' ? 'prueba' : settings.environment,
      message: result.message ?? null,
    })
    .select()
    .single();
  if (error) return reply({ error: error.message }, 500);
  return reply({ invoice: saved }, result.status === 'rechazada' ? 422 : 200);
});
