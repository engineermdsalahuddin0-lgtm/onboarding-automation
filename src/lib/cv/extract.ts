import { blobToCanvas, type ImageCandidate } from './photo';

// Reads the text and images out of a CV file, in the browser. Nothing here touches the network
// except loading our own OCR and PDF worker files.

export interface ExtractedFile {
  text: string;
  images: ImageCandidate[];
  /** First page rendered as an image, for scanned files where the photo is part of the page. */
  firstPage: HTMLCanvasElement | null;
  scanned: boolean;
  /** Rendered pages to run OCR on when the file has no text layer. */
  ocrPages: HTMLCanvasElement[];
  warnings: string[];
}

const SCANNED_CHARS_PER_PAGE = 40;
const MAX_OCR_PAGES = 5;

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface TextRow {
  y: number;
  height: number;
  items: TextItemLike[];
}

function buildRows(items: TextItemLike[]): TextRow[] {
  const rows: TextRow[] = [];
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const y = item.transform[5];
    const height = Math.abs(item.transform[3]) || item.height || 10;
    const row = rows.find((candidate) => Math.abs(candidate.y - y) < Math.max(2, height * 0.45));
    if (row) row.items.push(item);
    else rows.push({ y, height, items: [item] });
  }
  return rows.sort((a, b) => b.y - a.y);
}

function rowText(row: TextRow): string {
  const items = [...row.items].sort((a, b) => a.transform[4] - b.transform[4]);
  let line = '';
  let end = 0;
  for (const item of items) {
    const x = item.transform[4];
    if (line) {
      const gap = x - end;
      if (gap > row.height * 1.5) line = `${line.trimEnd()}    `;
      else if (gap > row.height * 0.15 && !line.endsWith(' ') && !item.str.startsWith(' ')) line += ' ';
    }
    line += item.str;
    end = x + item.width;
  }
  return line.trimEnd();
}

const rowsToText = (rows: TextRow[]) => rows.map(rowText).filter((line) => line.trim() !== '').join('\n');

/** PDF text arrives as scattered fragments. Rebuilds reading lines, keeping wide gaps between columns. */
export function itemsToLines(items: TextItemLike[]): string {
  return rowsToText(buildRows(items));
}

const GUTTER_WIDTH = 4;

/**
 * Finds the empty vertical strip between a sidebar and the main column, if the page has one.
 * Read line by line, such a page mixes the two columns into nonsense ("CONTACT resolving IT issues").
 * Label and value tables ("Father's Name : X") also have a strip, so they are told apart: there,
 * almost every line has text on both sides, and the right side starts with a colon.
 */
export function findGutter(items: TextItemLike[], pageWidth: number): number | null {
  const rows = buildRows(items);
  if (rows.length < 8) return null;
  const spans = rows.map((row) => row.items.map((item) => [item.transform[4], item.transform[4] + Math.max(item.width, 1)] as const));
  let best: { x: number; crossing: number } | null = null;
  for (let x = pageWidth * 0.2; x <= pageWidth * 0.7; x += 1) {
    let crossing = 0;
    let left = 0;
    let right = 0;
    for (const row of spans) {
      if (row.some(([a, b]) => a < x + GUTTER_WIDTH && b > x - GUTTER_WIDTH)) crossing += 1;
      if (row.some(([, b]) => b <= x - GUTTER_WIDTH)) left += 1;
      if (row.some(([a]) => a >= x + GUTTER_WIDTH)) right += 1;
    }
    if (left < rows.length * 0.25 || right < rows.length * 0.25) continue;
    if (!best || crossing < best.crossing) best = { x, crossing };
  }
  if (!best || best.crossing > Math.max(1, rows.length * 0.06)) return null;

  const x = best.x;
  let bothSides = 0;
  let oneSide = 0;
  let labelled = 0;
  for (const row of rows) {
    const leftText = row.items.filter((item) => item.transform[4] + item.width <= x).map((item) => item.str).join(' ').trim();
    const rightText = row.items.filter((item) => item.transform[4] >= x).map((item) => item.str).join(' ').trim();
    if (leftText && rightText) {
      bothSides += 1;
      if (/[:：]$/.test(leftText) || /^[:：]/.test(rightText)) labelled += 1;
    } else if (leftText || rightText) {
      oneSide += 1;
    }
  }
  // Two columns flow on their own, so many lines have text on one side only.
  if (oneSide < (bothSides + oneSide) * 0.25) return null;
  if (labelled > bothSides * 0.3) return null;
  return x;
}

