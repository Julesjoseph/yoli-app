import { useState } from 'react';

import { useAuth } from '@/auth/auth';
import { Button, Card, Chips, Field, Label, Screen } from '@/components/ui';
import { useBusinessState, type BusinessKind } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';

export function CreateBusinessScreen() {
  const { createBusiness, reload } = useBusinessState();
  const auth = useAuth();
  const t = useTheme();
  const [name, setName] = useState('');
  const [rnc, setRnc] = useState('');
  const [location, setLocation] = useState('');
  const [kind, setKind] = useState<BusinessKind>('comida_rapida');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const error = await createBusiness(name, rnc, location, kind, phone);
    setBusy(false);
    if (error) setMsg(error);
  }

  return (
    <Screen title="Tu negocio">
      <Label muted>
        Bienvenido a YOLI. Si eres el dueño, crea tu negocio aquí: tienes 14 días de prueba gratis. Si eres empleado, pide
        al dueño que te agregue con tu correo ({auth.session?.user.email}) y toca “Ya me agregaron”.
      </Label>
      <Card>
        <Field label="Nombre del negocio" icon="storefront-outline" value={name} onChangeText={setName} placeholder="Ej. Comedor Doña Rosa" />
        <Label bold size={14}>Tipo de negocio</Label>
        <Chips
          options={[
            { value: 'comida_rapida', label: 'Comida rápida', icon: 'hamburger' },
            { value: 'comedor', label: 'Comedor', icon: 'silverware-fork-knife' },
            { value: 'cafeteria', label: 'Cafetería', icon: 'coffee' },
            { value: 'mixto', label: 'Mixto', icon: 'storefront-outline' },
          ]}
          value={kind}
          onChange={(v) => setKind(v as BusinessKind)}
        />
        <Field label="Teléfono / WhatsApp" icon="phone-outline" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="809-555-1234" />
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
