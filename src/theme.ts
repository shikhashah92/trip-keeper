import { useColorScheme } from 'react-native';
import type { Theme } from './model';

// Trip Keeper: teal. `brand` is for fills (primary buttons, selected chips) with `onAccent` on top; `accent` is the
// teal that reads as text or an icon (the deep teal on light surfaces, the bright one on dark). Token names match Uplift's
// so the shared UI kit (ui.tsx) is the same code.
const light = {
  bg: '#F6F5F1', card: '#FFFFFF', text: '#1D2327', muted: '#6B7378', border: '#E4E2DB', chip: '#ECEAE3',
  brand: '#0F766E', accent: '#0F766E', onAccent: '#FFFFFF', accentSoft: '#E3F1EF',
  good: '#0F766E', goodSoft: '#E3F1EF', danger: '#B91C1C',
  field: '#FFFFFF', fieldBorder: '#C9C6BC', hint: '#A9ADB0', warnBg: '#FEF3C7', warnText: '#8A4B08',
};
const dark: typeof light = {
  bg: '#111517', card: '#1B2124', text: '#ECEFF0', muted: '#9AA3A8', border: '#2B3338', chip: '#262D31',
  brand: '#2DD4BF', accent: '#2DD4BF', onAccent: '#06201C', accentSoft: '#15332F',
  good: '#2DD4BF', goodSoft: '#15332F', danger: '#F87171',
  field: '#1F2629', fieldBorder: '#3A444A', hint: '#6F777C', warnBg: '#3A2E12', warnText: '#FBBF24',
};
export type Colors = typeof light;

export function useColors(pref: Theme): { c: Colors; dark: boolean } {
  const system = useColorScheme();
  const isDark = pref === 'dark' || (pref === 'system' && system === 'dark');
  return { c: isDark ? dark : light, dark: isDark };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 };
/** One family, Archivo (self-hosted), for everything; numbers use tabular figures so columns line up. */
export const sans = '"Archivo", system-ui, -apple-system, sans-serif';
export const font = { small: 14, body: 17, title: 22, h1: 28, big: 40 };
