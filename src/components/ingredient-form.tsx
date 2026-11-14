import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Chips, Field, Icon, Label, Row } from '@/components/ui';
import { saveIngredient, type CatalogIngredient } from '@/db/catalog';
import { addStock } from '@/db/repo';
import { useBusiness } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';
import { unitName, UNITS } from '@/lib/units';

const num = (s: string) => Number(s.replace(',', '.'));

/**
 * Formulario sencillo de insumo: nombre, cómo se cuenta (piezas, libras…),
 * cuánto se paga por una compra (la app saca el costo por unidad) y aviso de mínimo.
 */
export function IngredientForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: Partial<CatalogIngredient>;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const isNew = !initial.id;
  const [name, setName] = useState(initial.name ?? '');
  const [unit, setUnit] = useState(initial.unit ?? 'pieza');
  const [buyQty, setBuyQty] = useState('1');
  const [buyPrice, setBuyPrice] = useState(initial.cost_per_unit !== undefined ? String(initial.cost_per_unit) : '');
  const [min, setMin] = useState(initial.min_stock ? String(initial.min_stock) : '');
  const [stock, setStock] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const qtyN = num(buyQty || '0');
  const priceN = num(buyPrice || '0');
  const costPerUnit = qtyN > 0 ? priceN / qtyN : 0;
  const knownUnit = UNITS.some((u) => u.value === unit);

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      if (!(qtyN > 0)) throw new Error('Escribe cuántas compraste (mayor que 0).');
      const id = await saveIngredient(db, ctx, {
        id: initial.id,
        name,
        unit,
        cost_per_unit: Math.round(costPerUnit * 10000) / 10000,
        min_stock: num(min || '0'),
      });
      const s = num(stock || '0');
      if (isNew && s > 0) await addStock(db, ctx, id, s, 'compra');
      onSaved(id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={{ borderColor: t.primary, borderWidth: 1.5, gap: 12 }}>
      <Row>
        <Label bold size={17}>{isNew ? 'Nuevo insumo' : 'Editar insumo'}</Label>
        <Pressable onPress={onCancel} accessibilityLabel="Cerrar" hitSlop={8}>
          <Icon name="close" color={t.textSecondary} />
        </Pressable>
      </Row>
      <Field label="¿Qué es?" icon="basket-outline" value={name} onChangeText={setName} placeholder="Ej. Pollo frito, Plátano, Queso" />

      <Label muted size={13}>¿Cómo lo cuentas?</Label>
      <Chips
        options={[
          ...UNITS.map((u) => ({ value: u.value, label: u.many[0]!.toUpperCase() + u.many.slice(1) })),
          ...(knownUnit ? [] : [{ value: unit, label: unit }]),
        ]}
        value={unit}
        onChange={setUnit}
      />
      {unit === 'pieza' ? (
        <Label muted size={13}>Ideal para piezas de pollo, chuletas, empanadas, panes… Cada venta descuenta las piezas que lleva.</Label>
      ) : null}

      <Label muted size={13}>¿Cuánto te cuesta? (pon una compra normal y la app saca el costo de cada {unitName(unit, 1)})</Label>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label={`Compro (${unitName(unit)})`} keyboardType="decimal-pad" value={buyQty} onChangeText={setBuyQty} placeholder="Ej. 24" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Pago (RD$)" keyboardType="decimal-pad" value={buyPrice} onChangeText={setBuyPrice} placeholder="Ej. 900" />
        </View>
      </View>
      <View style={{ backgroundColor: t.primarySoft, borderRadius: 12, padding: 10 }}>
        <Label size={14} color={t.primary} bold>
          Cada {unitName(unit, 1)} te cuesta {formatRD(costPerUnit)}
        </Label>
      </View>

      <Field
        label={`Avísame cuando queden menos de (${unitName(unit)})`}
        icon="bell-alert-outline"
        keyboardType="decimal-pad"
        value={min}
        onChangeText={setMin}
        placeholder="Ej. 10"
      />
      {isNew ? (
        <Field
          label={`¿Cuántas ${unitName(unit)} tienes ahora? (opcional)`}
          icon="package-variant"
          keyboardType="decimal-pad"
          value={stock}
          onChangeText={setStock}
          placeholder="0"
        />
      ) : null}
      {msg ? <Label color={t.danger} size={14}>{msg}</Label> : null}
      <Button icon="content-save" title={saving ? 'Guardando…' : 'Guardar insumo'} onPress={save} disabled={saving || !name.trim()} />
    </Card>
  );
}
