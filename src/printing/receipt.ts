import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { getSetting, setSettings } from '@/db/database';
import { CHANNEL_LABELS, type Channel } from '@/lib/calc';

import { buildReceiptHtml, type TicketOrder as BaseOrder, type TicketSettings } from './receipt-html';

export { ticketNumber, type TicketSettings } from './receipt-html';
export type TicketOrder = BaseOrder & { channel: Channel };

/**
 * Ticket de venta para impresora térmica (58 mm u 80 mm).
 * Se imprime con el servicio de impresión del teléfono, así funciona con
 * impresoras Wi‑Fi, Bluetooth (con una app de impresión como RawBT) o USB.
 */

export const DEFAULT_TICKET: TicketSettings = {
  rnc: '',
  address: '',
  phone: '',
  footer: '¡Gracias por su compra!',
  width: '80',
  autoPrint: false,
};

export async function getTicketSettings(db: SQLiteDatabase): Promise<TicketSettings> {
  const [rnc, address, phone, footer, width, autoPrint] = await Promise.all(
    ['ticket_rnc', 'ticket_address', 'ticket_phone', 'ticket_footer', 'ticket_width', 'ticket_auto'].map((k) => getSetting(db, k)),
  );
  return {
    rnc: rnc ?? DEFAULT_TICKET.rnc,
    address: address ?? DEFAULT_TICKET.address,
    phone: phone ?? DEFAULT_TICKET.phone,
    footer: footer ?? DEFAULT_TICKET.footer,
    width: width === '58' ? '58' : '80',
    autoPrint: autoPrint === '1',
  };
}

export function saveTicketSettings(db: SQLiteDatabase, s: TicketSettings) {
  return setSettings(db, {
    ticket_rnc: s.rnc.trim(),
    ticket_address: s.address.trim(),
    ticket_phone: s.phone.trim(),
    ticket_footer: s.footer.trim(),
    ticket_width: s.width,
    ticket_auto: s.autoPrint ? '1' : '0',
  });
}

export async function getTicketOrder(db: SQLiteDatabase, orderId: string): Promise<TicketOrder | null> {
  const o = await db.getFirstAsync<Omit<TicketOrder, 'items'>>(
    'SELECT id, channel, external_ref, subtotal, itbis, tip_law, total, payment_method, created_at FROM orders WHERE id = ?',
    [orderId],
  );
  if (!o) return null;
  const items = await db.getAllAsync<BaseOrder['items'][number]>(
    'SELECT name, unit_price, quantity FROM order_items WHERE order_id = ?',
    [orderId],
  );
  return { ...o, items };
}

/** Abre el diálogo de impresión del teléfono con el ticket de la orden. */
export async function printOrderTicket(
  db: SQLiteDatabase,
  orderId: string,
  shop: { businessName: string; locationName: string; cashier?: string },
) {
  const [order, settings] = await Promise.all([getTicketOrder(db, orderId), getTicketSettings(db)]);
  if (!order) throw new Error('No se encontró la orden.');
  const html = buildReceiptHtml(order, { ...shop, channelLabel: CHANNEL_LABELS[order.channel] }, settings);
  await printHtml(html, settings.width);
}

/** Ticket de prueba para revisar el tamaño y los datos del negocio. */
export async function printTestTicket(shop: { businessName: string; locationName: string }, settings: TicketSettings) {
  const html = buildReceiptHtml(
    {
      id: '000000-prueba',
      channel: 'local',
      external_ref: null,
      subtotal: 250,
      itbis: 45,
      tip_law: 25,
      total: 320,
      payment_method: 'efectivo',
      created_at: new Date().toISOString(),
      items: [{ name: 'Producto de prueba', unit_price: 295, quantity: 1 }],
    },
    { ...shop, channelLabel: CHANNEL_LABELS.local },
    settings,
  );
  await printHtml(html, settings.width);
}

/**
 * Imprime solo el ticket. En el navegador de la PC, `expo-print` imprimiría la
 * pantalla completa, así que el ticket se imprime desde un marco oculto.
 */
async function printHtml(html: string, width: TicketSettings['width']) {
  if (Platform.OS !== 'web') {
    const Print = await import('expo-print');
    await Print.printAsync({ html, width: Math.round(((width === '58' ? 58 : 80) / 25.4) * 72) });
    return;
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  const win = frame.contentWindow!;
  // Página del ancho del papel y del largo exacto del ticket (sin hojas en blanco).
  const doc = frame.contentDocument!;
  const heightMm = Math.ceil((doc.documentElement.scrollHeight * 25.4) / 96) + 8;
  const style = doc.createElement('style');
  style.textContent = `@page { size: ${width}mm ${heightMm}mm; margin: 0; }`;
  doc.head.appendChild(style);
  win.focus();
  win.print();
  // Se quita el marco cuando se cierra la ventana de imprimir.
  setTimeout(() => frame.remove(), 60_000);
}
