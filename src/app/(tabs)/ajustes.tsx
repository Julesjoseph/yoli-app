import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';

import { useAuth } from '@/auth/auth';
import { Button, Card, Chips, Field, Icon, IconBadge, Label, Pill, Row, Screen, SectionTitle, type IconName } from '@/components/ui';
import { Mamey } from '@/constants/theme';
import { getCommissionRates, pendingSyncCount, ROLE_LABELS, type Role } from '@/db/repo';
import { canManage, useBusiness, useBusinessState, useFocusData } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/sync/supabase';
import { pushOutbox } from '@/sync/sync';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'Y';
}

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

  const userName = (auth.session?.user.user_metadata?.name as string | undefined) ?? '';
  const menu: { icon: IconName; label: string; hint: string; onPress: () => void }[] = [
    { icon: 'storefront-outline', label: ctx.businessName, hint: ctx.demo ? `Local: ${ctx.locationName}` : `${ctx.locationName} · toca para cambiar de local`, onPress: () => { if (!ctx.demo) changeLocation(); } },
    ...(manager
      ? [
          { icon: 'book-open-variant' as const, label: 'Catálogo', hint: 'Productos, fotos, precios y recetas', onPress: () => router.push('/catalogo') },
          { icon: 'receipt-text-outline' as const, label: 'Gastos', hint: 'Compras, nómina y servicios', onPress: () => router.push('/gastos') },
          { icon: 'chart-box-outline' as const, label: 'Reportes', hint: 'Ventas, costos y ganancia', onPress: () => router.push('/reportes') },
        ]
      : []),
    { icon: 'package-variant', label: 'Inventario', hint: 'Stock e insumos del local', onPress: () => router.push('/inventario') },
    { icon: 'printer-pos', label: 'Impresora y ticket', hint: 'Datos del ticket y papel de 58 u 80 mm', onPress: () => router.push('/impresora') },
    { icon: 'receipt-text-check-outline', label: 'Orden actual', hint: 'Ver la orden de la caja', onPress: () => router.push('/orden') },
  ];

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
    <Screen title="Perfil">
      <View style={{ alignItems: 'center', gap: 6, paddingVertical: 4 }}>
        <View style={[styles.avatar, { backgroundColor: Mamey }]}>
          <Text style={styles.avatarText}>{initials(userName || ctx.businessName)}</Text>
        </View>
        <Label bold size={20} numberOfLines={1}>{userName || ctx.businessName}</Label>
        {!ctx.demo && auth.session?.user.email ? <Label muted size={14}>{auth.session.user.email}</Label> : null}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
          <Pill text={ROLE_LABELS[ctx.role].toUpperCase()} color={t.primary} />
          {ctx.demo ? <Pill text="DEMO" color={t.info} /> : null}
        </View>
      </View>

      <Card style={{ gap: 0, paddingVertical: 6 }}>
        {menu.map((item, i) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            onPress={item.onPress}
            style={[styles.menuRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
            <View style={[styles.menuIcon, { backgroundColor: t.primarySoft }]}>
              <Icon name={item.icon} size={20} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Label bold size={16}>{item.label}</Label>
              <Label muted size={13} numberOfLines={1}>{item.hint}</Label>
            </View>
            <Icon name="chevron-right" color={t.textSecondary} />
          </Pressable>
        ))}
      </Card>

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
            Estás usando un negocio de ejemplo guardado solo en este equipo. Nada de esto se sube a tu cuenta real.
          </Label>
          {supabase ? <Button icon="logout" title="Salir del demo" variant="secondary" onPress={auth.exitDemo} /> : null}
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

const styles = StyleSheet.create({
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarText: { color: '#FFFFFF', fontSize: 32, fontWeight: '900' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  menuIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
