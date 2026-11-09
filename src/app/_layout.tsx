import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { migrate } from '@/db/database';
import { BusinessProvider } from '@/hooks/use-business';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SQLiteProvider databaseName="yoli.db" onInit={migrate}>
        <BusinessProvider>
          <AppTabs />
        </BusinessProvider>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
