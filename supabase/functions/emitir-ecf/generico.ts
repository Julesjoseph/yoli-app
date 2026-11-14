// Conector genérico: cualquier proveedor de factura electrónica autorizado por la DGII
// que tenga API (HTTP + JSON). YOLI SOFT le manda la factura en un formato estándar
// (documentado en docs/factura-electronica-api.md) y lee de la respuesta el e-NCF,
// el código de seguridad, el QR y el estado. Si el proveedor usa otros nombres de
// campos, el negocio los indica en Perfil › Factura electrónica (rutas tipo "data.encf").
// Sin dependencias: se usa en la función del servidor y en las pruebas.

import type { EcfInput } from './alanube.ts';

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Formas de pago de la DGII: 1 efectivo, 2 cheque/transferencia, 3 tarjeta, 8 otras.
const PAY_FORMS: Record<string, { code: number; name: string }> = {
  efectivo: { code: 1, name: 'Efectivo' },
  transferencia: { code: 2, name: 'Cheque / Transferencia / Depósito' },
  tarjeta: { code: 3, name: 'Tarjeta de débito / crédito' },
  plataforma: { code: 8, name: 'Otras formas de pago' },
};

/** Indicador de facturación de la DGII: 1 = ITBIS 18 %, 2 = ITBIS 16 %, 4 = exento. */
export function billingIndicator(rate: number) {
  if (Math.abs(rate - 0.18) < 1e-6) return 1;
  if (Math.abs(rate - 0.16) < 1e-6) return 2;
  return 4;
}

export interface YoliEcfMeta {
  saleId: string;
  environment: 'prueba' | 'produccion';
}

/**
 * Factura en el formato estándar de YOLI SOFT ("yoli-ecf-1").
 * Montos en pesos dominicanos con 2 decimales. "encf" es null si el proveedor pone el número.
 */
export function buildYoliPayload(i: EcfInput, meta: YoliEcfMeta) {
  const gross = i.lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
  const factor = gross > 0 ? Math.max(0, gross - i.discount) / gross : 1;

  const items = i.lines.map((l, k) => {
    const ind = billingIndicator(l.itbisRate);
    const rate = ind === 1 ? 0.18 : ind === 2 ? 0.16 : 0;
    const unitNet = round(l.unitPrice / (1 + rate));
    const base = round(unitNet * l.quantity);
    const discount = round(base * (1 - factor));
    const net = round(base - discount);
    const itbis = round(net * rate);
    return {
      linea: k + 1,
      descripcion: l.description.slice(0, 80),
      tipo: 'bien',
      cantidad: l.quantity,
      precioUnitarioConItbis: round(l.unitPrice),
      precioUnitarioSinItbis: unitNet,
      tasaItbis: rate * 100,
      indicadorFacturacion: ind,
      descuento: discount,
      montoSinItbis: net,
      itbis,
      total: round(net + itbis),
    };
  });
  if (i.tipLaw > 0) {
    items.push({
      linea: items.length + 1,
      descripcion: 'Propina legal (10%)',
      tipo: 'servicio',
      cantidad: 1,
      precioUnitarioConItbis: round(i.tipLaw),
      precioUnitarioSinItbis: round(i.tipLaw),
      tasaItbis: 0,
      indicadorFacturacion: 4,
      descuento: 0,
      montoSinItbis: round(i.tipLaw),
      itbis: 0,
      total: round(i.tipLaw),
    });
  }

  const sum = (ind: number, key: 'montoSinItbis' | 'itbis') =>
    round(items.filter((x) => x.indicadorFacturacion === ind).reduce((n, x) => n + x[key], 0));
  const gravado18 = sum(1, 'montoSinItbis');
  const gravado16 = sum(2, 'montoSinItbis');
  const exento = sum(4, 'montoSinItbis');
  const itbis18 = sum(1, 'itbis');
  const itbis16 = sum(2, 'itbis');
  const total = round(gravado18 + gravado16 + exento + itbis18 + itbis16);
  const pay = PAY_FORMS[i.paymentMethod] ?? PAY_FORMS.plataforma;

  return {
    formato: 'yoli-ecf-1',
    ambiente: meta.environment,
    tipoEcf: i.type,
    encf: i.encf || null,
    fechaVencimientoSecuencia: i.sequenceDue ?? null,
    fechaEmision: i.issuedOn,
    emisor: {
      rnc: i.issuer.rnc,
      razonSocial: i.issuer.legalName.slice(0, 150),
      nombreComercial: i.issuer.tradeName.slice(0, 150),
      direccion: i.issuer.address.slice(0, 100),
      telefono: (i.issuer.phone ?? '').replace(/\D/g, '') || null,
      correo: i.issuer.email || null,
    },
    comprador: i.customer ? { rncCedula: i.customer.rnc, nombre: i.customer.name.slice(0, 150) } : null,
    items,
    totales: {
      montoGravado18: gravado18,
      montoGravado16: gravado16,
      montoGravadoTotal: round(gravado18 + gravado16),
      montoExento: exento,
      itbis18,
      itbis16,
      itbisTotal: round(itbis18 + itbis16),
      descuento: round(i.discount),
      propinaLegal: round(i.tipLaw),
      total,
    },
    formaPago: { codigo: pay.code, nombre: pay.name, monto: total },
    referencia: { ventaId: meta.saleId, sistema: 'YOLI SOFT' },
  };
}