/** Text of one page, split into its left and right column when it has a gutter. */
function pageColumns(items: TextItemLike[], gutter: number): { left: string; right: string; leftTop: number; rightTop: number } {
  const leftItems: TextItemLike[] = [];
  const rightItems: TextItemLike[] = [];
  // A line that crosses the gutter (a heading across the page) goes with the column it starts in.
  for (const item of items) (item.transform[4] < gutter ? leftItems : rightItems).push(item);
  const leftRows = buildRows(leftItems);
  const rightRows = buildRows(rightItems);
  return {
    left: rowsToText(leftRows),
    right: rowsToText(rightRows),
    leftTop: leftRows[0]?.y ?? -Infinity,
    rightTop: rightRows[0]?.y ?? -Infinity,
  };
}

interface PageText {
  items: TextItemLike[];
  width: number;
}

/**
 * Puts a PDF's pages into reading order. Pages with a sidebar keep each column whole across pages:
 * the main column of page 1 continues on page 2, not into page 1's sidebar.
 */
export function pagesToText(pages: PageText[]): string {
  const out: string[] = [];
  let run: { left: string[]; right: string[]; leftFirst: boolean } | null = null;
  const flush = () => {
    if (!run) return;
    out.push(...(run.leftFirst ? [...run.left, ...run.right] : [...run.right, ...run.left]));
    run = null;
  };
  for (const page of pages) {
    const gutter = findGutter(page.items, page.width);
    if (gutter === null) {
      flush();
      out.push(itemsToLines(page.items));
      continue;
    }
    const columns = pageColumns(page.items, gutter);
    // Reading starts with whichever column begins higher on the first page; a tie goes to the main (wider) column.
    run ??= { left: [], right: [], leftFirst: columns.leftTop > columns.rightTop + 2 || (Math.abs(columns.leftTop - columns.rightTop) <= 2 && gutter > page.width / 2) };
    run.left.push(columns.left);
    run.right.push(columns.right);
  }
  flush();
  return out.filter((text) => text.trim() !== '').join('\n');
}

function drawPdfImage(image: any): HTMLCanvasElement | null {
  const width: number = image?.width;
  const height: number = image?.height;
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  if (image.bitmap) {
    context.drawImage(image.bitmap, 0, 0);
    return canvas;
  }
  if (!image.data) return null;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const source: Uint8Array = image.data;
  if (source.length >= width * height * 4) {
    rgba.set(source.subarray(0, width * height * 4));
  } else if (source.length >= width * height * 3) {
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgba[i] = source[j];
      rgba[i + 1] = source[j + 1];
      rgba[i + 2] = source[j + 2];
      rgba[i + 3] = 255;
    }
  } else if (source.length >= width * height) {
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = source[j];
      rgba[i + 3] = 255;
    }
  } else {
    return null;
  }
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

