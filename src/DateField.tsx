// Web: the browser's native date, time and date-and-time pickers: accessible, localised, zero dependencies.
import { createElement } from 'react';
import { useTheme } from './store';

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const pill = (c: { chip: string; text: string }, dark: boolean, extra: Record<string, unknown> = {}) => ({
  minHeight: 44, minWidth: 160, padding: '0 14px', borderRadius: 999, border: 'none', background: c.chip, color: c.text,
  fontSize: 16, fontWeight: 600, fontFamily: FONT, colorScheme: dark ? 'dark' : 'light', ...extra,
});

/** A day ("YYYY-MM-DD"). Empty is allowed: it says what the field is for, since iPhones draw a blank pill. */
export function DateField({ value, onChange, min, max, label = 'Date' }: { value: string; onChange: (day: string) => void; min?: string; max?: string; label?: string }) {
  const { c, dark } = useTheme();
  const input = createElement('input', {
    type: 'date', value, min, max, 'aria-label': label,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value), // '' when cleared
    style: pill(c, dark, value ? {} : { color: 'transparent' }),
  });
  if (value) return input;
  // Taps go through to the date picker underneath.
  return createElement('div', { style: { position: 'relative', display: 'inline-block' } }, input,
    createElement('span', { 'aria-hidden': true, style: { position: 'absolute', left: 14, top: 0, bottom: 0, display: 'flex', alignItems: 'center', pointerEvents: 'none', color: c.muted, fontSize: 16, fontFamily: FONT } }, 'Choose a date'));
}

/** A time of day ("07:00"), with the phone's own picker (12- or 24-hour, as the phone is set). */
export function TimeField({ value, onChange, label = 'Time' }: { value: string; onChange: (hhmm: string) => void; label?: string }) {
  const { c, dark } = useTheme();
  return createElement('input', {
    type: 'time', value, 'aria-label': label, onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    style: pill(c, dark, { minWidth: 120, alignSelf: 'flex-start' }),
  });
}

/** A local moment ("YYYY-MM-DDTHH:MM"), for departures, arrivals and check-in times. */
export function DateTimeField({ value, onChange, label = 'Date and time' }: { value: string; onChange: (stamp: string) => void; label?: string }) {
  const { c, dark } = useTheme();
  return createElement('input', {
    type: 'datetime-local', value, 'aria-label': label, onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    style: pill(c, dark, { alignSelf: 'flex-start' }),
  });
}
