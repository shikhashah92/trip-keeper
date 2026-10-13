// Copies the file readers into public/vendor/ so they are served from this site (no CDN, nothing leaves the phone).
// Runs before the dev server and the web build. public/vendor/ is generated: it is not committed.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => join(root, 'node_modules', ...p);
const out = (...p) => join(root, 'public', 'vendor', ...p);

rmSync(out(), { recursive: true, force: true });
mkdirSync(out('pdf'), { recursive: true });
mkdirSync(out('ocr', 'lang'), { recursive: true });

// PDF text (pdf.js, classic build: a plain script, so no bundler is involved).
cpSync(nm('pdfjs-dist', 'build', 'pdf.min.js'), out('pdf', 'pdf.min.js'));
cpSync(nm('pdfjs-dist', 'build', 'pdf.worker.min.js'), out('pdf', 'pdf.worker.min.js'));

// OCR for screenshots and photos (Tesseract). The LSTM engine only: both builds, since a phone may lack SIMD.
cpSync(nm('tesseract.js', 'dist', 'tesseract.min.js'), out('ocr', 'tesseract.min.js'));
cpSync(nm('tesseract.js', 'dist', 'worker.min.js'), out('ocr', 'worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) cpSync(nm('tesseract.js-core', f), out('ocr', f));
cpSync(nm('@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), out('ocr', 'lang', 'eng.traineddata.gz'));

// The build id shown in More > Version: the commit this was built from (CI sets GITHUB_SHA). Written to .env.local,
// which Expo reads at build time and which is not committed.
let sha = (process.env.GITHUB_SHA ?? '').slice(0, 7);
if (!sha) { try { sha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch { sha = 'dev'; } }
writeFileSync(join(root, '.env.local'), `EXPO_PUBLIC_BUILD=${sha}\n`);

console.log(`vendor files copied to public/vendor (build ${sha})`);
