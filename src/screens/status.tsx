import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/auth/auth';
import { Button, Label, Screen } from '@/components/ui';
import { useBusinessState } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';

export function LoadingScreen({ message }: { message?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: t.background }}>
      <ActivityIndicator color={t.primary} size="large" />
      {message ? <Label muted>{message}</Label> : null}
    </View>
  );
}

export function ErrorScreen({ message }: { message: string }) {
  const { reload } = useBusinessState();
  const auth = useAuth();
  return (
    <Screen title="Algo salió mal">
      <Label>{message}</Label>
      <Button title="Intentar de nuevo" onPress={reload} />
      {!auth.demo ? <Button title="Cerrar sesión" variant="secondary" onPress={auth.signOut} /> : null}
    </Screen>
  );
}