function getPdfObject(page: any, name: string): Promise<any> {
  const store = name.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    try {
      store.get(name, (value: unknown) => {
        clearTimeout(timer);
        resolve(value);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// OCR needs letters about 30 pixels tall. A fixed zoom left small pages (a 4x6 inch CV image) far
// too coarse to read, so scans are drawn to a set width whatever the page size.
const OCR_WIDTH_PX = 1800;

function ocrScale(page: any): number {
  const width = page.getViewport({ scale: 1 }).width;
  return Math.min(8, Math.max(2, OCR_WIDTH_PX / width));
}

async function renderPage(page: any, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
  return canvas;
}

async function extractPdf(file: Blob): Promise<ExtractedFile> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({
    data,
    cMapUrl: '/vendor/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
    wasmUrl: '/vendor/pdfjs/wasm/',
  }).promise;

  const pageTexts: PageText[] = [];
  const images: ImageCandidate[] = [];
  let firstPage: HTMLCanvasElement | null = null;
  const pages: any[] = [];

  try {
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page: any = await doc.getPage(number);
      pages.push(page);
      const content = await page.getTextContent();
      pageTexts.push({ items: content.items as TextItemLike[], width: page.getViewport({ scale: 1 }).width });

      // The first pages are where a CV's photo lives; later pages are usually certificates.
      if (number <= 3) {
        const viewport = page.getViewport({ scale: 1 });
        const pageArea = viewport.width * viewport.height;
        const operators = await page.getOperatorList();
        // Follow the graphics state to learn how large each image is actually drawn on the page:
        // that is what separates a passport photo from a full-page scan.
        let matrix = [1, 0, 0, 1, 0, 0];
        const stack: number[][] = [];
        for (let i = 0; i < operators.fnArray.length; i += 1) {
          const fn = operators.fnArray[i];
          const args = operators.argsArray[i];
          if (fn === pdfjs.OPS.save) {
            stack.push(matrix);
          } else if (fn === pdfjs.OPS.restore) {
            matrix = stack.pop() ?? matrix;
          } else if (fn === pdfjs.OPS.transform) {
            const [a, b, c, d, e, f] = (args.length === 6 ? args : args[0]) as number[];
            matrix = [
              matrix[0] * a + matrix[2] * b,
              matrix[1] * a + matrix[3] * b,
              matrix[0] * c + matrix[2] * d,
              matrix[1] * c + matrix[3] * d,
              matrix[0] * e + matrix[2] * f + matrix[4],
              matrix[1] * e + matrix[3] * f + matrix[5],
            ];
          } else if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject) {
            const image = fn === pdfjs.OPS.paintImageXObject ? await getPdfObject(page, args[0]) : args[0];
            const canvas = image ? drawPdfImage(image) : null;
            if (canvas) {
              const shownArea = Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]);
              images.push({ canvas, page: number, pageCoverage: Math.min(1, shownArea / pageArea) });
            }
          }
        }
      }
    }

    const text = pagesToText(pageTexts);
    const scanned = text.replace(/\s/g, '').length < SCANNED_CHARS_PER_PAGE * doc.numPages;
    if (scanned) {
      firstPage = await renderPage(pages[0], ocrScale(pages[0]));
    } else if (images.length === 0) {
      firstPage = await renderPage(pages[0], 2);
    }
    const warnings: string[] = [];
    const scannedPages: HTMLCanvasElement[] = [];
    if (scanned) {
      scannedPages.push(firstPage!);
      for (let i = 1; i < Math.min(doc.numPages, MAX_OCR_PAGES); i += 1) scannedPages.push(await renderPage(pages[i], ocrScale(pages[i])));
      if (doc.numPages > MAX_OCR_PAGES) warnings.push(`Only the first ${MAX_OCR_PAGES} scanned pages can be read without AI.`);
    }
    return { text, images, firstPage, scanned, ocrPages: scannedPages, warnings };
  } finally {
    void doc.loadingTask.destroy();
  }
}

const WORD_NAMESPACE_TEXT = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function wordXmlToText(xml: string): string {
  return xml
    .split(/<\/w:p>/)
    .map((paragraph) => decodeXml([...paragraph.matchAll(WORD_NAMESPACE_TEXT)].map((m) => m[1]).join('')).trim())
    .filter(Boolean)
    .join('\n');
}

async function extractDocx(file: Blob): Promise<ExtractedFile> {
  const [{ default: mammoth }, { default: JSZip }] = await Promise.all([import('mammoth'), import('jszip')]);
  const buffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
  const zip = await JSZip.loadAsync(buffer);

  // Mammoth skips headers, footers and text boxes, and CV templates love putting contact details there.
  const extras: string[] = [];
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))) {
    extras.push(wordXmlToText(await zip.files[name].async('string')));
  }
  const documentXml = await zip.file('word/document.xml')?.async('string');
  for (const match of documentXml?.matchAll(/<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/g) ?? []) {
    extras.push(wordXmlToText(match[1]));
  }
  const body = value.replace(/\n{2,}/g, '\n').trim();
  const uniqueExtras = [...new Set(extras.filter((text) => text && !body.includes(text)))];
  const text = [...uniqueExtras, body].filter(Boolean).join('\n');

  const images: ImageCandidate[] = [];
  for (const name of Object.keys(zip.files).filter((n) => /^word\/media\/.+\.(jpe?g|png|webp|bmp|gif)$/i.test(n))) {
    const canvas = await blobToCanvas(await zip.files[name].async('blob'));
    if (canvas) images.push({ canvas, page: 1 });
  }
  return { text, images, firstPage: null, scanned: false, ocrPages: [], warnings: [] };
}

