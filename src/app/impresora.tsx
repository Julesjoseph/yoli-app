import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { Button, Card, Chips, Field, Label, Row, Screen, SectionTitle } from '@/components/ui';
import { useBusiness } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_TICKET, getTicketSettings, printTestTicket, saveTicketSettings, type TicketSettings } from '@/printing/receipt';

export default function PrinterScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [s, setS] = useState<TicketSettings>(DEFAULT_TICKET);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getTicketSettings(db).then(setS);
  }, [db]);

  const set = <K extends keyof TicketSettings>(k: K, v: TicketSettings[K]) => {
    setS((cur) => ({ ...cur, [k]: v }));
    setMsg('');
  };

  async function save() {
    await saveTicketSettings(db, s);
    setMsg('Guardado en este equipo.');
  }

  async function test() {
    try {
      await printTestTicket(ctx, s);
    } catch (e) {
      Alert.alert('No se pudo imprimir', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen back title="Impresora y ticket" subtitle={ctx.locationName}>
      <Card style={{ gap: 12 }}>
        <Label muted size={13}>
          Estos datos salen arriba del ticket. Se guardan en este equipo, así cada caja puede tener su impresora.
        </Label>
        <Field label="RNC del negocio" icon="card-account-details-outline" keyboardType="number-pad" value={s.rnc} onChangeText={(v) => set('rnc', v)} placeholder="Ej. 131234567" />
        <Field label="Dirección" icon="map-marker-outline" value={s.address} onChangeText={(v) => set('address', v)} placeholder="Ej. Av. Duarte #10, Santiago" />
        <Field label="Teléfono" icon="phone-outline" keyboardType="phone-pad" value={s.phone} onChangeText={(v) => set('phone', v)} placeholder="Ej. 809-555-0000" />
        <Field label="Mensaje al final" icon="message-text-outline" value={s.footer} onChangeText={(v) => set('footer', v)} />
      </Card>

      <SectionTitle icon="printer-pos">Impresora</SectionTitle>
      <Card style={{ gap: 12 }}>
        <Label muted size={13}>Ancho del papel</Label>
        <Chips
          options={[
            { value: '80', label: '80 mm' },
            { value: '58', label: '58 mm' },
          ]}
          value={s.width}
          onChange={(v) => set('width', v)}
        />
        <Row>
          <View style={{ flex: 1 }}>
            <Label bold size={15}>Imprimir al cobrar</Label>
            <Label muted size={13}>Si está apagado, la app te pregunta después de cada venta.</Label>
          </View>
          <Switch value={s.autoPrint} onValueChange={(v) => set('autoPrint', v)} trackColor={{ true: t.primary, false: t.backgroundSelected }} thumbColor="#FFFFFF" />
        </Row>
        <Button variant="secondary" icon="printer" title="Imprimir ticket de prueba" onPress={test} />
        <Label muted size={13}>
          Impresora Bluetooth en Android: instala una app de servicio de impresión (por ejemplo RawBT), conéctala a tu
          impresora y elígela cuando se abra la ventana de imprimir. Las impresoras Wi‑Fi aparecen solas.
        </Label>
      </Card>

      {msg ? <Label color={t.success} size={14}>{msg}</Label> : null}
      <Button size="lg" icon="content-save" title="Guardar" onPress={save} />
    </Screen>
  );
}
