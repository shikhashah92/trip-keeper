// What's new: every release, newest first, one card per date. Add an entry with each user-facing change
// (the Today screen shows the top one once).
import type Ionicons from '@expo/vector-icons/Ionicons';

export type ChangeKind = 'new' | 'better' | 'fixed';
export interface Change { kind: ChangeKind; icon: keyof typeof Ionicons.glyphMap; title: string; text: string }
export interface Release { date: string; title: string; changes: Change[] }

export const RELEASES: Release[] = [
  { date: '2026-10-12', title: 'A rebuilt Trip Keeper', changes: [
    { kind: 'new', icon: 'time-outline', title: 'Undo history', text: 'Trip Keeper keeps your last 10 versions on this phone: one at the start of each day you make changes, and one before every restore or erase.' },
    { kind: 'new', icon: 'lock-closed-outline', title: 'Locked backups', text: 'Save a backup with a passphrase. It is locked on your phone before it goes to Drive, iCloud or email.' },
    { kind: 'better', icon: 'shield-checkmark-outline', title: 'Backups are checked', text: 'A backup is validated before it replaces anything, and what is on the phone now goes to Undo history first.' },
    { kind: 'better', icon: 'save-outline', title: 'Safer saving', text: 'Changes are written one at a time, in order. If something cannot be saved, you are told straight away.' },
    { kind: 'better', icon: 'moon-outline', title: 'Light and dark', text: 'Choose a theme in More, or follow the phone.' },
    { kind: 'fixed', icon: 'calendar-outline', title: 'Calendar file', text: 'Commas and semicolons in names and places no longer break the events, and long lines are folded as calendar apps expect.' },
  ] },
];
export const LATEST = RELEASES[0];
