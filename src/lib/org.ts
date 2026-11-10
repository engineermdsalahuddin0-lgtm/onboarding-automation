import type { OrgDepartment, OrgSection, OrgUnit, Settings } from '../types';

// The group's structure: units (CHO, TAL, BGL, RHL, MGL), each with departments, sections and subsections.
// Stored as one list in settings.org_structure and edited as an indented outline under Settings.

/** Compares names the way people mean them: case, spacing, "&" and punctuation do not matter. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

export function findUnit(structure: OrgUnit[], code: string): OrgUnit | undefined {
  return structure.find((unit) => nameKey(unit.code) === nameKey(code));
}

export function findDepartment(unit: OrgUnit | undefined, name: string): OrgDepartment | undefined {
  return unit?.departments.find((d) => nameKey(d.name) === nameKey(name));
}

export function findSection(department: OrgDepartment | undefined, name: string): OrgSection | undefined {
  return department?.sections.find((s) => nameKey(s.name) === nameKey(name));
}

/**
 * Departments to offer for a unit: the unit's own, or every unit's when none is chosen. A unit with no
 * structure yet falls back to the plain department list under Settings > Company.
 */
export function departmentOptions(settings: Pick<Settings, 'org_structure' | 'departments'>, unitCode: string, current = ''): string[] {
  const units = unitCode ? settings.org_structure.filter((u) => nameKey(u.code) === nameKey(unitCode)) : settings.org_structure;
  const fromStructure = units.flatMap((u) => u.departments.map((d) => d.name));
  const list = fromStructure.length > 0 ? fromStructure : settings.departments;
  return unique([...list, current]);
}

export function sectionOptions(structure: OrgUnit[], unitCode: string, department: string, current = ''): string[] {
  const units = unitCode ? [findUnit(structure, unitCode)] : structure;
  return unique([...units.flatMap((u) => findDepartment(u, department)?.sections.map((s) => s.name) ?? []), current]);
}

export function subsectionOptions(structure: OrgUnit[], unitCode: string, department: string, section: string, current = ''): string[] {
  const units = unitCode ? [findUnit(structure, unitCode)] : structure;
  return unique([...units.flatMap((u) => findSection(findDepartment(u, department), section)?.subsections ?? []), current]);
}

function unique(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = nameKey(name);
    if (!name.trim() || seen.has(key)) continue;
    seen.add(key);
    result.push(name.trim());
  }
  return result;
}

/** "RHL › HR & Admin › HR › Talent Acquisition & Onboarding", leaving out what is blank. */
export function placeText(parts: { unit?: string; department?: string; section?: string; subsection?: string }): string {
  return [parts.unit, parts.department, parts.section, parts.subsection].filter((part) => part && part.trim()).join(' › ');
}

/**
 * Adds a department, section and subsection to a unit when they are not there yet, matching names loosely.
 * Returns the structure unchanged (the same object) when nothing was new, and says what was added.
 */
export function addToStructure(
  structure: OrgUnit[],
  place: { unit: string; department: string; section?: string; subsection?: string },
): { structure: OrgUnit[]; added: string | null } {
  const unitCode = clean(place.unit).toUpperCase();
  const department = clean(place.department);
  const section = clean(place.section ?? '');
  const subsection = clean(place.subsection ?? '');
  if (!unitCode) return { structure, added: null };

  const next: OrgUnit[] = structuredClone(structure);
  let grew = false;
  let unit = findUnit(next, unitCode);
  if (!unit) {
    unit = { code: unitCode, name: unitCode, departments: [] };
    next.push(unit);
    grew = true;
  }
  let dept = department ? findDepartment(unit, department) : undefined;
  if (department && !dept) {
    dept = { name: department, code: '', sections: [] };
    unit.departments.push(dept);
    grew = true;
  }
  let sec = dept && section ? findSection(dept, section) : undefined;
  if (dept && section && !sec) {
    sec = { name: section, subsections: [] };
    dept.sections.push(sec);
    grew = true;
  }
  if (sec && subsection && !sec.subsections.some((s) => nameKey(s) === nameKey(subsection))) {
    sec.subsections.push(subsection);
    grew = true;
  }
  if (!grew) return { structure, added: null };
  // The whole place, in the names the structure uses, so it reads as one line.
  return { structure: next, added: placeText({ unit: unit.code, department: dept?.name, section: sec?.name, subsection: sec ? subsection : '' }) };
}

// ---------------------------------------------------------------------------
// The outline: one department per line, its sections indented under it, and their subsections indented
// further. A department's code goes in square brackets after its name.
//
//   ESG [RHL-ESG]
//     Social
//     EMS
//       EMS
// ---------------------------------------------------------------------------

