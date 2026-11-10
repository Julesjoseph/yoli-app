import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Chips, Divider, EmptyState, Field, Icon, IconBadge, Label, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { CHANNEL_ICONS } from '@/components/brand-icons';
import { ChannelColors } from '@/constants/theme';
import { canManage, useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { ECF_LABELS, emitInvoice, getEinvoiceSettings, listInvoices, refreshInvoice, type EcfType, type Invoice } from '@/invoicing/ecf';
import { CHANNEL_LABELS, formatRD } from '@/lib/calc';
import { getTicketOrder, printOrderTicket, ticketNumber } from '@/printing/receipt';
import { pushOutbox } from '@/sync/sync';

/** Detalle de una venta: reimprimir el ticket y emitir la factura electrónica. */
export default function SaleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [type, setType] = useState<EcfType | null>(null);
  const [rnc, setRnc] = useState('');
  const [client, setClient] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  const [data, reload] = useFocusData(async () => {
    const order = await getTicketOrder(db, id);
    if (ctx.demo) return { order, invoices: [] as Invoice[], settings: null };
    const [invoices, settings] = await Promise.all([listInvoices(id), getEinvoiceSettings(ctx.businessId)]);
    return { order, invoices, settings };
  }, [db, id]);

  const order = data?.order;
  const valid = (data?.invoices ?? []).filter((i) => i.status === 'aceptada' || i.status === 'enviada');
  const settings = data?.settings?.settings;
  const lastRejected = !valid.length ? (data?.invoices ?? []).filter((i) => i.status === 'rechazada').pop() : undefined;
  const chosen: EcfType = type ?? settings?.default_type ?? '32';
  const shop = { businessName: ctx.businessName, locationName: ctx.locationName };

  async function print(invoice?: Invoice) {
    try {
      await printOrderTicket(db, id, shop, invoice ?? null);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e) });
    }
  }

  async function emit() {
    setBusy(true);
    setMsg(null);
    // La venta tiene que estar en la nube antes de facturarla.
    await pushOutbox(db).catch(() => undefined);
    const r = await emitInvoice(id, chosen, chosen === '31' ? { rnc, name: client } : undefined);
    setBusy(false);
    if (r.error) return setMsg({ text: r.error });
    setMsg({ text: `Factura emitida: ${r.invoice?.encf ?? ''}`, ok: true });
    reload();
  }

  if (data && !order) {
    return (
      <Screen back title="Venta">
        <EmptyState icon="receipt-text-remove-outline" text="No se encontró esta venta en el equipo." />
      </Screen>
    );
  }

  return (
    <Screen back title={order ? `Venta #${ticketNumber(order.id)}` : 'Venta'} subtitle={order ? new Date(order.created_at).toLocaleString('es-DO') : undefined}>
      {order ? (
        <Card style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'flex-start', gap: 12 }}>
            <IconBadge name={CHANNEL_ICONS[order.channel]} color={ChannelColors[order.channel]} size={40} />
            <View style={{ flex: 1 }}>
              <Label bold size={16}>{CHANNEL_LABELS[order.channel]}</Label>
              {order.external_ref ? <Label muted size={13}>Pedido {order.external_ref}</Label> : null}
            </View>
            <Label bold size={20} color={t.primary}>{formatRD(order.total)}</Label>
          </Row>
          <Divider />
          {order.items.map((i, k) => (
            <Row key={k}>
              <Label size={15} style={{ flex: 1 }}>{i.quantity} × {i.name}</Label>
              <Label size={15}>{formatRD(i.unit_price * i.quantity)}</Label>
            </Row>
          ))}
          <Divider />
          <Row><Label muted size={14}>ITBIS</Label><Label size={14}>{formatRD(order.itbis)}</Label></Row>
          {order.tip_law ? <Row><Label muted size={14}>Ley de propina</Label><Label size={14}>{formatRD(order.tip_law)}</Label></Row> : null}
          <Button variant="secondary" icon="printer-outline" title="Imprimir ticket" onPress={() => print(valid[valid.length - 1])} />
        </Card>
      ) : null}

      <SectionTitle icon="file-certificate-outline">Factura electrónica</SectionTitle>
      {ctx.demo ? (
        <Card>
          <Label muted>En el demo de este equipo no se emiten facturas. Entra con tu cuenta para usarla.</Label>
        </Card>
      ) : valid.length ? (
        valid.map((inv) => (
          <Card key={inv.id} style={{ gap: 8 }}>
            <Row>
              <Label bold size={15} style={{ flex: 1 }}>{ECF_LABELS[inv.ecf_type] ?? 'e-CF'}</Label>
              <Pill text={inv.environment === 'prueba' ? 'PRUEBA' : inv.status.toUpperCase()} color={inv.environment === 'prueba' ? t.info : t.success} />
            </Row>
            <Label size={22} bold>{inv.encf}</Label>
            {inv.customer_name ? <Label size={14}>{inv.customer_name} · RNC {inv.customer_rnc}</Label> : null}
            {inv.security_code ? <Label muted size={13}>Código de seguridad: {inv.security_code}</Label> : null}
            {inv.message ? <Label muted size={13}>{inv.message}</Label> : null}
            {inv.status === 'enviada' ? (
              <Button
                variant="secondary"
                icon="refresh"
                title={busy ? 'Consultando…' : 'Actualizar estado'}
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  const r = await refreshInvoice(inv.id);
                  setBusy(false);
                  setMsg(r.error ? { text: r.error } : { text: `Estado: ${r.invoice?.status ?? ''}`, ok: true });
                  reload();
                }}
              />
            ) : null}
            <Button icon="printer" title="Imprimir factura" onPress={() => print(inv)} />
          </Card>
        ))
      ) : data?.settings?.error ? (
        <Card><Label color={t.danger}>{data.settings.error}</Label></Card>
      ) : settings && !settings.enabled ? (
        <Card style={{ gap: 10 }}>
          <Label>La factura electrónica no está activada en este negocio.</Label>
          {canManage(ctx) ? (
            <Button variant="secondary" icon="cog-outline" title="Configurar factura electrónica" onPress={() => router.push('/factura-electronica')} />
          ) : (
            <Label muted size={13}>Pídele al dueño que la active en Perfil › Factura electrónica.</Label>
          )}
        </Card>
      ) : (
        <Card style={{ gap: 12 }}>
          <Label muted size={13}>¿Qué factura necesita el cliente?</Label>
          <Chips
            options={[
              { value: '32', label: 'Consumo (consumidor final)', icon: 'account-outline' },
              { value: '31', label: 'Crédito fiscal (con RNC)', icon: 'domain' },
            ]}
            value={chosen}
            onChange={(v) => setType(v as EcfType)}
          />
          {chosen === '31' ? (
            <>
              <Field label="RNC o cédula del cliente" icon="card-account-details-outline" keyboardType="number-pad" value={rnc} onChangeText={setRnc} placeholder="Ej. 131234567" />
              <Field label="Nombre o razón social del cliente" icon="domain" value={client} onChangeText={setClient} placeholder="Ej. Empresa ABC SRL" />
            </>
          ) : null}
          {settings?.environment === 'prueba' ? (
            <Label muted size={13}>Modo prueba: el comprobante no se envía a la DGII.</Label>
          ) : null}
          <Button
            size="lg"
            icon="file-send-outline"
            title={busy ? 'Emitiendo…' : 'Emitir factura electrónica'}
            onPress={emit}
            disabled={busy || (chosen === '31' && (!rnc.trim() || !client.trim()))}
          />
        </Card>
      )}
      {lastRejected?.message && !msg ? (
        <Card style={{ gap: 4 }}>
          <Label bold size={14} color={t.danger}>La última vez fue rechazada ({lastRejected.encf})</Label>
          <Label size={13} color={t.danger}>{lastRejected.message}</Label>
        </Card>
      ) : null}
      {msg ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, padding: 10, backgroundColor: msg.ok ? t.successSoft : t.dangerSoft }}>
          <Icon name={msg.ok ? 'check-circle' : 'alert-circle'} size={18} color={msg.ok ? t.success : t.danger} />
          <Label size={14} color={msg.ok ? t.success : t.danger} style={{ flex: 1 }}>{msg.text}</Label>
        </View>
      ) : null}
    </Screen>
  );
}
