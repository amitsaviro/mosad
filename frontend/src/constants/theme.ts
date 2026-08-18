/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1A1D23',
    background: '#F7F8FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E8ECF7',
    textSecondary: '#60646C',
    border: '#E2E5EB',
    // Darkened from the original #4C6FFF/#E5484D/#2FAE60 -- those read
    // fine as fills, but fell short of WCAG AA's 4.5:1 text-contrast
    // minimum both as white-on-color button labels and as colored
    // text (e.g. ThemedText type="linkPrimary") on the light
    // background/card. These pass 4.5:1+ against both.
    primary: '#3A61FF',
    primaryPressed: '#2E4FDB',
    onPrimary: '#FFFFFF',
    danger: '#DF2026',
    dangerPressed: '#C01B21',
    success: '#238248',
    card: '#FFFFFF',
    cardShadow: 'rgba(20, 24, 40, 0.08)',
  },
  dark: {
    text: '#F2F3F5',
    background: '#111318',
    backgroundElement: '#1C1F26',
    backgroundSelected: '#2A2F45',
    textSecondary: '#9AA0AC',
    border: '#2C303A',
    primary: '#7C93FF',
    primaryPressed: '#95A8FF',
    onPrimary: '#0E1020',
    danger: '#FF6B6F',
    dangerPressed: '#FF8589',
    success: '#3FC172',
    card: '#1C1F26',
    cardShadow: 'rgba(0, 0, 0, 0.4)',
  },
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

export const Radius = {
  small: 8,
  medium: 14,
  large: 20,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
