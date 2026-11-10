import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, EmptyState, Field, Label, Screen, SectionTitle } from '@/components/ui';
import { canManage, useBusiness, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/sync/supabase';

type Loc = { id: string; name: string };

/** Enlaza cada local de YOLI con su tienda de PedidosYa (Vendor ID), para que los pedidos entren solos. */
export default function PedidosYaScreen() {
  const ctx = useBusiness();
  const t = useTheme();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const manager = canManage(ctx);

  const [data, reload] = useFocusData(async () => {
    if (!supabase) return { locations: [] as Loc[], links: {} as Record<string, string>, error: 'Sin nube' };
    const [l, d] = await Promise.all([
      supabase.from('locations').select('id, name').eq('business_id', ctx.businessId).eq('active', true).order('name'),
      supabase.from('delivery_links').select('vendor_id, location_id').eq('business_id', ctx.businessId).eq('platform_id', 'pedidosya'),
    ]);
    const error = l.error?.message ?? (d.error ? 'Falta un paso en Supabase: corre el archivo 0007_pedidosya_automatico.sql.' : undefined);
    const links: Record<string, string> = {};
    for (const r of (d.data ?? []) as { vendor_id: string; location_id: string }[]) links[r.location_id] = r.vendor_id;
    return { locations: (l.data ?? []) as Loc[], links, error };
  }, [ctx.businessId]);

  if (ctx.demo) {
    return (
      <Screen back title="PedidosYa">
        <EmptyState icon="moped-outline" text="En el demo no se conecta PedidosYa. Entra con tu cuenta." />
      </Screen>
    );
  }

  async function save() {
    if (!supabase || !data) return;
    setSaving(true);
    setMsg(null);
    for (const loc of data.locations) {
      const next = (edits[loc.id] ?? data.links[loc.id] ?? '').replace(/\s/g, '');
      const prev = data.links[loc.id] ?? '';
      if (next === prev) continue;
      if (prev) {
        const r = await supabase.from('delivery_links').delete().eq('platform_id', 'pedidosya').eq('vendor_id', prev);
        if (r.error) return finish(r.error.message);
      }
      if (next) {
        const r = await supabase
          .from('delivery_links')
          .insert({ platform_id: 'pedidosya', vendor_id: next, business_id: ctx.businessId, location_id: loc.id });
        if (r.error) return finish(/duplicate|unique/i.test(r.error.message) ? `El Vendor ID ${next} ya está enlazado a otro local.` : r.error.message);
      }
    }
    finish();
  }

  function finish(error?: string) {
    setSaving(false);
    setMsg(error ? { text: error } : { text: 'Guardado.', ok: true });
    if (!error) setEdits({});
    reload();
  }

  return (
    <Screen back title="PedidosYa" subtitle="Pedidos automáticos en la caja">
      <Card style={{ gap: 8 }}>
        <Label muted size={13}>
          Pon el número de tu tienda en PedidosYa (Vendor ID). Lo ves en el Portal de PedidosYa, al lado del nombre del
          local, por ejemplo "Mi Local (574131)". Cuando PedidosYa active la conexión, cada pedido entra solo como venta
          de ese local y descuenta el inventario.
        </Label>
      </Card>
      {data?.error ? (
        <Card><Label color={t.danger}>{data.error}</Label></Card>
      ) : null}

      <SectionTitle icon="storefront-outline">Tus locales</SectionTitle>
      <Card style={{ gap: 12 }}>
        {(data?.locations ?? []).map((loc) => (
          <View key={loc.id}>
            <Field
              label={loc.name}
              icon="moped-outline"
              keyboardType="number-pad"
              value={edits[loc.id] ?? data?.links[loc.id] ?? ''}
              onChangeText={(v) => setEdits((e) => ({ ...e, [loc.id]: v }))}
              editable={manager}
              placeholder="Vendor ID de PedidosYa"
            />
          </View>
        ))}
        {msg ? <Label size={14} color={msg.ok ? t.success : t.danger}>{msg.text}</Label> : null}
        {manager ? (
          <Button size="lg" icon="content-save" title={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving || !data} />
        ) : (
          <Label muted size={13}>Solo el dueño o el gerente puede cambiar esto.</Label>
        )}
      </Card>
    </Screen>
  );
}
