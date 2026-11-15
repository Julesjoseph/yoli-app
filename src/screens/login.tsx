import { useSQLiteContext } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth';
import { Logo } from '@/components/logo';
import { Text } from '@/components/text';
import { Button, Field, Icon, Label } from '@/components/ui';
import { pendingSyncCount } from '@/db/repo';
import { checkEmail } from '@/lib/email-check';
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
  /** Correo sugerido cuando parece mal escrito (gmial.com → gmail.com). */
  const [suggestion, setSuggestion] = useState<{ typed: string; better: string } | null>(null);
  /** Correo que la persona confirmó que está bien aunque se le sugirió otro. */
  const [trusted, setTrusted] = useState('');
  /** Cuenta creada: falta activarla desde el correo. */
  const [sent, setSent] = useState<string | null>(null);
  const demoVisible = useDemoVisible();
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
    if (!entrar) {
      const check = checkEmail(e);
      if (check.error) return setMsg({ text: check.error });
      if (check.suggestion && trusted !== check.email) {
        setMsg(null);
        return setSuggestion({ typed: check.email, better: check.suggestion });
      }
      if (pw.length < 6) return setMsg({ text: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    setSuggestion(null);
    setBusy(true);
    setMsg(null);
    if (entrar) {
      const error = await auth.signIn(e, pw);
      setBusy(false);
      if (error) setMsg({ text: error });
      return;
    }
    const { error, confirm } = await auth.signUp(name, e, pw);
    setBusy(false);
    if (error) setMsg({ text: error });
    else if (confirm) setSent(e.trim().toLowerCase());
  }

  /** Al salir del campo de correo (al crear cuenta), avisa enseguida si se ve mal escrito. */
  function reviewEmail() {
    if (entrar || !email.trim()) return;
    const check = checkEmail(email);
    if (check.error) setMsg({ text: check.error });
    else if (check.suggestion && trusted !== check.email) setSuggestion({ typed: check.email, better: check.suggestion });
    else setSuggestion(null);
  }

  if (sent) {
    return (
      <Registered
        email={sent}
        onWrongEmail={() => {
          setSent(null);
          setMode('registro');
          setMsg({ text: 'Escribe el correo correcto y vuelve a tocar «Crear cuenta».' });
        }}
        onDone={() => {
          setSent(null);
          setMode('entrar');
          setEmail(sent);
          setPassword('');
          setMsg(null);
        }}
      />
    );
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
    setSuggestion(null);
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
        onChangeText={(v) => {
          setEmail(v);
          if (suggestion) setSuggestion(null);
        }}
        onBlur={reviewEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="tucorreo@ejemplo.com"
      />
      {suggestion ? (
        <View style={[styles.suggest, { backgroundColor: t.primarySoft }]}>
          <Label size={14}>
            ¿Quisiste decir <Label bold size={14} color={t.primary}>{suggestion.better}</Label>?
          </Label>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              icon="check"
              title="Sí, corregirlo"
              onPress={() => {
                setEmail(suggestion.better);
                setSuggestion(null);
                setMsg(null);
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              title="No, está bien así"
              onPress={() => {
                setTrusted(suggestion.typed);
                setSuggestion(null);
              }}
            />
          </View>
        </View>
      ) : null}
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

      {demoVisible ? (
        <Pressable accessibilityRole="button" onPress={tryDemo} disabled={busy} style={[styles.demo, { backgroundColor: t.primarySoft }]}>
          <Icon name="play-circle-outline" size={22} color={t.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.primary, fontWeight: '800', fontSize: 15 }}>Probar demo (sin cuenta)</Text>
            <Text style={{ color: t.textSecondary, fontSize: 13 }}>Un negocio de ejemplo aparte. Nunca toca tus datos.</Text>
          </View>
          <Icon name="chevron-right" size={22} color={t.primary} />
        </Pressable>
      ) : null}
      {!entrar ? (
        <Label muted size={13} style={{ textAlign: 'center' }}>
          ¿Eres empleado? Crea tu cuenta y pide al dueño del negocio que te agregue.
        </Label>
      ) : null}
    </AuthShell>
  );
}

/** Se muestra al abrir el enlace de "cambiar contraseña" del correo. */
const DEMO_VISIBLE_KEY = 'yoli_demo_visible';

/**
 * ¿Se muestra "Probar demo"? Lo decide el administrador de YOLI (Clientes de YOLI ›
 * Desactivar demo). Se recuerda en el equipo para que sin internet se vea igual.
 */
function useDemoVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(DEMO_VISIBLE_KEY)
      .then((v) => alive && v === '0' && setVisible(false))
      .catch(() => undefined);
    supabase
      ?.rpc('demo_available')
      .then(({ data, error }) => {
        if (!alive || error || typeof data !== 'boolean') return; // sin la migración 0017 o sin internet: se deja como estaba
        setVisible(data);
        void AsyncStorage.setItem(DEMO_VISIBLE_KEY, data ? '1' : '0').catch(() => undefined);
      });
    return () => {
      alive = false;
    };
  }, []);
  return visible;
}

