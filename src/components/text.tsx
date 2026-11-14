import type { ComponentProps } from 'react';
import { Platform, StyleSheet, Text as RNText } from 'react-native';

const ANDROID = Platform.OS === 'android';

/**
 * Texto de la app. En varios Android (Motorola, Samsung, Xiaomi, Oppo…) la letra
 * del sistema en negrita extra (800/900) se mide más angosta de lo que se dibuja,
 * y se cortaban precios y la última letra de las palabras. En Android se usa una
 * letra fija (Roboto) y negrita normal, que se miden bien. También se limita
 * cuánto crece la letra si el celular la tiene muy grande.
 */
export function Text({ style, maxFontSizeMultiplier = 1.3, ...props }: ComponentProps<typeof RNText>) {
  if (!ANDROID) return <RNText {...props} maxFontSizeMultiplier={maxFontSizeMultiplier} style={style} />;
  const flat = StyleSheet.flatten(style) ?? {};
  const heavy = flat.fontWeight === '800' || flat.fontWeight === '900' || flat.fontWeight === 800 || flat.fontWeight === 900;
  return (
    <RNText
      {...props}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[{ fontFamily: 'Roboto' }, flat, heavy ? { fontWeight: 'bold' } : null]}
    />
  );
}
