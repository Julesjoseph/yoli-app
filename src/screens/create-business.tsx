import { useState } from 'react';

import { useAuth } from '@/auth/auth';
import { Button, Card, Field, Label, Screen } from '@/components/ui';
import { useBusinessState } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';

export function CreateBusinessScreen() {
  const { createBusiness, reload } = useBusinessState();
  const auth = useAuth();
  const t = useTheme();
  const [name, setName] = useState('');
  const [rnc, setRnc] = useState('');
  const [location, setLocation] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const error = await createBusiness(name, rnc, location);
    setBusy(false);
    if (error) setMsg(error);
  }

  return (
    <Screen title="Tu negocio">
      <Label muted>
        Todavía no perteneces a ningún negocio. Si eres el dueño, créalo aquí. Si eres empleado, pide al dueño que te
        agregue con tu correo ({auth.session?.user.email}) y toca “Ya me agregaron”.
      </Label>
      <Card>
        <Field label="Nombre del negocio" icon="storefront-outline" value={name} onChangeText={setName} placeholder="Ej. Yoli Comida Rápida" />
        <Field label="RNC (opcional)" icon="card-account-details-outline" value={rnc} onChangeText={setRnc} keyboardType="number-pad" placeholder="101234567" />
        <Field label="Nombre del primer local" icon="map-marker-outline" value={location} onChangeText={setLocation} placeholder="Ej. Sucursal Centro" />
        {msg ? <Label color={t.danger} size={14}>{msg}</Label> : null}
        <Button size="lg" icon="rocket-launch" title={busy ? 'Creando…' : 'Crear negocio'} onPress={submit} disabled={busy || !name.trim()} />
      </Card>
      <Button icon="refresh" title="Ya me agregaron" variant="secondary" onPress={reload} />
      <Button icon="logout" title="Cerrar sesión" variant="ghost" onPress={auth.signOut} />
    </Screen>
  );
}
