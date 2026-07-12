/**
 * PocketTune design tokens — Apple-inspired system.
 *
 * Chart colors are the validated dataviz reference palette (CVD-safe ordering,
 * per-mode steps); UI chrome follows iOS conventions: system font, grouped
 * cards, hairline separators, one accent.
 */
import { useColorScheme } from 'react-native';

export interface Theme {
  dark: boolean;
  /** page background (behind cards) */
  page: string;
  /** card / chart surface */
  surface: string;
  /** elevated surface (sheets, tab bar) */
  surfaceElevated: string;
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string;
  hairline: string;
  gridline: string;
  baseline: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  /** categorical series, fixed order — never cycled */
  series: string[];
  good: string;
  warning: string;
  critical: string;
  goodText: string;
  /** subtle fill for chips/segmented tracks */
  fill: string;
  fillStrong: string;
}

const light: Theme = {
  dark: false,
  page: '#f2f2f0',
  surface: '#fcfcfb',
  surfaceElevated: '#fcfcfb',
  inkPrimary: '#0b0b0b',
  inkSecondary: '#52514e',
  inkMuted: '#898781',
  hairline: 'rgba(11,11,11,0.10)',
  gridline: '#e1e0d9',
  baseline: '#c3c2b7',
  accent: '#2a78d6',
  accentSoft: 'rgba(42,120,214,0.12)',
  onAccent: '#ffffff',
  series: ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948'],
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  goodText: '#006300',
  fill: 'rgba(11,11,11,0.05)',
  fillStrong: 'rgba(11,11,11,0.09)',
};

const dark: Theme = {
  dark: true,
  page: '#0d0d0d',
  surface: '#1a1a19',
  surfaceElevated: '#232322',
  inkPrimary: '#ffffff',
  inkSecondary: '#c3c2b7',
  inkMuted: '#898781',
  hairline: 'rgba(255,255,255,0.10)',
  gridline: '#2c2c2a',
  baseline: '#383835',
  accent: '#3987e5',
  accentSoft: 'rgba(57,135,229,0.18)',
  onAccent: '#ffffff',
  series: ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767'],
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  goodText: '#0ca30c',
  fill: 'rgba(255,255,255,0.06)',
  fillStrong: 'rgba(255,255,255,0.11)',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  card: 18,
  control: 12,
  pill: 100,
  chip: 8,
} as const;

/** iOS-style type scale (system font). */
export const type = {
  largeTitle: { fontSize: 32, fontWeight: '700' as const, letterSpacing: 0.2 },
  title2: { fontSize: 21, fontWeight: '700' as const, letterSpacing: 0.1 },
  headline: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 21 },
  subhead: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  footnote: { fontSize: 12, fontWeight: '400' as const },
  caption: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.4 },
  hero: { fontSize: 48, fontWeight: '800' as const, letterSpacing: -0.5 },
  statValue: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.2 },
} as const;
