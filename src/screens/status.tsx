import { ActivityIndicator, Linking, View } from 'react-native';

import { Text } from '@/components/text';

import { useAuth } from '@/auth/auth';
import { Logo } from '@/components/logo';
import { Button, Label, Screen } from '@/components/ui';
import { useBusinessState } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { DEMO_EMAIL, SUPPORT_EMAIL, SUPPORT_WHATSAPP } from '@/sync/config';

export function LoadingScreen({ message }: { message?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, backgroundColor: t.brand }}>
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

/** Suscripción vencida o suspendida: no se puede seguir vendiendo hasta renovar. */
export function BlockedScreen({ access, businessName }: { access: 'vencido' | 'suspendido'; businessName: string }) {
  const { reload } = useBusinessState();
  const auth = useAuth();
  const t = useTheme();
  const msg = encodeURIComponent(`Hola, quiero renovar YOLI para mi negocio "${businessName}".`);
  if ((auth.session?.user.email ?? '').toLowerCase() === DEMO_EMAIL) {
    return (
      <Screen title="Demo no disponible">
        <Label>El demo de YOLI no está disponible en este momento. Crea tu cuenta para probar YOLI con 14 días gratis.</Label>
        <Button icon="arrow-left" title="Volver" onPress={auth.signOut} />
      </Screen>
    );
  }
  return (
    <Screen title={access === 'suspendido' ? 'Cuenta suspendida' : 'Tu prueba terminó'}>
      <Label>
        {access === 'suspendido'
          ? `La cuenta de "${businessName}" está suspendida. Comunícate con YOLI para reactivarla.`
          : `La suscripción de "${businessName}" venció. Renueva para seguir usando la caja, el inventario y los reportes. Tus datos están guardados y no se pierden.`}
      </Label>
      {SUPPORT_WHATSAPP ? (
        <Button icon="whatsapp" title="Renovar por WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${msg}`)} />
      ) : null}
      {SUPPORT_EMAIL ? (
        <Button variant="secondary" icon="email-outline" title={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${msg}`)} />
      ) : null}
      <Label muted size={13} color={t.textSecondary}>Cuando te activen, toca “Ya renové”.</Label>
      <Button variant="secondary" icon="refresh" title="Ya renové" onPress={reload} />
      <Button variant="ghost" icon="logout" title="Cerrar sesión" onPress={auth.signOut} />
    </Screen>
  );
}
