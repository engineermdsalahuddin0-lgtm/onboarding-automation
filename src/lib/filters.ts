import type { Candidate } from '../types';

export interface CandidateFilters {
  keyword: string;
  industry: string;
  experienceMin: string;
  experienceMax: string;
  salaryMin: string;
  salaryMax: string;
}

export const NO_FILTERS: CandidateFilters = {
  keyword: '',
  industry: '',
  experienceMin: '',
  experienceMax: '',
  salaryMin: '',
  salaryMax: '',
};

/** Value of the industry filter that finds CVs with no industry on record. */
export const INDUSTRY_NOT_STATED = '__none__';

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
