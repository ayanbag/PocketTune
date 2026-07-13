/**
 * PocketTune app design tokens — warm-copper system: warm paper/charcoal
 * neutrals, one copper accent. (The site uses Apple's design language; the
 * app deliberately has its own warmer identity — chosen 2026-07-13 when the
 * blue scheme was rejected.)
 *
 * The copper accent doubles as the single-series chart mark color and is
 * validated per mode with the dataviz six-checks script (#b4531f on #fdfcfa,
 * #d0713a on #201c18 — both pass lightness band, chroma, contrast).
 * Multi-series charts keep the validated categorical reference palette in
 * `series` (CVD-safe ordering, per-mode steps) — do not reorder it.
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
  page: '#f4f1ec',
  surface: '#fdfcfa',
  surfaceElevated: '#fdfcfa',
  inkPrimary: '#1a1512',
  inkSecondary: '#575047',
  inkMuted: '#8d857a',
  hairline: 'rgba(26,21,18,0.10)',
  gridline: '#e7e2d9',
  baseline: '#cbc4b6',
  accent: '#b4531f',
  accentSoft: 'rgba(180,83,31,0.12)',
  onAccent: '#ffffff',
  series: ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948'],
  good: '#0ca30c',
  warning: '#c77d00',
  critical: '#d03b3b',
  goodText: '#006300',
  fill: 'rgba(26,21,18,0.05)',
  fillStrong: 'rgba(26,21,18,0.09)',
};

const dark: Theme = {
  dark: true,
  page: '#151210',
  surface: '#201c18',
  surfaceElevated: '#2a2521',
  inkPrimary: '#f8f4ef',
  inkSecondary: '#cbc3b7',
  inkMuted: '#8f877c',
  hairline: 'rgba(255,255,255,0.10)',
  gridline: '#2f2a25',
  baseline: '#3c362f',
  accent: '#d0713a',
  accentSoft: 'rgba(208,113,58,0.18)',
  onAccent: '#211106',
  series: ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767'],
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#e66767',
  goodText: '#3ec46a',
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
