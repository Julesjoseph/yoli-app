/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1C1917',
    background: '#F7F5F2',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F1EDE8',
    textSecondary: '#78716C',
    primary: '#EA580C',
    primaryDeep: '#C2410C',
    primarySoft: '#FFEDD5',
    accent: '#F59E0B',
    onPrimary: '#FFFFFF',
    success: '#16A34A',
    successSoft: '#DCFCE7',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    info: '#2563EB',
    infoSoft: '#DBEAFE',
    border: '#ECE7E1',
    shadow: '#7C2D12',
  },
  dark: {
    text: '#FAFAF9',
    background: '#0C0A09',
    backgroundElement: '#1C1917',
    backgroundSelected: '#292524',
    textSecondary: '#A8A29E',
    primary: '#FB923C',
    primaryDeep: '#EA580C',
    primarySoft: '#3B1D0B',
    accent: '#FBBF24',
    onPrimary: '#FFFFFF',
    success: '#4ADE80',
    successSoft: '#0F2A1A',
    danger: '#F87171',
    dangerSoft: '#3A1414',
    info: '#60A5FA',
    infoSoft: '#132339',
    border: '#292524',
    shadow: '#000000',
  },
} as const;

/** Degradado de marca para botones y portadas */
export const BrandGradient = ['#F97316', '#E11D48'] as const;

/** Color de cada canal de venta (igual en claro y oscuro) */
export const ChannelColors = {
  local: '#F97316',
  para_llevar: '#0EA5E9',
  pedidosya: '#E11D48',
  ubereats: '#16A34A',
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
