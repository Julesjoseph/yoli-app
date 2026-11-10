// Conector de Alanube (proveedor de factura electrónica autorizado por la DGII).
// Documentación: https://developer.alanube.co/reference (API República Dominicana, /dom/v1).
// Sin dependencias: se usa en la función del servidor y en las pruebas.

export const ALANUBE_URL = {
  prueba: 'https://sandbox.alanube.co/dom/v1',
  produccion: 'https://api.alanube.co/dom/v1',
} as const;

/** Ruta de cada tipo de e-CF en Alanube. */
export const ALANUBE_PATH: Record<string, string> = {
  '31': 'fiscal-invoices',
  '32': 'invoices',
};

export interface EcfLine {
  description: string;
  quantity: number;
  unitPrice: number; // con ITBIS incluido, como se cobró
  itbisRate: number; // 0.18, 0.16 o 0
}

export interface EcfInput {
  type: '31' | '32';
  encf: string;
  sequenceDue?: string | null; // AAAA-MM-DD
  issuer: { rnc: string; legalName: string; tradeName: string; address: string; phone?: string; email?: string };
  customer?: { rnc: string; name: string };
  lines: EcfLine[];
  discount: number; // descuento de la orden (con ITBIS)
  tipLaw: number; // 10% de ley (va como línea exenta)
  paymentMethod: string; // efectivo, tarjeta, transferencia, plataforma
  issuedOn: string; // AAAA-MM-DD
  companyId?: string | null; // compañía asociada en Alanube
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Formas de pago de la DGII: 1 efectivo, 2 cheque/transferencia, 3 tarjeta, 8 otras.
const PAYMENT: Record<string, number> = { efectivo: 1, transferencia: 2, tarjeta: 3, plataforma: 8 };

function indicator(rate: number) {
  if (Math.abs(rate - 0.18) < 1e-6) return 1;
  if (Math.abs(rate - 0.16) < 1e-6) return 2;
  return 4; // exento
}

/** Arma el cuerpo que espera Alanube para emitir el e-CF. Montos sin ITBIS por línea. */
export function buildAlanubePayload(i: EcfInput) {
  const gross = i.lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
  const factor = gross > 0 ? Math.max(0, gross - i.discount) / gross : 1;

  const itemDetails: Record<string, unknown>[] = i.lines.map((l, k) => {
    const ind = indicator(l.itbisRate);
    const unit = r2(ind === 4 ? l.unitPrice : l.unitPrice / (1 + l.itbisRate));
    const base = r2(unit * l.quantity);
    const discount = r2(base * (1 - factor));
    return {
      lineNumber: k + 1,
      billingIndicator: ind,
      itemName: l.description.slice(0, 80),
      goodServiceIndicator: 1,
      quantityItem: l.quantity,
      unitPriceItem: unit,
      ...(discount > 0 ? { discountAmount: discount } : {}),
      itemAmount: r2(base - discount),
    };
  });
  if (i.tipLaw > 0) {
    itemDetails.push({
      lineNumber: itemDetails.length + 1,
      billingIndicator: 4,
      itemName: 'Propina legal (10%)',
      goodServiceIndicator: 2,
      quantityItem: 1,
      unitPriceItem: r2(i.tipLaw),
      itemAmount: r2(i.tipLaw),
    });
  }

  const sum = (ind: number) => r2(itemDetails.filter((d) => d.billingIndicator === ind).reduce((n, d) => n + (d.itemAmount as number), 0));
  const i1 = sum(1);
  const i2 = sum(2);
  const exempt = sum(4);
  const itbis1 = r2(i1 * 0.18);
  const itbis2 = r2(i2 * 0.16);
  const totalAmount = r2(i1 + i2 + exempt + itbis1 + itbis2);

  const totals: Record<string, number> = { totalAmount };
  if (i1 || i2) {
    totals.totalTaxedAmount = r2(i1 + i2);
    totals.itbisTotal = r2(itbis1 + itbis2);
  }
  if (i1) Object.assign(totals, { i1AmountTaxed: i1, itbisS1: 18, itbis1Total: itbis1 });
  if (i2) Object.assign(totals, { i2AmountTaxed: i2, itbisS2: 16, itbis2Total: itbis2 });
  if (exempt) totals.exemptAmount = exempt;

  const phone = (i.issuer.phone ?? '').replace(/\D/g, '');
  return {
    ...(i.companyId ? { company: { id: i.companyId } } : {}),
    idDoc: {
      encf: i.encf,
      ...(i.type === '31' && i.sequenceDue ? { sequenceDueDate: i.sequenceDue } : {}),
      taxAmountIndicator: 0,
      paymentType: 1,
      incomeType: 1,
      paymentFormsTable: [{ paymentMethod: PAYMENT[i.paymentMethod] ?? 8, paymentAmount: totalAmount }],
    },
    sender: {
      rnc: i.issuer.rnc,
      companyName: i.issuer.legalName.slice(0, 150),
      ...(i.issuer.tradeName && i.issuer.tradeName !== i.issuer.legalName ? { tradename: i.issuer.tradeName.slice(0, 150) } : {}),
      address: i.issuer.address.slice(0, 100),
      ...(phone.length === 10 ? { phoneNumber: [`${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`] } : {}),
      ...(i.issuer.email ? { mail: i.issuer.email.slice(0, 80) } : {}),
      stampDate: i.issuedOn,
    },
    ...(i.customer ? { buyer: { rnc: i.customer.rnc, companyName: i.customer.name.slice(0, 150) } } : {}),
    totals,
    itemDetails,
  };
}

export interface AlanubeResult {
  status: 'enviada' | 'aceptada' | 'rechazada';
  providerId?: string;
  encf?: string;
  securityCode?: string;
  qrUrl?: string;
  message?: string;
}

/** Lee la respuesta de Alanube (se guarda completa aparte por si cambia algún nombre). */
export function readAlanubeResponse(j: Record<string, any>): AlanubeResult {
  const state = String(j.legalStatus ?? j.status ?? '').toUpperCase();
  const status = /RECHAZ|REJECT|ERROR|FAIL/.test(state)
    ? 'rechazada'
    : /ACEPT|ACCEPT|APROB|APPROV|REGISTER/.test(state)
      ? 'aceptada'
      : 'enviada';
  const msgs = Array.isArray(j.response) ? j.response.map((m: any) => m?.message ?? m?.description ?? m?.code).filter(Boolean) : [];
  return {
    status,
    providerId: j.id ?? undefined,
    encf: j.encf ?? j.idDoc?.encf ?? undefined,
    securityCode: j.securityCode ?? j.security_code ?? undefined,
    qrUrl: j.documentStampUrl ?? j.stampUrl ?? j.qrUrl ?? undefined,
    message: [state && `Estado: ${state}`, ...msgs].filter(Boolean).join(' · ') || undefined,
  };
}

/** Mensaje claro de un error de Alanube. */
export function alanubeError(status: number, j: any): string {
  if (status === 401 || status === 403) return 'Alanube no aceptó la llave. Revisa el token y el ambiente (pruebas o producción).';
  const parts = [j?.message, j?.error?.message, ...(Array.isArray(j?.errors) ? j.errors.map((e: any) => e?.message ?? JSON.stringify(e)) : [])]
    .filter(Boolean)
    .map(String);
  return `Alanube respondió ${status}${parts.length ? ': ' + parts.join(' · ') : ''}`;
}
