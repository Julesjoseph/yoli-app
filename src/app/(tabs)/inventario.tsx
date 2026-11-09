import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { foodIcon } from '@/components/brand-icons';
import { Button, Card, Chips, Field, Icon, IconBadge, Label, Pill, ProgressBar, Row, Screen, SectionTitle, Stat } from '@/components/ui';
import { addStock, type StockRow } from '@/db/repo';
import { listStock } from '@/db/repo';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';

type Reason = 'compra' | 'merma' | 'ajuste';

const fmtQty = (n: number) => Number(n.toFixed(2)).toLocaleString('es-DO');

export default function InventoryScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [stock, reload] = useFocusData(() => listStock(db, ctx), [db, ctx]);
  const [editing, setEditing] = useState<StockRow | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<Reason>('compra');
  const [filter, setFilter] = useState<'todos' | 'bajos'>('todos');

  const rows = stock ?? [];
  const low = rows.filter((s) => s.quantity <= s.min_stock);
  const value = rows.reduce((sum, s) => sum + Math.max(s.quantity, 0) * s.cost_per_unit, 0);
  const shown = filter === 'bajos' ? low : rows;

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
    <Screen title="Inventario" subtitle={ctx.locationName}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat icon="package-variant" label="Valor en almacén" value={formatRD(value)} color={t.info} />
        <Stat icon="alert-circle" label="Por agotarse" value={String(low.length)} color={low.length ? t.danger : t.success} />
      </View>

      {editing ? (
        <Card style={{ borderColor: t.primary, borderWidth: 1.5 }}>
          <Row>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <IconBadge name={foodIcon(editing.name)} color={t.primary} />
              <View>
                <Label bold size={17}>{editing.name}</Label>
                <Label muted size={13}>Hay {fmtQty(editing.quantity)} {editing.unit}</Label>
              </View>
            </View>
            <Pressable onPress={() => setEditing(null)} accessibilityLabel="Cerrar" hitSlop={8}>
              <Icon name="close" color={t.textSecondary} />
            </Pressable>
          </Row>
          <Chips
            options={[
              { value: 'compra', label: 'Entrada', icon: 'arrow-down-bold-circle-outline', color: t.success },
              { value: 'merma', label: 'Merma', icon: 'delete-outline', color: t.danger },
              { value: 'ajuste', label: 'Salida', icon: 'arrow-up-bold-circle-outline', color: t.accent },
            ]}
            value={reason}
            onChange={setReason}
          />
          <Field label={`Cantidad (${editing.unit})`} icon="scale-balance" keyboardType="decimal-pad" value={qty} onChangeText={setQty} autoFocus />
          <Button icon="content-save" title="Guardar movimiento" onPress={save} />
        </Card>
      ) : null}

      <SectionTitle icon="format-list-bulleted">Insumos</SectionTitle>
      <Chips
        options={[
          { value: 'todos', label: `Todos (${rows.length})` },
          { value: 'bajos', label: `Por agotarse (${low.length})`, color: t.danger },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {shown.map((s) => {
        const isLow = s.quantity <= s.min_stock;
        const color = isLow ? t.danger : s.quantity <= s.min_stock * 1.5 ? t.accent : t.success;
        return (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityLabel={`Mover inventario de ${s.name}`}
            onPress={() => {
              setEditing(s);
              setReason('compra');
            }}>
            <Card style={{ gap: 12 }}>
              <Row>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <IconBadge name={foodIcon(s.name)} color={color} />
                  <View style={{ flex: 1 }}>
                    <Label bold size={16} numberOfLines={1}>{s.name}</Label>
                    <Label muted size={13}>Mínimo {fmtQty(s.min_stock)} {s.unit}</Label>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Label bold size={17} color={isLow ? t.danger : t.text}>
                    {fmtQty(s.quantity)} <Label muted size={13}>{s.unit}</Label>
                  </Label>
                  {isLow ? <Pill text="REPONER" color={t.danger} /> : null}
                </View>
              </Row>
              <ProgressBar value={s.min_stock > 0 ? s.quantity / (s.min_stock * 3) : 1} color={color} />
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
