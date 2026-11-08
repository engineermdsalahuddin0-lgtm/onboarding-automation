// Copies the OCR engine and PDF reader data into public/vendor, so reading a scanned or unusual CV
// never depends on a CDN (CV contents and office firewalls both argue against one).
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const vendor = join(root, 'public', 'vendor');

const ocrWorker = join(modules, 'tesseract.js', 'dist', 'worker.min.js');
if (!existsSync(ocrWorker)) {
  console.log('[vendor-assets] dependencies not installed yet, skipping.');
  process.exit(0);
}

const ocr = join(vendor, 'ocr');
mkdirSync(ocr, { recursive: true });
cpSync(ocrWorker, join(ocr, 'worker.min.js'));
const core = join(modules, 'tesseract.js-core');
// Only the LSTM builds: that is the recognition engine we start, and the others add about 25 MB.
for (const name of readdirSync(core)) {
  if (/-lstm\.wasm(\.js)?$/.test(name)) cpSync(join(core, name), join(ocr, name));
}
cpSync(join(modules, '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), join(ocr, 'eng.traineddata.gz'));

const pdf = join(vendor, 'pdfjs');
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  cpSync(join(modules, 'pdfjs-dist', folder), join(pdf, folder), { recursive: true });
}

console.log('[vendor-assets] copied to public/vendor');
