import type { ComponentProps } from 'react';
import { Platform, Text as RNText } from 'react-native';

/**
 * Texto de la app. En algunos Android (Oppo, Realme, Xiaomi, Samsung…) la letra
 * del sistema mide distinto que la que dibuja, y se cortaban precios y la última
 * letra de las palabras en negrita. Fijando la letra (Roboto) se mide bien.
 */
const ANDROID_FONT = Platform.OS === 'android' ? { fontFamily: 'Roboto' } : null;

export function Text({ style, ...props }: ComponentProps<typeof RNText>) {
  return <RNText {...props} style={ANDROID_FONT ? [ANDROID_FONT, style] : style} />;
}
