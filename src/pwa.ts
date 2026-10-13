// PWA glue: service worker (offline + instant start) and the "Install app" prompt.
import { useEffect, useState } from 'react';

/** Where the app is served from: "/" on its own domain (a sub-folder only if experiments.baseUrl is set). */
export const BASE = `${process.env.EXPO_BASE_URL ?? ''}/`;

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; emit(); });
  // Dev server rebuilds constantly; caching there would only serve stale bundles.
  if (!__DEV__ && 'serviceWorker' in navigator) {
    // The bundle often runs after `load` has already fired, so register right away in that case.
    const register = () => navigator.serviceWorker.register(`${BASE}sw.js`).catch(() => {});
    if (document.readyState === 'complete') register(); else window.addEventListener('load', register);
  }
}

export const isStandalone = () =>
  typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
// iPadOS reports itself as a Mac; a Mac with a touch screen is an iPad.
export const isIOS = () => typeof navigator !== 'undefined' && !/Android/.test(navigator.userAgent) && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const isAndroid = () => typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);

/** canInstall: the browser offered a native install prompt (Chrome/Edge/Android). iOS needs Share → Add to Home Screen. */
export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return {
    canInstall: !!deferred,
    async install() {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      emit();
    },
  };
}
