import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { Button, Card, Chips, EmptyState, Field, Icon, Label, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { getLocalProfile } from '@/db/business-profile';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { getEinvoiceSettings, PROVIDERS, saveEinvoiceSettings, type EcfType, type EinvoiceSettings } from '@/invoicing/ecf';

/** Configuración de la factura electrónica (e-CF) del negocio. Solo el dueño la cambia. */
export default function EinvoiceSettingsScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const owner = ctx.role === 'dueno';
  const [form, setForm] = useState<EinvoiceSettings | null>(null);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  const [data, reload] = useFocusData(async () => {
    const [cloud, profile] = await Promise.all([getEinvoiceSettings(ctx.businessId), getLocalProfile(db)]);
    return { ...cloud, rnc: profile.rnc };
  }, [db]);

  if (ctx.demo) {
    return (
      <Screen back title="Factura electrónica">
        <EmptyState icon="file-certificate-outline" text="En el demo de este equipo no se emiten facturas. Entra con tu cuenta para configurarla." />
      </Screen>
    );
  }

  const s = form ?? data?.settings ?? null;
  const set = (patch: Partial<EinvoiceSettings>) => {
    if (s) setForm({ ...s, ...patch });
  };
  const provider = PROVIDERS.find((p) => p.value === s?.provider);
  const hasRnc = !!data?.rnc.replace(/\D/g, '');

  async function save() {
    if (!s) return;
    setSaving(true);
    setMsg(null);
    const error = await saveEinvoiceSettings(ctx.businessId, s, token);
    setSaving(false);
    if (error) return setMsg({ text: error });
    setToken('');
    setForm(null);
    setMsg({ text: 'Guardado.', ok: true });
    reload();
  }

  return (
    <Screen back title="Factura electrónica" subtitle="e-CF de la DGII con un proveedor autorizado">
      {data?.error ? (
        <Card><Label color={t.danger}>{data.error}</Label></Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        <Row>
          <Label bold size={16}>Estado</Label>
          <Pill
            text={data?.settings.enabled ? (data.settings.environment === 'prueba' ? 'ACTIVA · PRUEBA' : 'ACTIVA') : 'APAGADA'}
            color={data?.settings.enabled ? (data.settings.environment === 'prueba' ? t.info : t.success) : t.textSecondary}
          />
        </Row>
        <Label muted size={13}>
          Desde cada venta (Inicio › Últimas ventas) puedes emitir la factura de consumo (32) o de crédito fiscal (31). El
          e-NCF y el código de seguridad salen en el ticket.
        </Label>
        {!hasRnc ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="alert-circle-outline" size={18} color={t.danger} />
            <Label size={14} color={t.danger} style={{ flex: 1 }}>Falta el RNC del negocio.</Label>
            <Button size="sm" variant="secondary" title="Ponerlo" onPress={() => router.push('/negocio')} />
          </View>
        ) : null}
      </Card>

      {s ? (
        <>
          <SectionTitle icon="cog-outline">Configuración</SectionTitle>
          <Card style={{ gap: 14 }}>
            <Row>
              <View style={{ flex: 1 }}>
                <Label bold size={15}>Activar factura electrónica</Label>
                <Label muted size={13}>Permite emitir e-CF desde las ventas.</Label>
              </View>
              <Switch value={s.enabled} onValueChange={(v) => set({ enabled: v })} disabled={!owner} trackColor={{ true: t.primary, false: t.backgroundSelected }} thumbColor="#FFFFFF" />
            </Row>

            <Label muted size={13}>Proveedor autorizado por la DGII</Label>
            <Chips
              options={PROVIDERS.map((p) => ({ value: p.value, label: p.ready ? p.label : `${p.label} (pronto)` }))}
              value={s.provider}
              onChange={(v) => {
                if (owner && PROVIDERS.find((p) => p.value === v)?.ready) set({ provider: v, environment: v === 'prueba' ? 'prueba' : s.environment });
              }}
            />
            {s.provider === 'prueba' ? (
              <Label muted size={13}>Modo prueba: arma la factura para practicar, pero no la envía a la DGII.</Label>
            ) : null}

            {provider && s.provider !== 'prueba' ? (
              <>
                <Label muted size={13}>Ambiente</Label>
                <Chips
                  options={[
                    { value: 'prueba', label: 'Pruebas (certificación)' },
                    { value: 'produccion', label: 'Producción (real)' },
                  ]}
                  value={s.environment}
                  onChange={(v) => {
                    if (owner) set({ environment: v as EinvoiceSettings['environment'] });
                  }}
                />
                <Field
                  label={data?.tokenSaved ? 'Llave del proveedor (ya guardada)' : 'Llave (token) del proveedor'}
                  icon="key-outline"
                  value={token}
                  onChangeText={setToken}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={owner}
                  placeholder={data?.tokenSaved ? '•••••••• (escribe para cambiarla)' : 'Pégala aquí'}
                />
                <Label muted size={13}>La llave se guarda en el servidor y nadie la puede volver a ver desde la app.</Label>
              </>
            ) : null}

            <Label muted size={13}>Tipo que se sugiere al facturar</Label>
            <Chips
              options={[
                { value: '32', label: 'Consumo (32)' },
                { value: '31', label: 'Crédito fiscal (31)' },
              ]}
              value={s.default_type}
              onChange={(v) => {
                if (owner) set({ default_type: v as EcfType });
              }}
            />

            {msg ? <Label size={14} color={msg.ok ? t.success : t.danger}>{msg.text}</Label> : null}
            {owner ? (
              <Button size="lg" icon="content-save" title={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving} />
            ) : (
              <Label muted size={13}>Solo el dueño puede cambiar esta configuración.</Label>
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
