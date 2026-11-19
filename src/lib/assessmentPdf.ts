import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { InterviewAssessment } from '../types';
import { AREAS, enteredByText, FORM_UNITS, FULL_SCORE, MAX_REMARKS, RATING_SCALE, scoreOf, STAGE_LABEL, type FormHeader } from './assessment';
import { dateDmy, dateTime } from './format';

// The Interview Assessment Form as a PDF, laid out like the company's paper form, one page per interviewer.
// Built in the browser: Download saves it, Print sends it to the printer.

export interface PrintableAssessment {
  groupName: string;
  header: FormHeader;
  assessment: Pick<
    InterviewAssessment,
    'ratings' | 'strengths' | 'weaknesses' | 'comment' | 'recommendation' | 'signature' | 'marks_by' | 'entered_by_name' | 'interviewer_name' | 'updated_at'
  >;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 32;
/** Space between two sections. */
const GAP = 7;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.38, 0.38, 0.38);
const LINE = rgb(0.55, 0.55, 0.55);
const BAR = rgb(0.2, 0.2, 0.2);
const SHADE = rgb(0.9, 0.9, 0.9);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

/** Text the built-in fonts cannot write (Bangla, for one) is drawn by the browser and placed as a picture. */
class Writer {
  constructor(private doc: PDFDocument, private page: PDFPage, private fonts: Fonts) {}

  private encodable(font: PDFFont, text: string) {
    try {
      font.encodeText(text);
      return true;
    } catch {
      return false;
    }
  }

  private canvasFont(size: number, bold: boolean) {
    return `${bold ? 'bold ' : ''}${size * 4}px "Nirmala UI", "Vrinda", "Noto Sans Bengali", "Shonar Bangla", Arial, sans-serif`;
  }

  private measure(text: string, size: number, font: PDFFont, bold: boolean): number {
    if (this.encodable(font, text)) return font.widthOfTextAtSize(text, size);
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = this.canvasFont(size, bold);
    return context.measureText(text).width / 4;
  }

  /** One line at a baseline, made smaller and then cut short if it does not fit. */
  async line(text: string, x: number, y: number, opts: { size?: number; bold?: boolean; italic?: boolean; maxWidth?: number; color?: ReturnType<typeof rgb> } = {}) {
    let value = text.replace(/\s+/g, ' ').trim();
    if (!value) return;
    const bold = opts.bold ?? false;
    const font = bold ? this.fonts.bold : opts.italic ? this.fonts.italic : this.fonts.regular;
    let size = opts.size ?? 10;
    const maxWidth = opts.maxWidth ?? Infinity;
    while (size > 6.5 && this.measure(value, size, font, bold) > maxWidth) size -= 0.5;
    // Cut a character at a time and end with an ellipsis, until it fits.
    while (value.length > 1 && this.measure(value, size, font, bold) > maxWidth) value = `${value.slice(0, -2)}…`;
    await this.place(value, x, y, size, font, bold, opts.color ?? INK);
  }

  /** A paragraph from a top line downwards; returns how many lines it used. */
  async paragraph(text: string, x: number, top: number, width: number, opts: { size?: number; maxLines?: number; leading?: number } = {}) {
    const size = opts.size ?? 10;
    const leading = opts.leading ?? size * 1.3;
    const font = this.fonts.regular;
    const lines: string[] = [];
    for (const block of text.split(/\n+/)) {
      let current = '';
      for (const word of block.split(/\s+/).filter(Boolean)) {
        const next = current ? `${current} ${word}` : word;
        if (current && this.measure(next, size, font, false) > width) {
          lines.push(current);
          current = word;
        } else current = next;
      }
      if (current) lines.push(current);
    }
    const shown = lines.slice(0, opts.maxLines ?? lines.length);
    if (opts.maxLines && lines.length > opts.maxLines) shown[shown.length - 1] = `${shown[shown.length - 1]}…`;
    for (const [index, value] of shown.entries()) await this.place(value, x, top - size - index * leading, size, font, false, INK);
    return shown.length;
  }

