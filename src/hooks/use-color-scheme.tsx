import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';

/** Modo de colores elegido en Perfil: automático (como el equipo), día o noche. */
export type ThemePreference = 'auto' | 'light' | 'dark';

const KEY = 'yoli_tema';
const ThemeContext = createContext<{ preference: ThemePreference; setPreference(p: ThemePreference): void }>({
  preference: 'auto',
  setPreference: () => undefined,
});

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>('auto');
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => (v === 'light' || v === 'dark' || v === 'auto') && setPref(v))
      .catch(() => undefined);
  }, []);
  const setPreference = (p: ThemePreference) => {
    setPref(p);
    AsyncStorage.setItem(KEY, p).catch(() => undefined);
  };
  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export const useThemePreference = () => useContext(ThemeContext);

/** 'light' o 'dark' según lo elegido en Perfil (o el modo del equipo en automático). */
export function useColorScheme(): 'light' | 'dark' {
  const system = useSystemScheme();
  const { preference } = useContext(ThemeContext);
  if (preference === 'auto') return system === 'dark' ? 'dark' : 'light';
  return preference;
}
