// YOLI APP · Receptor de pedidos de PedidosYa (Partner API, "order-events").
// PedidosYa envía un POST por cada pedido nuevo o cambio de estado. Aquí se
// revisa el token secreto y se guarda el pedido con ingest_pedidosya_order().
//
// Secretos (Supabase › Edge Functions › Secrets):
//   PEDIDOSYA_WEBHOOK_TOKEN = el mismo token que pongas en el Partner/Vendor Portal
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase solo (nunca van en la app).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOKEN = Deno.env.get('PEDIDOSYA_WEBHOOK_TOKEN') ?? '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('YOLI · PedidosYa webhook', { status: 200 });

  const auth = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!TOKEN || auth !== TOKEN) return new Response('unauthorized', { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const { data, error } = await db.rpc('ingest_pedidosya_order', { p: payload });
  if (error) {
    console.error('ingest_pedidosya_order', error);
    // 500 => PedidosYa vuelve a intentar más tarde.
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, result: data }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
