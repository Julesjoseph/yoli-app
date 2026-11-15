import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Card, Chips, EmptyState, Icon, IconBadge, Label, Pill, Row, Screen } from '@/components/ui';
import { listAudit } from '@/db/accounting';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { formatRD } from '@/lib/calc';

type Filter = 'todo' | 'venta' | 'gasto';
const when = (iso: string) => new Date(iso).toLocaleString('es-DO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Auditoría: ventas y gastos anulados (no se borran) y cuentas por pagar que se pagaron. */
export default function AuditScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [filter, setFilter] = useState<Filter>('todo');
  const [data] = useFocusData(() => listAudit(db, ctx), [db, ctx]);
  const items = (data?.items ?? []).filter((i) => filter === 'todo' || i.kind === filter);

  return (
    <Screen back title="Auditoría" subtitle={data?.source === 'equipo' ? 'Datos de este equipo' : 'Todos los locales'}>
      <Label muted size={13}>
        Aquí queda todo lo que se anuló: qué era, cuánto, el motivo, cuándo y quién lo hizo. Nada de esto se puede borrar.
      </Label>
      <Chips
        options={[
          { value: 'todo', label: 'Todo' },
          { value: 'venta', label: 'Ventas' },
          { value: 'gasto', label: 'Gastos' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {!data ? <ActivityIndicator color={t.primary} style={{ marginTop: 30 }} /> : null}
      {data && !items.length ? <EmptyState icon="shield-check-outline" text="No hay nada anulado." /> : null}
      {items.length ? (
        <Card style={{ gap: 0 }}>
          {items.map((a, i) => (
            <Pressable
              key={a.key}
              accessibilityRole="button"
              onPress={() =>
                a.kind === 'venta'
                  ? router.push({ pathname: '/venta/[id]', params: { id: a.id } })
                  : router.push({ pathname: '/gasto/[id]', params: { id: a.id } })
              }
              style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
              <IconBadge
                name={a.action === 'pagar' ? 'cash-check' : a.kind === 'venta' ? 'receipt-text-remove-outline' : 'cancel'}
                color={a.action === 'pagar' ? t.success : t.danger}
                size={36}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Row style={{ justifyContent: 'flex-start', gap: 6 }}>
                  <Label bold size={14}>{a.action === 'pagar' ? 'Cuenta por pagar pagada' : a.kind === 'venta' ? 'Venta anulada' : 'Gasto anulado'}</Label>
                </Row>
                {a.reason ? <Label size={13}>Motivo: {a.reason}</Label> : null}
                {a.detail ? <Label muted size={12} numberOfLines={2}>{a.detail}</Label> : null}
                <Label muted size={12}>{when(a.at)}{a.who ? ` · ${a.who}` : ''}</Label>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Label bold size={14}>{formatRD(a.amount)}</Label>
                {a.action === 'anular' ? <Pill text="ANULADO" color={t.danger} /> : null}
              </View>
              <Icon name="chevron-right" size={18} color={t.textSecondary} />
            </Pressable>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
});
