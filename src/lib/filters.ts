import type { Candidate } from '../types';

export interface CandidateFilters {
  keyword: string;
  industry: string;
  experienceMin: string;
  experienceMax: string;
  salaryMin: string;
  salaryMax: string;
  /** 'male', 'female', NOT_STATED, or '' for everyone. */
  gender: string;
  /** Places, separated by commas: a candidate living in any one of them matches. */
  presentAddress: string;
  permanentAddress: string;
}

export const NO_FILTERS: CandidateFilters = {
  keyword: '',
  industry: '',
  experienceMin: '',
  experienceMax: '',
  salaryMin: '',
  salaryMax: '',
  gender: '',
  presentAddress: '',
  permanentAddress: '',
};

/** Value of a choice filter that finds CVs with nothing on record for it. */
export const NOT_STATED = '__none__';
/** Value of the industry filter that finds CVs with no industry on record. */
export const INDUSTRY_NOT_STATED = NOT_STATED;

/**
 * Gender as written on a CV or the form ("Male", "female", "F", "মহিলা") read as one of two values.
 * Empty when the CV does not say, or says something else.
 */
export function genderOf(text: string): 'male' | 'female' | '' {
  const value = (text ?? '').trim().toLowerCase();
  if (/^(f\b|female|woman|women|girl)/.test(value) || /মহিলা|নারী/.test(value)) return 'female';
  if (/^(m\b|male|man\b|men\b|boy)/.test(value) || /পুরুষ/.test(value)) return 'male';
  return '';
}

const placeTerms = (text: string) => text.toLowerCase().split(',').map((term) => term.trim()).filter(Boolean);

/** "Dhaka, Gazipur" matches an address in either place. */
export function matchesPlace(address: string, query: string): boolean {
  const terms = placeTerms(query);
  if (terms.length === 0) return true;
  const text = (address ?? '').toLowerCase();
  return terms.some((term) => text.includes(term));
}

/**
 * The area an address ends with, usually the district: "House 5, Uttara Sector 4, Dhaka-1230" is "Dhaka",
 * "Vill: Rampur, Dist: Gazipur, Bangladesh" is "Gazipur". Empty when there is nothing usable.
 */
export function addressArea(address: string): string {
  const parts = (address ?? '')
    .split(/[,\n]/)
    .map((part) => part
      .replace(/^\s*(dist(rict)?|zila|zilla|city|division)\s*[:.-]?\s*/i, '')
      .replace(/[\d-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((part) => part.length >= 3 && !/^bangladesh$/i.test(part));
  const last = parts.at(-1) ?? '';
  return last.length > 30 ? '' : last.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** The areas found across the addresses, the most common first, for the address filter's suggestions. */
export function commonAreas(addresses: string[], limit = 60): string[] {
  const counts = new Map<string, number>();
  for (const address of addresses) {
    const area = addressArea(address);
    if (area) counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([area]) => area);
}

const SALARY_NUMBER = /(\d[\d,]*(?:\.\d+)?)\s*(k\b|lac\b|lacs\b|lakh\b|lakhs\b)?/gi;

/** Reads a monthly salary out of free text: "Tk. 40,000", "30k - 40k", "1.5 lakh". Null if there is no real figure. */
export function parseSalary(text: string): { min: number; max: number } | null {
  const values: number[] = [];
  for (const match of (text ?? '').matchAll(SALARY_NUMBER)) {
    const unit = (match[2] ?? '').toLowerCase();
    const amount = Number(match[1].replace(/,/g, '')) * (unit === 'k' ? 1_000 : unit.startsWith('la') ? 100_000 : 1);
    // Anything smaller is a stray number such as "2 months", not a salary.
    if (amount >= 1_000) values.push(amount);
  }
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Expected salary, or the present one when the CV gives only that. */
export function candidateSalary(c: Pick<Candidate, 'expected_salary' | 'present_salary'>) {
  return parseSalary(c.expected_salary) ?? parseSalary(c.present_salary);
}

/** The span a range slider has to cover: from the lowest to the highest figure on record, on whole steps. */
export function sliderBounds(values: number[], step: number, fallback: { min: number; max: number }): { min: number; max: number } {
  if (values.length === 0) return fallback;
  const min = Math.floor(Math.min(...values) / step) * step;
  const max = Math.ceil(Math.max(...values) / step) * step;
  return { min, max: max > min ? max : min + step };
}

const number = (text: string) => (text.trim() === '' ? null : Number(text));

export function usesExperienceFilter(f: CandidateFilters) {
  return number(f.experienceMin) !== null || number(f.experienceMax) !== null;
}

export function usesSalaryFilter(f: CandidateFilters) {
  return number(f.salaryMin) !== null || number(f.salaryMax) !== null;
}

export function hasFilters(f: CandidateFilters) {
  return Object.values(f).some((value) => value.trim() !== '');
}

function searchableText(c: Candidate, fullText: string | undefined): string {
  return [
    c.full_name, c.phone, c.email, c.address, c.current_designation, c.current_company, c.industry, c.career_summary,
    ...c.skills,
    ...c.languages,
    ...c.education.flatMap((e) => [e.degree, e.institution]),
    ...c.experience.flatMap((e) => [e.company, e.role, e.details ?? '']),
    ...c.training.flatMap((t) => [t.title, t.institute ?? '']),
    fullText ?? '',
  ].join(' ').toLowerCase();
}

/** Commas separate keywords and a candidate must match all of them, so each one narrows the list further. */
export function matchesFilters(c: Candidate, f: CandidateFilters, fullText?: string): boolean {
  const years = c.total_experience_years;
  const minYears = number(f.experienceMin);
  const maxYears = number(f.experienceMax);
  if (minYears !== null && (years === null || years < minYears)) return false;
  if (maxYears !== null && (years === null || years > maxYears)) return false;

  if (f.industry === INDUSTRY_NOT_STATED ? c.industry !== '' : f.industry !== '' && c.industry !== f.industry) return false;

  if (f.gender !== '' && genderOf(c.gender) !== (f.gender === NOT_STATED ? '' : f.gender)) return false;
  if (!matchesPlace(c.address, f.presentAddress)) return false;
  if (!matchesPlace(c.permanent_address, f.permanentAddress)) return false;

  if (usesSalaryFilter(f)) {
    const salary = candidateSalary(c);
    if (!salary) return false;
    // A range on the CV counts when any part of it falls inside the range asked for.
    const minSalary = number(f.salaryMin);
    const maxSalary = number(f.salaryMax);
    if (minSalary !== null && salary.max < minSalary) return false;
    if (maxSalary !== null && salary.min > maxSalary) return false;
  }

  const keywords = f.keyword.toLowerCase().split(',').map((word) => word.trim()).filter(Boolean);
  if (keywords.length > 0) {
    const text = searchableText(c, fullText);
    if (!keywords.every((word) => text.includes(word))) return false;
  }
  return true;
}
