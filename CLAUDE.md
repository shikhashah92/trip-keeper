# Trip Keeper

A free, offline-first travel organizer that runs as an installable web app (PWA) on a phone. Everything is stored on the device. There is no server, no account and no paid service. Keep it that way.

The architecture mirrors Uplift (`../iron-log`) and Munshi. When in doubt about how something should be done, look at how Uplift does it.

## Goals and hard constraints

- Zero cost to build, host and run. No paid APIs, no backend, no analytics.
- Works offline after the first load (service worker + IndexedDB).
- Data stays on the device. Never send user data over the network. The content security policy in `public/index.html` enforces this: no third-party scripts, fonts or requests.
- Mobile first. Check changes at roughly 390px wide, in light and dark mode.
- Copy is plain and short. No em-dash asides.

## Stack and commands

Expo + React Native Web + TypeScript, exported as a static single-page web app.

```
npm ci
npx expo start --web   # dev server
npm run check          # typecheck, lint, build:web, tests: run before every commit
```

Tests are `node --test` on `tests/*.test.ts` and import the pure modules directly, so those modules import with `.ts` extensions and use no TypeScript-only runtime features (no enums, no parameter properties).

## Layout

```
src/model.ts          Data model + every change as a pure function; itinerary, money, dates
src/backup.ts         parseBackup (validates untrusted/own data), serialize, CSV, reads the first app's backup
src/crypto.ts         Passphrase encryption for backups (copied from Uplift)
src/ics.ts            Calendar file, share text, print page
src/parse.ts          Paste-a-confirmation heuristics + diffBooking (what a file would change)
src/flights.ts        Splits a ticket into one booking per flight; airline and airport tables; passenger, seat, terminal details
src/reader.ts         Reads a PDF (text layer) or image (OCR) on the phone, from self-hosted files
src/handoff.ts        Passes picked files from the Bookings tab to the booking form
scripts/vendor.mjs    Copies pdf.js and Tesseract into public/vendor (generated, not committed)
src/pin.ts            PIN record hashing (screen lock, not encryption)
src/legacy.ts         Reads the first app's IndexedDB ("tripkeeper") for a one-time move
src/countries.ts      Country quick facts table
src/whatsNew.ts       Release cards, newest first
src/storage.ts        IndexedDB key/value + BroadcastChannel between tabs
src/safety.ts         Undo history (last 10 versions) and set-aside unreadable copies
src/store.tsx         StoreProvider: serial write queue, load/validate, undo snapshots, PIN lock state
src/io.ts             saveFile, pickers, attachments, print, dialogs
src/dialog.tsx        In-app confirm/notice/prompt dialogs
src/ui.tsx            Shared UI kit (same as Uplift's)
src/theme.ts          Colour tokens (teal), spacing, type
src/components.tsx    EventRow, PlaceLinks, PassphraseModal, LockScreen
src/backupActions.tsx Backup/restore flows used by Welcome and Backup
src/app/              expo-router screens: (tabs) = Today, Itinerary, Bookings, Expenses, More
public/               index.html (CSP), manifest, sw.js, icons, self-hosted font
tests/core.test.ts    Unit tests for the pure modules
```

## How the code is organised

- One `Log` (see `model.ts`) holds the whole trip: `trip`, `items`, `bookings`, `expenses`, `attachments` (metadata only), `settings`. It is stored as a single JSON string under `trip:v1`.
- Attached files' bytes (data URLs) live under their own `file:v1:<id>` keys so saving the trip stays small. The store writes bytes before the list that points at them, and removes bytes nothing points at (not the trip, not any undo snapshot) at startup.
- All writes go through the store's single serial queue (one in flight, latest value per key wins). Screens call `update(fn)` with a pure function from `model.ts`; never write storage directly from a screen.
- Anything read back (own data, undo snapshots, imported backups) goes through `parseBackup`. Add a field to the model in the same change as its validation. Changing the stored shape: bump `SCHEMA_VERSION` and teach `parseBackup` the old one.
- The first change each day, and every restore or erase, takes an undo snapshot first. If that can't be written, the replace stops.
- Forms are routed modal screens (`/item`, `/booking`, `/expense`, ...), not sheets. `/booking` takes `id` or `prefill` (JSON from the paste reader).
- Dates are local `YYYY-MM-DD`; times `HH:MM`; booking start/end `YYYY-MM-DDTHH:MM`. Use `today()`, `addDays()`, `diffDays()`.
- Money: each expense stores amount + currency. `trip.home` is the home currency (default INR); `trip.rates[CUR]` is one global rate per currency. Expenses with no rate are left out of totals and flagged.
- The PIN is a screen lock, not encryption. Do not describe it as encryption. It lives outside the log (`pin:v1`) so restoring a backup does not change it.
- Flights: `parseDocument()` (flights.ts) returns one booking per flight number found, each span of text parsed by `parsePaste`. A flight number counts only if its airline code is in `AIRLINES`; an airport code in brackets counts unless it is in `NOT_AIRPORT` (PNR, currencies, taxes). Details go in the booking notes as `Label: value` lines and are only ever added below what the person wrote.
- Booking kinds: `classify()` in `parse.ts` scores each kind by weighted signals (add a signal there, with a test, when a real document is mistaken). `BOOKING_GROUPS` in `model.ts` is how the Bookings tab sections them.
- Reading files: `reader.ts` loads pdf.js and Tesseract as classic scripts from `public/vendor` (never a CDN, never the bundler). Nothing about a file leaves the phone. A read only ever fills the form after the person confirms (`diffBooking` lists what changes); a time that wasn't found is set to noon and flagged. OCR data is fetched on first use and then cached by the service worker.
- Share text and the print page must not include booking reference numbers.
- Calendar file: floating local times, reminders (flights 1 day and 3 hours, others 1 hour), optional 8 PM "tomorrow's plan" event, lines folded at 75 octets.

## Conventions

- Every user-facing change adds a card to `src/whatsNew.ts` (newest first, one per date).
- Bump `CACHE` in `public/sw.js` only if the shell file list changes; hashed bundles are handled by the worker.
- No `fetch` to external hosts, no CDN scripts, no web fonts. Use `../ui` components; do not add a UI library.

## Known limits (no free way around them)

- No automatic import from forwarded emails (needs a server). Paste import is the free substitute.
- No live flight alerts, gate changes or airport maps (paid data).
- No sync between devices. People move data with the backup file.
- A PWA cannot fire reliable notifications when closed. Calendar export with reminders is the workaround.

## Ideas not built yet

- Multiple trips (a trips list and a switcher; the Log would become one per trip).
- Packing list and to-do checklist per trip.
- Per-expense exchange rates (today the rate is global per currency).
- Trip statistics (nights, flights, spend per day).
