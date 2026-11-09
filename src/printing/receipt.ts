import type { SQLiteDatabase } from 'expo-sqlite';

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
  const Print = await import('expo-print');
  const [order, settings] = await Promise.all([getTicketOrder(db, orderId), getTicketSettings(db)]);
  if (!order) throw new Error('No se encontró la orden.');
  const html = buildReceiptHtml(order, { ...shop, channelLabel: CHANNEL_LABELS[order.channel] }, settings);
  await Print.printAsync({ html, width: Math.round(((settings.width === '58' ? 58 : 80) / 25.4) * 72) });
}

/** Ticket de prueba para revisar el tamaño y los datos del negocio. */
export async function printTestTicket(shop: { businessName: string; locationName: string }, settings: TicketSettings) {
  const Print = await import('expo-print');
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
  await Print.printAsync({ html, width: Math.round(((settings.width === '58' ? 58 : 80) / 25.4) * 72) });
}
