import { describe, expect, it } from 'vitest';
import { DESIGNATIONS, gradeOf } from '../src/lib/designations';
import { addToStructure, DEFAULT_ORG_STRUCTURE, departmentOptions, departmentsToOutline, nameKey, outlineToDepartments, sectionOptions } from '../src/lib/org';
import { cellDate, cellText, findColumns, parseVacancySheet } from '../src/lib/vacancySheet';
import type { OrgUnit } from '../src/types';

// The heading row of the company's sheet, line breaks and stray spaces included.
const HEADINGS = [
  'SL', 'Unit', 'Position', 'Department', 'Section', 'Reason for Vacancy New / Replacement', 'Former Employee Name', 'Vacancy / GAP',
  'Required ', 'Requisition Date', 'Approved Requisition received Date(Factory)', 'Job posting  Site', 'Job Posting Date', 'CV \nReceived',
  'Shortlisted\nfor\nPrimary Interview', 'Primary\nInterview Date', 'Primary Interview Attended', 'Shortlisted\nfor\nFinal Interview',
  'Final\nInterview Date', 'Approval & Offer Letter (Date)', 'No. of Days Complted Recruitment', 'Name of Selected Candidates',
  'Current Status', 'Expected Date of Joining', 'Remarks',
];

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function row(values: Partial<Record<string, unknown>>): unknown[] {
  return HEADINGS.map((heading) => values[heading.replace(/\s+/g, ' ').trim()] ?? null);
}

const RHL: OrgUnit = {
  code: 'RHL',
  name: 'RHL',
  departments: [{ name: 'QA, Audit & Technical', code: 'RHL-QA', sections: [{ name: 'Laboratory', subsections: ['Lab'] }] }],
};

describe('reading cells', () => {
  it('unwraps formulas, rich text and errors', () => {
    expect(cellText({ formula: 'A1', result: 'Done' })).toBe('Done');
    expect(cellText({ richText: [{ text: 'BD Jobs' }, { text: '\nLinkidin ' }] })).toBe('BD Jobs\nLinkidin');
    expect(cellText({ error: '#VALUE!' })).toBe('');
  });

  it('reads dates however they were typed, and drops typing slips', () => {
    expect(cellDate(utc('2026-07-07')).date).toBe('2026-07-07');
    expect(cellDate(46210).date).toBe('2026-07-07');
    expect(cellDate('27/07/2026\n28/07/2026')).toMatchObject({ date: '2026-07-27', more: true });
    expect(cellDate('7/16/2026\n8/02/2026')).toMatchObject({ date: '2026-07-16', more: true });
    expect(cellDate('21/09/2026').date).toBe('2026-09-21');
    expect(cellDate(utc('1900-01-06')).date).toBeNull();
    expect(cellDate('FO').date).toBeNull();
  });

  it('finds the columns by heading, whatever their order', () => {
    const found = findColumns([['Vacancy status, July 2026'], [...HEADINGS].reverse()]);
    expect(found?.headerRow).toBe(1);
    expect(found?.columns.unit).toBe(HEADINGS.length - 2);
    expect(found?.columns.offer_date).toBe(HEADINGS.length - 1 - HEADINGS.indexOf('Approval & Offer Letter (Date)'));
    expect(findColumns([['Name', 'Phone']])).toBeNull();
  });
});

