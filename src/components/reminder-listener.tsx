import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';

import { listShopping, shoppingSpeech } from '@/db/shopping';
import { useBusiness } from '@/hooks/use-business';
import { getVoiceEnabled, remindersSupported, speak } from '@/lib/reminders';

/**
 * Cuando suena el recordatorio de compras con la app abierta, lee la lista en voz alta.
 * Al tocar el aviso (con la app cerrada o en el fondo), abre la lista y la lee.
 */
export function ReminderListener() {
  const db = useSQLiteContext();
  const ctx = useBusiness();

  useEffect(() => {
    if (!remindersSupported) return;
    const isShopping = (n: Notifications.Notification) => n.request.content.data?.kind === 'compras';
    const readAloud = async () => {
      if (!(await getVoiceEnabled(db))) return;
      speak(shoppingSpeech(await listShopping(db, ctx)));
    };

    const received = Notifications.addNotificationReceivedListener((n) => {
      if (isShopping(n)) void readAloud();
    });
    const handled = new Set<string>();
    const open = (r: Notifications.NotificationResponse | null) => {
      if (!r || !isShopping(r.notification) || handled.has(r.notification.request.identifier)) return;
      handled.add(r.notification.request.identifier);
      void getVoiceEnabled(db).then((voice) => router.push({ pathname: '/compras', params: voice ? { leer: String(Date.now()) } : {} }));
    };
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    // La app estaba cerrada y se abrió tocando el aviso.
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r && Date.now() - r.notification.date < 5 * 60_000) open(r);
    });
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [db, ctx]);

  return null;
}
