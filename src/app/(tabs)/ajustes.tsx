import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth';
import { Button, Card, Chips, Field, HeroCard, Icon, IconBadge, Label, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { getCommissionRates, pendingSyncCount, ROLE_LABELS, type Role } from '@/db/repo';
import { canManage, useBusiness, useBusinessState, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/sync/supabase';
import { pushOutbox } from '@/sync/sync';

interface Member {
  id: string;
  user_id: string;
  location_id: string | null;
  role: Role;
  display_name: string | null;
}
interface Loc {
  id: string;
  name: string;
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const auth = useAuth();
  const { changeLocation, reload } = useBusinessState();
  const t = useTheme();
  const manager = canManage(ctx);
  const [pending, reloadPending] = useFocusData(() => pendingSyncCount(db), [db]);
  const [syncMsg, setSyncMsg] = useState('');

  async function sync() {
    const r = await pushOutbox(db);
    setSyncMsg(
      r.offlineMode
        ? 'Modo demo: no hay nube configurada.'
        : r.error
          ? `No se pudo subir (${r.error}). Se reintentará solo.`
          : `Listo: ${r.pushed} cambios subidos.`,
    );
    reloadPending();
    if (!r.error && !r.offlineMode) reload();
  }

  return (
    <Screen title="Ajustes">
      <HeroCard>
        <Row>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="storefront-outline" size={28} color="#E11D48" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900' }} numberOfLines={1}>{ctx.businessName}</Text>
              <Text style={{ color: '#FFFFFFE6', fontWeight: '600' }} numberOfLines={1}>
                {ROLE_LABELS[ctx.role]} · {ctx.locationName}
              </Text>
            </View>
          </View>
        </Row>
        {!ctx.demo ? (
          <Text style={{ color: '#FFFFFFCC', fontSize: 13 }} numberOfLines={1}>{auth.session?.user.email}</Text>
        ) : null}
      </HeroCard>
      {!ctx.demo ? <Button icon="swap-horizontal" title="Cambiar de local" variant="secondary" onPress={changeLocation} /> : null}

      <Card>
        <Row>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <IconBadge name={ctx.demo ? 'cellphone' : pending ? 'cloud-sync' : 'cloud-check'} color={ctx.demo ? t.info : pending ? t.accent : t.success} />
            <View style={{ flex: 1 }}>
              <Label bold size={16}>Respaldo en la nube</Label>
              <Label muted size={13}>
                {ctx.demo ? 'Guardado solo en este equipo' : pending ? `${pending} cambios por subir` : 'Todo está al día'}
              </Label>
            </View>
          </View>
          <Button size="sm" icon="sync" title="Sincronizar" variant="secondary" onPress={sync} />
        </Row>
        {syncMsg ? <Label muted size={13}>{syncMsg}</Label> : null}
      </Card>

      {ctx.demo ? (
        <Card>
          <Row>
            <Label bold>Modo demo</Label>
            <Pill text="DEMO" color={t.info} />
          </Row>
          <Label muted size={14}>
            La app está usando datos de ejemplo guardados solo en este equipo. Para usar varios locales, personal e
            inicio de sesión, conecta Supabase (ver README).
          </Label>
        </Card>
      ) : null}

      {manager ? (
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {[
            { icon: 'book-open-variant' as const, label: 'Catálogo', hint: 'Productos, precios, insumos y recetas', href: '/catalogo' as const, color: t.info },
            { icon: 'receipt-text-outline' as const, label: 'Gastos', hint: 'Compras, nómina y servicios', href: '/gastos' as const, color: t.accent },
          ].map((item, i) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              onPress={() => router.push(item.href)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: t.border }}>
              <IconBadge name={item.icon} color={item.color} />
              <View style={{ flex: 1 }}>
                <Label bold size={16}>{item.label}</Label>
                <Label muted size={13}>{item.hint}</Label>
              </View>
              <Icon name="chevron-right" color={t.textSecondary} />
            </Pressable>
          ))}
        </Card>
      ) : null}
      {manager ? <Commissions /> : null}
      {manager && !ctx.demo ? <Locations /> : null}
      {manager && !ctx.demo ? <Staff /> : null}

      {!ctx.demo ? (
        <Button
          icon="logout"
          title="Cerrar sesión"
          variant="danger"
          onPress={async () => {
            const n = await pendingSyncCount(db);
            if (n > 0) {
              Alert.alert(
                'Hay cambios sin subir',
                `${n} cambios aún no están en la nube. Se subirán cuando alguien vuelva a entrar en este equipo con internet.`,
              );
            }
            await auth.signOut();
          }}
        />
      ) : null}
    </Screen>
  );
}

