import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button, Field, Icon, IconBadge, Label, Row } from '@/components/ui';
import { creditCloudReady, listCustomers, saveCustomer, type CustomerWithBalance } from '@/db/credit';
import { useBusiness } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD, round2 } from '@/lib/calc';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Elegir (o crear) el cliente de una venta a crédito. */
export function CustomerPicker({ value, onChange, total }: { value: string | null; onChange: (id: string | null) => void; total: number }) {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [customers, setCustomers] = useState<CustomerWithBalance[] | null>(null);
  const [ready, setReady] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const load = () => listCustomers(db, ctx).then(setCustomers);
  useEffect(() => {
    void load();
    void creditCloudReady(ctx).then(setReady);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ctx]);

  if (!ready) {
    return (
      <View style={[styles.box, { backgroundColor: t.dangerSoft }]}>
        <Label bold size={14} color={t.danger}>Falta activar el crédito en la nube</Label>
        <Label size={13}>Hay que correr el archivo 0016_compras_credito.sql en Supabase (SQL Editor). Después vuelve a abrir la app.</Label>
      </View>
    );
  }

  const selected = customers?.find((c) => c.id === value) ?? null;
  if (selected) {
    const after = round2(selected.balance + total);
    const over = selected.credit_limit !== null && after > selected.credit_limit;
    return (
      <View style={[styles.box, { backgroundColor: over ? t.dangerSoft : t.backgroundSelected }]}>
        <Row>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <IconBadge name="account" color={t.primary} size={36} />
            <View style={{ flex: 1 }}>
              <Label bold size={15}>{selected.name}</Label>
              <Label muted size={13}>Debe {formatRD(selected.balance)} · con esta venta {formatRD(after)}</Label>
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => onChange(null)} hitSlop={8}>
            <Label bold size={14} color={t.primary}>Cambiar</Label>
          </Pressable>
        </Row>
        {over ? <Label bold size={13} color={t.danger}>Pasa su límite de crédito de {formatRD(selected.credit_limit ?? 0)}.</Label> : null}
      </View>
    );
  }

  async function create() {
    try {
      const id = await saveCustomer(db, ctx, { name, phone });
      await load();
      onChange(id);
      setCreating(false);
      setName('');
      setPhone('');
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : String(e));
    }
  }

  if (creating) {
    return (
      <View style={{ gap: 10 }}>
        <Field label="Nombre del cliente" icon="account" value={name} onChangeText={setName} placeholder="Ej. Doña Carmen" autoFocus />
        <Field label="Teléfono (para recordarle por WhatsApp)" icon="phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="809-555-1234" />
        <Row style={{ gap: 8 }}>
          <Button variant="secondary" title="Cancelar" onPress={() => setCreating(false)} style={{ flex: 1 }} />
          <Button icon="content-save" title="Guardar" onPress={create} disabled={!name.trim()} style={{ flex: 1 }} />
        </Row>
      </View>
    );
  }

  const q = norm(search.trim());
  const matches = (customers ?? []).filter((c) => !q || norm(`${c.name} ${c.phone ?? ''}`).includes(q)).slice(0, 6);
  return (
    <View style={{ gap: 10 }}>
      <Label bold size={16}>¿A quién se le fía?</Label>
      {(customers?.length ?? 0) > 6 || search ? (
        <Field label="Buscar cliente" icon="magnify" value={search} onChangeText={setSearch} placeholder="Nombre o teléfono" />
      ) : null}
      {matches.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          onPress={() => onChange(c.id)}
          style={[styles.option, { borderColor: t.border }]}>
          <Icon name="account-outline" size={20} color={t.textSecondary} />
          <Label bold size={15} style={{ flex: 1 }}>{c.name}</Label>
          {c.balance > 0 ? <Label size={13} color={t.danger}>Debe {formatRD(c.balance)}</Label> : <Label muted size={13}>Al día</Label>}
        </Pressable>
      ))}
      {customers && !customers.length ? <Label muted size={14}>Todavía no tienes clientes a crédito.</Label> : null}
      <Button variant="secondary" icon="account-plus" title="Cliente nuevo" onPress={() => { setName(search); setCreating(true); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, padding: 12, gap: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
});
