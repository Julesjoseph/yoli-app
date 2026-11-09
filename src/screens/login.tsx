import { useState } from 'react';

import { useAuth } from '@/auth/auth';
import { Button, Card, Chips, Field, Label, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';

export function LoginScreen() {
  const auth = useAuth();
  const t = useTheme();
  const [mode, setMode] = useState<'entrar' | 'registro'>('entrar');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg('');
    const error =
      mode === 'entrar' ? await auth.signIn(email, password) : await auth.signUp(name, email, password);
    setBusy(false);
    if (error) setMsg(error);
  }

  return (
    <Screen title="YOLI APP">
      <Label muted>Control de ventas, inventario y gastos de tu negocio.</Label>
      <Card>
        <Chips
          options={[
            { value: 'entrar', label: 'Entrar' },
            { value: 'registro', label: 'Crear cuenta' },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setMsg('');
          }}
        />
        {mode === 'registro' ? (
          <Field label="Tu nombre" value={name} onChangeText={setName} autoComplete="name" placeholder="Ej. Juana Pérez" />
        ) : null}
        <Field
          label="Correo"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="tucorreo@ejemplo.com"
        />
        <Field
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
          onSubmitEditing={submit}
        />
        {msg ? <Label color={t.danger} size={14}>{msg}</Label> : null}
        <Button
          title={busy ? 'Un momento…' : mode === 'entrar' ? 'Entrar' : 'Crear cuenta'}
          onPress={submit}
          disabled={busy || !email || !password || (mode === 'registro' && !name)}
        />
      </Card>
      {mode === 'registro' ? (
        <Label muted size={14}>
          Si eres empleado, crea tu cuenta y pide al dueño o gerente que te agregue desde Ajustes.
        </Label>
      ) : null}
    </Screen>
  );
}
