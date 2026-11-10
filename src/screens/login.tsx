import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth';
import { Logo } from '@/components/logo';
import { Text } from '@/components/text';
import { Button, Field, Icon, Label } from '@/components/ui';
import { pendingSyncCount } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';
import { DEMO_EMAIL, DEMO_PASSWORD, GOOGLE_LOGIN } from '@/sync/config';
import { supabase } from '@/sync/supabase';

/** Cabecera mamey con círculos decorativos y la hoja blanca redondeada debajo. */
function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.brand }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View pointerEvents="none" style={[styles.circle, styles.circleBig]} />
            <View pointerEvents="none" style={[styles.circle, styles.circleSmall]} />
            <SafeAreaView edges={['top']} style={styles.heroInner}>
              <View style={{ alignSelf: 'center' }}>
                <Logo size={40} color="#FFFFFF" />
              </View>
              <View style={{ gap: 8, marginTop: 26, alignItems: 'center' }}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </View>
            </SafeAreaView>
          </View>
          <View style={[styles.sheet, { backgroundColor: t.backgroundElement }]}>
            <View style={styles.sheetInner}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function OrDivider() {
  const t = useTheme();
  return (
    <View style={styles.or}>
      <View style={[styles.orLine, { backgroundColor: t.border }]} />
      <Text style={{ color: t.textSecondary, fontSize: 14 }}>o</Text>
      <View style={[styles.orLine, { backgroundColor: t.border }]} />
    </View>
  );
}

function OutlineButton({ title, icon, onPress, disabled }: { title: string; icon?: Parameters<typeof Icon>[0]['name']; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.outline,
        { borderColor: t.border, backgroundColor: pressed ? t.backgroundSelected : t.backgroundElement, opacity: disabled ? 0.5 : 1 },
      ]}>
      {icon ? <Icon name={icon} size={20} color={icon === 'google' ? '#DB4437' : t.text} /> : null}
      <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{title}</Text>
    </Pressable>
  );
}

function Message({ text, ok }: { text: string; ok?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.msg, { backgroundColor: ok ? t.successSoft : t.dangerSoft }]}>
      <Icon name={ok ? 'check-circle' : 'alert-circle'} size={18} color={ok ? t.success : t.danger} />
      <Label color={ok ? t.success : t.danger} size={14} style={{ flex: 1 }}>
        {text}
      </Label>
    </View>
  );
}

function PasswordField(props: { label: string; value: string; onChangeText: (v: string) => void; autoComplete: 'current-password' | 'new-password'; onSubmitEditing?: () => void }) {
  const t = useTheme();
  const [show, setShow] = useState(false);
  return (
    <Field
      label={props.label}
      icon="lock-outline"
      value={props.value}
      onChangeText={props.onChangeText}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoComplete={props.autoComplete}
      placeholder="Mínimo 6 caracteres"
      onSubmitEditing={props.onSubmitEditing}
      right={
        <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Ocultar contraseña' : 'Ver contraseña'} hitSlop={10} onPress={() => setShow((s) => !s)}>
          <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={t.textSecondary} />
        </Pressable>
      }
    />
  );
}

/** En la PC el navegador puede autocompletar el correo y la contraseña sin avisar a la app. */
function domValue(selector: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return '';
  return (document.querySelector(selector) as HTMLInputElement | null)?.value ?? '';
}

