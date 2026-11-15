// YOLI SOFT · Lee la foto (o PDF) de una factura de compra con Claude y devuelve
// proveedor, RNC, NCF, fecha, totales y cada producto, con un nombre claro para el
// inventario y, si se parece a un insumo que ya existe, cuál es.
//
// La app llama:  supabase.functions.invoke('leer-factura', {
//   body: { business_id, file: { data: <base64>, media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' },
//           ingredients: [{ id, name, unit }] } })
// con la sesión del usuario. Solo para miembros del negocio.
//
// Secreto en Supabase (Edge Functions › Secrets): ANTHROPIC_API_KEY (la app nunca la ve).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

const UNITS = ['unidad', 'pieza', 'porcion', 'lb', 'onza', 'kg', 'g', 'litro', 'ml', 'galon', 'lonja', 'paquete', 'caja', 'saco', 'otra'];
const MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_BASE64 = 6_500_000; // ~4.8 MB de archivo

const str = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const num = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_invoice', 'supplier_name', 'supplier_rnc', 'ncf', 'date', 'subtotal', 'itbis', 'total', 'items', 'notes'],
  properties: {
    is_invoice: { type: 'boolean' },
    supplier_name: str,
    supplier_rnc: str,
    ncf: str,
    date: str,
    subtotal: num,
    itbis: num,
    total: num,
    notes: str,
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'name', 'quantity', 'unit', 'unit_cost', 'line_total', 'ingredient_id', 'for_inventory'],
        properties: {
          description: { type: 'string' },
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string', enum: UNITS },
          unit_cost: num,
          line_total: num,
          ingredient_id: str,
          for_inventory: { type: 'boolean' },
        },
      },
    },
  },
};

