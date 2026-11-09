import type { OrgUnit, Requisition, RequisitionStatus } from '../types';
import { addToStructure, findDepartment, findSection, findUnit, nameKey } from './org';

// Reads the company's vacancy status sheet ("NEW_Job vacancy Status _July 2026.xlsx", sheet VACANCY)
// into requisitions. Each row is keyed by its SL, so syncing the sheet again updates the same rows instead
// of adding them twice. Columns are found by their heading, so a moved or added column does not matter.

/** A cell as it comes out of the workbook: plain values, dates, or ExcelJS's rich text and formula shapes. */
export type SheetCell = unknown;

type Field =
  | 'sl' | 'unit' | 'position' | 'department' | 'section' | 'reason' | 'former' | 'gap' | 'required'
  | 'requisition_date' | 'approved_on' | 'posting_site' | 'posting_date' | 'cv_received' | 'shortlisted_primary'
  | 'primary_interview' | 'primary_attended' | 'shortlisted_final' | 'final_interview' | 'offer_date' | 'days'
  | 'selected' | 'status' | 'expected_joining' | 'remarks';

/** Heading words, compared without case, spacing or punctuation. The first heading that starts with one wins. */
const HEADINGS: [Field, string[]][] = [
  ['sl', ['sl', 'slno', 'serial']],
  ['unit', ['unit']],
  ['position', ['position', 'designation']],
  ['department', ['department']],
  ['section', ['section']],
  ['reason', ['reasonforvacancy', 'reason']],
  ['former', ['formeremployee']],
  ['gap', ['vacancygap', 'gap']],
  ['required', ['required']],
  ['requisition_date', ['requisitiondate']],
  ['approved_on', ['approvedrequisition']],
  ['posting_site', ['jobpostingsite']],
  ['posting_date', ['jobpostingdate']],
  ['cv_received', ['cvreceived']],
  ['shortlisted_primary', ['shortlistedforprimary']],
  ['primary_interview', ['primaryinterviewdate']],
  ['primary_attended', ['primaryinterviewattended']],
  ['shortlisted_final', ['shortlistedforfinal']],
  ['final_interview', ['finalinterviewdate']],
  ['offer_date', ['approvalandofferletter', 'offerletter']],
  ['days', ['noofdays']],
  ['selected', ['nameofselected']],
  ['status', ['currentstatus', 'status']],
  ['expected_joining', ['expecteddateofjoining']],
  ['remarks', ['remarks']],
];

/** The columns a row cannot do without. */
const NEEDED: Field[] = ['sl', 'unit', 'position', 'department'];

/** Spellings in the sheet that mean a department under another name. */
const DEPARTMENT_ALIASES: Record<string, string> = {
  [nameKey('Engneering & Services')]: 'Engineering & Services',
  [nameKey('MIS & IA')]: 'MIS & Internal Audit',
};

const SECTION_ALIASES: Record<string, string> = {
  [nameKey('IA')]: 'Internal Audit',
  [nameKey('Sewing - Techncal')]: 'Sewing - Technical',
};

/** "Do" (ditto) in the section column: same as the department, so no section of its own. */
const DITTO = new Set(['do', 'do.', 'ditto', '"']);

export interface VacancyRow {
  sl: number;
  /** The requisition as it will be saved. Every row carries the same columns. */
  requisition: Omit<Requisition, 'id' | 'designation_id'>;
  /** Things worth a look: a date that could not be read, a name spelt differently, and so on. */
  notes: string[];
}

export interface VacancyImport {
  sheetName: string;
  rows: VacancyRow[];
  /** Rows with an SL but no unit or position, such as the numbered blank rows at the end. */
  blankRows: number;
  /** Headings of needed columns that were not found. */
  missingColumns: string[];
  /** The structure with every unit, department and section the sheet names. */
  structure: OrgUnit[];
  /** What the sheet adds to the structure, e.g. "TAL › Washing › Dry Process". */
  added: string[];
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/** Unwraps ExcelJS's shapes: formulas give their result, rich text its text, errors nothing. */
export function plain(cell: SheetCell): string | number | boolean | Date | null {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date || typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') return cell;
  if (typeof cell === 'object') {
    const value = cell as Record<string, unknown>;
    if ('error' in value) return null;
    if ('result' in value) return plain(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part: { text?: string }) => part.text ?? '').join('');
    if ('text' in value) return plain(value.text);
  }
  return null;
}

