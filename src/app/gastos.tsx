import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { EXPENSE_ICONS } from '@/components/brand-icons';
import { Button, Card, Chips, EmptyState, Field, HeroCard, Icon, IconBadge, Label, Row, Screen, SectionTitle } from '@/components/ui';
import { addExpense, listExpenses, localDate } from '@/db/repo';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
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
].map((c) => ({ ...c, icon: EXPENSE_ICONS[c.value] }));
const labelOf = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

export default function ExpensesScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [expenses, reload] = useFocusData(() => listExpenses(db, ctx), [db, ctx]);
  const [category, setCategory] = useState('insumos');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [ncf, setNcf] = useState('');

  const month = localDate(new Date()).slice(0, 7);
  const monthTotal = (expenses ?? []).filter((e) => e.spent_at.startsWith(month)).reduce((s, e) => s + e.amount, 0);

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
    <Screen back title="Gastos" subtitle={ctx.locationName}>
      <HeroCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="calendar-month" color="#FFFFFF" size={20} />
          <Text style={{ color: '#FFFFFFE6', fontWeight: '700', fontSize: 15 }}>Gastado este mes</Text>
        </View>
        <Text style={{ color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: -1 }} adjustsFontSizeToFit numberOfLines={1}>
          {formatRD(monthTotal)}
        </Text>
      </HeroCard>

      <Card style={{ gap: 14 }}>
        <SectionTitle icon="plus-circle">Nuevo gasto</SectionTitle>
        <Chips options={CATEGORIES} value={category} onChange={setCategory} />
        <Field label="Monto (RD$)" icon="cash" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
        <Field label="Descripción" icon="text" value={description} onChangeText={setDescription} placeholder="Ej. Compra de pollo en el mercado" />
        <Field label="NCF del proveedor (opcional)" icon="file-document-outline" value={ncf} onChangeText={setNcf} autoCapitalize="characters" placeholder="B0100000001" />
        <Button icon="content-save" title="Guardar gasto" onPress={save} disabled={!amount} />
      </Card>

      <SectionTitle icon="history">Últimos gastos</SectionTitle>
      <Card style={{ gap: 4 }}>
        {(expenses ?? []).length === 0 ? <EmptyState icon="receipt-text-outline" text="Todavía no hay gastos registrados." /> : null}
        {(expenses ?? []).map((e, i) => (
          <View key={e.id} style={{ borderTopWidth: i ? 1 : 0, borderColor: t.border, paddingVertical: 10 }}>
            <Row>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <IconBadge name={EXPENSE_ICONS[e.category] ?? 'cash'} color={t.accent} size={38} />
                <View style={{ flex: 1 }}>
                  <Label bold size={15}>{labelOf(e.category)}</Label>
                  <Label muted size={13} numberOfLines={1}>{e.description || e.spent_at}</Label>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Label bold size={15} color={t.danger}>− {formatRD(e.amount)}</Label>
                <Label muted size={12}>{e.spent_at}</Label>
              </View>
            </Row>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