describe('the vacancy sheet', () => {
  const rows = [
    HEADINGS,
    row({
      SL: 1, Unit: 'TAL', Position: 'Incharge', Department: 'Production', Section: 'Finishing', 'Reason for Vacancy New / Replacement': 'Replacement',
      'Former Employee Name': 'Shahidul Islam\n48200', 'Vacancy / GAP': 1, Required: 1, 'Requisition Date': utc('2026-07-07'),
      'Approved Requisition received Date(Factory)': utc('2026-07-07'), 'Job posting Site': 'FO', 'CV Received': 'FO', 'Shortlisted for Final Interview': 1,
      'Final Interview Date': utc('2026-07-08'), 'Approval & Offer Letter (Date)': utc('2026-07-13'), 'No. of Days Complted Recruitment': -6,
      'Name of Selected Candidates': 'Md. Noornabi Setu', 'Current Status': 'Done',
    }),
    row({
      SL: 2, Unit: 'rhl', Position: 'Executive', Department: 'QA,Audit & Technical', Section: 'Quality', 'Reason for Vacancy New / Replacement': 'New',
      'Former Employee Name': 'N/A', 'Vacancy / GAP': 11, Required: 2, 'Requisition Date': '7/7/2026', 'Current Status': 'On Process',
    }),
    row({ SL: 3, Unit: 'BGL', Position: 'Executive', Department: 'Engneering & Services', Section: 'Do', Required: 2, 'Approved Requisition received Date(Factory)': utc('2026-08-02'), 'Current Status': 'HOLD' }),
    row({ SL: 4, Unit: 'CHO', Position: 'Jr. Executive', Department: 'MIS & IA', Section: 'IA', 'Name of Selected Candidates': '1. A\n2. B', 'Expected Date of Joining': 'Unit - 3' }),
    row({ SL: 5, Unit: 'CHO', Position: 'MT', Department: 'Marketing & Merchandising', Section: 'Merchandising', 'Requisition Date': 'soon' }),
    row({ SL: 102, 'No. of Days Complted Recruitment': 1 }),
    row({ SL: 2, Unit: 'RHL', Position: 'Executive', Department: 'QA, Audit & Technical', Section: 'Quality', Required: 3 }),
  ];
  const result = parseVacancySheet('VACANCY', rows, [RHL], { now: '2026-11-09T06:00:00.000Z' });
  const bySl = (sl: number) => result.rows.find((r) => r.sl === sl)!;

  it('reads every row with a unit and a position, keyed by SL, and skips numbered blanks', () => {
    expect(result.missingColumns).toEqual([]);
    expect(result.rows.map((r) => r.sl)).toEqual([1, 2, 3, 4, 5]);
    expect(result.blankRows).toBe(1);
    expect(bySl(1).requisition).toMatchObject({
      sheet_key: 'vacancy-sheet:1', ref_no: 'VAC-001', unit: 'TAL', designation: 'Incharge', department: 'Production', section: 'Finishing',
      vacancy_type: 'Replacement', replacing: 'Shahidul Islam, 48200', vacancies: 1, requisition_date: '2026-07-07', approved_on: '2026-07-07',
      offer_date: '2026-07-13', status: 'Filled', selected_names: 'Md. Noornabi Setu', created_at: '2026-07-07T06:00:00.000Z', grade: '',
      filled_at: '2026-07-13T06:00:00.000Z',
    });
    expect(bySl(1).requisition.sheet_data).toMatchObject({ factory: true, cv_received: 'FO', shortlisted_final: 1, final_interview: '2026-07-08', gap: 1 });
  });

  it('keeps the last row of a repeated SL, and says so', () => {
    expect(bySl(2).requisition.vacancies).toBe(3);
    expect(bySl(2).notes.join(' ')).toMatch(/appears more than once/);
  });

  it('matches names to the structure, fixes known misspellings and says what it changed', () => {
    expect(bySl(2).requisition).toMatchObject({ unit: 'RHL', department: 'QA, Audit & Technical', grade: 'MS-12' });
    expect(bySl(3).requisition).toMatchObject({ department: 'Engineering & Services', section: '', status: 'On hold' });
    expect(bySl(3).notes.join(' ')).toMatch(/ditto/);
    expect(bySl(4).requisition).toMatchObject({ department: 'MIS & Internal Audit', section: 'Internal Audit', status: 'In progress' });
    expect(bySl(4).requisition.sheet_data.expected_joining_note).toBe('Unit - 3');
  });

  it('sets the status the app uses, and falls back sensibly when the sheet has none', () => {
    expect(bySl(5).requisition.status).toBe('Pending approval');
    expect(bySl(3).requisition.status).toBe('On hold');
    expect(bySl(5).notes.join(' ')).toMatch(/Requisition date "soon" is not a date/);
    expect(bySl(5).requisition.created_at).toBe('2026-11-09T06:00:00.000Z');
  });

  it('adds what the structure lacks, without touching what it has', () => {
    expect(result.added).toContain('RHL › QA, Audit & Technical › Quality');
    expect(result.added).toContain('TAL › Production › Finishing');
    expect(result.added).toContain('BGL › Engineering & Services');
    expect(result.added).toContain('CHO › MIS & Internal Audit › Internal Audit');
    const rhl = result.structure.find((u) => u.code === 'RHL')!;
    expect(rhl.departments).toHaveLength(1);
    expect(rhl.departments[0].sections.map((s) => s.name)).toEqual(['Laboratory', 'Quality']);
    expect(rhl.departments[0].code).toBe('RHL-QA');
  });

  it('reports a sheet without the needed columns', () => {
    expect(parseVacancySheet('Other', [['Name', 'Phone']], []).missingColumns).toEqual(['Unit', 'Position']);
  });
});

