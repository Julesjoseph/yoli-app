import { Pressable, View } from 'react-native';

import { useAuth } from '@/auth/auth';
import { Button, Card, Icon, IconBadge, Label, Row, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useBusinessState, type LocationOption } from '@/hooks/use-business';

export function ChooseLocationScreen({ options }: { options: LocationOption[] }) {
  const { chooseLocation } = useBusinessState();
  const auth = useAuth();
  const t = useTheme();
  return (
    <Screen title="¿En qué local estás?">
      {options.length === 0 ? (
        <Label muted>No tienes locales asignados. Pide al dueño que te asigne uno.</Label>
      ) : null}
      {options.map((o) => (
        <Pressable key={o.id} accessibilityRole="button" onPress={() => chooseLocation(o)}>
          <Card>
            <Row>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconBadge name="storefront-outline" color={t.primary} size={44} />
                <Label bold size={18}>{o.name}</Label>
              </View>
              <Icon name="chevron-right" color={t.textSecondary} />
            </Row>
          </Card>
        </Pressable>
      ))}
      <Button icon="logout" title="Cerrar sesión" variant="secondary" onPress={auth.signOut} />
    </Screen>
  );
}
