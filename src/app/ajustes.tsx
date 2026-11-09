import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/auth/auth';
import { Button, Card, Chips, Field, Label, Row, Screen } from '@/components/ui';
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
      <Card>
        <Label bold size={18}>{ctx.businessName}</Label>
        <Row><Label muted>Local</Label><Label>{ctx.locationName}</Label></Row>
        <Row><Label muted>Tu rol</Label><Label>{ROLE_LABELS[ctx.role]}</Label></Row>
        {!ctx.demo ? <Row><Label muted>Cuenta</Label><Label size={14}>{auth.session?.user.email}</Label></Row> : null}
        {!ctx.demo ? <Button title="Cambiar de local" variant="secondary" onPress={changeLocation} /> : null}
      </Card>

      <Card>
        <Row><Label muted>Cambios pendientes de subir</Label><Label bold>{pending ?? 0}</Label></Row>
        <Button title="Sincronizar ahora" variant="secondary" onPress={sync} />
        {syncMsg ? <Label muted size={14}>{syncMsg}</Label> : null}
      </Card>

      {ctx.demo ? (
        <Card>
          <Label bold>Modo demo</Label>
          <Label muted size={14}>
            La app está usando datos de ejemplo guardados solo en este equipo. Para usar varios locales, personal e
            inicio de sesión, conecta Supabase (ver README).
          </Label>
        </Card>
      ) : null}

      {manager ? <Commissions /> : null}
      {manager && !ctx.demo ? <Locations /> : null}
      {manager && !ctx.demo ? <Staff /> : null}

      {!ctx.demo ? (
        <Button
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
      <Label bold size={18}>Comisiones de delivery</Label>
      <Field label="PedidosYa (%)" keyboardType="decimal-pad" value={pya} onChangeText={setPya} />
      <Field label="Uber Eats (%)" keyboardType="decimal-pad" value={uber} onChangeText={setUber} />
      {msg ? <Label size={14} color={t.textSecondary}>{msg}</Label> : null}
      <Button title="Guardar comisiones" onPress={save} />
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
      <Label bold size={18}>Locales</Label>
      {error ? <Label size={14} color={t.danger}>{error}</Label> : null}
      {rows.map((l) => (
        <Row key={l.id}>
          <Label>{l.name}</Label>
          {l.id === ctx.locationId ? <Label muted size={14}>Estás aquí</Label> : null}
        </Row>
      ))}
      <Field label="Nuevo local" value={name} onChangeText={setName} placeholder="Ej. Sucursal Los Alcarrizos" />
      {msg ? <Label size={14} color={t.textSecondary}>{msg}</Label> : null}
      <Button title="Agregar local" variant="secondary" onPress={add} disabled={!name.trim()} />
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
      <Label bold size={18}>Personal</Label>
      {error ? <Label size={14} color={t.danger}>{error}</Label> : null}
      {rows.map((m) => (
        <Row key={m.id}>
          <Label size={15}>
            {m.display_name ?? 'Sin nombre'} · {ROLE_LABELS[m.role]} · {locName(m.location_id)}
          </Label>
          {m.user_id !== ctx.userId && (m.role !== 'dueno' || ctx.role === 'dueno') ? (
            <Button title="Quitar" variant="secondary" style={{ paddingVertical: 6 }} onPress={() => remove(m)} />
          ) : null}
        </Row>
      ))}
      <Label muted size={14}>
        La persona primero crea su cuenta en la app con su correo. Luego la agregas aquí.
      </Label>
      <Field
        label="Correo de la persona"
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
      <Button title="Agregar persona" variant="secondary" onPress={add} disabled={!email.trim()} />
    </Card>
  );
}
