// Backups the person saves themselves (Files, iCloud Drive, Google Drive, email): shared by Welcome and More.
// Nothing is ever uploaded by Trip Keeper; the file goes wherever the share sheet sends it.
import { useState } from 'react';
import { parseBackup, toBackupJSON, toCSV, type Files } from './backup';
import { PassphraseModal } from './components';
import { decryptEnvelope, deriveKey, encryptWithKey, isEnvelope, ITERATIONS, newSalt } from './crypto';
import { choose, confirm, notify, pickTextFile, saveFile } from './io';
import { forgetLegacy, hasLegacyData, readLegacy } from './legacy';
import { dayKey, fmtLong, summary, today, type Log } from './model';
import { useStore } from './store';
import { forgetUnreadable, unreadableCopies, type Unreadable } from './safety';

type Pending = { mode: 'set' | 'enter'; onSubmit: (pass: string) => Promise<void> } | null;
type Replace = (next: { log: Log; files?: Files }, reason?: string) => Promise<void>;

/** Swap in data "Start fresh" set aside. What's on the phone now goes to Undo history first. */
export async function bringBack(u: Unreadable, replace: Replace) {
  try {
    await replace({ log: u.log! }, 'Before bringing back earlier data');
    await forgetUnreadable(u.key);
    notify('Your trip is back', `${summary(u.log!)}. What was on this phone a moment ago is in Undo history.`);
  } catch (e) {
    notify('Could not bring it back', (e as Error).message);
  }
}

/** On opening: if data that once wouldn't open does now (an app fix), offer it back. Asked once per copy; it stays in Undo history. */
export async function offerUnreadable(replace: Replace) {
  const u = (await unreadableCopies()).find((x) => x.log);
  if (!u) return;
  const asked = `trip-keeper.offered:${u.key}`;
  try { if (localStorage.getItem(asked)) return; localStorage.setItem(asked, '1'); } catch { /* private mode: may ask again */ }
  if (await confirm('Your earlier trip can be opened now',
    `On ${fmtLong(dayKey(new Date(u.at)))} Trip Keeper couldn't open your data (${summary(u.log!)}). It can now. Bring it back? What's on this phone now is kept in Undo history first.`,
    'Bring it back')) await bringBack(u, replace);
}

export function useBackup() {
  const { log, update, replace, start, readFiles, setPin } = useStore();
  const [pending, setPending] = useState<Pending>(null);
  const saved = () => update((l) => ({ ...l, settings: { ...l.settings, lastBackupAt: Date.now() } }));

  /** Locked with a passphrase: safe to keep in any cloud drive or email. */
  function exportLocked() {
    if (!log) return;
    setPending({
      mode: 'set',
      onSubmit: async (pass) => {
        const salt = newSalt();
        const file = await encryptWithKey(await deriveKey(pass, salt), salt, ITERATIONS, toBackupJSON(log, await readFiles()));
        setPending(null);
        if (await saveFile(`trip-keeper-backup-locked-${today()}.json`, file, 'application/json')) saved();
      },
    });
  }
  async function exportPlain() {
    if (!log) return;
    try { if (await saveFile(`trip-keeper-backup-${today()}.json`, toBackupJSON(log, await readFiles()), 'application/json')) saved(); }
    catch (e) { notify('Export failed', (e as Error).message); }
  }
  async function exportCSV() {
    if (!log) return;
    try { await saveFile(`${log.trip.name.replace(/\W+/g, '-')}-expenses.csv`, toCSV(log), 'text/csv'); }
    catch (e) { notify('Export failed', (e as Error).message); }
  }

  async function restore() {
    try {
      const text = await pickTextFile();
      if (!text) return;
      if (!isEnvelope(text)) return await restoreFrom(text);
      setPending({ mode: 'enter', onSubmit: async (pass) => { const plain = await decryptEnvelope(text, pass); setPending(null); await restoreFrom(plain); } });
    } catch (e) { notify('Could not restore', (e as Error).message); }
  }
  /** Open a backup file and say what's in it, without changing anything here: proof it can be restored. */
  async function verify() {
    const report = (plain: string) => {
      const { log: b, files } = parseBackup(plain);
      let when = '';
      try { const at = JSON.parse(plain).exportedAt; if (typeof at === 'string' && !Number.isNaN(Date.parse(at))) when = ` It was saved on ${fmtLong(dayKey(new Date(at)))}.`; } catch { /* no date: fine */ }
      notify('This backup opens fine', `“${b.trip.name}”: ${summary(b)} and ${Object.keys(files).length} attached ${Object.keys(files).length === 1 ? 'file' : 'files'}.${when} Nothing on this device was changed.`);
    };
    try {
      const text = await pickTextFile();
      if (!text) return;
      if (!isEnvelope(text)) return report(text);
      setPending({ mode: 'enter', onSubmit: async (pass) => { const plain = await decryptEnvelope(text, pass); setPending(null); try { report(plain); } catch (e) { notify('This file can’t be restored', (e as Error).message); } } });
    } catch (e) { notify('This file can’t be restored', (e as Error).message); }
  }
  async function restoreFrom(text: string) {
    try {
      await bringIn(parseBackup(text), 'Restore this backup?', 'Backup restored');
    } catch (e) { notify('Could not restore', (e as Error).message); }
  }

  /** Replace what's here (kept in Undo history), or start with it on first run. */
  async function bringIn(next: { log: Log; files: Files }, title: string, done: string, reason?: string) {
    const what = `“${next.log.trip.name}”: ${summary(next.log)}`;
    if (!log) {
      if (!(await confirm(title, `${what}.`, 'Continue'))) return false;
      await start(next);
    } else {
      const msg = `${what}. It will replace what is on this device now (“${log.trip.name}”: ${summary(log)}), which is kept in Undo history so you can go back.`;
      if (!(await confirm(title, msg, 'Replace', true))) return false;
      await replace(next, reason);
    }
    notify(done, `${what} is on this device now.`);
    return true;
  }

  /** Data the first Trip Keeper left in this browser (same address): validate it, ask, then bring it over. */
  async function moveOver() {
    try {
      const { text, pin } = await readLegacy();
      const ok = await bringIn(parseBackup(text), 'Bring your trip over?', 'Your trip is here', 'Before moving from the first Trip Keeper');
      if (!ok) return;
      if (pin) await setPin(pin);
      // The old copy is only removed after this one is saved, and only if the person says so.
      if (await choose('Remove the old copy?', 'Your trip is saved in the new Trip Keeper. Remove the first app’s copy from this phone? You can keep it until you are sure.', 'Remove it', 'Keep it')) await forgetLegacy();
    } catch (e) { notify('Could not bring it over', (e as Error).message); }
  }

  const modal = pending ? <PassphraseModal visible mode={pending.mode} onSubmit={pending.onSubmit} onClose={() => setPending(null)} /> : null;
  return { exportLocked, exportPlain, exportCSV, restore, verify, bringIn, moveOver, hasLegacyData, modal };
}

