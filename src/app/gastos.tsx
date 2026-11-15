import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Text } from '@/components/text';

import { EXPENSE_ICONS } from '@/components/brand-icons';
import { Button, Card, Chips, EmptyState, Field, HeroCard, Icon, IconBadge, Label, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { addExpense, listExpenses, localDate, monthExpenses } from '@/db/repo';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD, parseAmount } from '@/lib/calc';

import { EXPENSE_CATEGORIES } from '@/lib/accounting';

const CATEGORIES = EXPENSE_CATEGORIES.map((c) => ({ ...c, icon: EXPENSE_ICONS[c.value] }));
const labelOf = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00`));
const plusDays = (n: number) => localDate(new Date(Date.now() + n * 86_400_000));
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });

export default function ExpensesScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const month = localDate(new Date()).slice(0, 7);
  const [data, reload] = useFocusData(
    async () => ({ list: await listExpenses(db, ctx), month: await monthExpenses(db, ctx, month) }),
    [db, ctx, month],
  );
  const expenses = data?.list;
  const [category, setCategory] = useState('insumos');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [ncf, setNcf] = useState('');
  const [supplier, setSupplier] = useState('');
  const [payment, setPayment] = useState<'pagado' | 'credito'>('pagado');
  const [due, setDue] = useState(plusDays(30));
  const [spentAt, setSpentAt] = useState(localDate(new Date()));
  const [more, setMore] = useState(false);

  async function save() {
    const n = parseAmount(amount);
    if (!Number.isFinite(n) || n <= 0) return Alert.alert('Escribe un monto válido');
    if (!isDate(spentAt) || spentAt > localDate(new Date())) return Alert.alert('Revisa la fecha del gasto (AAAA-MM-DD, no en el futuro).');
    if (payment === 'credito' && !supplier.trim()) return Alert.alert('Escribe a quién se le debe (el proveedor).');
    if (payment === 'credito' && due && !isDate(due)) return Alert.alert('Revisa la fecha en que vence (AAAA-MM-DD).');
    await addExpense(db, ctx, {
      category,
      amount: n,
      description,
      ncf,
      supplierName: supplier,
      spentAt,
      paid: payment === 'pagado',
      dueDate: payment === 'credito' ? due || null : null,
    });
    setAmount('');
    setDescription('');
    setNcf('');
    setSupplier('');
    setPayment('pagado');
    setSpentAt(localDate(new Date()));
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
          {formatRD(data?.month.total ?? 0)}
        </Text>
        {data?.month.pending ? (
          <Text style={{ color: '#FFFFFFD9', fontSize: 14, fontWeight: '600' }}>De eso, {formatRD(data.month.pending)} sin pagar todavía</Text>
        ) : null}
      </HeroCard>

      <Button size="lg" icon="line-scan" title="Escanear factura de compra" onPress={() => router.push('/escanear-factura')} />

      <Card style={{ gap: 14 }}>
        <SectionTitle icon="plus-circle">Nuevo gasto</SectionTitle>
        <Chips options={CATEGORIES} value={category} onChange={setCategory} />
        <Field label="Monto (RD$)" icon="cash" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
        <Field label="Descripción" icon="text" value={description} onChangeText={setDescription} placeholder="Ej. Compra de pollo en el mercado" />
        <Label muted size={12} bold>¿YA SE PAGÓ?</Label>
        <Chips
          options={[
            { value: 'pagado', label: 'Sí, pagado', icon: 'cash-check' },
            { value: 'credito', label: 'No, a crédito (por pagar)', icon: 'clock-outline' },
          ]}
          value={payment}
          onChange={setPayment}
        />
        {payment === 'credito' || more ? (
          <Field label={payment === 'credito' ? 'Proveedor (a quién se le debe)' : 'Proveedor (opcional)'} icon="store-outline" value={supplier} onChangeText={setSupplier} placeholder="Ej. Distribuidora del Cibao" />
        ) : null}
        {payment === 'credito' ? (
          <Field label="Vence (AAAA-MM-DD)" icon="calendar-alert" value={due} onChangeText={setDue} placeholder={plusDays(30)} />
        ) : null}
        {more ? (
          <>
            <Field label="Fecha del gasto (AAAA-MM-DD)" icon="calendar" value={spentAt} onChangeText={setSpentAt} placeholder={localDate(new Date())} />
            <Field label="NCF del proveedor (opcional)" icon="file-document-outline" value={ncf} onChangeText={setNcf} autoCapitalize="characters" placeholder="B0100000001" />
          </>
        ) : (
          <Button variant="ghost" icon="chevron-down" title="Más datos (fecha, NCF, proveedor)" onPress={() => setMore(true)} />
        )}
        <Button icon="content-save" title="Guardar gasto" onPress={save} disabled={!amount} />
      </Card>

      <SectionTitle icon="history">Últimos gastos</SectionTitle>
      <Label muted size={13} style={{ marginTop: -6 }}>Toca un gasto para ver todo lo registrado, pagarlo o anularlo.</Label>
      <Card style={{ gap: 4 }}>
        {(expenses ?? []).length === 0 ? <EmptyState icon="receipt-text-outline" text="Todavía no hay gastos registrados." /> : null}
        {(expenses ?? []).map((e, i) => {
          const voided = !!e.voided;
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={`Ver gasto de ${formatRD(e.amount)}`}
              onPress={() => router.push({ pathname: '/gasto/[id]', params: { id: e.id } })}
              style={({ pressed }) => ({ borderTopWidth: i ? 1 : 0, borderColor: t.border, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
              <Row>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <IconBadge name={EXPENSE_ICONS[e.category] ?? 'cash'} color={voided ? t.textSecondary : t.accent} size={38} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Label bold size={15}>{labelOf(e.category)}</Label>
                      {voided ? <Pill text="ANULADO" color={t.danger} /> : !e.paid ? <Pill text="POR PAGAR" color={t.accent} /> : null}
                    </View>
                    <Label muted size={13} numberOfLines={1}>{e.supplier_name || e.description || 'Sin descripción'}</Label>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Label bold size={15} color={voided ? t.textSecondary : t.danger} style={voided ? { textDecorationLine: 'line-through' } : undefined}>
                    − {formatRD(e.amount)}
                  </Label>
                  <Label muted size={12}>{shortDay(e.spent_at)}</Label>
                </View>
                <Icon name="chevron-right" size={18} color={t.textSecondary} />
              </Row>
            </Pressable>
          );
        })}
      </Card>
    </Screen>
  );
}