  private async place(text: string, x: number, y: number, size: number, font: PDFFont, bold: boolean, color: ReturnType<typeof rgb>) {
    if (this.encodable(font, text)) {
      this.page.drawText(text, { x, y, size, font, color });
      return;
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    context.font = this.canvasFont(size, bold);
    canvas.width = Math.max(1, Math.ceil(context.measureText(text).width) + 8);
    canvas.height = Math.ceil(size * 4 * 1.6);
    context.font = this.canvasFont(size, bold);
    context.fillStyle = '#1a1a1a';
    context.textBaseline = 'alphabetic';
    context.fillText(text, 4, size * 4 * 1.2);
    const image = await this.doc.embedPng(canvas.toDataURL('image/png'));
    this.page.drawImage(image, { x: x - 1, y: y - size * 0.4, width: canvas.width / 4, height: canvas.height / 4 });
  }
}

function box(page: PDFPage, x: number, y: number, width: number, height: number, fill?: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y, width, height, borderColor: LINE, borderWidth: 0.7, color: fill });
}

function tick(page: PDFPage, x: number, y: number, size: number) {
  page.drawLine({ start: { x: x + size * 0.18, y: y + size * 0.5 }, end: { x: x + size * 0.42, y: y + size * 0.2 }, thickness: 1.6, color: INK });
  page.drawLine({ start: { x: x + size * 0.42, y: y + size * 0.2 }, end: { x: x + size * 0.85, y: y + size * 0.85 }, thickness: 1.6, color: INK });
}


