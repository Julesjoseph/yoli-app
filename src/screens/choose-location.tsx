import { Pressable } from 'react-native';

import { useAuth } from '@/auth/auth';
import { Button, Card, Label, Screen } from '@/components/ui';
import { useBusinessState, type LocationOption } from '@/hooks/use-business';

export function ChooseLocationScreen({ options }: { options: LocationOption[] }) {
  const { chooseLocation } = useBusinessState();
  const auth = useAuth();
  return (
    <Screen title="¿En qué local estás?">
      {options.length === 0 ? (
        <Label muted>No tienes locales asignados. Pide al dueño que te asigne uno.</Label>
      ) : null}
      {options.map((o) => (
        <Pressable key={o.id} accessibilityRole="button" onPress={() => chooseLocation(o)}>
          <Card>
            <Label bold size={18}>{o.name}</Label>
          </Card>
        </Pressable>
      ))}
      <Button title="Cerrar sesión" variant="secondary" onPress={auth.signOut} />
    </Screen>
  );
}
