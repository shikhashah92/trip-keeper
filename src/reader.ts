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

/** The text of a PDF, line by line, from its own text layer; scanned pages fall back to OCR. */
async function pdfText(f: Source, progress: Progress): Promise<string> {
  await loadScript(abs('vendor/pdf/pdf.min.js'));
  const pdfjs = w.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = abs('vendor/pdf/pdf.worker.min.js');
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: bytesOf(f.data), isEvalSupported: false }).promise;
  } catch (e) {
    const name = (e as { name?: string }).name;
    throw new Error(name === 'PasswordException' ? 'This PDF is password protected.' : 'This PDF could not be opened.');
  }
  const pages = Math.min(doc.numPages, 10);
  let text = '';
  for (let n = 1; n <= pages; n++) {
    progress(pages > 1 ? `Reading page ${n} of ${pages}…` : 'Reading…');
    const content = await (await doc.getPage(n)).getTextContent();
    for (const it of content.items) text += it.str + (it.hasEOL ? '\n' : ' ');
    text += '\n';
  }
  if (text.replace(/\s/g, '').length >= 40) return text;

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
  return ocr(canvases, progress);
}

/** All the text found in a PDF or image. Throws a sentence the person can read. */
export async function readFileText(f: Source, progress: Progress = () => {}): Promise<string> {
  let text: string;
  if (isPdf(f)) text = await pdfText(f, progress);
  else if (isImage(f)) text = await ocr([await toCanvas(f.data)], progress);
  else throw new Error('Only PDFs and images can be read.');
  if (text.replace(/\s/g, '').length < 10) throw new Error('No text was found in this file.');
  return text;
}
