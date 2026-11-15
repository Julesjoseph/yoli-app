import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Card, Chips, EmptyState, Field, HeroCard, Icon, Label, Row, Screen, SectionTitle } from '@/components/ui';
import {
  addLowStockItems,
  addShoppingItem,
  clearBoughtItems,
  deleteShoppingItem,
  listShopping,
  shoppingSpeech,
  toggleShoppingItem,
  type ShoppingItem,
} from '@/db/shopping';
import { listStock } from '@/db/repo';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import {
  cancelReminder,
  describeReminder,
  getReminder,
  getVoiceEnabled,
  parseTime,
  remindersSupported,
  scheduleReminder,
  setVoiceEnabled,
  speak,
  stopSpeaking,
} from '@/lib/reminders';

type When = 'hora' | 'hoy' | 'manana' | 'diario';
const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: 'hora', label: 'En 1 hora' },
  { value: 'hoy', label: 'Hoy' },
  { value: 'manana', label: 'Mañana' },
  { value: 'diario', label: 'Todos los días' },
];
const TIME_OPTIONS = ['7:00 am', '9:00 am', '12:00 pm', '3:00 pm', '6:00 pm'].map((v) => ({ value: v, label: v.replace(':00', '') }));

/** Lista de compras del negocio, con recordatorio y voz. */
export default function ShoppingScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const params = useLocalSearchParams<{ leer?: string }>();
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [when, setWhen] = useState<When>('manana');
  const [time, setTime] = useState('9:00 am');
  const [busy, setBusy] = useState(false);

  const [data, reload] = useFocusData(async () => {
    const [items, stock, reminder, voice] = await Promise.all([listShopping(db, ctx), listStock(db, ctx), getReminder(db), getVoiceEnabled(db)]);
    const names = new Set(items.filter((i) => !i.done).map((i) => i.name.toLowerCase()));
    const low = stock.filter((s) => s.min_stock > 0 && s.quantity <= s.min_stock && !names.has(s.name.toLowerCase())).length;
    return { items, low, reminder, voice };
  }, [db, ctx]);

  const items = data?.items ?? [];
  const pending = items.filter((i) => !i.done);
  const bought = items.filter((i) => i.done);

  // Al abrir desde el aviso: leer la lista.
  useEffect(() => {
    if (params.leer && data) speak(shoppingSpeech(data.items));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.leer, !!data]);
  useEffect(() => () => void stopSpeaking(), []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      reload();
    } catch (e) {
      Alert.alert('No se pudo', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    run(async () => {
      await addShoppingItem(db, ctx, { name, quantity: qty });
      setName('');
      setQty('');
    });

  const addLow = () =>
    run(async () => {
      const n = await addLowStockItems(db, ctx);
      Alert.alert(n ? `✅ Se agregaron ${n}` : 'Nada que agregar', n ? 'Los insumos que se están agotando ya están en la lista.' : 'No hay insumos por agotarse.');
    });

  function reminderDate(): Date | { hour: number; minute: number } | null {
    if (when === 'hora') return new Date(Date.now() + 3600_000);
    const hm = parseTime(time);
    if (!hm) return null;
    if (when === 'diario') return hm;
    const d = new Date();
    if (when === 'manana') d.setDate(d.getDate() + 1);
    d.setHours(hm.hour, hm.minute, 0, 0);
    return d;
  }

  const setReminder = () =>
    run(async () => {
      const at = reminderDate();
      if (!at) throw new Error('Escribe la hora así: 9:00 am o 5:30 pm.');
      const r = await scheduleReminder(db, at instanceof Date ? { kind: 'una_vez', at } : { kind: 'diario', ...at }, pending.length);
      Alert.alert('⏰ Recordatorio listo', describeReminder(r));
    });

  const testReminder = () =>
    run(async () => {
      await scheduleReminder(db, { kind: 'una_vez', at: new Date(Date.now() + 10_000) }, pending.length);
      Alert.alert('Prueba en 10 segundos', 'Puedes salir de la app para ver cómo llega el aviso. Después vuelve a poner tu recordatorio.');
    });

  return (
    <Screen back title="Lista de compras" subtitle={ctx.locationName}>
      <HeroCard>
        <Row>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="cart-variant" color="#FFFFFF" size={20} />
            <Text style={{ color: '#FFFFFFE6', fontWeight: '700', fontSize: 15 }}>Por comprar</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Escuchar la lista"
            onPress={() => speak(shoppingSpeech(items))}
            style={styles.heroBtn}>
            <Icon name="volume-high" color="#FFFFFF" size={18} />
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Escuchar</Text>
          </Pressable>
        </Row>
        <Text style={{ color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: -1 }}>
          {pending.length} {pending.length === 1 ? 'cosa' : 'cosas'}
        </Text>
        {data?.reminder ? (
          <Text style={{ color: '#FFFFFFE6', fontWeight: '700', fontSize: 14 }}>⏰ {describeReminder(data.reminder)}</Text>
        ) : null}
      </HeroCard>

      <Card style={{ gap: 12 }}>
        <SectionTitle icon="plus-circle">Anotar</SectionTitle>
        <Field label="¿Qué hay que comprar?" icon="cart-plus" value={name} onChangeText={setName} placeholder="Ej. Pollo, aceite, servilletas" onSubmitEditing={add} returnKeyType="done" />
        <Field label="Cantidad (opcional)" icon="scale" value={qty} onChangeText={setQty} placeholder="Ej. 20 libras, 2 cajas" onSubmitEditing={add} />
        <Button icon="plus" title="Agregar a la lista" onPress={add} disabled={!name.trim() || busy} />
        {data && data.low > 0 ? (
          <Button
            variant="secondary"
            icon="package-variant"
            title={`Agregar ${data.low} ${data.low === 1 ? 'insumo que se agota' : 'insumos que se agotan'}`}
            onPress={addLow}
            disabled={busy}
          />
        ) : null}
      </Card>

      <SectionTitle icon="format-list-checks">Pendiente</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {data && !pending.length ? <EmptyState icon="cart-check" text="No hay nada pendiente por comprar." /> : null}
        {pending.map((i, k) => (
          <ItemRow key={i.id} item={i} first={k === 0} onToggle={() => run(() => toggleShoppingItem(db, ctx, i))} onDelete={() => run(() => deleteShoppingItem(db, ctx, i))} />
        ))}
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionTitle icon="alarm">Recordatorio</SectionTitle>
        {!remindersSupported ? (
          <Label muted size={14}>Los recordatorios suenan en el celular o la tablet con la app instalada. Aquí en la PC puedes escuchar la lista con el botón Escuchar.</Label>
        ) : (
          <>
            {data?.reminder ? (
              <Row>
                <Label bold size={15} style={{ flex: 1 }}>⏰ {describeReminder(data.reminder)}</Label>
                <Button size="sm" variant="danger" title="Quitar" onPress={() => run(() => cancelReminder(db))} />
              </Row>
            ) : (
              <Label muted size={14}>Te llega un aviso en el celular a la hora que elijas, aunque la app esté cerrada.</Label>
            )}
            <Chips options={WHEN_OPTIONS} value={when} onChange={setWhen} />
            {when !== 'hora' ? (
              <>
                <Chips scroll options={TIME_OPTIONS} value={time} onChange={setTime} />
                <Field label="Hora" icon="clock-outline" value={time} onChangeText={setTime} placeholder="9:00 am" autoCapitalize="none" />
              </>
            ) : null}
            <Button icon="alarm-plus" title={data?.reminder ? 'Cambiar recordatorio' : 'Poner recordatorio'} onPress={setReminder} disabled={busy} />
            <Row>
              <View style={{ flex: 1 }}>
                <Label bold size={15}>Leer la lista en voz alta</Label>
                <Label muted size={13}>Cuando suena con la app abierta, o al tocar el aviso.</Label>
              </View>
              <Switch
                value={data?.voice ?? true}
                onValueChange={(v) => run(() => setVoiceEnabled(db, v))}
                trackColor={{ true: t.primary, false: t.backgroundSelected }}
                thumbColor="#FFFFFF"
              />
            </Row>
            <Button size="sm" variant="ghost" icon="bell-ring-outline" title="Probar el aviso (en 10 segundos)" onPress={testReminder} disabled={busy} />
          </>
        )}
      </Card>

      {bought.length ? (
        <>
          <SectionTitle
            icon="check-all"
            right={
              <Pressable accessibilityRole="button" onPress={() => run(() => clearBoughtItems(db, ctx))} hitSlop={8}>
                <Label bold size={14} color={t.primary}>Quitar comprados</Label>
              </Pressable>
            }>
            {`Ya comprado · ${bought.length}`}
          </SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {bought.map((i, k) => (
              <ItemRow key={i.id} item={i} first={k === 0} onToggle={() => run(() => toggleShoppingItem(db, ctx, i))} onDelete={() => run(() => deleteShoppingItem(db, ctx, i))} />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function ItemRow({ item, first, onToggle, onDelete }: { item: ShoppingItem; first: boolean; onToggle: () => void; onDelete: () => void }) {
  const t = useTheme();
  const done = !!item.done;
  return (
    <View style={[styles.item, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${done ? 'Desmarcar' : 'Marcar comprado'}: ${item.name}`}
        onPress={onToggle}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        <Icon name={done ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={26} color={done ? t.success : t.textSecondary} />
        <View style={{ flex: 1 }}>
          <Label bold size={15} color={done ? t.textSecondary : undefined} style={done ? { textDecorationLine: 'line-through' } : undefined}>
            {item.name}
          </Label>
          {item.quantity || item.note ? (
            <Label muted size={13} numberOfLines={1}>{[item.quantity, item.note].filter(Boolean).join(' · ')}</Label>
          ) : null}
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Borrar ${item.name}`} onPress={onDelete} hitSlop={8}>
        <Icon name="trash-can-outline" size={20} color={t.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF33', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
});
