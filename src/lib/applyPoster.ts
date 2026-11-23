import { PDFDocument, rgb } from 'pdf-lib';
import qrcode from 'qrcode-generator';
import logoUrl from '../assets/images/Bitopi_Logo_Final.png';
import { embedFonts, printPdf, safeFileName, savePdf, Writer } from './assessmentPdf';

// The job application form's QR code, and the A4 sheet with it that HR prints and hands to candidates.

export interface QrMatrix {
  size: number;
  dark: (row: number, column: number) => boolean;
}

/** The QR code of a text. Level M still scans with a smudge or a fold in the paper. */
export function qrMatrix(text: string): QrMatrix {
  const code = qrcode(0, 'M');
  code.addData(text, 'Byte');
  code.make();
  return { size: code.getModuleCount(), dark: (row, column) => code.isDark(row, column) };
}

/** The dark squares as one SVG path, one unit per square, for a crisp code at any size. */
export function qrPath(matrix: QrMatrix): string {
  let path = '';
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      // Runs of dark squares in a row become one rectangle.
      if (!matrix.dark(row, column)) continue;
      let end = column;
      while (end + 1 < matrix.size && matrix.dark(row, end + 1)) end += 1;
      path += `M${column} ${row}h${end - column + 1}v1h-${end - column + 1}z`;
      column = end;
    }
  }
  return path;
}

export interface PosterDetails {
  link: string;
  designation: string;
  /** Department and company, as one line. */
  place: string;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.38, 0.38, 0.38);
/** brand-700, as in the app. */
const BRAND = rgb(0x33 / 255, 0x6f / 255, 0x1c / 255);

export async function applyPosterPdf(details: PosterDetails): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Apply for ${details.designation}`);
  const fonts = await embedFonts(doc);
  const page = doc.addPage(A4);
  const write = new Writer(doc, page, fonts);
  const [width, height] = A4;
  const middle = width / 2;
  const inner = width - MARGIN * 2;
  const centre = async (text: string, baseline: number, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const w = Math.min(write.widthOf(text, size, opts.bold), inner);
    await write.line(text, middle - w / 2, baseline, { size, bold: opts.bold, color: opts.color, maxWidth: inner });
  };

  // A frame round the sheet, so it reads as one notice on a board.
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: BRAND, borderWidth: 2 });

  // The logo.
  const logo = await doc.embedPng(await (await fetch(logoUrl)).arrayBuffer());
  const logoWidth = 230;
  const logoHeight = (logo.height / logo.width) * logoWidth;
  let y = height - 60;
  page.drawImage(logo, { x: middle - logoWidth / 2, y: y - logoHeight, width: logoWidth, height: logoHeight });
  y -= logoHeight + 34;

  // The position.
  await centre('We are hiring', y, 13, { color: MUTED });
  y -= 30;
  for (const line of write.wrap(details.designation, 26, inner, 2, true)) {
    await centre(line, y, 26, { bold: true });
    y -= 32;
  }
  if (details.place) {
    await centre(details.place, y + 6, 12, { color: MUTED });
    y -= 16;
  }
  y -= 24;

  // The ask, and the code itself.
  await centre('Please scan and fill the form', y, 22, { bold: true, color: BRAND });
  y -= 22;
  const matrix = qrMatrix(details.link);
  const quiet = 4;
  const side = Math.min(300, y - 190);
  const unit = side / (matrix.size + quiet * 2);
  const left = middle - side / 2;
  const top = y;
  page.drawRectangle({ x: left, y: top - side, width: side, height: side, borderColor: INK, borderWidth: 1.2, color: rgb(1, 1, 1) });
  // One vector path, the same as on screen: sharp at any printer resolution.
  page.drawSvgPath(qrPath(matrix), { x: left + quiet * unit, y: top - quiet * unit, scale: unit, color: INK });
  y = top - side - 32;

  // How, for those who have not scanned a code before, and the address for those who cannot.
  await centre('Open the camera on your phone and point it at the code.', y, 11.5);
  y -= 16;
  await centre('Fill in the form, attach your CV if you have one, and press Submit.', y, 11.5);
  y -= 30;
  await centre('Or type this address in your browser:', y, 9.5, { color: MUTED });
  y -= 15;
  await centre(details.link, y, 11, { bold: true });

  return doc.save();
}

const fileName = (details: PosterDetails) => safeFileName(`Application QR - ${details.designation}.pdf`);

export async function downloadApplyPoster(details: PosterDetails) {
  savePdf(await applyPosterPdf(details), fileName(details));
}

export async function printApplyPoster(details: PosterDetails) {
  printPdf(await applyPosterPdf(details));
}