/** Old binary .doc: pulls out readable runs of text. Good enough to find contacts, flagged for checking. */
async function extractLegacyDoc(file: Blob): Promise<ExtractedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const runs: string[] = [];
  let current = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if ((code >= 32 && code < 0x2100) || code === 13 || code === 9) {
      current += code === 13 ? '\n' : String.fromCharCode(code);
    } else {
      if (current.trim().length > 3) runs.push(current);
      current = '';
    }
  }
  if (current.trim().length > 3) runs.push(current);
  let text = runs.join('\n');
  if (text.replace(/\s/g, '').length < 100) {
    text = new TextDecoder('windows-1252').decode(bytes).match(/[\x20-\x7e\r\n\t]{4,}/g)?.join('\n') ?? '';
  }
  return {
    text: text.replace(/\r/g, '\n'),
    images: [],
    firstPage: null,
    scanned: false,
    ocrPages: [],
    warnings: ['Old .doc format: the text was recovered approximately and the photo cannot be read. Save as .docx or PDF for a full read.'],
  };
}

async function extractImage(file: Blob): Promise<ExtractedFile> {
  const canvas = await blobToCanvas(file);
  if (!canvas) throw new Error('This image could not be opened.');
  return { text: '', images: [], firstPage: canvas, scanned: true, ocrPages: [canvas], warnings: [] };
}

export function extensionOf(fileName: string): string {
  return fileName.toLowerCase().split('.').pop() ?? '';
}

export const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'doc', 'txt', 'jpg', 'jpeg', 'png', 'webp'];

export const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function extractFile(file: File): Promise<ExtractedFile> {
  switch (extensionOf(file.name)) {
    case 'pdf':
      return extractPdf(file);
    case 'docx':
      return extractDocx(file);
    case 'doc':
      return extractLegacyDoc(file);
    case 'txt':
      return { text: await file.text(), images: [], firstPage: null, scanned: false, ocrPages: [], warnings: [] };
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'webp':
      return extractImage(file);
    default:
      throw new Error('Unsupported file type.');
  }
}

// OCR runs on one shared worker, one page at a time, and is only loaded when a scan turns up.
let ocrWorker: Promise<any> | null = null;
let ocrQueue: Promise<unknown> = Promise.resolve();

function getOcrWorker() {
  ocrWorker ??= import('tesseract.js').then(async ({ createWorker, PSM }) => {
    const worker = await createWorker('eng', 1, {
      workerPath: `${location.origin}/vendor/ocr/worker.min.js`,
      corePath: `${location.origin}/vendor/ocr`,
      langPath: `${location.origin}/vendor/ocr`,
      gzip: true,
    });
    // Read the page as a layout of blocks, so a sidebar and the main column come out one after the
    // other instead of interleaved line by line.
    // Pages are drawn about 1800 pixels wide, which is close to 200 dpi for an A4 page; saying so
    // stops Tesseract guessing (and logging "Estimating resolution") on every page.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: '200' });
    return worker;
  });
  return ocrWorker;
}

/** A photo or screenshot of a CV can be small too; the same width rule applies. */
function enlargeForOcr(page: HTMLCanvasElement): HTMLCanvasElement {
  if (page.width >= OCR_WIDTH_PX * 0.75) return page;
  const scale = OCR_WIDTH_PX / page.width;
  const big = document.createElement('canvas');
  big.width = OCR_WIDTH_PX;
  big.height = Math.round(page.height * scale);
  const context = big.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(page, 0, 0, big.width, big.height);
  return big;
}

export async function ocrPages(pages: HTMLCanvasElement[]): Promise<string> {
  const run = ocrQueue.then(async () => {
    const worker = await getOcrWorker();
    const texts: string[] = [];
    for (const page of pages) {
      const { data } = await worker.recognize(enlargeForOcr(page));
      texts.push(data.text as string);
    }
    return texts.join('\n');
  });
  ocrQueue = run.catch(() => undefined);
  return run;
}
