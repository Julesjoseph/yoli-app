/**
 * Facturación electrónica (e-CF) de la DGII, República Dominicana.
 *
 * La app no habla directo con la DGII: usa un proveedor certificado
 * (por ejemplo los listados por la DGII como proveedores de servicios e-CF).
 * Para conectar uno, se crea una clase que implemente EInvoiceProvider
 * y se registra en `getInvoiceProvider()`. El resto de la app no cambia.
 */

export type EcfType =
  | '31' // Factura de Crédito Fiscal Electrónica (cliente con RNC)
  | '32' // Factura de Consumo Electrónica (consumidor final)
  | '34'; // Nota de Crédito Electrónica (anulaciones/devoluciones)

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number; // sin ITBIS
  itbisRate: number;
}

export interface InvoiceRequest {
  orderId: string;
  type: EcfType;
  issuerRnc: string;
  customer?: { rnc: string; name: string };
  lines: InvoiceLine[];
  tipLaw: number;
  issuedAt: Date;
}

export interface InvoiceResult {
  status: 'aceptada' | 'rechazada' | 'enviada';
  encf?: string; // ej. E320000000001
  qrUrl?: string; // código QR de la representación impresa
  securityCode?: string;
  raw?: unknown;
  message?: string;
}

export interface EInvoiceProvider {
  readonly name: string;
  issue(req: InvoiceRequest): Promise<InvoiceResult>;
  cancel?(encf: string, reason: string): Promise<InvoiceResult>;
}

/** Proveedor de prueba mientras no se contrata uno real. No emite nada ante la DGII. */
export class SandboxProvider implements EInvoiceProvider {
  readonly name = 'sandbox';
  private counter = 0;
  async issue(req: InvoiceRequest): Promise<InvoiceResult> {
    this.counter += 1;
    return {
      status: 'enviada',
      encf: `E${req.type}${String(this.counter).padStart(10, '0')}`,
      message: 'Modo prueba: comprobante NO válido ante la DGII',
    };
  }
}

export function getInvoiceProvider(): EInvoiceProvider {
  return new SandboxProvider();
}
