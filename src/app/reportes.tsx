import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';

import { Button, Card, Chips, Label, Row, Screen } from '@/components/ui';
import { getReport, pendingSyncCount, type Period } from '@/db/repo';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { CHANNEL_LABELS, formatRD, type Channel } from '@/lib/calc';
import { pushOutbox } from '@/sync/sync';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mes' },
];

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [period, setPeriod] = useState<Period>('hoy');
  const [data, reload] = useFocusData(
    async () => ({ ...(await getReport(db, ctx, period)), pending: await pendingSyncCount(db) }),
    [db, ctx, period],
  );
  const [syncMsg, setSyncMsg] = useState('');

  async function sync() {
    const r = await pushOutbox(db);
    setSyncMsg(
      r.offlineMode
        ? 'Modo demo: configura Supabase para respaldar en la nube.'
        : r.error
          ? `Sin conexión o error: ${r.error}. Se reintentará.`
          : `Subidos ${r.pushed} cambios.`,
    );
    reload();
  }

  const r = data?.report;
  return (
    <Screen title="Reportes">
      <Chips options={PERIODS} value={period} onChange={setPeriod} />
      {r ? (
        <>
          <Card>
            <Row><Label muted>Ventas ({r.orders} órdenes)</Label><Label bold>{formatRD(r.gross)}</Label></Row>
            <Row><Label muted>Comisiones de plataformas</Label><Label color={t.danger}>− {formatRD(r.commissions)}</Label></Row>
            <Row><Label muted>ITBIS a pagar a la DGII</Label><Label color={t.danger}>− {formatRD(r.itbis)}</Label></Row>
            <Row><Label muted>Gastos</Label><Label color={t.danger}>− {formatRD(r.expenses)}</Label></Row>
            <Row>
              <Label bold size={20}>Ganancia</Label>
              <Label bold size={20} color={r.profit >= 0 ? t.success : t.danger}>{formatRD(r.profit)}</Label>
            </Row>
          </Card>

          <Label bold size={18}>Por canal</Label>
          {(Object.keys(r.byChannel) as Channel[]).map((c) => {
            const s = r.byChannel[c];
            return (
              <Card key={c}>
                <Row><Label bold>{CHANNEL_LABELS[c]}</Label><Label muted>{s.orders} órdenes</Label></Row>
                <Row><Label muted>Vendido</Label><Label>{formatRD(s.gross)}</Label></Row>
                {s.commission > 0 ? <Row><Label muted>Comisión</Label><Label color={t.danger}>− {formatRD(s.commission)}</Label></Row> : null}
                <Row><Label muted>Neto</Label><Label bold>{formatRD(s.net)}</Label></Row>
              </Card>
            );
          })}

          <Label bold size={18}>Más vendidos</Label>
          {data.topProducts.length === 0 ? <Label muted>Sin ventas en este periodo.</Label> : null}
          {data.topProducts.map((p) => (
            <Row key={p.name}><Label>{p.qty} × {p.name}</Label><Label muted>{formatRD(p.amount)}</Label></Row>
          ))}

          <Card>
            <Row><Label muted>Cambios pendientes de respaldar</Label><Label bold>{data.pending}</Label></Row>
            <Button title="Sincronizar ahora" variant="secondary" onPress={sync} />
            {syncMsg ? <Label muted size={14}>{syncMsg}</Label> : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
