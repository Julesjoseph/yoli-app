import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Card, Chips, Field, Label, Row, Screen } from '@/components/ui';
import { addExpense, listExpenses } from '@/db/repo';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { formatRD } from '@/lib/calc';

const CATEGORIES = [
  { value: 'insumos', label: 'Insumos' },
  { value: 'nomina', label: 'Nómina' },
  { value: 'alquiler', label: 'Alquiler' },
  { value: 'servicios', label: 'Luz/agua/internet' },
  { value: 'gas', label: 'Gas' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'marketing', label: 'Publicidad' },
  { value: 'impuestos', label: 'Impuestos' },
  { value: 'otros', label: 'Otros' },
];
const labelOf = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

export default function ExpensesScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const [expenses, reload] = useFocusData(() => listExpenses(db, ctx), [db, ctx]);
  const [category, setCategory] = useState('insumos');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [ncf, setNcf] = useState('');

  async function save() {
    const n = Number(amount.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return Alert.alert('Escribe un monto válido');
    await addExpense(db, ctx, { category, amount: n, description, ncf });
    setAmount('');
    setDescription('');
    setNcf('');
    reload();
  }

  return (
    <Screen title="Gastos">
      <Card>
        <Label bold size={18}>Nuevo gasto</Label>
        <Chips options={CATEGORIES} value={category} onChange={setCategory} />
        <Field label="Monto (RD$)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
        <Field label="Descripción" value={description} onChangeText={setDescription} placeholder="Ej. Compra de pollo en el mercado" />
        <Field label="NCF del proveedor (opcional)" value={ncf} onChangeText={setNcf} autoCapitalize="characters" placeholder="B0100000001" />
        <Button title="Guardar gasto" onPress={save} />
      </Card>

      <Label bold size={18}>Últimos gastos</Label>
      {(expenses ?? []).length === 0 ? <Label muted>Todavía no hay gastos registrados.</Label> : null}
      {(expenses ?? []).map((e) => (
        <Card key={e.id}>
          <Row><Label bold>{labelOf(e.category)}</Label><Label bold>{formatRD(e.amount)}</Label></Row>
          <Row><Label muted size={14}>{e.description ?? ''}</Label><Label muted size={14}>{e.spent_at}</Label></Row>
        </Card>
      ))}
    </Screen>
  );
}