export function departmentsToOutline(departments: OrgDepartment[]): string {
  const lines: string[] = [];
  for (const d of departments) {
    lines.push(d.code ? `${d.name} [${d.code}]` : d.name);
    for (const s of d.sections) {
      lines.push(`  ${s.name}`);
      for (const sub of s.subsections) lines.push(`    ${sub}`);
    }
  }
  return lines.join('\n');
}

export function outlineToDepartments(text: string): OrgDepartment[] {
  const departments: OrgDepartment[] = [];
  let department: OrgDepartment | null = null;
  let section: OrgSection | null = null;
  let sectionIndent: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = (/^[ \t]*/.exec(raw)?.[0] ?? '').replace(/\t/g, '    ').length;
    // Bullets and numbering pasted from elsewhere ("- ", "1.2.1 ") are not part of the name.
    const line = clean(raw.replace(/^\s*([-*•]\s+|\d+(\.\d+)*\.?\s+)/, ''));
    if (!line) continue;
    if (indent === 0 || !department) {
      const code = /\[([^\]]*)\]\s*$/.exec(line);
      department = { name: clean(code ? line.slice(0, code.index) : line), code: clean(code?.[1] ?? ''), sections: [] };
      departments.push(department);
      section = null;
      sectionIndent = null;
    } else if (sectionIndent === null || indent <= sectionIndent || !section) {
      section = { name: line, subsections: [] };
      department.sections.push(section);
      sectionIndent = indent;
    } else {
      section.subsections.push(line);
    }
  }
  return departments;
}

// ---------------------------------------------------------------------------
// The starting structure, as the company gave it (organisation.json, November 2026): every unit has the same
// departments, sections and subsections, and RHL also has Washing. Units go by their short code only.
// Department codes are the unit's code and the department's short code, e.g. TAL-HRA.
// ---------------------------------------------------------------------------

const dept = (name: string, code: string, sections: [string, string[]?][] = []): OrgDepartment => ({
  name,
  code,
  sections: sections.map(([sectionName, subsections = []]) => ({ name: sectionName, subsections })),
});

/** Every unit's departments: [name, short code, sections with their subsections]. */
const COMMON_DEPARTMENTS: [string, string, [string, string[]?][]][] = [
  ['CAD & Sample', 'CAD', []],
  ['Commercial', 'COM', [['Commercial', ['Customs', 'Export', 'Import']]]],
  ['Employee Relations & Engagement', 'ERE', []],
  ['Engineering & Services', 'ENG', [['Civil', ['Civil']], ['Maintenance', ['Maintenance']], ['Utility & Engineering', ['Electrical', 'Utility']]]],
  ['ERP & IT', 'IT', [['ERP', ['Development']], ['General', ['General']], ['IT', ['IT', 'Support']]]],
  ['ESG', 'ESG', [['EMS', ['EMS']], ['Social']]],
  ['Finance & Accounts', 'FIN', [['Finance & Accounts', ['Accounts', 'Finance']]]],
  ['HR & Admin', 'HRA', [
    ['Admin', ['Cafeteria & House Keeping Management', 'General', 'Safety, Security & Emergency Management', 'Transportation Management']],
    ['HR', ['Compensation, Benefits & HR Analytics', 'PMS, Learning & OD', 'Talent Acquisition & Onboarding']],
  ]],
  ['IE', 'IE2', []],
  ['MIS & Internal Audit', 'MIS', [['MIS & Internal Audit', ['Internal Audit', 'MIS']]]],
  ['Production', 'PROD', [['Cutting'], ['Finishing', ['Finishing']], ['Sewing']]],
  ['Production Planning & Control', 'PPC', [['Planning', ['Planning']]]],
  ['QA, Audit & Technical', 'QA', [['Laboratory', ['Lab']]]],
  ['Store & Warehouse', 'STW', [['Store', ['Store']]]],
  ['Technical', 'TECH', []],
];

/** Departments only some units have. */
const EXTRA_DEPARTMENTS: Record<string, [string, string, [string, string[]?][]][]> = {
  RHL: [['Washing', 'WASH', []]],
};

const unitOf = (code: string): OrgUnit => ({
  code,
  name: code,
  departments: [...COMMON_DEPARTMENTS, ...(EXTRA_DEPARTMENTS[code] ?? [])].map(([name, short, sections]) => dept(name, `${code}-${short}`, sections)),
});

export const DEFAULT_ORG_STRUCTURE: OrgUnit[] = ['CHO', 'MGL', 'RHL', 'TAL', 'BGL'].map(unitOf);