export function cellText(cell: SheetCell): string {
  const value = plain(cell);
  if (value === null) return '';
  if (value instanceof Date) return isoOf(value) ?? '';
  return String(value).replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/[\s ]+/g, ' ').trim()).filter(Boolean).join('\n');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A workbook date: ExcelJS gives midnight UTC, so the UTC parts are the calendar day. Years before 2000 are typing slips. */
function isoOf(date: Date): string | null {
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) return null;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Excel's day number, for a date typed as a number (45000 is 2023-03-15). */
function fromSerial(serial: number): string | null {
  if (serial < 36526 || serial > 73050) return null;
  return isoOf(new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000));
}

/**
 * The first date in a cell: a real date, a day number, or text such as 7/16/2026, 27/07/2026 or 2026-07-16.
 * Text with the day first is read when the first number cannot be a month; otherwise month first, as Excel types it.
 * `more` says the cell held more than one date, e.g. a first and a second interview.
 */
export function cellDate(cell: SheetCell): { date: string | null; more: boolean; text: string } {
  const value = plain(cell);
  if (value === null || value === '') return { date: null, more: false, text: '' };
  if (value instanceof Date) return { date: isoOf(value), more: false, text: isoOf(value) ?? '' };
  if (typeof value === 'number') return { date: fromSerial(value), more: false, text: String(value) };
  const text = cellText(value);
  const found: string[] = [];
  for (const match of text.matchAll(/(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/g)) {
    let year: number;
    let month: number;
    let day: number;
    if (match[1]) {
      [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    } else {
      const [a, b] = [Number(match[4]), Number(match[5])];
      year = Number(match[6]) < 100 ? 2000 + Number(match[6]) : Number(match[6]);
      [month, day] = a > 12 ? [b, a] : [a, b];
    }
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) continue;
    found.push(`${year}-${pad(month)}-${pad(day)}`);
  }
  return { date: found[0] ?? null, more: found.length > 1, text };
}

function cellNumber(cell: SheetCell): number | null {
  const value = plain(cell);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

/** A count as the sheet has it: a number, FO, "4+9+6" and so on, kept as written. */
function cellFigure(cell: SheetCell): string | number | null {
  const number = cellNumber(cell);
  if (number !== null) return number;
  const text = cellText(cell).replace(/\n/g, ', ');
  return text || null;
}

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

/** Finds the heading row (within the first 10 rows) and which column holds which field. */
export function findColumns(rows: SheetCell[][]): { headerRow: number; columns: Partial<Record<Field, number>> } | null {
  for (let r = 0; r < Math.min(rows.length, 10); r += 1) {
    const columns: Partial<Record<Field, number>> = {};
    rows[r].forEach((cell, index) => {
      const heading = nameKey(cellText(cell));
      if (!heading) return;
      const field = HEADINGS.find(([name, words]) => columns[name] === undefined && words.some((word) => heading.startsWith(word)))?.[0];
      if (field) columns[field] = index;
    });
    if (columns.unit !== undefined && columns.position !== undefined) return { headerRow: r, columns };
  }
  return null;
}

const STATUS: Record<string, RequisitionStatus> = {
  done: 'Filled',
  filled: 'Filled',
  onprocess: 'In progress',
  inprocess: 'In progress',
  inprogress: 'In progress',
  processing: 'In progress',
  hold: 'On hold',
  onhold: 'On hold',
  cancel: 'Cancelled',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
};

function vacancyType(text: string): string {
  const key = nameKey(text);
  if (!key) return '';
  if (key.includes('new') && key.includes('replacement')) return 'New & Replacement';
  if (key.startsWith('replace')) return 'Replacement';
  if (key.startsWith('new')) return 'New';
  return text;
}

/** Noon in Bangladesh, so the day stays the same in every time zone the app is opened in. */
const stampOf = (date: string) => `${date}T06:00:00.000Z`;

/**
 * Turns the sheet's rows into requisitions. `existing` gives the creation time of rows synced before, so an
 * update keeps it when the sheet has no requisition date; `now` is used for new rows without one.
 */
export function parseVacancySheet(
  sheetName: string,
  rows: SheetCell[][],
  structure: OrgUnit[],
  options: { existing?: Map<string, string>; now?: string } = {},
): VacancyImport {
  const found = findColumns(rows);
  if (!found) {
    return { sheetName, rows: [], blankRows: 0, missingColumns: ['Unit', 'Position'], structure, added: [] };
  }
  const { headerRow, columns } = found;
  const missingColumns = NEEDED.filter((field) => columns[field] === undefined).map((field) => field === 'sl' ? 'SL' : field[0].toUpperCase() + field.slice(1));
  const now = options.now ?? new Date().toISOString();
  const cell = (row: SheetCell[], field: Field) => (columns[field] === undefined ? null : row[columns[field]!]);

  let merged = structure;
  const added: string[] = [];
  const result: VacancyRow[] = [];
  let blankRows = 0;
  const seen = new Set<number>();

  for (const row of rows.slice(headerRow + 1)) {
    const sl = cellNumber(cell(row, 'sl'));
    const unit = cellText(cell(row, 'unit')).toUpperCase();
    const position = cellText(cell(row, 'position')).replace(/\n/g, ' ');
    if (sl === null || !unit || !position) {
      if (sl !== null) blankRows += 1;
      continue;
    }
    const notes: string[] = [];
    if (seen.has(sl)) notes.push(`SL ${sl} appears more than once; the last one is kept.`);
    seen.add(sl);

    // Names are matched to the structure, so "QA,Audit & Technical" lands in "QA, Audit & Technical".
    const unitInStructure = findUnit(merged, unit);
    // "QA,Audit & Technical" becomes "QA, Audit & Technical" when the structure has no spelling of it yet.
    const rawDepartment = cellText(cell(row, 'department')).replace(/\n/g, ' ').replace(/,(?=\S)/g, ', ');
    const aliasDepartment = DEPARTMENT_ALIASES[nameKey(rawDepartment)];
    const department = findDepartment(unitInStructure, aliasDepartment ?? rawDepartment)?.name
      ?? findDepartment({ code: '', name: '', departments: merged.flatMap((u) => u.departments) }, aliasDepartment ?? rawDepartment)?.name
      ?? aliasDepartment ?? rawDepartment;
    if (aliasDepartment) notes.push(`Department "${rawDepartment}" read as "${department}".`);

    const rawSection = cellText(cell(row, 'section')).replace(/\n/g, ' ');
    let section = rawSection;
    if (DITTO.has(rawSection.toLowerCase())) {
      section = '';
      notes.push(`Section "${rawSection}" (ditto) left blank: choose the section on the requisition.`);
    } else {
      const aliasSection = SECTION_ALIASES[nameKey(rawSection)];
      const inStructure = findSection(findDepartment(findUnit(merged, unit), department), aliasSection ?? rawSection)?.name;
      section = inStructure ?? aliasSection ?? rawSection;
      if (aliasSection) notes.push(`Section "${rawSection}" read as "${section}".`);
    }

    const placed = addToStructure(merged, { unit, department, section });
    if (placed.added) {
      merged = placed.structure;
      added.push(placed.added);
    }

    const date = (field: Field, label: string) => {
      const value = cellDate(cell(row, field));
      if (!value.date && value.text && nameKey(value.text) !== 'fo') notes.push(`${label} "${value.text.replace(/\n/g, ' ')}" is not a date.`);
      return value;
    };
    // A date in 1900 is a number typed into a date cell, e.g. 6 shown as 06/01/1900.
    for (const [field, label] of [['primary_interview', 'Primary interview date'], ['final_interview', 'Final interview date']] as const) {
      const value = plain(cell(row, field));
      if (value instanceof Date && value.getUTCFullYear() < 2000) notes.push(`${label} reads ${value.toISOString().slice(0, 10)}, which looks like a typing slip; left out.`);
    }
    const requisitionDate = date('requisition_date', 'Requisition date');
    const approved = date('approved_on', 'Approved requisition date');
    const offer = date('offer_date', 'Offer letter date');
    const joining = cellDate(cell(row, 'expected_joining'));
    const posting = cellDate(cell(row, 'posting_date'));

    const sheetStatus = cellText(cell(row, 'status'));
    const selected = cellText(cell(row, 'selected'));
    const status: RequisitionStatus = STATUS[nameKey(sheetStatus)]
      ?? (selected ? 'In progress' : approved.date ? 'Approved' : 'Pending approval');
    if (sheetStatus && !STATUS[nameKey(sheetStatus)]) notes.push(`Status "${sheetStatus}" is not one the app knows; saved as ${status}.`);

    const required = cellNumber(cell(row, 'required'));
    const gap = cellNumber(cell(row, 'gap'));
    const former = cellText(cell(row, 'former'));
    const factory = ['posting_site', 'cv_received', 'shortlisted_primary', 'primary_interview'].some((field) => nameKey(cellText(cell(row, field as Field))) === 'fo');
    const createdOn = requisitionDate.date ?? approved.date;

    const sheetData: VacancyRow['requisition']['sheet_data'] = {
      sl,
      gap,
      required,
      posting_site: cellText(cell(row, 'posting_site')).replace(/\n/g, ', ') || null,
      posting_date: posting.date ?? (cellText(cell(row, 'posting_date')) || null),
      cv_received: cellFigure(cell(row, 'cv_received')),
      shortlisted_primary: cellFigure(cell(row, 'shortlisted_primary')),
      primary_interview: cellText(cell(row, 'primary_interview')).replace(/\n/g, ', ') || null,
      primary_attended: cellFigure(cell(row, 'primary_attended')),
      shortlisted_final: cellFigure(cell(row, 'shortlisted_final')),
      final_interview: cellText(cell(row, 'final_interview')).replace(/\n/g, ', ') || null,
      factory,
      sheet_status: sheetStatus || null,
      expected_joining_note: !joining.date && joining.text && nameKey(joining.text) !== 'fo' ? joining.text : null,
      offer_dates: offer.more ? offer.text.replace(/\n/g, ', ') : null,
    };

    result.push({
      sl,
      notes,
      requisition: {
        sheet_key: `vacancy-sheet:${sl}`,
        ref_no: `VAC-${String(sl).padStart(3, '0')}`,
        unit,
        designation: position,
        department,
        section,
        subsection: '',
        company: '',
        vacancies: Math.max(1, Math.round(required ?? gap ?? 1)),
        priority: 'Medium',
        employment_type: 'Permanent',
        location: '',
        hiring_manager: '',
        requested_by: '',
        budget_min: null,
        budget_max: null,
        target_date: null,
        status,
        justification: '',
        job_description: '',
        vacancy_type: vacancyType(cellText(cell(row, 'reason'))),
        replacing: /^(n\/?a|-|none)$/i.test(former) ? '' : former.replace(/\n/g, ', '),
        requisition_date: requisitionDate.date,
        approved_on: approved.date,
        offer_date: offer.date,
        expected_joining: joining.date,
        selected_names: selected,
        remarks: cellText(cell(row, 'remarks')),
        created_at: createdOn ? stampOf(createdOn) : options.existing?.get(`vacancy-sheet:${sl}`) ?? now,
        filled_at: status === 'Filled' && (offer.date ?? joining.date) ? stampOf((offer.date ?? joining.date)!) : null,
        sheet_data: sheetData,
      },
    });
  }

  // A repeated SL keeps its last row, as a spreadsheet user would expect from "the row further down".
  const bySl = new Map<number, VacancyRow>();
  for (const row of result) bySl.set(row.sl, row);
  return { sheetName, rows: [...bySl.values()].sort((a, b) => a.sl - b.sl), blankRows, missingColumns, structure: merged, added };
}

/** Opens a workbook and reads its vacancy sheet: the one named VACANCY, or else the first with Unit and Position headings. */
export async function readVacancyWorkbook(data: ArrayBuffer): Promise<{ sheetName: string; rows: SheetCell[][] }> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheets = workbook.worksheets.filter((sheet) => sheet.state !== 'hidden' && sheet.state !== 'veryHidden');
  const rowsOf = (sheet: (typeof sheets)[number]) => {
    const rows: SheetCell[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row, number) => {
      const values = row.values as SheetCell[];
      // ExcelJS numbers columns from 1, leaving the first slot empty.
      rows[number - 1] = Array.isArray(values) ? values.slice(1) : [];
    });
    return Array.from(rows, (row) => row ?? []);
  };
  const named = sheets.find((sheet) => nameKey(sheet.name) === 'vacancy');
  for (const sheet of named ? [named, ...sheets.filter((s) => s !== named)] : sheets) {
    const rows = rowsOf(sheet);
    if (findColumns(rows)) return { sheetName: sheet.name, rows };
  }
  throw new Error('No sheet in this file has the Unit and Position columns of the vacancy status sheet.');
}
