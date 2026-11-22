import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import type { CvBucket } from '../types';
import { embedFonts, printPdf, safeFileName, savePdf, Writer, type Fonts } from './assessmentPdf';
import { dateDmy } from './format';
import { postTitle, type SelectionReport } from './selectionReport';

// The primary selection report as a PDF, laid out like the company's paper list: A4 landscape, the
// candidates HRD and the team both marked Employ, and empty boxes for the final interview board to fill by hand.

export const OFFICE_NAME = 'Corporate Head Office.';
export const OFFICE_ADDRESS = '822/3 Begum Rokeya Sharani, Mirpur, Dhaka.';

const PAGE: [number, number] = [841.89, 595.28];
const MARGIN = 30;
const INK = rgb(0.1, 0.1, 0.1);
const LINE = rgb(0.35, 0.35, 0.35);
const SHADE = rgb(0.88, 0.88, 0.88);

/** The columns, left to right, as on paper. The last one takes what is left. */
const COLUMNS: { key: string; title: string; width: number }[] = [
  { key: 'sl', title: 'Sl No.', width: 32 },
  { key: 'name', title: 'Name', width: 120 },
  { key: 'position', title: 'Present Position', width: 88 },
  { key: 'org', title: 'Present Org.', width: 128 },
  { key: 'hrd', title: 'Comments from HRD', width: 82 },
  { key: 'team', title: 'Comments from Team', width: 82 },
  { key: 'hod', title: 'Team HOD', width: 64 },
  { key: 'gm', title: 'GM', width: 64 },
  { key: 'chro', title: 'CHRO', width: 64 },
  { key: 'final', title: 'Final Decision', width: 0 },
];
const TABLE_WIDTH = PAGE[0] - MARGIN * 2;
COLUMNS[COLUMNS.length - 1].width = TABLE_WIDTH - COLUMNS.slice(0, -1).reduce((sum, c) => sum + c.width, 0);
const X = COLUMNS.reduce<number[]>((list, column, index) => [...list, index === 0 ? MARGIN : list[index - 1] + COLUMNS[index - 1].width], []);

const TITLE_H = 74;
const HEAD_H = 42;
const ROW_H = 32;
/** Room kept on the last page for the three signature lines. */
const SIGN_H = 70;

function cell(page: PDFPage, x: number, y: number, width: number, height: number, fill?: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y, width, height, borderColor: LINE, borderWidth: 0.7, color: fill });
}

/** Text centred in a box, on up to two lines. */
async function centred(write: Writer, text: string, x: number, top: number, width: number, height: number, opts: { size?: number; bold?: boolean } = {}) {
  const size = opts.size ?? 9;
  const lines = write.wrap(text, size, width - 6, 2, opts.bold);
  const leading = size * 1.2;
  const first = top - height / 2 + ((lines.length - 1) * leading) / 2 - size * 0.35;
  for (const [index, value] of lines.entries()) {
    const w = Math.min(write.widthOf(value, size, opts.bold), width - 6);
    await write.line(value, x + (width - w) / 2, first - index * leading, { size, bold: opts.bold, maxWidth: width - 6 });
  }
}

async function drawTitle(page: PDFPage, write: Writer, bucket: CvBucket, date: string | null) {
  const top = PAGE[1] - MARGIN;
  const middle = PAGE[0] / 2;
  const centre = async (text: string, baseline: number, size: number) => {
    const width = write.widthOf(text, size, true);
    await write.line(text, middle - Math.min(width, TABLE_WIDTH) / 2, baseline, { size, bold: true, maxWidth: TABLE_WIDTH });
  };
  page.drawRectangle({ x: MARGIN, y: top - TITLE_H, width: TABLE_WIDTH, height: TITLE_H, borderColor: INK, borderWidth: 1 });
  await centre(OFFICE_NAME, top - 18, 14);
  await centre(OFFICE_ADDRESS, top - 33, 10);
  await centre(`List of the candidates for - ${postTitle(bucket)}`, top - 49, 11);
  await centre(`Date: ${date ? dateDmy(date) : ''}`, top - 64, 10);
}

