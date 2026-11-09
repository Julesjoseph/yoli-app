import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth';
import { Logo } from '@/components/logo';
import { Button, Card, Chips, Field, Icon, Label } from '@/components/ui';
import { Mamey } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const FEATURES = [
  { icon: 'cash-register', text: 'Caja rápida' },
  { icon: 'moped', text: 'PedidosYa y Uber Eats' },
  { icon: 'chart-box', text: 'Ganancias al día' },
] as const;

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
    const error = mode === 'entrar' ? await auth.signIn(email, password) : await auth.signUp(name, email, password);
    setBusy(false);
    if (error) setMsg(error);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={[styles.hero, { backgroundColor: Mamey }]}>
            <SafeAreaView edges={['top']} style={{ gap: 18 }}>
              <View style={{ gap: 10, alignItems: 'center' }}>
                <Logo size={54} color="#FFFFFF" />
                <Text style={styles.tagline}>Ventas, inventario y ganancias de tu negocio, en un solo lugar.</Text>
              </View>
              <View style={styles.features}>
                {FEATURES.map((f) => (
                  <View key={f.text} style={styles.feature}>
                    <Icon name={f.icon} size={16} color="#FFFFFF" />
                    <Text style={styles.featureText}>{f.text}</Text>
                  </View>
                ))}
              </View>
            </SafeAreaView>
          </View>

          <View style={styles.formWrap}>
            <Card style={{ gap: 14, padding: 20 }}>
              <Chips
                options={[
                  { value: 'entrar', label: 'Entrar', icon: 'login' },
                  { value: 'registro', label: 'Crear cuenta', icon: 'account-plus' },
                ]}
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setMsg('');
                }}
              />
              {mode === 'registro' ? (
                <Field label="Tu nombre" icon="account-circle" value={name} onChangeText={setName} autoComplete="name" placeholder="Ej. Juana Pérez" />
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
              <Field
                label="Contraseña"
                icon="lock-outline"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
                placeholder="Mínimo 6 caracteres"
                onSubmitEditing={submit}
              />
              {msg ? (
                <View style={[styles.msg, { backgroundColor: t.dangerSoft }]}>
                  <Icon name="alert-circle" size={18} color={t.danger} />
                  <Label color={t.danger} size={14} style={{ flex: 1 }}>{msg}</Label>
                </View>
              ) : null}
              <Button
                size="lg"
                icon={mode === 'entrar' ? 'arrow-right' : 'check'}
                title={busy ? 'Un momento…' : mode === 'entrar' ? 'Entrar' : 'Crear cuenta'}
                onPress={submit}
                disabled={busy || !email || !password || (mode === 'registro' && !name)}
              />
            </Card>
            {mode === 'registro' ? (
              <Label muted size={14} style={{ textAlign: 'center', paddingHorizontal: 12 }}>
                ¿Eres empleado? Crea tu cuenta y pide al dueño que te agregue desde Ajustes.
              </Label>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 24, paddingBottom: 64, paddingTop: 28, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  tagline: { color: '#FFFFFFE6', fontSize: 17, fontWeight: '500', lineHeight: 23, textAlign: 'center' },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF2E', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  featureText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  formWrap: { marginTop: -36, paddingHorizontal: 16, paddingBottom: 40, gap: 14, width: '100%', maxWidth: 520, alignSelf: 'center' },
  msg: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, padding: 10 },
});
