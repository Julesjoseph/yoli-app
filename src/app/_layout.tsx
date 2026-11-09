import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { useColorScheme } from '@/hooks/use-color-scheme';

import { AuthProvider } from '@/auth/auth';
import { migrate } from '@/db/database';
import { BusinessProvider, useBusinessState } from '@/hooks/use-business';
import { CartProvider } from '@/hooks/use-cart';
import { ChooseLocationScreen } from '@/screens/choose-location';
import { CreateBusinessScreen } from '@/screens/create-business';
import { LoginScreen } from '@/screens/login';
import { ErrorScreen, LoadingScreen } from '@/screens/status';

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
    case 'ready':
      return (
        <CartProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </CartProvider>
      );
  }
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="dark" />
      <SQLiteProvider databaseName="yoli.db" onInit={migrate}>
        <AuthProvider>
          <BusinessProvider>
            <Gate />
          </BusinessProvider>
        </AuthProvider>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