async function drawHead(page: PDFPage, write: Writer, top: number) {
  // "Primary Interview" takes the upper part; its two columns' titles, on two lines, the rest.
  const half = 16;
  const lower = HEAD_H - half;
  for (const [index, column] of COLUMNS.entries()) {
    if (column.key === 'hrd' || column.key === 'team') {
      cell(page, X[index], top - HEAD_H, column.width, lower, SHADE);
      await centred(write, column.title, X[index], top - half, column.width, lower, { size: 8, bold: true });
    } else {
      cell(page, X[index], top - HEAD_H, column.width, HEAD_H, SHADE);
      await centred(write, column.title, X[index], top, column.width, HEAD_H, { size: 9, bold: true });
    }
  }
  // "Primary Interview" over the HRD and Team columns.
  const start = COLUMNS.findIndex((c) => c.key === 'hrd');
  const width = COLUMNS[start].width + COLUMNS[start + 1].width;
  cell(page, X[start], top - half, width, half, SHADE);
  await centred(write, 'Primary Interview', X[start], top, width, half, { size: 9, bold: true });
}

function drawSignatures(page: PDFPage, fonts: Fonts) {
  const baseline = MARGIN + 14;
  const slot = TABLE_WIDTH / 3;
  for (const [index, label] of ['Team HOD', 'GM', 'CHRO'].entries()) {
    const lineWidth = 170;
    const x = MARGIN + slot * index + (slot - lineWidth) / 2;
    page.drawLine({ start: { x, y: baseline + 14 }, end: { x: x + lineWidth, y: baseline + 14 }, thickness: 0.7, color: INK });
    page.drawText(label, { x: x + (lineWidth - fonts.bold.widthOfTextAtSize(label, 9.5)) / 2, y: baseline, size: 9.5, font: fonts.bold, color: INK });
  }
}

export async function selectionReportPdf(bucket: CvBucket, report: SelectionReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Primary selection report - ${bucket.designation}`);
  const fonts = await embedFonts(doc);
  const tableTop = PAGE[1] - MARGIN - TITLE_H;
  const fit = (reserve: number) => Math.max(1, Math.floor((tableTop - HEAD_H - MARGIN - reserve) / ROW_H));

  // Fill pages; the last one must also hold the signatures.
  const pages: (typeof report.rows)[] = [];
  let rest = report.rows;
  do {
    if (rest.length <= fit(SIGN_H)) {
      pages.push(rest);
      rest = [];
    } else {
      const take = Math.min(fit(0), rest.length - 1);
      pages.push(rest.slice(0, take));
      rest = rest.slice(take);
    }
  } while (rest.length > 0);

  let number = 0;
  for (const [pageIndex, rows] of pages.entries()) {
    const page = doc.addPage(PAGE);
    const write = new Writer(doc, page, fonts);
    await drawTitle(page, write, bucket, report.date);
    await drawHead(page, write, tableTop);
    for (const [index, row] of rows.entries()) {
      number += 1;
      const top = tableTop - HEAD_H - index * ROW_H;
      const values: Record<string, string> = {
        sl: String(number),
        name: row.candidate.full_name,
        position: row.candidate.current_designation ?? '',
        org: row.candidate.current_company ?? '',
        hrd: row.hrd,
        team: row.team,
      };
      for (const [c, column] of COLUMNS.entries()) {
        cell(page, X[c], top - ROW_H, column.width, ROW_H);
        if (values[column.key]) await centred(write, values[column.key], X[c], top, column.width, ROW_H);
      }
    }
    if (pageIndex === pages.length - 1) drawSignatures(page, fonts);
    if (pages.length > 1) {
      const text = `Page ${pageIndex + 1} of ${pages.length}`;
      page.drawText(text, { x: PAGE[0] - MARGIN - fonts.regular.widthOfTextAtSize(text, 7.5), y: MARGIN - 14, size: 7.5, font: fonts.regular, color: LINE });
    }
  }
  return doc.save();
}

const fileName = (bucket: CvBucket, date: string | null) =>
  safeFileName(`Primary selection report - ${bucket.designation}${date ? ` - ${dateDmy(date).replace(/\//g, '-')}` : ''}.pdf`);

export async function downloadSelectionReport(bucket: CvBucket, report: SelectionReport) {
  savePdf(await selectionReportPdf(bucket, report), fileName(bucket, report.date));
}

export async function printSelectionReport(bucket: CvBucket, report: SelectionReport) {
  printPdf(await selectionReportPdf(bucket, report));
}