const SYSTEM = `Lees facturas de compra de negocios de comida en República Dominicana (colmados, supermercados, distribuidores, mercados) para registrarlas como gasto y pasar los productos al inventario.

Devuelve los datos tal como aparecen en la factura:
- supplier_name: nombre comercial o razón social del proveedor.
- supplier_rnc: RNC o cédula del proveedor, solo dígitos (9 u 11). No confundas el RNC del comprador con el del proveedor.
- ncf: comprobante fiscal (B01…, B02…, E31…, E32…, etc.), sin espacios. null si no tiene.
- date: fecha de la factura en formato AAAA-MM-DD (en RD las fechas suelen venir como DD/MM/AAAA).
- subtotal, itbis, total: en pesos dominicanos, números sin símbolos ni comas de miles.

Para cada línea de producto:
- description: el texto de la factura tal cual.
- name: un nombre corto y claro para el inventario, en español, como lo diría el dueño del negocio (ej. "POLLO ENT. FRESCO KG" → "Pollo entero"; "ACEITE CRISOL 1GL" → "Aceite Crisol").
- quantity y unit: cantidad comprada en la unidad más útil para el inventario. Si la descripción dice el tamaño (ej. 5 sacos de arroz de 25 lb), usa la unidad del contenido solo si es claro; si no, usa la unidad de la factura (unidad, caja, saco, paquete…).
- unit_cost: precio por esa unidad; line_total: importe de la línea (después de descuento, sin ITBIS si la factura lo separa).
- ingredient_id: si el producto es claramente el mismo que uno de los insumos que ya existen (lista abajo), su id; si no hay uno claro, null. No inventes ids.
- for_inventory: true si es un insumo o mercancía que se guarda y se gasta (comida, bebidas, desechables, gas); false si es un servicio, cargo, envío, propina o algo que no se almacena.

Si un dato no se ve o no se puede leer con seguridad, pon null en vez de adivinar. Si la imagen no es una factura o recibo de compra, pon is_invoice en false y explica en notes. En notes pon también cualquier advertencia útil (ej. "la foto está borrosa en la parte de abajo").`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Usa POST' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return reply({ error: 'Falta la llave de lectura de facturas (ANTHROPIC_API_KEY) en Supabase › Edge Functions › Secrets.' }, 500);

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(jwt);
  const userId = who?.user?.id;
  if (!userId) return reply({ error: 'Inicia sesión otra vez.' }, 401);

  let body: { business_id?: string; file?: { data?: string; media_type?: string }; ingredients?: { id: string; name: string; unit: string }[] };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Datos no válidos' }, 400);
  }
  const businessId = body.business_id ?? '';
  const { data: member } = await admin.from('members').select('role').eq('business_id', businessId).eq('user_id', userId).limit(1).maybeSingle();
  if (!member) return reply({ error: 'No eres parte de este negocio.' }, 403);

  // Límite de lecturas con IA de este negocio este mes (lo pone el administrador de YOLI).
  const now = new Date(Date.now() - 4 * 3600_000); // hora de RD
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 4)).toISOString();
  const [{ data: sub, error: subError }, { count, error: countError }] = await Promise.all([
    admin.from('subscriptions').select('ai_scans_month').eq('business_id', businessId).maybeSingle(),
    admin.from('invoice_scans').select('id', { count: 'exact', head: true }).eq('business_id', businessId).gte('created_at', monthStart),
  ]);
  if (subError || countError) return reply({ error: 'Falta correr 0018_lectura_facturas.sql en Supabase.' }, 500);
  const limit = Number(sub?.ai_scans_month ?? 0);
  if ((count ?? 0) >= limit) {
    return reply(
      {
        error: limit
          ? `Ya usaste las ${limit} lecturas con IA de este mes. Usa la lectura gratis del celular o pide más a YOLI SOFT.`
          : 'La lectura con IA no está activada para tu negocio. Usa la lectura gratis del celular o pídela a YOLI SOFT.',
        limit_reached: true,
      },
      402,
    );
  }

  const data = String(body.file?.data ?? '').replace(/^data:[^,]+,/, '');
  const mediaType = String(body.file?.media_type ?? '');
  if (!data || !MEDIA.includes(mediaType)) return reply({ error: 'Manda una foto (JPG o PNG) o un PDF de la factura.' }, 400);
  if (data.length > MAX_BASE64) return reply({ error: 'El archivo es muy grande. Toma la foto de nuevo o usa uno de menos de 4 MB.' }, 413);

  const ingredients = (body.ingredients ?? []).slice(0, 400).map((i) => `${i.id} | ${String(i.name).slice(0, 80)} | ${String(i.unit).slice(0, 20)}`);
  const fileBlock =
    mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg', data } };

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            {
              type: 'text',
              text: `Insumos que ya existen en el inventario (id | nombre | unidad):\n${ingredients.join('\n') || '(ninguno todavía)'}\n\nLee esta factura.`,
            },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return reply({ error: 'La llave de Anthropic no es válida. Revísala en Supabase › Edge Functions › Secrets.' }, 502);
    if (e instanceof Anthropic.PermissionDeniedError) return reply({ error: 'La cuenta de Anthropic no tiene permiso o no tiene saldo. Revisa Billing en console.anthropic.com.' }, 502);
    if (e instanceof Anthropic.RateLimitError) return reply({ error: 'Muchas facturas seguidas. Espera un minuto y vuelve a intentar.' }, 429);
    if (e instanceof Anthropic.BadRequestError) return reply({ error: `No se pudo leer el archivo: ${e.message}`.slice(0, 300) }, 400);
    if (e instanceof Anthropic.APIError) return reply({ error: `El servicio de lectura respondió ${e.status}. Intenta otra vez.` }, 502);
    return reply({ error: 'No se pudo conectar con el servicio de lectura. Intenta otra vez.' }, 502);
  }

  if (response.stop_reason === 'refusal') return reply({ error: 'No se pudo leer esta imagen. Prueba con otra foto de la factura.' }, 422);
  if (response.stop_reason === 'max_tokens') return reply({ error: 'La factura es muy larga para leerla de una vez. Prueba con una foto por página.' }, 422);
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') return reply({ error: 'No llegó respuesta. Intenta otra vez.' }, 502);
  let invoice: unknown;
  try {
    invoice = JSON.parse(text.text);
  } catch {
    return reply({ error: 'La respuesta no se entendió. Intenta otra vez.' }, 502);
  }
  await admin.from('invoice_scans').insert({ business_id: businessId, user_id: userId });
  return reply({ invoice, used: (count ?? 0) + 1, limit });
});