/** Dónde buscar cada dato en la respuesta del proveedor (rutas con puntos, ej. "data.encf"). */
export interface ResponseMap {
  id?: string;
  encf?: string;
  securityCode?: string;
  qrUrl?: string;
  status?: string;
  message?: string;
}

const DEFAULT_PATHS: Record<keyof ResponseMap, string[]> = {
  id: ['id', 'trackId', 'trackid', 'uuid', 'documentId', 'data.id', 'data.trackId', 'result.id'],
  encf: ['encf', 'eNCF', 'ENCF', 'eNcf', 'numero', 'ncf', 'data.encf', 'data.eNCF', 'result.encf', 'idDoc.encf'],
  securityCode: ['securityCode', 'codigoSeguridad', 'CodigoSeguridad', 'security_code', 'data.securityCode', 'data.codigoSeguridad', 'result.securityCode'],
  qrUrl: ['qrUrl', 'urlQR', 'urlQr', 'qr', 'qrCodeUrl', 'stampUrl', 'documentStampUrl', 'data.qrUrl', 'data.urlQR', 'result.qrUrl'],
  status: ['status', 'estado', 'legalStatus', 'data.status', 'data.estado', 'result.status'],
  message: ['message', 'mensaje', 'detail', 'error', 'data.message', 'data.mensaje', 'result.message'],
};

/** Lee un valor por ruta con puntos ("data.items.0.encf"). */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.').map((p) => p.trim()).filter(Boolean)) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function pick(json: unknown, custom: string | undefined, defaults: string[]): string | undefined {
  for (const path of custom?.trim() ? [custom.trim()] : defaults) {
    const v = getPath(json, path);
    if (v !== undefined && v !== null && v !== '' && typeof v !== 'object') return String(v);
  }
  return undefined;
}

/** Convierte el estado del proveedor al de YOLI: aceptada, rechazada o enviada (en proceso). */
export function normalizeStatus(raw: string | undefined): 'enviada' | 'aceptada' | 'rechazada' {
  const s = (raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (/RECHAZ|REJECT|ERROR|FAIL|DENEG|DENIED|INVALID|ANUL/.test(s)) return 'rechazada';
  if (/ACEPT|ACCEPT|APROB|APPROV|SUCCESS|EXITO|FIRMAD|SIGNED|EMITID|ISSUED|REGISTR|COMPLET|^OK$|^TRUE$|^1$/.test(s)) return 'aceptada';
  return 'enviada';
}

export interface GenericResult {
  status: 'enviada' | 'aceptada' | 'rechazada';
  providerId?: string;
  encf?: string;
  securityCode?: string;
  qrUrl?: string;
  message?: string;
}

export function readGenericResponse(json: unknown, map: ResponseMap = {}): GenericResult {
  const rawStatus = pick(json, map.status, DEFAULT_PATHS.status);
  const encf = pick(json, map.encf, DEFAULT_PATHS.encf);
  const securityCode = pick(json, map.securityCode, DEFAULT_PATHS.securityCode);
  // Sin estado claro pero con e-NCF y código: el proveedor lo firmó.
  let status = normalizeStatus(rawStatus);
  if (!rawStatus && encf && securityCode) status = 'aceptada';
  const message = pick(json, map.message, DEFAULT_PATHS.message);
  return {
    status,
    providerId: pick(json, map.id, DEFAULT_PATHS.id),
    encf: encf && /^E\d{12}$/i.test(encf.trim()) ? encf.trim().toUpperCase() : encf,
    securityCode,
    qrUrl: pick(json, map.qrUrl, DEFAULT_PATHS.qrUrl),
    message: [rawStatus && `Estado: ${rawStatus}`, message].filter(Boolean).join(' · ') || undefined,
  };
}

/** Mensaje claro de un error del proveedor. */
export function genericError(status: number, json: unknown, name = 'El proveedor'): string {
  if (status === 401 || status === 403) return `${name} no aceptó la llave. Revisa el token, el encabezado y el ambiente.`;
  if (status === 404) return `${name} respondió 404: revisa la dirección (URL) de la API.`;
  const j = json as Record<string, unknown> | null;
  const errors = Array.isArray(j?.errors) ? (j!.errors as unknown[]).map((e) => (e as { message?: string })?.message ?? JSON.stringify(e)) : [];
  const parts = [j?.message, j?.mensaje, (j?.error as { message?: string })?.message ?? (typeof j?.error === 'string' ? j.error : undefined), ...errors]
    .filter(Boolean)
    .map(String);
  return `${name} respondió ${status}${parts.length ? ': ' + parts.join(' · ').slice(0, 400) : ''}`;
}

/** Solo direcciones https públicas (no la red interna del servidor). */
export function validApiUrl(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  if (!u) return 'Falta la dirección (URL) de la API del proveedor.';
  let parsed: URL;
  try {
    parsed = new URL(u.replace(/\{(id|encf)\}/g, 'x'));
  } catch {
    return 'La dirección de la API no es válida.';
  }
  if (parsed.protocol !== 'https:') return 'La dirección de la API tiene que empezar con https://';
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/i.test(parsed.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname)) {
    return 'La dirección de la API tiene que ser pública.';
  }
  return null;
}

/** Pone el id o el e-NCF en la URL de consulta ("https://api.x.com/ecf/{id}"). */
export function fillUrl(template: string, values: { id?: string | null; encf?: string | null }) {
  return template
    .replace(/\{id\}/g, encodeURIComponent(values.id ?? ''))
    .replace(/\{encf\}/g, encodeURIComponent(values.encf ?? ''));
}