function Commissions() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const t = useTheme();
  const [pya, setPya] = useState('');
  const [uber, setUber] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getCommissionRates(db, ctx.businessId).then((r) => {
      setPya(String(Math.round((r.pedidosya ?? 0) * 1000) / 10));
      setUber(String(Math.round((r.ubereats ?? 0) * 1000) / 10));
    });
  }, [db, ctx.businessId]);

  async function save() {
    const rows = [
      { platform_id: 'pedidosya', commission_rate: Number(pya.replace(',', '.')) / 100 },
      { platform_id: 'ubereats', commission_rate: Number(uber.replace(',', '.')) / 100 },
    ];
    if (rows.some((r) => !Number.isFinite(r.commission_rate) || r.commission_rate < 0 || r.commission_rate >= 1)) {
      return setMsg('Escribe porcentajes entre 0 y 99.');
    }
    if (supabase && !ctx.demo) {
      const { error } = await supabase
        .from('platform_commissions')
        .upsert(rows.map((r) => ({ ...r, business_id: ctx.businessId })));
      if (error) return setMsg(`No se pudo guardar en la nube: ${error.message}`);
    }
    for (const r of rows) {
      await db.runAsync(
        'INSERT OR REPLACE INTO platform_commissions (business_id, platform_id, commission_rate) VALUES (?, ?, ?)',
        [ctx.businessId, r.platform_id, r.commission_rate],
      );
    }
    setMsg('Comisiones guardadas. Aplican a las ventas nuevas.');
  }

  return (
    <Card>
      <SectionTitle icon="percent-outline">Comisiones de delivery</SectionTitle>
      <Field label="PedidosYa (%)" icon="moped" keyboardType="decimal-pad" value={pya} onChangeText={setPya} />
      <Field label="Uber Eats (%)" icon="truck-delivery-outline" keyboardType="decimal-pad" value={uber} onChangeText={setUber} />
      {msg ? <Label size={14} color={t.textSecondary}>{msg}</Label> : null}
      <Button icon="content-save" title="Guardar comisiones" onPress={save} />
    </Card>
  );
}

function useCloudList<T>(table: string, businessId: string, extra?: (q: any) => any) {
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!supabase) return;
    let q = supabase.from(table).select('*').eq('business_id', businessId);
    if (extra) q = extra(q);
    const { data, error: e } = await q;
    if (e) setError('Sin conexión: no se pudo cargar.');
    else {
      setError('');
      setRows((data ?? []) as T[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, businessId]);
  useEffect(() => {
    load();
  }, [load]);
  return { rows, error, load };
}

