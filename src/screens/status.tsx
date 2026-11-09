import { ActivityIndicator, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth';
import { Logo } from '@/components/logo';
import { Button, Label, Screen } from '@/components/ui';
import { Mamey } from '@/constants/theme';
import { useBusinessState } from '@/hooks/use-business';

export function LoadingScreen({ message }: { message?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, backgroundColor: Mamey }}>
      <Logo size={64} color="#FFFFFF" />
      <ActivityIndicator color="#FFFFFF" size="large" />
      {message ? <Text style={{ color: '#FFFFFFE6', fontWeight: '700', fontSize: 15 }}>{message}</Text> : null}
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
