import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';

import { ThemePreferenceProvider, useColorScheme } from '@/hooks/use-color-scheme';

import { AuthProvider } from '@/auth/auth';
import { migrate } from '@/db/database';
import { BusinessProvider, useBusinessState } from '@/hooks/use-business';
import { CartProvider } from '@/hooks/use-cart';
import { ChooseLocationScreen } from '@/screens/choose-location';
import { CreateBusinessScreen } from '@/screens/create-business';
import { LoginScreen } from '@/screens/login';
import { BlockedScreen, ErrorScreen, LoadingScreen } from '@/screens/status';

function Gate() {
  const { phase } = useBusinessState();
  switch (phase.kind) {
    case 'loading':
      return <LoadingScreen message={phase.message} />;
    case 'login':
      return <LoginScreen />;
    case 'no-business':
      return <CreateBusinessScreen />;
    case 'choose-location':
      return <ChooseLocationScreen options={phase.options} />;
    case 'error':
      return <ErrorScreen message={phase.message} />;
    case 'blocked':
      return <BlockedScreen access={phase.access} businessName={phase.businessName} />;
    case 'ready':
      return (
        <CartProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </CartProvider>
      );
  }
}

/** En la PC solo una pestaña del navegador puede usar la base de datos a la vez. */
function DatabaseError({ error }: { error: Error }) {
  const otherTab = /access handle|another open/i.test(error.message);
  return (
    <View style={dbErr.wrap}>
      <View style={dbErr.card}>
        <Text style={dbErr.title}>{otherTab ? 'YOLI ya está abierta en otra pestaña' : 'No se pudo abrir la base de datos'}</Text>
        <Text style={dbErr.text}>
          {otherTab
            ? 'Cierra las otras pestañas de la app y vuelve a intentarlo. Solo una pestaña puede usarla a la vez.'
            : error.message}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => (typeof window !== 'undefined' ? window.location.reload() : undefined)}
          style={dbErr.button}>
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>Intentar de nuevo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const dbErr = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F26B1D', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, gap: 12, maxWidth: 440, width: '100%' },
  title: { fontSize: 20, fontWeight: '900', color: '#1C1917' },
  text: { fontSize: 15, color: '#57534E', lineHeight: 21 },
  button: { backgroundColor: '#EA580C', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
});

export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <ThemedRoot />
    </ThemePreferenceProvider>
  );
}

function ThemedRoot() {
  const colorScheme = useColorScheme();
  const [dbError, setDbError] = useState<Error | null>(null);
  if (dbError) return <DatabaseError error={dbError} />;
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <SQLiteProvider databaseName="yoli.db" onInit={migrate} onError={setDbError}>
        <AuthProvider>
          <BusinessProvider>
            <Gate />
          </BusinessProvider>
        </AuthProvider>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
