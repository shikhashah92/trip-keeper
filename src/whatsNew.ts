// What's new: every release, newest first, one card per date. Add an entry with each user-facing change
// (the Today screen shows the top one once).
import type Ionicons from '@expo/vector-icons/Ionicons';

export type ChangeKind = 'new' | 'better' | 'fixed';
export interface Change { kind: ChangeKind; icon: keyof typeof Ionicons.glyphMap; title: string; text: string }
export interface Release { date: string; title: string; changes: Change[] }

export const RELEASES: Release[] = [
  { date: '2026-10-13', title: 'Add a booking from a file', changes: [
    { kind: 'new', icon: 'document-attach-outline', title: 'Add from a PDF or screenshot', text: 'Pick a ticket or confirmation and the booking is filled in for you to check: type, reference, dates, times and place.' },
    { kind: 'new', icon: 'refresh-outline', title: 'Update from a new file', text: 'Attach a changed ticket to a booking and see what differs before anything is updated.' },
    { kind: 'new', icon: 'copy-outline', title: 'Copy text from a file', text: 'Open a ticket and select its text like in any PDF viewer, or tap Copy text to copy the whole thing.' },
    { kind: 'new', icon: 'globe-outline', title: 'Times in their own time zone', text: 'A flight shows when it leaves and lands in each place’s local time, with the zone (IST, GST, UTC+1). Nothing is converted.' },
    { kind: 'fixed', icon: 'airplane-outline', title: 'All the flights on a ticket', text: 'Flights from airlines the app didn’t know, and a flight number used on two days, are no longer skipped.' },
    { kind: 'new', icon: 'airplane-outline', title: 'A ticket with several flights', text: 'A ticket or itinerary with a connection or a return becomes one booking per flight, each with its own times.' },
    { kind: 'new', icon: 'list-outline', title: 'More from a flight ticket', text: 'Airline, flight number, airports with terminals, passengers, seat, class, baggage and ticket number go into the booking’s notes.' },
    { kind: 'fixed', icon: 'time-outline', title: 'Flight and activity times', text: 'Arrival times, boarding and gate times, a ticket’s booking date, ‘10 AM’, time ranges and durations are now read the way they are written.' },
    { kind: 'new', icon: 'eye-outline', title: 'Open files inside the app', text: 'Tap a ticket or voucher to see it in the app. It no longer needs a new browser tab.' },
    { kind: 'better', icon: 'albums-outline', title: 'Bookings in sections', text: 'Flights, stays, cars and trains, activities, and insurance and visas each get their own section, and a stay shows its nights.' },
    { kind: 'better', icon: 'sparkles-outline', title: 'Smarter at telling them apart', text: 'A file is sorted as a flight, stay, car, train, activity or insurance from what it says, not just the first word it finds.' },
    { kind: 'better', icon: 'shield-checkmark-outline', title: 'Read on your phone', text: 'Files are read on this phone and are never sent anywhere. The first screenshot read needs internet once, to get the text reader.' },
  ] },
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
