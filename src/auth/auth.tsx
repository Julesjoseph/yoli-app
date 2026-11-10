import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { SITE_URL } from '@/sync/config';
import { supabase } from '@/sync/supabase';

interface AuthState {
  /** true en modo demo: datos de ejemplo solo en este equipo, sin cuenta ni nube. */
  demo: boolean;
  /** Entrar al modo demo desde la pantalla de inicio de sesión. */
  enterDemo(): Promise<void>;
  /** Salir del modo demo y volver a la pantalla de inicio de sesión. */
  exitDemo(): Promise<void>;
  loading: boolean;
  session: Session | null;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(name: string, email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  /** Entrar con la cuenta de Google (hay que activarlo en Supabase). */
  signInWithGoogle(): Promise<string | null>;
  /** Envía el correo para cambiar la contraseña. */
  resetPassword(email: string): Promise<string | null>;
  /** true cuando la persona abrió el enlace de "cambiar contraseña". */
  recovering: boolean;
  updatePassword(password: string): Promise<string | null>;
}

const AuthContext = createContext<AuthState | null>(null);
const DEMO_KEY = 'yoli_demo';

const traducir = (msg: string) => {
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(msg)) return 'Confirma tu correo antes de entrar (revisa tu bandeja de entrada).';
  if (/already registered/i.test(msg)) return 'Ya existe una cuenta con ese correo.';
  if (/password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/network|fetch/i.test(msg)) return 'Sin conexión a internet. Intenta de nuevo.';
  if (/provider is not enabled|unsupported provider/i.test(msg)) return 'El acceso con Google aún no está activado.';
  if (/rate limit|security purposes/i.test(msg)) return 'Espera un momento antes de intentarlo otra vez.';
  if (/sending confirmation email|sending recovery email/i.test(msg)) return 'No se pudo enviar el correo. Intenta más tarde.';
  return msg;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [demoChosen, setDemoChosen] = useState<boolean | null>(supabase ? null : true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DEMO_KEY)
      .then((v) => setDemoChosen(!supabase || v === '1'))
      .catch(() => setDemoChosen(!supabase));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    // getSession lee la sesión guardada en el equipo, así funciona sin internet.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    demo: !!demoChosen,
    loading: loading || demoChosen === null,
    session: demoChosen ? null : session,
    async enterDemo() {
      await AsyncStorage.setItem(DEMO_KEY, '1').catch(() => undefined);
      setDemoChosen(true);
    },
    async exitDemo() {
      if (!supabase) return;
      await AsyncStorage.removeItem(DEMO_KEY).catch(() => undefined);
      setDemoChosen(false);
    },
    async signIn(email, password) {
      if (!supabase) return null;
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error ? traducir(error.message) : null;
    },
    async signUp(name, email, password) {
      if (!supabase) return null;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim() } },
      });
      if (error) return traducir(error.message);
      if (!data.session) return 'Cuenta creada. Revisa tu correo para confirmarla y luego entra.';
      return null;
    },
    async signOut() {
      await supabase?.auth.signOut();
    },
    async signInWithGoogle() {
      if (!supabase) return null;
      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        return error ? traducir(error.message) : null;
      }
      // Teléfono: se abre Google en el navegador y vuelve a la app con yoliapp://auth
      const redirectTo = Linking.createURL('auth');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) return traducir(error?.message ?? 'No se pudo abrir Google.');
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== 'success') return null;
      const params = new URLSearchParams(res.url.split('#')[1] ?? res.url.split('?')[1] ?? '');
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (!access_token || !refresh_token) return params.get('error_description') ?? 'Google no devolvió la sesión.';
      const { error: e2 } = await supabase.auth.setSession({ access_token, refresh_token });
      return e2 ? traducir(e2.message) : null;
    },
    async resetPassword(email) {
      if (!supabase) return null;
      if (!email.trim()) return 'Escribe tu correo arriba y vuelve a tocar “¿Olvidaste tu contraseña?”.';
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: Platform.OS === 'web' ? window.location.origin : SITE_URL,
      });
      return error ? traducir(error.message) : null;
    },
    recovering,
    async updatePassword(password) {
      if (!supabase) return null;
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return traducir(error.message);
      setRecovering(false);
      return null;
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
