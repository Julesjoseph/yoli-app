import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { Button, Card, Chips, EmptyState, Field, Icon, Label, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { getLocalProfile } from '@/db/business-profile';
import { useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { getEinvoiceSettings, PROVIDERS, saveEinvoiceSettings, type ApiResponseMap, type EcfType, type EinvoiceSettings } from '@/invoicing/ecf';

/** Configuración de la factura electrónica (e-CF) del negocio. Solo el dueño la cambia. */
export default function EinvoiceSettingsScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const owner = ctx.role === 'dueno';
  const [form, setForm] = useState<EinvoiceSettings | null>(null);
  const [token, setToken] = useState('');
  const [advanced, setAdvanced] = useState(false);
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
  const isApi = s?.provider === 'api';
  const usesToken = s?.provider === 'alanube' || isApi;
  const usesSequences = s?.provider === 'alanube' || (isApi && s?.api_numbering !== 'proveedor');
  const map = s?.api_response_map ?? {};
  const setMap = (patch: Partial<ApiResponseMap>) => {
    const next = { ...map, ...patch };
    for (const k of Object.keys(next) as (keyof ApiResponseMap)[]) if (!next[k]?.trim()) delete next[k];
    set({ api_response_map: Object.keys(next).length ? next : null });
  };
  const hasRnc = !!data?.rnc.replace(/\D/g, '');

  async function save() {
    if (!s) return;
    for (const d of [s.seq32_due, s.seq31_due]) {
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return setMsg({ text: 'La fecha de vencimiento va así: 2027-12-31.' });
    }
    if (s.provider === 'api' && s.enabled) {
      if (!s.provider_name?.trim()) return setMsg({ text: 'Escribe el nombre de tu proveedor.' });
      if (!/^https:\/\/\S+$/i.test(s.api_url?.trim() ?? '')) return setMsg({ text: 'La dirección para emitir tiene que empezar con https://' });
      if (s.api_status_url?.trim() && !/^https:\/\/\S+$/i.test(s.api_status_url.trim())) {
        return setMsg({ text: 'La dirección para consultar tiene que empezar con https:// (o déjala vacía).' });
      }
      if (s.api_numbering !== 'proveedor' && !s.seq32_next && !s.seq31_next) {
        return setMsg({ text: 'Pon al menos una secuencia e-NCF, o elige que el proveedor ponga el número.' });
      }
    }
    if (s.enabled && s.provider === 'manual' && !s.provider_name?.trim()) {
      return setMsg({ text: 'Escribe el nombre de tu proveedor.' });
    }
    if (s.enabled && s.provider === 'alanube' && !s.seq32_next && !s.seq31_next) {
      return setMsg({ text: 'Pon al menos una secuencia e-NCF (la da la DGII).' });
    }
    if (s.enabled && s.provider === 'alanube' && !data?.tokenSaved && !token.trim()) {
      return setMsg({ text: 'Pega la llave (token) de Alanube.' });
    }
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
                if (owner && PROVIDERS.find((p) => p.value === v)?.ready) {
                  set({
                    provider: v,
                    environment: v === 'prueba' ? 'prueba' : v === 'manual' ? 'produccion' : s.environment,
                    ...(v === 'api' ? { api_format: s.api_format ?? 'yoli', api_numbering: s.api_numbering ?? 'yoli' } : {}),
                  });
                }
              }}
            />
            {s.provider === 'prueba' ? (
              <Label muted size={13}>Modo prueba: arma la factura para practicar, pero no la envía a la DGII.</Label>
            ) : null}

            {s.provider === 'manual' ? (
              <>
                <Label muted size={13}>
                  Para usar cualquier proveedor certificado por la DGII. Emites la factura en el sistema de tu proveedor y
                  luego, en la venta, escribes el e-NCF y el código de seguridad. YOLI SOFT la guarda y la imprime en el
                  ticket con el código QR.
                </Label>
                <Field
                  label="Nombre de tu proveedor"
                  icon="domain"
                  value={s.provider_name ?? ''}
                  onChangeText={(v) => set({ provider_name: v || null })}
                  editable={owner}
                  placeholder="Ej. el sistema donde emites tus e-CF"
                />
              </>
            ) : null}

            {isApi ? (
              <>
                <Label muted size={13}>
                  Para conectar cualquier proveedor autorizado por la DGII que tenga API. YOLI SOFT le manda cada factura
                  y guarda el e-NCF, el código de seguridad y el QR que devuelve. Pídele a tu proveedor la dirección de su
                  API y la llave, y pásale la guía de YOLI (docs/factura-electronica-api.md).
                </Label>
                <Field
                  label="Nombre de tu proveedor"
                  icon="domain"
                  value={s.provider_name ?? ''}
                  onChangeText={(v) => set({ provider_name: v || null })}
                  editable={owner}
                  placeholder="Ej. el nombre de la empresa"
                />
                <Field
                  label="Dirección para emitir (POST)"
                  icon="web"
                  value={s.api_url ?? ''}
                  onChangeText={(v) => set({ api_url: v.trim() || null })}
                  autoCapitalize="none"
                  keyboardType="url"
                  editable={owner}
                  placeholder="https://api.tuproveedor.com/ecf"
                />
                <Field
                  label="Dirección para consultar el estado (opcional, GET)"
                  icon="web-refresh"
                  value={s.api_status_url ?? ''}
                  onChangeText={(v) => set({ api_status_url: v.trim() || null })}
                  autoCapitalize="none"
                  keyboardType="url"
                  editable={owner}
                  placeholder="https://api.tuproveedor.com/ecf/{id}"
                />
                <Label muted size={12}>En la de consultar, {'{id}'} se cambia por el id que dio el proveedor y {'{encf}'} por el e-NCF.</Label>
                <Label muted size={13}>Formato de la factura</Label>
                <Chips
                  options={[
                    { value: 'yoli', label: 'Estándar YOLI (recomendado)' },
                    { value: 'alanube', label: 'Igual que Alanube' },
                  ]}
                  value={s.api_format ?? 'yoli'}
                  onChange={(v) => {
                    if (owner) set({ api_format: v as 'yoli' | 'alanube' });
                  }}
                />
                <Label muted size={13}>¿Quién pone el número e-NCF?</Label>
                <Chips
                  options={[
                    { value: 'yoli', label: 'YOLI lleva la secuencia' },
                    { value: 'proveedor', label: 'El proveedor lo pone' },
                  ]}
                  value={s.api_numbering ?? 'yoli'}
                  onChange={(v) => {
                    if (owner) set({ api_numbering: v as 'yoli' | 'proveedor' });
                  }}
                />
              </>
            ) : null}

            {provider && usesToken ? (
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
                {isApi ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={advanced ? 'chevron-up' : 'chevron-down'}
                      title={advanced ? 'Ocultar opciones avanzadas' : 'Opciones avanzadas (encabezado y respuesta)'}
                      onPress={() => setAdvanced(!advanced)}
                    />
                    {advanced ? (
                      <View style={{ gap: 10 }}>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Field
                              label="Encabezado de la llave"
                              value={s.api_auth_header ?? ''}
                              onChangeText={(v) => set({ api_auth_header: v.trim() || null })}
                              autoCapitalize="none"
                              editable={owner}
                              placeholder="Authorization"
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Field
                              label="Antes de la llave"
                              value={s.api_auth_prefix ?? ''}
                              onChangeText={(v) => set({ api_auth_prefix: v || null })}
                              autoCapitalize="none"
                              editable={owner}
                              placeholder="Bearer (con espacio)"
                            />
                          </View>
                        </View>
                        <Label muted size={12}>
                          Por defecto se manda "Authorization: Bearer tu-llave". Si tu proveedor usa otro (por ejemplo
                          "x-api-key"), escríbelo aquí y deja "Antes de la llave" con un espacio o vacío.
                        </Label>
                        <Label bold size={14}>Dónde viene cada dato en la respuesta</Label>
                        <Label muted size={12}>
                          Déjalo vacío y YOLI lo busca solo (encf, codigoSeguridad, qrUrl, estado…). Si tu proveedor usa
                          otros nombres, escribe la ruta, por ejemplo data.documento.encf.
                        </Label>
                        {(
                          [
                            ['encf', 'e-NCF'],
                            ['securityCode', 'Código de seguridad'],
                            ['qrUrl', 'Enlace del QR'],
                            ['status', 'Estado'],
                            ['id', 'Id del documento'],
                            ['message', 'Mensaje'],
                          ] as [keyof ApiResponseMap, string][]
                        ).map(([k, label]) => (
                          <Field
                            key={k}
                            label={label}
                            value={map[k] ?? ''}
                            onChangeText={(v) => setMap({ [k]: v })}
                            autoCapitalize="none"
                            editable={owner}
                            placeholder="(automático)"
                          />
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {s.provider === 'alanube' ? (
              <>
                <Field
                  label="Id de la compañía en Alanube (opcional)"
                  icon="domain"
                  value={s.provider_company_id ?? ''}
                  onChangeText={(v) => set({ provider_company_id: v.trim() || null })}
                  autoCapitalize="none"
                  editable={owner}
                  placeholder="Solo si Alanube te la dio (compañía asociada)"
                />
              </>
            ) : null}

            {usesSequences ? (
              <>

                <Label bold size={15}>Secuencias e-NCF autorizadas por la DGII</Label>
                <Label muted size={13}>
                  Las pides en la Oficina Virtual de la DGII. Pon el próximo número que vas a usar (sin la E32 / E31) y la
                  fecha en que vence. La app sigue contando sola.
                </Label>
                {(['32', '31'] as const).map((k) => (
                  <View key={k} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label={`Próximo E${k}`}
                        keyboardType="number-pad"
                        value={s[`seq${k}_next`] ? String(s[`seq${k}_next`]) : ''}
                        onChangeText={(v) => set({ [`seq${k}_next`]: v.replace(/\D/g, '') ? Number(v.replace(/\D/g, '')) : null })}
                        editable={owner}
                        placeholder="Ej. 1"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Vence"
                        value={s[`seq${k}_due`] ?? ''}
                        onChangeText={(v) => set({ [`seq${k}_due`]: v.trim() || null })}
                        editable={owner}
                        placeholder="AAAA-MM-DD"
                      />
                    </View>
                  </View>
                ))}
                {s.seq32_next ? (
                  <Label muted size={13}>Próxima factura de consumo: E32{String(s.seq32_next).padStart(10, '0')}</Label>
                ) : null}
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
