// Reads the text of an attached file on the phone, so a booking can be filled in from a ticket or a confirmation.
// PDFs: their own text layer (pdf.js). Screenshots, photos and scanned PDFs: OCR (Tesseract). Both run from files this
// site serves itself (public/vendor, copied by scripts/vendor.mjs); the file is never sent anywhere.
import { BASE } from './pwa';

export type Progress = (note: string) => void;
interface Source { name: string; type: string; data: string }

const w = window as any;
const scripts = new Map<string, Promise<void>>();
/** Load a classic script once. The readers are plain scripts on purpose: nothing for the bundler to rewrite. */
function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((ok, fail) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => ok();
      el.onerror = () => { scripts.delete(src); fail(new Error('The file reader could not be loaded. Open the app once with internet, then try again.')); };
      document.head.appendChild(el);
    });
    scripts.set(src, p);
  }
  return p;
}
const abs = (path: string) => new URL(BASE + path, location.href).href;

export const isPdf = (f: { type: string; name: string }) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isImage = (f: { type: string; name: string }) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
/** Word files and the like are kept as attachments but cannot be read. */
export const canRead = (f: { type: string; name: string }) => isPdf(f) || isImage(f);

function bytesOf(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/** An image, scaled down so a big photo doesn't exhaust a phone's memory (text stays readable at this size). */
function toCanvas(dataUrl: string, maxEdge = 2400): Promise<HTMLCanvasElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onerror = () => fail(new Error('This image could not be opened.'));
    img.onload = () => {
      const k = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      ok(c);
    };
    img.src = dataUrl;
  });
}

/** OCR one or more images and return all the text. */
async function ocr(images: HTMLCanvasElement[], progress: Progress): Promise<string> {
  await loadScript(abs('vendor/ocr/tesseract.min.js'));
  progress('Getting the text reader ready…');
  let page = 0;
  const worker = await w.Tesseract.createWorker('eng', 1, {
    workerPath: abs('vendor/ocr/worker.min.js'),
    corePath: abs('vendor/ocr'),
    langPath: abs('vendor/ocr/lang'),
    workerBlobURL: false, // a blob: worker would be blocked by the page's content policy
    gzip: true,
    cacheMethod: 'none', // the service worker already keeps these files
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') progress(`Reading${images.length > 1 ? ` page ${page}` : ''}… ${Math.round(m.progress * 100)}%`);
    },
  });
  try {
    let text = '';
    for (const img of images) {
      page++;
      text += `${(await worker.recognize(img)).data.text}\n`;
    }
    return text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Text pieces of one page as lines, the way the page looks: top to bottom, left to right. A PDF stores its text in the
 * order it was drawn, and a table is often drawn a column at a time, so reading it in that order separates a label from
 * its value ("Departure" ... a page later ... "07 Nov 06:15"). Pieces whose baselines are within a few points share a line.
 */
function linesOf(items: { str: string; transform: number[]; width?: number }[]): string {
  const pieces = items.filter((it) => it.str.trim()).map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0 }));
  pieces.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: { y: number; list: typeof pieces }[] = [];
  for (const p of pieces) {
    const row = rows.find((r) => Math.abs(r.y - p.y) <= 3);
    if (row) row.list.push(p); else rows.push({ y: p.y, list: [p] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.list.sort((a, b) => a.x - b.x);
    let line = '';
    let end = -Infinity;
    for (const p of r.list) {
      line += (line && p.x - end > 1 ? (p.x - end > 12 ? '  ' : ' ') : '') + p.s;
      end = p.x + p.w;
    }
    return line;
  }).join('\n');
}

async function openPdf(f: Source) {
  await loadScript(abs('vendor/pdf/pdf.min.js'));
  const pdfjs = w.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = abs('vendor/pdf/pdf.worker.min.js');
  try {
    return await pdfjs.getDocument({ data: bytesOf(f.data), isEvalSupported: false }).promise;
  } catch (e) {
    const name = (e as { name?: string }).name;
    throw new Error(name === 'PasswordException' ? 'This PDF is password protected.' : 'This PDF could not be opened.');
  }
}

/** Draw every page of a PDF into `el`, as wide as it is. This is the in-app viewer: no new tab, no plugin, works offline. */
export async function renderPdfInto(f: Source, el: HTMLElement, progress: Progress = () => {}): Promise<void> {
  const doc = await openPdf(f);
  const width = Math.max(280, el.clientWidth || 360);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (let n = 1; n <= Math.min(doc.numPages, 40); n++) {
    progress(doc.numPages > 1 ? `Page ${n} of ${doc.numPages}` : '');
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const view = page.getViewport({ scale: (width / base.width) * dpr });
    const c = document.createElement('canvas');
    c.width = Math.round(view.width);
    c.height = Math.round(view.height);
    c.style.cssText = 'width:100%;height:auto;display:block;margin-bottom:12px;background:#fff;border-radius:6px';
    await page.render({ canvasContext: c.getContext('2d')!, viewport: view }).promise;
    el.appendChild(c);
  }
}

/**
 * The text of a PDF from its own text layer, read two ways: as rows by position (a table reads left to right) and in
 * the order it was drawn (a card drawn a column at a time reads top to bottom). Scanned pages fall back to OCR.
 */
async function pdfTexts(f: Source, progress: Progress): Promise<string[]> {
  const doc = await openPdf(f);
  const pages = Math.min(doc.numPages, 10);
  let rows = '';
  let drawn = '';
  for (let n = 1; n <= pages; n++) {
    progress(pages > 1 ? `Reading page ${n} of ${pages}…` : 'Reading…');
    const items = (await (await doc.getPage(n)).getTextContent()).items;
    rows += `${linesOf(items)}\n`;
    drawn += `${items.map((it: { str: string; hasEOL?: boolean }) => it.str + (it.hasEOL ? '\n' : ' ')).join('')}\n`;
  }
  if (rows.replace(/\s/g, '').length >= 40) return rows.trim() === drawn.trim() ? [rows] : [rows, drawn];

  // Almost no text: a scan or a photo saved as PDF. Draw the first pages and read them as images.
  const canvases: HTMLCanvasElement[] = [];
  for (let n = 1; n <= Math.min(pages, 3); n++) {
    const page = await doc.getPage(n);
    const view = page.getViewport({ scale: 2 });
    const c = document.createElement('canvas');
    c.width = Math.round(view.width);
    c.height = Math.round(view.height);
    await page.render({ canvasContext: c.getContext('2d')!, viewport: view }).promise;
    canvases.push(c);
  }
  return [await ocr(canvases, progress)];
}

/** All the readings of the text in a PDF or image (one for an image). Throws a sentence the person can read. */
export async function readFileTexts(f: Source, progress: Progress = () => {}): Promise<string[]> {
  let texts: string[];
  if (isPdf(f)) texts = await pdfTexts(f, progress);
  else if (isImage(f)) texts = [await ocr([await toCanvas(f.data)], progress)];
  else throw new Error('Only PDFs and images can be read.');
  if (texts.every((t) => t.replace(/\s/g, '').length < 10)) throw new Error('No text was found in this file.');
  return texts;
}