function Locations() {
  const ctx = useBusiness();
  const { reload } = useBusinessState();
  const t = useTheme();
  const { rows, error, load } = useCloudList<Loc>('locations', ctx.businessId, (q) => q.eq('active', true).order('name'));
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  async function add() {
    if (!supabase) return;
    const { error: e } = await supabase.from('locations').insert({ business_id: ctx.businessId, name: name.trim() });
    if (e) return setMsg(e.message);
    setName('');
    setMsg('Local agregado.');
    await load();
    reload(); // vuelve a descargar el catálogo con el local nuevo
  }

  return (
    <Card>
      <SectionTitle icon="store-marker">Locales</SectionTitle>
      {error ? <Label size={14} color={t.danger}>{error}</Label> : null}
      {rows.map((l) => (
        <Row key={l.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <IconBadge name="store" color={t.primary} size={34} />
            <Label bold size={15}>{l.name}</Label>
          </View>
          {l.id === ctx.locationId ? <Pill text="ESTÁS AQUÍ" color={t.success} /> : null}
        </Row>
      ))}
      <Field label="Nuevo local" icon="store-plus-outline" value={name} onChangeText={setName} placeholder="Ej. Sucursal Los Alcarrizos" />
      {msg ? <Label size={14} color={t.textSecondary}>{msg}</Label> : null}
      <Button icon="plus" title="Agregar local" variant="secondary" onPress={add} disabled={!name.trim()} />
    </Card>
  );
}

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

function Staff() {
  const ctx = useBusiness();
  const t = useTheme();
  const { rows, error, load } = useCloudList<Member>('members', ctx.businessId, (q) => q.order('created_at'));
  const locations = useCloudList<Loc>('locations', ctx.businessId, (q) => q.eq('active', true).order('name'));
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('cajero');
  const [loc, setLoc] = useState<string>('todos');
  const [msg, setMsg] = useState('');

  const locName = (id: string | null) =>
    id === null ? 'Todos los locales' : (locations.rows.find((l) => l.id === id)?.name ?? 'Local');

  async function add() {
    if (!supabase) return;
    const { error: e } = await supabase.rpc('add_member', {
      p_business: ctx.businessId,
      p_email: email.trim(),
      p_role: role,
      p_location: loc === 'todos' ? null : loc,
    });
    if (e) return setMsg(e.message);
    setEmail('');
    setMsg('Persona agregada. Ya puede entrar con su cuenta.');
    load();
  }

  async function remove(m: Member) {
    if (!supabase) return;
    const { error: e } = await supabase.from('members').delete().eq('id', m.id);
    if (e) setMsg(e.message);
    load();
  }

  return (
    <Card>
      <SectionTitle icon="account-group">Personal</SectionTitle>
      {error ? <Label size={14} color={t.danger}>{error}</Label> : null}
      {rows.map((m) => (
        <Row key={m.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <IconBadge name={m.role === 'cocina' ? 'chef-hat' : m.role === 'cajero' ? 'cash-register' : 'account-tie'} color={t.info} size={34} />
            <View style={{ flex: 1 }}>
              <Label bold size={15} numberOfLines={1}>{m.display_name ?? 'Sin nombre'}</Label>
              <Label muted size={13} numberOfLines={1}>{ROLE_LABELS[m.role]} · {locName(m.location_id)}</Label>
            </View>
          </View>
          {m.user_id !== ctx.userId && (m.role !== 'dueno' || ctx.role === 'dueno') ? (
            <Button size="sm" icon="account-remove-outline" title="Quitar" variant="danger" onPress={() => remove(m)} />
          ) : null}
        </Row>
      ))}
      <Label muted size={14}>
        La persona primero crea su cuenta en la app con su correo. Luego la agregas aquí.
      </Label>
      <Field
        label="Correo de la persona"
        icon="email-outline"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Chips options={ROLE_OPTIONS.filter((r) => r.value !== 'dueno' || ctx.role === 'dueno')} value={role} onChange={setRole} />
      <Chips
        options={[{ value: 'todos', label: 'Todos los locales' }, ...locations.rows.map((l) => ({ value: l.id, label: l.name }))]}
        value={loc}
        onChange={setLoc}
      />
      {msg ? <Label size={14} color={t.textSecondary}>{msg}</Label> : null}
      <Button icon="account-plus" title="Agregar persona" variant="secondary" onPress={add} disabled={!email.trim()} />
    </Card>
  );
}
