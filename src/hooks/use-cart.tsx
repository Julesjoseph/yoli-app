import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { PaymentMethod, Product } from '@/db/repo';
import { computeOrderTotals, type Channel } from '@/lib/calc';

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
  totals: ReturnType<typeof computeOrderTotals>;
  qtyOf(id: string): number;
  add(p: Product, qty?: number): void;
  remove(id: string): void;
  removeAll(id: string): void;
  clear(): void;
  setChannel(c: Channel): void;
  setPayment(p: PaymentMethod): void;
  setExternalRef(s: string): void;
}

const CartContext = createContext<CartState | null>(null);

/** La orden en curso de la caja, compartida entre el menú, el detalle y la pantalla de orden. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Record<string, CartLine>>({});
  const [channel, setChannel] = useState<Channel>('local');
  const [payment, setPayment] = useState<PaymentMethod>('efectivo');
  const [externalRef, setExternalRef] = useState('');

  const lines = Object.values(items);
  const totals = useMemo(
    () =>
      computeOrderTotals(
        lines.map((l) => ({ unitPrice: l.product.price, quantity: l.quantity, itbisRate: l.product.itbis_rate })),
        channel,
      ),
    [lines, channel],
  );

  const value: CartState = {
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    channel,
    payment,
    externalRef,
    totals,
    qtyOf: (id) => items[id]?.quantity ?? 0,
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
    },
    setChannel,
    setPayment,
    setExternalRef,
  };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const c = useContext(CartContext);
  if (!c) throw new Error('useCart fuera de CartProvider');
  return c;
}
