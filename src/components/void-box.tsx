import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Chips, Field, Icon, Label } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';

/**
 * Botón para anular una venta o un gasto entrado por error. Pide el motivo;
 * no se borra: queda marcado como anulado y en la auditoría.
 */
export function VoidBox({
  what,
  reasons,
  warning,
  onVoid,
}: {
  /** "esta venta" / "este gasto" */
  what: string;
  reasons: string[];
  warning?: string;
  onVoid: (reason: string) => Promise<void>;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [quick, setQuick] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const text = quick && quick !== 'otro' ? quick : reason;

  if (!open) {
    return (
      <Button variant="danger" icon="cancel" title={`Anular ${what}`} onPress={() => setOpen(true)} />
    );
  }

  return (
    <Card style={{ gap: 12, borderWidth: 1, borderColor: t.danger }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="cancel" color={t.danger} size={20} />
        <Label bold size={16} color={t.danger}>¿Anular {what}?</Label>
      </View>
      <Label muted size={13}>
        No se borra: deja de contar en ventas, gastos y reportes, y queda guardada en la auditoría con el motivo, la fecha y quién la anuló. No se puede deshacer.
      </Label>
      {warning ? <Label size={13} color={t.danger}>{warning}</Label> : null}
      <Label muted size={12} bold>MOTIVO</Label>
      <Chips options={[...reasons.map((r) => ({ value: r, label: r })), { value: 'otro', label: 'Otro motivo' }]} value={quick} onChange={setQuick} />
      {quick === 'otro' || !quick ? (
        <Field label="Escribe el motivo" icon="text" value={reason} onChangeText={setReason} placeholder="Ej. Se registró dos veces" />
      ) : null}
      {error ? <Label size={14} color={t.danger}>{error}</Label> : null}
      <Button
        variant="danger"
        icon="check"
        title={busy ? 'Anulando…' : 'Sí, anular'}
        disabled={busy || text.trim().length < 3}
        onPress={async () => {
          setBusy(true);
          setError('');
          try {
            await onVoid(text.trim());
            setOpen(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
          setBusy(false);
        }}
      />
      <Button variant="ghost" title="No, dejarlo como está" onPress={() => setOpen(false)} disabled={busy} />
    </Card>
  );
}
