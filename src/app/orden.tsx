import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { OrderPanel } from '@/components/order-panel';
import { Label, Screen } from '@/components/ui';
import { useBusiness } from '@/hooks/use-business';
import { useCart } from '@/hooks/use-cart';
import { useTheme } from '@/hooks/use-theme';

export default function OrderScreen() {
  const ctx = useBusiness();
  const cart = useCart();
  const t = useTheme();
  return (
    <Screen
      back
      title="Orden"
      subtitle={ctx.locationName}
      right={
        cart.lines.length ? (
          <Pressable onPress={cart.clear} accessibilityRole="button" hitSlop={8}>
            <Label bold color={t.danger} size={14}>Vaciar</Label>
          </Pressable>
        ) : undefined
      }>
      <OrderPanel onCharged={() => (router.canGoBack() ? router.back() : router.replace('/caja'))} />
    </Screen>
  );
}
