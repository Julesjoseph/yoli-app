import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { getSetting, setSettings } from '@/db/database';

/**
 * Recordatorio de la lista de compras: un aviso en el celular a la hora elegida
 * (una vez o todos los días) y la lista leída en voz alta.
 * El aviso y su hora se guardan en este equipo (cada quien pone el suyo).
 */

export const remindersSupported = Platform.OS !== 'web';
const CHANNEL = 'compras';
const KEY = 'compras_recordatorio';
const VOICE_KEY = 'compras_voz';

export type Reminder =
  | { id: string; kind: 'una_vez'; at: string }
  | { id: string; kind: 'diario'; hour: number; minute: number };

if (remindersSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function getReminder(db: SQLiteDatabase): Promise<Reminder | null> {
  const raw = await getSetting(db, KEY);
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Reminder;
    // Un aviso de una sola vez que ya pasó ya no cuenta.
    if (r.kind === 'una_vez' && new Date(r.at).getTime() < Date.now() - 60_000) return null;
    return r;
  } catch {
    return null;
  }
}

async function ensurePermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Recordatorio de compras',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#CC6600',
      sound: 'default',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Programa el aviso (reemplaza el anterior). */
export async function scheduleReminder(
  db: SQLiteDatabase,
  when: { kind: 'una_vez'; at: Date } | { kind: 'diario'; hour: number; minute: number },
  pendingCount: number,
): Promise<Reminder> {
  if (!remindersSupported) throw new Error('Los recordatorios funcionan en el celular o la tablet, no en la PC.');
  if (!(await ensurePermission())) {
    throw new Error('Permite las notificaciones de YOLI SOFT en los ajustes del celular para recibir el recordatorio.');
  }
  await cancelReminder(db);
  const content: Notifications.NotificationContentInput = {
    title: '🛒 Recordatorio de compras',
    body: pendingCount
      ? `Tienes ${pendingCount} ${pendingCount === 1 ? 'cosa' : 'cosas'} por comprar para el negocio. Toca para escuchar la lista.`
      : 'Revisa la lista de compras del negocio.',
    data: { kind: 'compras' },
    sound: 'default',
  };
  let reminder: Reminder;
  if (when.kind === 'una_vez') {
    if (when.at.getTime() <= Date.now()) throw new Error('Elige una hora que todavía no haya pasado.');
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when.at, channelId: CHANNEL },
    });
    reminder = { id, kind: 'una_vez', at: when.at.toISOString() };
  } else {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: when.hour, minute: when.minute, channelId: CHANNEL },
    });
    reminder = { id, kind: 'diario', hour: when.hour, minute: when.minute };
  }
  await setSettings(db, { [KEY]: JSON.stringify(reminder) });
  return reminder;
}

export async function cancelReminder(db: SQLiteDatabase) {
  const raw = await getSetting(db, KEY);
  if (raw && remindersSupported) {
    try {
      await Notifications.cancelScheduledNotificationAsync((JSON.parse(raw) as Reminder).id);
    } catch {
      // ya no existía
    }
  }
  await setSettings(db, { [KEY]: null });
}

/** Si se lee la lista en voz alta cuando llega el aviso (en este equipo). */
export async function getVoiceEnabled(db: SQLiteDatabase) {
  return (await getSetting(db, VOICE_KEY)) !== '0';
}
export const setVoiceEnabled = (db: SQLiteDatabase, on: boolean) => setSettings(db, { [VOICE_KEY]: on ? '1' : '0' });

/** Lee un texto en voz alta en español (con la voz del celular o de la PC). */
export function speak(text: string) {
  void Speech.stop();
  Speech.speak(text, { language: 'es-US', rate: 0.95, pitch: 1 });
}
export const stopSpeaking = () => Speech.stop();

export function describeReminder(r: Reminder) {
  const fmt = (d: Date) => d.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' });
  if (r.kind === 'diario') {
    const d = new Date();
    d.setHours(r.hour, r.minute, 0, 0);
    return `Todos los días a las ${fmt(d)}`;
  }
  const at = new Date(r.at);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  const day =
    at.toDateString() === today.toDateString()
      ? 'Hoy'
      : at.toDateString() === tomorrow.toDateString()
        ? 'Mañana'
        : at.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'short' });
  return `${day} a las ${fmt(at)}`;
}

export { parseTime } from './hora';