describe('designations and grades', () => {
  it('keeps one grade per designation, roles of one grade apart', () => {
    expect(DESIGNATIONS.filter((d) => d.grade === 'MS-2').map((d) => d.title)).toEqual(['CEO', 'COO', 'CHRO', 'CFO', 'CMO', 'CTO']);
    expect(DESIGNATIONS.filter((d) => d.grade === 'MS-1').map((d) => d.title)).toEqual(['Executive Director', 'CSO']);
    expect(new Set(DESIGNATIONS.map((d) => d.grade)).size).toBe(13);
  });

  it('finds the grade however the title is written', () => {
    expect(gradeOf('Executive')).toBe('MS-12');
    expect(gradeOf('Sr. Executive')).toBe('MS-11');
    expect(gradeOf('Jr. Executive')).toBe('MS-13');
    expect(gradeOf('Asst. Manager')).toBe('MS-10');
    expect(gradeOf('Dy. Manager')).toBe('MS-9');
    expect(gradeOf('AGM')).toBe('MS-6');
    expect(gradeOf('DGM / GM')).toBe('MS-5');
    expect(gradeOf('Executive / Sr. Executive')).toBe('MS-12');
    expect(gradeOf('Executive (Welfare)')).toBe('MS-12');
    expect(gradeOf('cfo')).toBe('MS-2');
    expect(gradeOf('Incharge')).toBe('');
  });
});

describe("the company's structure", () => {
  it('has the five units by code, each with the same departments, and Washing in RHL', () => {
    expect(DEFAULT_ORG_STRUCTURE.map((u) => u.code)).toEqual(['CHO', 'MGL', 'RHL', 'TAL', 'BGL']);
    expect(DEFAULT_ORG_STRUCTURE.every((u) => u.name === u.code)).toBe(true);
    const names = (u: OrgUnit) => u.departments.map((d) => d.name);
    const tal = DEFAULT_ORG_STRUCTURE.find((u) => u.code === 'TAL')!;
    const rhl = DEFAULT_ORG_STRUCTURE.find((u) => u.code === 'RHL')!;
    expect(names(tal)).toHaveLength(15);
    expect(names(rhl)).toEqual([...names(tal), 'Washing']);
    expect(rhl.departments.at(-1)?.code).toBe('RHL-WASH');
    expect(tal.departments.find((d) => d.name === 'HR & Admin')?.code).toBe('TAL-HRA');
    const count = (pick: (u: OrgUnit) => number) => DEFAULT_ORG_STRUCTURE.reduce((sum, u) => sum + pick(u), 0);
    expect(count((u) => u.departments.length)).toBe(76);
    expect(count((u) => u.departments.flatMap((d) => d.sections).length)).toBe(95);
    expect(count((u) => u.departments.flatMap((d) => d.sections.flatMap((s) => s.subsections)).length)).toBe(135);
    expect(sectionOptions(DEFAULT_ORG_STRUCTURE, 'CHO', 'HR & Admin')).toEqual(['Admin', 'HR']);
  });
});

describe('the unit structure', () => {
  it('compares names loosely', () => {
    expect(nameKey('QA,Audit & Technical')).toBe(nameKey('QA, Audit and Technical'));
    expect(nameKey('Production Planning & control')).toBe(nameKey('Production, Planning & Control'));
  });

  it('turns the outline into departments and back', () => {
    const outline = 'ESG [RHL-ESG]\n  Social\n  EMS\n    EMS\nCAD & Sample [RHL-CAD]\n\tSample\n- Commercial\n  1.1 Commercial\n      Export\n      Import';
    const departments = outlineToDepartments(outline);
    expect(departments).toEqual([
      { name: 'ESG', code: 'RHL-ESG', sections: [{ name: 'Social', subsections: [] }, { name: 'EMS', subsections: ['EMS'] }] },
      { name: 'CAD & Sample', code: 'RHL-CAD', sections: [{ name: 'Sample', subsections: [] }] },
      { name: 'Commercial', code: '', sections: [{ name: 'Commercial', subsections: ['Export', 'Import'] }] },
    ]);
    expect(outlineToDepartments(departmentsToOutline(departments))).toEqual(departments);
  });

  it('adds a place only when it is new', () => {
    const input = [RHL];
    const same = addToStructure(input, { unit: 'rhl', department: 'qa, audit and technical', section: 'laboratory' });
    expect(same.added).toBeNull();
    expect(same.structure).toBe(input);
    const grown = addToStructure([RHL], { unit: 'RHL', department: 'QA, Audit & Technical', section: 'Laboratory', subsection: 'Chemical' });
    expect(grown.added).toBe('RHL › QA, Audit & Technical › Laboratory › Chemical');
    expect(RHL.departments[0].sections[0].subsections).toEqual(['Lab']);
  });

  it('offers the departments of the chosen unit, or the plain list when the unit has none', () => {
    const settings = { org_structure: [RHL, { code: 'MGL', name: 'MGL', departments: [] }], departments: ['HR & Admin'] };
    expect(departmentOptions(settings, 'RHL')).toEqual(['QA, Audit & Technical']);
    expect(departmentOptions(settings, 'MGL')).toEqual(['HR & Admin']);
    expect(departmentOptions(settings, 'RHL', 'Old name')).toEqual(['QA, Audit & Technical', 'Old name']);
    expect(sectionOptions(settings.org_structure, 'RHL', 'QA, Audit & Technical')).toEqual(['Laboratory']);
  });
});
