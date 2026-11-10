import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { Button, Card, Chips, EmptyState, IconBadge, Label, Pill, Row, Screen } from '@/components/ui';
import { useBusinessState, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';
import { supabase } from '@/sync/supabase';

/** Un negocio cliente de YOLI, como lo devuelve admin_businesses() (migración 0008). */
interface Client {
  id: string;
  name: string;
  kind: string;
  phone: string | null;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  status: string;
  access: 'activo' | 'prueba' | 'vencido' | 'suspendido';
  trial_ends_at: string | null;
  paid_until: string | null;
  locations: number;
  users: number;
  orders_30d: number;
  sales_30d: number;
  last_sale: string | null;
}

const KINDS: Record<string, string> = {
  comida_rapida: 'Comida rápida',
  comedor: 'Comedor',
  cafeteria: 'Cafetería',
  mixto: 'Mixto',
};

type Filter = 'todos' | 'prueba' | 'activo' | 'vencido';

const day = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const plusMonths = (from: string | null, months: number) => {
  const today = new Date();
  const base = from && new Date(`${from}T12:00:00`) > today ? new Date(`${from}T12:00:00`) : today;
  base.setMonth(base.getMonth() + months);
  return base.toISOString().slice(0, 10);
};

function confirm(title: string, message: string, onOk: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Sí', onPress: onOk },
  ]);
}

/** Panel del dueño de YOLI: clientes, suscripciones y actividad. */
export default function AdminScreen() {
  const { isAdmin } = useBusinessState();
  const t = useTheme();
  const [filter, setFilter] = useState<Filter>('todos');
  const [msg, setMsg] = useState('');
  const [data, reload] = useFocusData(async () => {
    if (!supabase) return { clients: [] as Client[], error: 'Sin nube' };
    const { data, error } = await supabase.rpc('admin_businesses');
    return { clients: (data ?? []) as Client[], error: error?.message ?? '' };
  }, []);

  if (!isAdmin) {
    return (
      <Screen back title="Clientes de YOLI">
        <EmptyState icon="lock-outline" text="Solo el administrador de YOLI puede ver esta pantalla." />
      </Screen>
    );
  }

  const clients = data?.clients ?? [];
  const count = (a: Client['access'] | 'vencido') =>
    clients.filter((c) => (a === 'vencido' ? c.access === 'vencido' || c.access === 'suspendido' : c.access === a)).length;
  const shown = clients.filter((c) =>
    filter === 'todos' ? true : filter === 'vencido' ? c.access === 'vencido' || c.access === 'suspendido' : c.access === filter,
  );

  async function setSub(c: Client, status: 'activo' | 'suspendido' | 'prueba', paidUntil: string | null, label: string) {
    if (!supabase) return;
    const { error } = await supabase.rpc('admin_set_subscription', {
      p_business: c.id,
      p_status: status,
      p_paid_until: paidUntil,
      p_note: null,
    });
    setMsg(error ? `No se pudo: ${error.message}` : `${c.name}: ${label}.`);
    reload();
  }

  const accessPill = (c: Client) => {
    switch (c.access) {
      case 'activo':
        return <Pill text={c.paid_until ? `ACTIVO HASTA ${day(c.paid_until).toUpperCase()}` : 'ACTIVO'} color={t.success} />;
      case 'prueba':
        return <Pill text={`PRUEBA HASTA ${day(c.trial_ends_at).toUpperCase()}`} color={t.info} />;
      case 'suspendido':
        return <Pill text="SUSPENDIDO" color={t.danger} />;
      default:
        return <Pill text="VENCIDO" color={t.danger} />;
    }
  };

  return (
    <Screen back title="Clientes de YOLI" subtitle="Suscripciones y actividad de cada negocio">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[
          { label: 'Clientes', value: clients.length, color: t.primary, icon: 'storefront-outline' as const },
          { label: 'Activos', value: count('activo'), color: t.success, icon: 'check-decagram' as const },
          { label: 'En prueba', value: count('prueba'), color: t.info, icon: 'timer-sand' as const },
          { label: 'Vencidos', value: count('vencido'), color: t.danger, icon: 'alert-circle-outline' as const },
        ].map((k) => (
          <Card key={k.label} style={{ flexGrow: 1, flexBasis: 150, gap: 6 }}>
            <IconBadge name={k.icon} color={k.color} size={36} />
            <Label bold size={26}>{String(k.value)}</Label>
            <Label muted size={13}>{k.label}</Label>
          </Card>
        ))}
      </View>

      <Chips
        options={[
          { value: 'todos', label: 'Todos' },
          { value: 'prueba', label: 'En prueba' },
          { value: 'activo', label: 'Activos' },
          { value: 'vencido', label: 'Vencidos' },
        ]}
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
      />
      {msg ? <Label size={14} color={t.success}>{msg}</Label> : null}
      {data?.error ? (
        <Card>
          <Label color={t.danger}>No se pudo cargar la lista: {data.error}</Label>
          <Label muted size={13}>¿Ya corriste la migración 0008 en Supabase?</Label>
        </Card>
      ) : null}
      {data && !data.error && shown.length === 0 ? <EmptyState icon="storefront-outline" text="No hay clientes en este grupo." /> : null}

      {shown.map((c) => (
        <Card key={c.id} style={{ gap: 10 }}>
          <Row>
            <View style={{ flex: 1, gap: 2 }}>
              <Label bold size={17}>{c.name}</Label>
              <Label muted size={13}>
                {KINDS[c.kind] ?? c.kind} · cliente desde {day(c.created_at)}
              </Label>
            </View>
            {accessPill(c)}
          </Row>
          <Label size={14}>
            {c.owner_name ?? 'Dueño'} · {c.owner_email ?? 'sin correo'}
            {c.phone ? ` · ${c.phone}` : ''}
          </Label>
          <Label muted size={13}>
            {c.locations} {c.locations === 1 ? 'local' : 'locales'} · {c.users} {c.users === 1 ? 'usuario' : 'usuarios'} · 30 días:{' '}
            {c.orders_30d} ventas, {formatRD(Number(c.sales_30d))} · última venta {day(c.last_sale)}
          </Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button
              size="sm"
              icon="calendar-plus"
              title="+1 mes"
              onPress={() => confirm('Activar 1 mes', `¿${c.name} pagó un mes?`, () => setSub(c, 'activo', plusMonths(c.paid_until, 1), 'activo 1 mes más'))}
            />
            <Button
              size="sm"
              variant="secondary"
              icon="calendar-star"
              title="+1 año"
              onPress={() => confirm('Activar 1 año', `¿${c.name} pagó un año?`, () => setSub(c, 'activo', plusMonths(c.paid_until, 12), 'activo 1 año más'))}
            />
            {c.access === 'suspendido' ? (
              <Button size="sm" variant="secondary" icon="play" title="Reactivar" onPress={() => setSub(c, 'activo', c.paid_until, 'reactivado')} />
            ) : (
              <Button
                size="sm"
                variant="danger"
                icon="pause"
                title="Suspender"
                onPress={() => confirm('Suspender', `¿Suspender a ${c.name}? No podrá registrar ventas hasta reactivarlo.`, () => setSub(c, 'suspendido', c.paid_until, 'suspendido'))}
              />
            )}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
