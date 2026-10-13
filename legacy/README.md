# First version (archive)

The original Trip Keeper: one HTML file (`first-version/app/index.html`) with its service worker, manifest and icons,
and the Playwright smoke test it was checked with (`first-version/smoke.py`).

It is kept for reference only. Nothing in the current app reads or builds from this folder, and it is not deployed.
The current app is in `src/` (Expo + React Native Web + TypeScript).

Moving data from this version: see "Moving from the first Trip Keeper" in the main README. The current app reads this
version's backup files and, if it was served from the same address, the data it left in the browser.