/** Proveedores de correo conocidos: botón para abrir la bandeja directo. */
function inboxFor(email: string): { name: string; url: string } | null {
  const domain = email.split('@')[1] ?? '';
  if (domain === 'gmail.com') return { name: 'Gmail', url: Platform.OS === 'web' ? 'https://mail.google.com/mail/u/0/#search/YOLI' : 'googlegmail://' };
  if (/^(hotmail|outlook|live|msn)\./.test(domain)) return { name: 'Outlook', url: 'https://outlook.live.com/mail/' };
  if (/^yahoo\./.test(domain)) return { name: 'Yahoo Mail', url: 'https://mail.yahoo.com/' };
  if (/^(icloud|me)\.com$/.test(domain)) return { name: 'iCloud Mail', url: 'https://www.icloud.com/mail' };
  return null;
}

/** Aviso después de crear la cuenta: hay que activarla desde el correo. */
function Registered({ email, onWrongEmail, onDone }: { email: string; onWrongEmail: () => void; onDone: () => void }) {
  const auth = useAuth();
  const t = useTheme();
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [wait, setWait] = useState(60);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);
  const inbox = inboxFor(email);

  async function resend() {
    setMsg(null);
    const error = await auth.resendConfirmation(email);
    setWait(60);
    setMsg(error ? { text: error } : { text: `Te enviamos otro correo a ${email}.`, ok: true });
  }

  async function openInbox() {
    if (!inbox) return;
    const ok = await Linking.canOpenURL(inbox.url).catch(() => false);
    await Linking.openURL(ok || Platform.OS === 'web' ? inbox.url : 'https://mail.google.com/').catch(() => undefined);
  }

  return (
    <AuthShell title="¡Ya estás registrado!" subtitle="Solo falta un paso: activar tu cuenta desde tu correo.">
      <View style={[styles.sentBox, { backgroundColor: t.primarySoft }]}>
        <View style={[styles.sentIcon, { backgroundColor: t.primary }]}>
          <Icon name="email-check-outline" size={30} color="#FFFFFF" />
        </View>
        <Label muted size={14} style={{ textAlign: 'center' }}>Te enviamos un correo de activación a</Label>
        <Label bold size={17} style={{ textAlign: 'center' }}>{email}</Label>
      </View>

      <View style={{ gap: 10 }}>
        {[
          'Abre tu correo y busca el mensaje «Confirma tu cuenta de YOLI».',
          'Toca el botón del correo para activar tu cuenta.',
          'Vuelve aquí y entra con tu correo y tu contraseña.',
        ].map((step, i) => (
          <View key={step} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={[styles.step, { backgroundColor: t.primary }]}>
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>{i + 1}</Text>
            </View>
            <Label size={15} style={{ flex: 1 }}>{step}</Label>
          </View>
        ))}
        <Label muted size={13}>¿No lo ves? Revisa la carpeta de Spam o Promociones. Puede tardar unos minutos.</Label>
      </View>

      {msg ? <Message text={msg.text} ok={msg.ok} /> : null}

      {inbox ? <Button size="lg" icon="email-open-outline" title={`Abrir ${inbox.name}`} onPress={openInbox} /> : null}
      <Button size={inbox ? 'md' : 'lg'} variant={inbox ? 'secondary' : 'primary'} icon="login" title="Ya la activé, entrar" onPress={onDone} />
      <OutlineButton title={wait > 0 ? `Reenviar correo (${wait} s)` : 'Reenviar correo'} icon="email-sync-outline" onPress={resend} disabled={wait > 0} />
      <Pressable accessibilityRole="link" onPress={onWrongEmail} style={{ alignSelf: 'center', paddingVertical: 4 }}>
        <Text style={{ color: t.primary, fontWeight: '700', fontSize: 14 }}>¿Ese no es tu correo? Corrígelo</Text>
      </Pressable>
    </AuthShell>
  );
}

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
  suggest: { borderRadius: 14, padding: 12, gap: 10, marginTop: -4 },
  sentBox: { borderRadius: 20, padding: 18, gap: 6, alignItems: 'center' },
  sentIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  step: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
