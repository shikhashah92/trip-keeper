# Trip Keeper

A private travel organizer: bookings and tickets (with attached PDFs and screenshots), the itinerary, a preview of
tomorrow, and trip expenses in several currencies. It installs to your phone's home screen and works offline.

**Your data stays on your phone.** There's no account and no server, and nothing is uploaded. Backups are files you
save yourself, to Files, iCloud Drive, Google Drive or email, and they can be locked with a passphrase
(AES-256-GCM, encrypted on the phone).

**Stack:** Expo + React Native Web + TypeScript, exported as a static web app. The architecture is the same as
[Uplift](../iron-log) (and Munshi): IndexedDB storage behind one serial write queue, validated load and restore,
undo history (the last 10 versions), and a service worker for offline use.

## Features

- **Today:** countdown, today's plan and a preview of tomorrow.
- **Itinerary:** your own activities plus every dated booking, grouped by day. Mark it Final when planning is done.
- **Bookings and documents:** flights, hotels, Airbnbs, car rentals, trains, tickets and visas with confirmation numbers and attached files.
- **Paste a confirmation:** paste an email or booking page text and the form is filled in for you to review.
- **Expenses:** multi-currency, optional budget, totals by category, CSV export.
- **Calendar export:** an .ics file with reminders (flights 1 day and 3 hours before, an 8 PM "tomorrow's plan" reminder).
- **Share and print:** the itinerary as text (booking references left out) or as a PDF.
- **Maps and nearby:** one-tap map links and nearby restaurants, ATMs, pharmacies and more.
- **Country quick facts:** plug type, voltage, currency, emergency numbers, driving side (offline).
- **PIN lock**, **locked backups**, **undo history**.

## Develop

```bash
npm ci
npx expo start --web     # dev server
npm run check            # the release gate: typecheck, lint, build, tests
```

Node 22.18 or newer (the tests run TypeScript directly).

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: `npm run check`, then publish `dist/` to GitHub Pages.
The workflow copies `index.html` to `404.html` so deep links work. **One-time setup:** repo **Settings → Pages →
Source: GitHub Actions**. To serve from a sub-folder, set `experiments.baseUrl` in `app.json`.

**Every user-facing change adds a card to `src/whatsNew.ts`** in the same PR (newest release first, one per date).

## Install on iPhone

Open the site in **Safari**, tap **Share → Add to Home Screen**. Installing matters: Safari may clear a website's
storage after 7 days without a visit, but not for a home-screen app. Trip Keeper also reminds you weekly to save a backup.

## Moving from the first Trip Keeper (one HTML file)

- **Same address:** the new app spots the old data left in this browser and offers **Bring my trip over** on its first screen.
- **Otherwise:** in the old app use *Export backup*, then in the new one *Restore from a backup*. The old backup format is still read.

## Files

- `src/model.ts`: the data model and every change to it, as pure functions (itinerary, money, backup reminder)
- `src/backup.ts`: backup validation, expense CSV, snapshots; reads the first app's backup format
- `src/crypto.ts`: passphrase encryption for backups (WebCrypto)
- `src/ics.ts`: calendar file, share text, print page
- `src/parse.ts`: paste-a-confirmation reader
- `src/pin.ts`: PIN records (a screen lock, not encryption)
- `src/legacy.ts`: reads the first app's data from this browser
- `src/storage.ts`, `src/store.tsx`, `src/safety.ts`: IndexedDB, the write queue, undo history
- `src/app/`: screens (expo-router)
- `public/sw.js`: the offline service worker
- `tests/`: `node --test`
