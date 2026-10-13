// File export/import, attached files, and dialogs (in-app ones: react-native-web's Alert is a no-op, window.confirm looks out of place).
import { MAX_IMPORT_BYTES } from './backup';
import { askDialog, confirmDialog, noticeDialog } from './dialog';

/**
 * Phones: the system share sheet (Save to Files, iCloud Drive, Google Drive, Mail) in one tap.
 * Computers, or if sharing isn't allowed: a normal download. Returns false if the person cancelled.
 */
export async function saveFile(name: string, content: BlobPart, mimeType: string, text?: string): Promise<boolean> {
  const file = new File([content], name, { type: mimeType });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], ...(text ? { text } : { title: name }) });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      // e.g. NotAllowedError when the tap's user activation was used up by a dialog: fall back to a download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export function pickTextFile(accept = 'application/json,.json'): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      if (f.size > MAX_IMPORT_BYTES) return reject(new Error('File is too large to be a Trip Keeper backup.'));
      f.text().then(resolve, reject);
    };
    input.click();
  });
}

/** One attached file's size limit: a phone's storage is shared with everything else in the browser. */
export const MAX_ATTACH_BYTES = 40 * 1024 * 1024;
export interface Picked { name: string; type: string; data: string }

// A file with no known type reads as `data:application/octet-stream;base64,…` in some browsers and `data:;base64,…` in others.
const normalise = (uri: string, type: string) => (uri.startsWith('data:;base64,') ? `data:${type || 'application/octet-stream'};base64,${uri.slice(13)}` : uri);

/** Pick tickets, vouchers, PDFs or screenshots. Each comes back as a data URL (what a backup holds, too). */
export function pickFiles(accept = 'application/pdf,image/*,.pdf,.doc,.docx'): Promise<Picked[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.onchange = async () => {
      try {
        const list = [...(input.files ?? [])];
        const big = list.find((f) => f.size > MAX_ATTACH_BYTES);
        if (big) return reject(new Error(`“${big.name}” is over ${MAX_ATTACH_BYTES / 1024 / 1024} MB. Try a smaller copy or a screenshot.`));
        resolve(await Promise.all(list.map((f) => new Promise<Picked>((ok, fail) => {
          const r = new FileReader();
          r.onerror = () => fail(new Error(`Couldn’t read “${f.name}”.`));
          r.onload = () => ok({ name: f.name, type: f.type || 'application/octet-stream', data: normalise(r.result as string, f.type) });
          r.readAsDataURL(f);
        }))));
      } catch (e) { reject(e); }
    };
    input.click();
  });
}

/** Print, or "Save as PDF" in the print dialog. Must be called straight from a tap: browsers block a window opened later. */
export function printHtml(html: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
  return true;
}

export const confirm = (title: string, message: string, ok = 'OK', destructive = false) => confirmDialog(title, message, ok, destructive);

export function notify(title: string, message?: string) {
  noticeDialog(title, message);
}

export const ask = (title: string, value = '') => askDialog(title, value);
export { chooseDialog as choose, menuDialog as menu } from './dialog';
