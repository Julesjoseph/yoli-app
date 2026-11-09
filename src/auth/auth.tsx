import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

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
}

const AuthContext = createContext<AuthState | null>(null);
const DEMO_KEY = 'yoli_demo';

const traducir = (msg: string) => {
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(msg)) return 'Confirma tu correo antes de entrar (revisa tu bandeja de entrada).';
  if (/already registered/i.test(msg)) return 'Ya existe una cuenta con ese correo.';
  if (/password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/network|fetch/i.test(msg)) return 'Sin conexión a internet. Intenta de nuevo.';
  return msg;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [demoChosen, setDemoChosen] = useState<boolean | null>(supabase ? null : true);

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
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
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
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
