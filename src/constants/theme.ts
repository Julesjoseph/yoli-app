/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Mamey más oscuro (#CC6600) para que no canse la vista. Modo día y noche.
export const Colors = {
  light: {
    text: '#1F1B18',
    background: '#F6F3EF',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EFEAE4',
    textSecondary: '#78716C',
    primary: '#CC6600',
    primaryDeep: '#A85400',
    primarySoft: '#FBEBDA',
    accent: '#D99A2B',
    onPrimary: '#FFFFFF',
    success: '#2F9E5B',
    successSoft: '#DFF3E6',
    danger: '#D64545',
    dangerSoft: '#FBE4E4',
    info: '#3B6FD4',
    infoSoft: '#E0E9FB',
    border: '#E9E3DC',
    shadow: '#6B3416',
    /** Superficies de marca (portadas, avatar). */
    brand: '#CC6600',
    brandGradient: ['#D9781A', '#C25F00'] as readonly [string, string],
    /** Menú lateral / barra inferior */
    nav: '#CC6600',
    navText: '#FFFFFF',
    navMuted: '#FFFFFFD9',
    navActiveBg: '#FFFFFF',
    navActiveText: '#CC6600',
    navHover: '#FFFFFF24',
    navLogo: '#FFFFFF',
    navBorder: '#FFFFFF33',
  },
  dark: {
    text: '#F1ECE7',
    background: '#141110',
    backgroundElement: '#1E1A18',
    backgroundSelected: '#2A2522',
    textSecondary: '#A39C96',
    primary: '#E08A3A',
    primaryDeep: '#CC6600',
    primarySoft: '#3A2410',
    accent: '#E3B04F',
    onPrimary: '#FFFFFF',
    success: '#5CC487',
    successSoft: '#16291E',
    danger: '#EE7B7B',
    dangerSoft: '#3A1B1B',
    info: '#7DA4EE',
    infoSoft: '#18233A',
    border: '#2E2824',
    shadow: '#000000',
    brand: '#A65300',
    brandGradient: ['#B35E0A', '#8F4700'] as readonly [string, string],
    nav: '#8F4700',
    navText: '#FFF4EA',
    navMuted: '#FFF4EACC',
    navActiveBg: '#FFF4EA',
    navActiveText: '#8F4700',
    navHover: '#FFFFFF1F',
    navLogo: '#FFF4EA',
    navBorder: '#FFFFFF26',
  },
};

/** Degradado de marca (modo día). Usa `useTheme().brandGradient` para seguir el modo. */
export const BrandGradient = Colors.light.brandGradient;

/** Color mamey sólido de la marca (modo día). Usa `useTheme().brand` para seguir el modo. */
export const Mamey = Colors.light.brand;
export const MameyDeep = Colors.light.primaryDeep;

/** Color de cada canal de venta (igual en claro y oscuro) */
export const ChannelColors = {
  local: '#F97316',
  para_llevar: '#0EA5E9',
  pedidosya: '#E11D48',
  ubereats: '#16A34A',
} as const;

export type ThemeColor = { [K in keyof typeof Colors.light]: (typeof Colors.light)[K] extends string ? K : never }[keyof typeof Colors.light];

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