async function drawPage(doc: PDFDocument, fonts: Fonts, item: PrintableAssessment) {
  const page = doc.addPage(A4);
  const write = new Writer(doc, page, fonts);
  const { header, assessment } = item;
  const right = A4[0] - MARGIN;
  const width = right - MARGIN;
  const bar = (title: string, top: number) => {
    page.drawRectangle({ x: MARGIN, y: top - 14, width: Math.max(250, fonts.bold.widthOfTextAtSize(title, 9) + 14), height: 14, color: BAR });
    page.drawText(title, { x: MARGIN + 6, y: top - 10.5, size: 9, font: fonts.bold, color: rgb(1, 1, 1) });
  };
  // A label, then its value written over a rule.
  const field = async (label: string, value: string, x: number, baseline: number, fieldWidth: number) => {
    page.drawText(label, { x, y: baseline, size: 9, font: fonts.regular, color: MUTED });
    const start = x + fonts.regular.widthOfTextAtSize(label, 9) + 6;
    page.drawLine({ start: { x: start, y: baseline - 2 }, end: { x: x + fieldWidth, y: baseline - 2 }, thickness: 0.5, color: LINE });
    await write.line(value, start + 2, baseline, { size: 10, bold: true, maxWidth: x + fieldWidth - start - 4 });
  };

  // Title.
  let y = A4[1] - MARGIN;
  await write.line(item.groupName, MARGIN, y - 12, { size: 11, bold: true, maxWidth: 220 });
  const title = 'Interview Assessment Form';
  page.drawText(title, { x: right - fonts.bold.widthOfTextAtSize(title, 17), y: y - 14, size: 17, font: fonts.bold, color: INK });
  const stage = STAGE_LABEL[header.stage];
  page.drawText(stage, { x: right - fonts.regular.widthOfTextAtSize(stage, 9), y: y - 27, size: 9, font: fonts.regular, color: MUTED });
  y -= 40;

  // Candidate and interviewer.
  bar("Candidate & Interviewer's Information", y);
  const infoTop = y - 14;
  const infoHeight = 96;
  box(page, MARGIN, infoTop - infoHeight, width, infoHeight);
  let line = infoTop - 16;
  page.drawText('Unit / Factory', { x: MARGIN + 8, y: line, size: 9, font: fonts.regular, color: MUTED });
  const unit = (header.unit || '').toUpperCase();
  let unitX = MARGIN + 100;
  for (const code of [...FORM_UNITS, 'Other']) {
    box(page, unitX, line - 3, 11, 11);
    const isThis = code === 'Other' ? Boolean(unit) && !FORM_UNITS.includes(unit) : unit === code;
    if (isThis) tick(page, unitX, line - 3, 11);
    page.drawText(code, { x: unitX + 15, y: line, size: 9, font: fonts.regular, color: INK });
    unitX += code === 'Other' ? 40 : 58;
  }
  if (unit && !FORM_UNITS.includes(unit)) await write.line(header.unit, unitX, line, { size: 10, bold: true, maxWidth: right - unitX - 8 });
  const half = (width - 24) / 2;
  const leftX = MARGIN + 8;
  const rightX = MARGIN + 16 + half;
  line -= 18;
  await field("Candidate's Name", header.candidateName, leftX, line, half);
  await field('Position', header.designation, rightX, line, half);
  line -= 18;
  await field('Sub-section', header.subsection, leftX, line, half * 0.5 - 6);
  await field('Section', header.section, leftX + half * 0.5, line, half * 0.5);
  await field('Department', header.department, rightX, line, half);
  line -= 18;
  await field("Interviewer's Name", header.interviewerName, leftX, line, half);
  await field('Position', header.interviewerDesignation, rightX, line, half);
  line -= 18;
  await field('Department', header.interviewerDepartment, leftX, line, half);
  await field('Date of Interview', header.date ? dateDmy(header.date) : '', rightX, line, half);
  y = infoTop - infoHeight - GAP;

  // The ten areas.
  bar('Interview Assessment of Candidate', y);
  const tableTop = y - 14;
  const slW = 26;
  const markW = 52;
  const areaW = width - slW - markW * 5;
  const headH = 30;
  const rowH = 24;
  box(page, MARGIN, tableTop - headH, slW, headH, SHADE);
  page.drawText('SL', { x: MARGIN + 7, y: tableTop - 19, size: 9, font: fonts.bold, color: INK });
  box(page, MARGIN + slW, tableTop - headH, areaW, headH, SHADE);
  page.drawText('Areas of Assessment', { x: MARGIN + slW + 8, y: tableTop - 13, size: 9.5, font: fonts.bold, color: INK });
  page.drawText('(Key indicators of assessment areas)', { x: MARGIN + slW + 8, y: tableTop - 24, size: 8, font: fonts.regular, color: MUTED });
  for (const [index, point] of RATING_SCALE.entries()) {
    const x = MARGIN + slW + areaW + index * markW;
    box(page, x, tableTop - headH, markW, headH, SHADE);
    page.drawText(point.label, { x: x + (markW - fonts.bold.widthOfTextAtSize(point.label, 8)) / 2, y: tableTop - 13, size: 8, font: fonts.bold, color: INK });
    const number = String(point.value);
    page.drawText(number, { x: x + (markW - fonts.bold.widthOfTextAtSize(number, 9)) / 2, y: tableTop - 25, size: 9, font: fonts.bold, color: INK });
  }
  for (const [index, area] of AREAS.entries()) {
    const top = tableTop - headH - index * rowH;
    box(page, MARGIN, top - rowH, slW, rowH);
    page.drawText(`${index + 1}.`, { x: MARGIN + 7, y: top - 12, size: 9, font: fonts.regular, color: INK });
    box(page, MARGIN + slW, top - rowH, areaW, rowH);
    page.drawText(area.title, { x: MARGIN + slW + 6, y: top - 10, size: 9.5, font: fonts.bold, color: INK });
    await write.line(`(${area.hint})`, MARGIN + slW + 6, top - 20, { size: 6.5, color: MUTED, maxWidth: areaW - 10 });
    for (const [column, point] of RATING_SCALE.entries()) {
      const x = MARGIN + slW + areaW + column * markW;
      box(page, x, top - rowH, markW, rowH);
      if (assessment.ratings[index] === point.value) tick(page, x + markW / 2 - 8, top - rowH / 2 - 8, 16);
    }
  }
  y = tableTop - headH - AREAS.length * rowH - GAP;

  // Strengths and weaknesses.
  bar('Major Observable Strengths & Weaknesses of the Candidate', y);
  const remarksTop = y - 14;
  const remarksH = MAX_REMARKS * 12 + 10;
  box(page, MARGIN, remarksTop - remarksH, width, remarksH);
  for (let i = 0; i < MAX_REMARKS; i += 1) {
    const baseline = remarksTop - 14 - i * 12;
    await field(`Strength - ${i + 1}`, assessment.strengths[i] ?? '', leftX, baseline, half);
    await field(`Weakness - ${i + 1}`, assessment.weaknesses[i] ?? '', rightX, baseline, half);
  }
  y = remarksTop - remarksH - GAP;

  // Comment.
  bar("Interviewer's Comment", y);
  const commentTop = y - 14;
  const commentH = 36;
  box(page, MARGIN, commentTop - commentH, width, commentH);
  await write.paragraph(assessment.comment, MARGIN + 8, commentTop - 4, width - 16, { size: 9.5, maxLines: 2, leading: 12 });
  y = commentTop - commentH - GAP;

  // Score: worked out, never written by hand.
  const score = scoreOf(assessment.ratings);
  bar('Interview Assessment Score', y);
  const scoreTop = y - 14;
  const scoreH = 30;
  box(page, MARGIN, scoreTop - scoreH, width, scoreH);
  const quarter = width / 4;
  const scoreCell = (label: string, sub: string, value: string, column: number) => {
    const x = MARGIN + 8 + column * quarter;
    page.drawText(label, { x, y: scoreTop - 13, size: 9, font: fonts.regular, color: INK });
    if (sub) page.drawText(sub, { x, y: scoreTop - 24, size: 7, font: fonts.regular, color: MUTED });
    const valueX = x + quarter - 58;
    box(page, valueX, scoreTop - 21, 46, 14);
    page.drawText(value, { x: valueX + (46 - fonts.bold.widthOfTextAtSize(value, 10)) / 2, y: scoreTop - 17.5, size: 10, font: fonts.bold, color: INK });
  };
  scoreCell('Full Score', '', String(FULL_SCORE), 0);
  scoreCell('Obtained Score', '', String(score.obtained), 1);
  scoreCell('Average Score', '(Obtained ÷ 10)', score.average.toFixed(1), 2);
  scoreCell('% of Score', '(Obtained ÷ 50 × 100)', `${score.percent}%`, 3);
  y = scoreTop - scoreH - GAP;

  // Recommendation.
  bar("Interviewer's Recommendation", y);
  const recTop = y - 14;
  const recH = 24;
  box(page, MARGIN, recTop - recH, width, recH);
  let recX = MARGIN + 8;
  for (const [value, label] of [['employ', 'Employ'], ['turn_down', 'Turn Down']] as const) {
    box(page, recX, recTop - 17, 12, 12);
    if (assessment.recommendation === value) tick(page, recX, recTop - 17, 12);
    page.drawText(label, { x: recX + 17, y: recTop - 14, size: 10, font: fonts.regular, color: INK });
    recX += 110;
  }
  y = recTop - recH - 14;

  // Signature.
  const sigBaseline = Math.max(MARGIN + 34, y - 44);
  page.drawText("Interviewer's Signature", { x: MARGIN, y: sigBaseline, size: 10, font: fonts.italic, color: INK });
  const sigX = MARGIN + 130;
  page.drawLine({ start: { x: sigX, y: sigBaseline - 2 }, end: { x: sigX + 190, y: sigBaseline - 2 }, thickness: 0.6, color: INK });
  if (assessment.signature) {
    const image = await doc.embedPng(assessment.signature);
    const scale = Math.min(180 / image.width, 46 / image.height);
    page.drawImage(image, { x: sigX + 5, y: sigBaseline, width: image.width * scale, height: image.height * scale });
  }

  // Who entered it and when, small at the foot.
  const foot = `${enteredByText(assessment)}${assessment.updated_at ? `, last saved ${dateTime(assessment.updated_at)}` : ''}.`;
  await write.line(foot, MARGIN, MARGIN - 10, { size: 7.5, italic: true, color: MUTED, maxWidth: width });
}

export async function assessmentPdf(items: PrintableAssessment[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(items.length === 1 ? `Interview Assessment - ${items[0].header.candidateName}` : 'Interview Assessments');
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  for (const item of items) await drawPage(doc, fonts, item);
  return doc.save();
}

const fileName = (items: PrintableAssessment[]) => {
  const first = items[0];
  const who = items.length === 1 ? ` - ${first.assessment.interviewer_name}` : '';
  return `Interview Assessment - ${first.header.candidateName} - ${STAGE_LABEL[first.header.stage]}${who}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ');
};

const blobOf = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' });

export async function downloadAssessments(items: PrintableAssessment[]) {
  const url = URL.createObjectURL(blobOf(await assessmentPdf(items)));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(items);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Opens the printer dialog for the PDF. Where a browser cannot print a PDF in place, it opens in a new tab. */
export async function printAssessments(items: PrintableAssessment[]) {
  const url = URL.createObjectURL(blobOf(await assessmentPdf(items)));
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, '_blank', 'noopener');
    }
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 120_000);
  };
  document.body.append(frame);
}
