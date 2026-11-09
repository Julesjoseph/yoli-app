import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Card, Chips, Field, Label, Row, Screen } from '@/components/ui';
import { addStock, listStock, type StockRow } from '@/db/repo';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';

type Reason = 'compra' | 'merma' | 'ajuste';

export default function InventoryScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [stock, reload] = useFocusData(() => listStock(db, ctx), [db, ctx]);
  const [editing, setEditing] = useState<StockRow | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<Reason>('compra');

  const low = (stock ?? []).filter((s) => s.quantity <= s.min_stock);
  const value = (stock ?? []).reduce((sum, s) => sum + Math.max(s.quantity, 0) * s.cost_per_unit, 0);

  async function save() {
    if (!editing) return;
    const n = Number(qty.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return Alert.alert('Cantidad inválida');
    await addStock(db, ctx, editing.id, reason === 'compra' ? n : -n, reason);
    setEditing(null);
    setQty('');
    reload();
  }

  return (
    <Screen title="Inventario">
      <Card>
        <Row><Label muted>Valor del inventario</Label><Label bold>{formatRD(value)}</Label></Row>
        <Row><Label muted>Insumos por agotarse</Label><Label bold color={low.length ? t.danger : t.success}>{low.length}</Label></Row>
      </Card>

      {editing ? (
        <Card>
          <Label bold size={18}>{editing.name}</Label>
          <Chips
            options={[{ value: 'compra', label: 'Entrada (compra)' }, { value: 'merma', label: 'Merma' }, { value: 'ajuste', label: 'Salida (ajuste)' }]}
            value={reason}
            onChange={setReason}
          />
          <Field label={`Cantidad (${editing.unit})`} keyboardType="decimal-pad" value={qty} onChangeText={setQty} autoFocus />
          <Button title="Guardar movimiento" onPress={save} />
          <Button title="Cancelar" variant="secondary" onPress={() => setEditing(null)} />
        </Card>
      ) : null}

      {(stock ?? []).map((s) => {
        const isLow = s.quantity <= s.min_stock;
        return (
          <Card key={s.id}>
            <Row>
              <Label bold>{s.name}</Label>
              <Label bold color={isLow ? t.danger : t.text}>
                {Number(s.quantity.toFixed(2))} {s.unit}
              </Label>
            </Row>
            <Row>
              <Label muted size={14}>Mínimo {s.min_stock} {s.unit}{isLow ? ' · reponer' : ''}</Label>
              <Button title="Mover" variant="secondary" style={{ paddingVertical: 6 }} onPress={() => { setEditing(s); setReason('compra'); }} />
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
