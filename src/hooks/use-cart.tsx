import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { PaymentMethod, Product } from '@/db/repo';
import { computeOrderTotals, DELIVERY_CHANNELS, itbisFor, priceFor, round2, type Channel } from '@/lib/calc';

export interface Discount {
  kind: 'pct' | 'monto';
  value: number;
}

export interface CartLine {
  product: Product;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  count: number;
  channel: Channel;
  payment: PaymentMethod;
  externalRef: string;
  /** Descuento elegido (solo comedor y para llevar). */
  discount: Discount;
  totals: ReturnType<typeof computeOrderTotals>;
  /** Precio de un producto en el canal actual. */
  priceOf(p: Product): number;
  qtyOf(id: string): number;
  add(p: Product, qty?: number): void;
  remove(id: string): void;
  removeAll(id: string): void;
  clear(): void;
  setChannel(c: Channel): void;
  setPayment(p: PaymentMethod): void;
  setExternalRef(s: string): void;
  setDiscount(d: Discount): void;
  /** Efectivo que entregó el cliente (texto tal como se escribió). */
  cashReceived: string;
  setCashReceived(s: string): void;
}

const CartContext = createContext<CartState | null>(null);

/** La orden en curso de la caja, compartida entre el menú, el detalle y la pantalla de orden. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Record<string, CartLine>>({});
  const [channel, setChannel] = useState<Channel>('local');
  const [payment, setPayment] = useState<PaymentMethod>('efectivo');
  const [externalRef, setExternalRef] = useState('');
  const [discount, setDiscount] = useState<Discount>({ kind: 'pct', value: 0 });
  const [cashReceived, setCashReceived] = useState('');

  const lines = Object.values(items);
  const totals = useMemo(() => {
    const cartLines = lines.map((l) => ({ unitPrice: priceFor(l.product, channel), quantity: l.quantity, itbisRate: itbisFor(l.product, channel) }));
    const full = cartLines.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
    const amount = DELIVERY_CHANNELS.includes(channel)
      ? 0
      : discount.kind === 'pct'
        ? round2((full * Math.min(discount.value, 100)) / 100)
        : discount.value;
    return computeOrderTotals(cartLines, channel, { discount: amount });
  }, [lines, channel, discount]);

  const value: CartState = {
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    channel,
    payment,
    externalRef,
    discount,
    totals,
    priceOf: (p) => priceFor(p, channel),
    // Un combo con acompañantes distintos va en líneas separadas; aquí se suman por producto.
    qtyOf: (id) => lines.reduce((n, l) => n + ((l.product.base_id ?? l.product.id) === id ? l.quantity : 0), 0),
    add: (p, qty = 1) =>
      setItems((c) => ({ ...c, [p.id]: { product: p, quantity: (c[p.id]?.quantity ?? 0) + qty } })),
    remove: (id) =>
      setItems((c) => {
        if (!c[id]) return c;
        const next = { ...c };
        if (next[id].quantity > 1) next[id] = { ...next[id], quantity: next[id].quantity - 1 };
        else delete next[id];
        return next;
      }),
    removeAll: (id) =>
      setItems((c) => {
        const next = { ...c };
        delete next[id];
        return next;
      }),
    clear: () => {
      setItems({});
      setExternalRef('');
      setDiscount({ kind: 'pct', value: 0 });
      setCashReceived('');
    },
    setChannel,
    setPayment,
    setExternalRef,
    setDiscount,
    cashReceived,
    setCashReceived,
  };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const c = useContext(CartContext);
  if (!c) throw new Error('useCart fuera de CartProvider');
  return c;
}