export function LoginScreen() {
  const auth = useAuth();
  const db = useSQLiteContext();
  const t = useTheme();
  const [mode, setMode] = useState<'entrar' | 'registro'>('entrar');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const entrar = mode === 'entrar';

  async function tryDemo() {
    // El demo usa datos de ejemplo en este equipo: no se entra si hay ventas reales sin subir.
    const pending = await pendingSyncCount(db).catch(() => 0);
    if (pending > 0) {
      setMsg({ text: `Hay ${pending} cambios de tu negocio sin subir. Entra con tu cuenta y sincroniza antes de usar el demo.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    // Demo en la nube (se ve igual en la PC y en los teléfonos). Sin internet, demo en este equipo.
    const error = supabase ? await auth.signIn(DEMO_EMAIL, DEMO_PASSWORD) : 'sin nube';
    setBusy(false);
    if (error) await auth.enterDemo();
  }

  async function submit() {
    if (busy) return;
    // El navegador puede autocompletar sin avisar: se revisa aquí y no se apaga el botón.
    const e = email || domValue('input[autocomplete="email"]');
    const pw = password || domValue('input[type="password"]');
    if (!entrar && !name.trim()) return setMsg({ text: 'Escribe tu nombre.' });
    if (!e.trim() || !pw) return setMsg({ text: 'Escribe tu correo y tu contraseña.' });
    setBusy(true);
    setMsg(null);
    const error = entrar ? await auth.signIn(e, pw) : await auth.signUp(name, e, pw);
    setBusy(false);
    if (error) setMsg({ text: error });
  }

  async function google() {
    setBusy(true);
    setMsg(null);
    const error = await auth.signInWithGoogle();
    setBusy(false);
    if (error) setMsg({ text: error });
  }

  async function forgot() {
    setBusy(true);
    setMsg(null);
    const error = await auth.resetPassword(email);
    setBusy(false);
    setMsg(error ? { text: error } : { text: `Te enviamos un correo a ${email.trim()} para cambiar tu contraseña.`, ok: true });
  }

  function switchMode() {
    setMode(entrar ? 'registro' : 'entrar');
    setMsg(null);
  }

  return (
    <AuthShell
      title={entrar ? 'Bienvenido.' : 'Crea tu cuenta.'}
      subtitle={
        entrar
          ? 'Entra para ver las ventas, el inventario y las ganancias de tu negocio.'
          : 'Empieza con 14 días gratis. Caja, delivery e inventario en un solo lugar.'
      }>
      {GOOGLE_LOGIN ? (
        <>
          <OutlineButton title="Continuar con Google" icon="google" onPress={google} disabled={busy} />
          <OrDivider />
        </>
      ) : null}

      {!entrar ? (
        <Field label="Tu nombre" icon="account-circle-outline" value={name} onChangeText={setName} autoComplete="name" placeholder="Ej. Juana Pérez" />
      ) : null}
      <Field
        label="Correo"
        icon="email-outline"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="tucorreo@ejemplo.com"
      />
      <PasswordField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        autoComplete={entrar ? 'current-password' : 'new-password'}
        onSubmitEditing={submit}
      />

      {msg ? <Message text={msg.text} ok={msg.ok} /> : null}

      <Button
        size="lg"
        title={busy ? 'Un momento…' : entrar ? 'Entrar' : 'Crear cuenta'}
        onPress={submit}
        disabled={busy}
      />
      {entrar ? (
        <Pressable accessibilityRole="link" onPress={forgot} disabled={busy} style={{ alignSelf: 'center', paddingVertical: 2 }}>
          <Text style={{ color: t.primary, fontWeight: '700', fontSize: 14 }}>¿Olvidaste tu contraseña?</Text>
        </Pressable>
      ) : null}
      <OrDivider />
      <OutlineButton title={entrar ? 'Crear cuenta' : 'Ya tengo cuenta'} onPress={switchMode} disabled={busy} />

      <Pressable accessibilityRole="button" onPress={tryDemo} disabled={busy} style={[styles.demo, { backgroundColor: t.primarySoft }]}>
        <Icon name="play-circle-outline" size={22} color={t.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.primary, fontWeight: '800', fontSize: 15 }}>Probar demo (sin cuenta)</Text>
          <Text style={{ color: t.textSecondary, fontSize: 13 }}>Un negocio de ejemplo aparte. Nunca toca tus datos.</Text>
        </View>
        <Icon name="chevron-right" size={22} color={t.primary} />
      </Pressable>
      {!entrar ? (
        <Label muted size={13} style={{ textAlign: 'center' }}>
          ¿Eres empleado? Crea tu cuenta y pide al dueño del negocio que te agregue.
        </Label>
      ) : null}
    </AuthShell>
  );
}

/** Se muestra al abrir el enlace de "cambiar contraseña" del correo. */
export function NewPasswordScreen() {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (password.length < 6) return setMsg('La contraseña debe tener al menos 6 caracteres.');
    if (password !== repeat) return setMsg('Las dos contraseñas no son iguales.');
    setBusy(true);
    setMsg('');
    const error = await auth.updatePassword(password);
    setBusy(false);
    if (error) setMsg(error);
  }

  return (
    <AuthShell title="Nueva contraseña." subtitle="Escribe tu nueva contraseña para entrar a YOLI.">
      <PasswordField label="Nueva contraseña" value={password} onChangeText={setPassword} autoComplete="new-password" />
      <PasswordField label="Repite la contraseña" value={repeat} onChangeText={setRepeat} autoComplete="new-password" onSubmitEditing={save} />
      {msg ? <Message text={msg} /> : null}
      <Button size="lg" title={busy ? 'Un momento…' : 'Guardar contraseña'} onPress={save} disabled={busy || !password || !repeat} />
      <OutlineButton title="Cancelar" onPress={() => auth.signOut()} disabled={busy} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  hero: { overflow: 'hidden', paddingHorizontal: 28, paddingTop: 30, paddingBottom: 58 },
  heroInner: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  circle: { position: 'absolute', borderRadius: 999, backgroundColor: '#FFFFFF' },
  circleBig: { width: 260, height: 260, top: -90, right: -80, opacity: 0.1 },
  circleSmall: { width: 130, height: 130, top: 110, right: 40, opacity: 0.07 },
  title: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { color: '#FFFFFFD9', fontSize: 16, lineHeight: 22, maxWidth: 380, textAlign: 'center' },
  sheet: { flex: 1, borderTopLeftRadius: 32, borderTopRightRadius: 32, marginTop: -26 },
  sheetInner: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 30, paddingBottom: 40, gap: 16 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
  outline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderRadius: 16, paddingVertical: 14 },
  msg: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, padding: 10 },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginTop: 6 },
});
