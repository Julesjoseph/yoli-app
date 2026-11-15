import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EXPENSE_ICONS } from '@/components/brand-icons';
import { Button, Card, Divider, EmptyState, Icon, IconBadge, Label, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { VoidBox } from '@/components/void-box';
import { getExpense, markExpensePaid, removeInvoiceLine, voidExpense, type InvoiceStockLine } from '@/db/accounting';
import { confirmAction } from '@/lib/confirm';
import { canManage, useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { categoryLabel } from '@/lib/accounting';
import { formatRD } from '@/lib/calc';

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleString('es-DO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Detalle de un gasto: lo que se registró, su historial, pagarlo (si es a crédito) o anularlo. */
export default function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [e, reload] = useFocusData(() => getExpense(db, ctx, id), [db, ctx, id]);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const manager = canManage(ctx);

  function removeLine(line: InvoiceStockLine) {
    confirmAction(
      `¿Quitar "${line.name}" del inventario?`,
      `Sale lo que entró con esta factura (${Math.round((line.bought - line.removed) * 100) / 100} ${line.unit}). El gasto no cambia.`,
      'Quitar',
      async () => {
        setBusy(true);
        setMsg(null);
        try {
          await removeInvoiceLine(db, ctx, id, line);
          setMsg({ text: `Listo: ${line.name} salió del inventario.`, ok: true });
          reload();
        } catch (err) {
          setMsg({ text: err instanceof Error ? err.message : String(err) });
        }
        setBusy(false);
      },
    );
  }

  if (e === null) {
    return (
      <Screen back title="Gasto">
        <EmptyState icon="receipt-text-remove-outline" text="No se encontró este gasto en el equipo." />
      </Screen>
    );
  }
  if (!e) return <Screen back title="Gasto">{null}</Screen>;

  const voided = !!e.voided;
  const pending = !e.paid && !voided;
  const history: { icon: Parameters<typeof Icon>[0]['name']; color: string; title: string; text?: string }[] = [
    { icon: 'plus-circle-outline', color: t.info, title: 'Registrado', text: when(e.created_at) },
    ...(e.stock.length ? [{ icon: 'package-variant-closed' as const, color: t.success, title: 'Entró al inventario', text: `${e.stock.length} producto${e.stock.length === 1 ? '' : 's'}` }] : []),
    ...(e.paid && e.paid_at ? [{ icon: 'cash-check' as const, color: t.success, title: 'Pagado', text: when(e.paid_at) }] : []),
    ...(voided ? [{ icon: 'cancel' as const, color: t.danger, title: 'Anulado', text: `${e.voided_at ? when(e.voided_at) : ''}${e.void_reason ? ` · ${e.void_reason}` : ''}` }] : []),
  ];

  return (
    <Screen back title={categoryLabel(e.category)} subtitle={day(e.spent_at)}>
      {voided ? (
        <Card style={{ gap: 6, backgroundColor: t.dangerSoft }}>
          <Row style={{ justifyContent: 'flex-start', gap: 8 }}>
            <Icon name="cancel" color={t.danger} size={20} />
            <Label bold size={16} color={t.danger}>Gasto anulado</Label>
          </Row>
          <Label size={14} color={t.danger}>Motivo: {e.void_reason || '—'}</Label>
          <Label muted size={13}>No cuenta en los gastos ni en la contabilidad. Queda en la auditoría.</Label>
        </Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'flex-start', gap: 12 }}>
          <IconBadge name={EXPENSE_ICONS[e.category] ?? 'cash'} color={voided ? t.textSecondary : t.accent} size={44} />
          <View style={{ flex: 1 }}>
            <Label bold size={16} numberOfLines={2}>{e.supplier_name || e.description || categoryLabel(e.category)}</Label>
            {e.supplier_name && e.description ? <Label muted size={13} numberOfLines={2}>{e.description}</Label> : null}
          </View>
          <Label bold size={20} color={voided ? t.textSecondary : t.danger} style={voided ? { textDecorationLine: 'line-through' } : undefined}>
            {formatRD(e.amount)}
          </Label>
        </Row>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {voided ? <Pill text="ANULADO" color={t.danger} /> : pending ? <Pill text="POR PAGAR" color={t.accent} /> : <Pill text="PAGADO" color={t.success} />}
          {!e.synced && !ctx.demo ? <Pill text="SIN SUBIR A LA NUBE" color={t.info} /> : null}
        </View>
        <Divider />
        <Info label="Categoría" value={categoryLabel(e.category)} />
        <Info label="Fecha del gasto" value={day(e.spent_at)} />
        {e.supplier_rnc ? <Info label="RNC del proveedor" value={e.supplier_rnc} /> : null}
        {e.ncf ? <Info label="NCF" value={e.ncf} /> : null}
        {pending && e.due_date ? <Info label="Vence" value={day(e.due_date)} /> : null}
      </Card>

      {e.stock.length ? (
        <>
          <SectionTitle icon="package-variant-closed">Lo que entró al inventario</SectionTitle>
          <Card style={{ gap: 10 }}>
            {e.stock.map((s, i) => {
              const left = Math.round((s.bought - s.removed) * 100) / 100;
              const q = (n: number) => `${Math.round(n * 100) / 100} ${s.unit}`;
              return (
                <View key={`${s.ingredient_id}${s.location_id}`} style={{ gap: 4, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: t.border, paddingTop: i ? 8 : 0 }}>
                  <Row>
                    <Label size={15} style={{ flex: 1, textDecorationLine: left <= 0 ? 'line-through' : 'none' }} muted={left <= 0}>{s.name}</Label>
                    <Label bold size={15} muted={left <= 0}>{q(s.bought)}</Label>
                  </Row>
                  {s.removed > 0 ? <Label muted size={12}>Quitado del inventario: {q(s.removed)} (no era de la producción)</Label> : null}
                  {!voided && manager && left > 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="package-variant-remove"
                      title="Quitar del inventario (no es de la producción)"
                      disabled={busy}
                      onPress={() => removeLine(s)}
                    />
                  ) : null}
                </View>
              );
            })}
            <Label muted size={12}>
              {voided
                ? 'Al anular el gasto, esto salió del inventario.'
                : 'Quitar un producto no cambia el monto del gasto (ese dinero sí se gastó). Si además el insumo no lo usas, elimínalo en Inventario.'}
            </Label>
          </Card>
        </>
      ) : null}

      <SectionTitle icon="history">Historial</SectionTitle>
      <Card style={{ gap: 12 }}>
        {history.map((h, i) => (
          <Row key={i} style={{ justifyContent: 'flex-start', gap: 12, alignItems: 'flex-start' }}>
            <IconBadge name={h.icon} color={h.color} size={32} />
            <View style={{ flex: 1 }}>
              <Label bold size={14}>{h.title}</Label>
              {h.text ? <Label muted size={13}>{h.text}</Label> : null}
            </View>
          </Row>
        ))}
      </Card>

      {pending && manager ? (
        <Button
          icon="cash-check"
          title={busy ? 'Guardando…' : 'Marcar como pagado'}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await markExpensePaid(db, ctx, e.id);
              setMsg({ text: 'Listo: quedó pagado.', ok: true });
              reload();
            } catch (err) {
              setMsg({ text: err instanceof Error ? err.message : String(err) });
            }
            setBusy(false);
          }}
        />
      ) : null}

      {!voided && manager ? (
        <VoidBox
          what="este gasto"
          reasons={['Se registró dos veces', 'Monto equivocado', 'No era de este negocio']}
          warning={e.stock.some((x) => x.bought - x.removed > 0) ? 'Lo que entró al inventario con esta factura va a salir.' : undefined}
          onVoid={async (reason) => {
            await voidExpense(db, ctx, e.id, reason);
            setMsg({ text: 'Gasto anulado. Quedó en la auditoría.', ok: true });
            reload();
          }}
        />
      ) : null}
      {!manager && !voided ? <Label muted size={13}>Solo el dueño o un gerente pueden anular gastos.</Label> : null}

      {msg ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, padding: 10, backgroundColor: msg.ok ? t.successSoft : t.dangerSoft }}>
          <Icon name={msg.ok ? 'check-circle' : 'alert-circle'} size={18} color={msg.ok ? t.success : t.danger} />
          <Label size={14} color={msg.ok ? t.success : t.danger} style={{ flex: 1 }}>{msg.text}</Label>
        </View>
      ) : null}
    </Screen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Row>
      <Label muted size={14}>{label}</Label>
      <Label size={14} style={{ flexShrink: 1, textAlign: 'right' }}>{value}</Label>
    </Row>
  );
}
