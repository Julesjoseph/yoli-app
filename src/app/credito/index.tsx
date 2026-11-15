import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Card, EmptyState, Field, HeroCard, Icon, IconBadge, Label, Row, Screen, SectionTitle } from '@/components/ui';
import { creditCloudReady, creditSummary, listCustomers, saveCustomer } from '@/db/credit';
import { localDate } from '@/db/repo';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ventas a crédito: quién debe, cuánto, y cobrar abonos. */
export default function CreditScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [limit, setLimit] = useState('');

  const [data, reload] = useFocusData(async () => {
    const startOfToday = new Date(`${localDate(new Date())}T00:00:00`).toISOString();
    const [customers, summary, ready] = await Promise.all([listCustomers(db, ctx), creditSummary(db, ctx, startOfToday), creditCloudReady(ctx)]);
    return { customers, summary, ready };
  }, [db, ctx]);

  async function create() {
    try {
      const id = await saveCustomer(db, ctx, { name, phone, creditLimit: Number(limit.replace(/,/g, '')) || null });
      setCreating(false);
      setName('');
      setPhone('');
      setLimit('');
      reload();
      router.push({ pathname: '/credito/[id]', params: { id } });
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : String(e));
    }
  }

  const q = norm(search.trim());
  const list = (data?.customers ?? []).filter((c) => !q || norm(`${c.name} ${c.phone ?? ''}`).includes(q));
  const s = data?.summary;

  return (
    <Screen back title="Ventas a crédito" subtitle={ctx.businessName}>
      <HeroCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="account-cash" color="#FFFFFF" size={20} />
          <Text style={{ color: '#FFFFFFE6', fontWeight: '700', fontSize: 15 }}>Te deben</Text>
        </View>
        <Text style={{ color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: -1 }} adjustsFontSizeToFit numberOfLines={1}>
          {formatRD(s?.receivable ?? 0)}
        </Text>
        <Text style={{ color: '#FFFFFFE6', fontWeight: '700', fontSize: 14 }}>
          {s?.owingCount ?? 0} {s?.owingCount === 1 ? 'cliente debe' : 'clientes deben'} · Cobrado hoy {formatRD(s?.paidToday ?? 0)}
        </Text>
      </HeroCard>

      {data && !data.ready ? (
        <Card style={{ gap: 6, borderColor: t.danger, borderWidth: 1 }}>
          <Label bold size={15} color={t.danger}>Falta activar el crédito en la nube</Label>
          <Label size={14}>Corre el archivo 0016_compras_credito.sql en Supabase (SQL Editor) y vuelve a abrir la app.</Label>
        </Card>
      ) : null}

      <Card style={{ gap: 12 }}>
        <Row>
          <Label muted size={14} style={{ flex: 1 }}>Para fiar, en la Caja elige la forma de pago «A crédito» y el cliente.</Label>
        </Row>
        {creating ? (
          <>
            <Field label="Nombre del cliente" icon="account" value={name} onChangeText={setName} placeholder="Ej. Doña Carmen" autoFocus />
            <Field label="Teléfono (WhatsApp)" icon="phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="809-555-1234" />
            <Field label="Límite de crédito RD$ (opcional)" icon="shield-check-outline" keyboardType="decimal-pad" value={limit} onChangeText={setLimit} placeholder="Sin límite" />
            <Row style={{ gap: 8 }}>
              <Button variant="secondary" title="Cancelar" onPress={() => setCreating(false)} style={{ flex: 1 }} />
              <Button icon="content-save" title="Guardar" onPress={create} disabled={!name.trim() || data?.ready === false} style={{ flex: 1 }} />
            </Row>
          </>
        ) : (
          <Button icon="account-plus" title="Cliente nuevo" onPress={() => setCreating(true)} disabled={data?.ready === false} />
        )}
      </Card>

      <SectionTitle icon="account-group">Clientes</SectionTitle>
      {(data?.customers.length ?? 0) > 5 ? (
        <Field label="Buscar" icon="magnify" value={search} onChangeText={setSearch} placeholder="Nombre o teléfono" />
      ) : null}
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {data && !list.length ? (
          <EmptyState icon="account-clock-outline" text={q ? 'Ningún cliente con ese nombre.' : 'Todavía no hay clientes a crédito.'} />
        ) : null}
        {list.map((c, i) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={`${c.name}, debe ${formatRD(c.balance)}`}
            onPress={() => router.push({ pathname: '/credito/[id]', params: { id: c.id } })}
            style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
            <IconBadge name="account" color={c.balance > 0 ? t.danger : t.success} size={38} />
            <View style={{ flex: 1 }}>
              <Label bold size={15}>{c.name}</Label>
              <Label muted size={13} numberOfLines={1}>
                {[c.phone, c.last_at ? `Último movimiento ${new Date(c.last_at).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}` : null]
                  .filter(Boolean)
                  .join(' · ') || 'Sin movimientos'}
              </Label>
            </View>
            {c.balance > 0 ? (
              <Label bold size={15} color={t.danger}>{formatRD(c.balance)}</Label>
            ) : (
              <Label bold size={13} color={t.success}>Al día</Label>
            )}
            <Icon name="chevron-right" size={18} color={t.textSecondary} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
});
