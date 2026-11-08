import { describe, expect, it } from 'vitest';
import { canonicalIndustry, parseCvText } from '../src/lib/cv/heuristics';
import { candidateSalary, INDUSTRY_NOT_STATED, matchesFilters, NO_FILTERS, parseSalary, type CandidateFilters } from '../src/lib/filters';
import type { Candidate } from '../src/types';

const person = (overrides: Partial<Candidate> = {}) =>
  ({
    full_name: 'Sara Ali',
    phone: '01711234567',
    email: 'sara@example.com',
    address: '',
    current_designation: 'HR Executive',
    current_company: 'Sample Apparels Ltd.',
    industry: 'Garments & Textile',
    career_summary: '',
    total_experience_years: 5,
    expected_salary: 'Tk. 40,000',
    present_salary: '',
    skills: ['Payroll', 'HRIS'],
    languages: [],
    education: [{ degree: 'BBA', institution: 'Dhaka College' }],
    experience: [],
    training: [],
    ...overrides,
  }) as Candidate;

const matches = (c: Candidate, filters: Partial<CandidateFilters>, fullText?: string) => matchesFilters(c, { ...NO_FILTERS, ...filters }, fullText);

describe('parseSalary', () => {
  it.each([
    ['Tk. 40000', 40000, 40000],
    ['40,000 BDT', 40000, 40000],
    ['30,000 - 45,000', 30000, 45000],
    ['30k - 40k', 30000, 40000],
    ['1.5 lakh', 150000, 150000],
    ['BDT 1 lac', 100000, 100000],
  ])('%s', (text, min, max) => {
    expect(parseSalary(text)).toEqual({ min, max });
  });

  it('finds nothing where there is no real figure', () => {
    expect(parseSalary('Negotiable')).toBeNull();
    expect(parseSalary('')).toBeNull();
    expect(parseSalary('2 months notice')).toBeNull();
  });

  it('falls back to the present salary only when no expected salary is given', () => {
    expect(candidateSalary(person({ expected_salary: 'Negotiable', present_salary: '30000' }))).toEqual({ min: 30000, max: 30000 });
    expect(candidateSalary(person({ expected_salary: '50000', present_salary: '30000' }))).toEqual({ min: 50000, max: 50000 });
  });
});

describe('matchesFilters', () => {
  it('lets everyone through with no filters', () => {
    expect(matches(person(), {})).toBe(true);
    expect(matches(person({ total_experience_years: null, expected_salary: '', industry: '' }), {})).toBe(true);
  });

  it('filters by experience, including both ends', () => {
    expect(matches(person(), { experienceMin: '5' })).toBe(true);
    expect(matches(person(), { experienceMin: '6' })).toBe(false);
    expect(matches(person(), { experienceMax: '5' })).toBe(true);
    expect(matches(person(), { experienceMax: '4' })).toBe(false);
    expect(matches(person(), { experienceMin: '2', experienceMax: '6' })).toBe(true);
  });

  it('counts 0 as a real limit, not as an empty box', () => {
    expect(matches(person({ total_experience_years: 2 }), { experienceMax: '0' })).toBe(false);
    expect(matches(person({ total_experience_years: 0 }), { experienceMax: '0' })).toBe(true);
  });

  it('leaves out a CV with no figure when a range is asked for', () => {
    expect(matches(person({ total_experience_years: null }), { experienceMin: '1' })).toBe(false);
    expect(matches(person({ expected_salary: 'Negotiable' }), { salaryMax: '100000' })).toBe(false);
  });

  it('filters by industry, and can find those with none', () => {
    expect(matches(person(), { industry: 'Garments & Textile' })).toBe(true);
    expect(matches(person(), { industry: 'Banking & Finance' })).toBe(false);
    expect(matches(person(), { industry: INDUSTRY_NOT_STATED })).toBe(false);
    expect(matches(person({ industry: '' }), { industry: INDUSTRY_NOT_STATED })).toBe(true);
  });

  it('matches a salary range that overlaps the range asked for', () => {
    expect(matches(person(), { salaryMin: '30000', salaryMax: '50000' })).toBe(true);
    expect(matches(person(), { salaryMin: '45000' })).toBe(false);
    expect(matches(person(), { salaryMax: '35000' })).toBe(false);
    const range = person({ expected_salary: '30,000 - 45,000' });
    expect(matches(range, { salaryMin: '40000', salaryMax: '60000' })).toBe(true);
    expect(matches(range, { salaryMin: '46000' })).toBe(false);
  });

  it('searches every field, and requires every comma-separated keyword', () => {
    expect(matches(person(), { keyword: 'payroll' })).toBe(true);
    expect(matches(person(), { keyword: 'DHAKA COLLEGE' })).toBe(true);
    expect(matches(person(), { keyword: 'payroll, hris' })).toBe(true);
    expect(matches(person(), { keyword: 'payroll, excel' })).toBe(false);
    expect(matches(person(), { keyword: ' , ' })).toBe(true);
  });

  it('searches the full CV text once it has loaded', () => {
    expect(matches(person(), { keyword: 'best employee' })).toBe(false);
    expect(matches(person(), { keyword: 'best employee' }, 'Awards: Best Employee 2020')).toBe(true);
  });
});

describe('industry from a CV', () => {
  it('groups different wordings under one name', () => {
    expect(canonicalIndustry('RMG')).toBe('Garments & Textile');
    expect(canonicalIndustry('Sample Apparels Ltd.')).toBe('Garments & Textile');
    expect(canonicalIndustry('Dutch Bangla Bank')).toBe('Banking & Finance');
    expect(canonicalIndustry('Sara & Sons')).toBeNull();
  });

  it('reads a stated industry, keeping wording it does not recognise', () => {
    expect(parseCvText('Sara Ali\nCompany Business : Garments\n').industry).toBe('Garments & Textile');
    expect(parseCvText('Sara Ali\nIndustry: Aviation\n').industry).toBe('Aviation');
  });

  it('otherwise uses only the current employer, and leaves it empty when unclear', () => {
    expect(parseCvText('Sara Ali\nWork Experience\nManager, Sample Apparels Ltd.  Jan 2018 - Present\n').industry).toBe('Garments & Textile');
    expect(parseCvText('Sara Ali\nWork Experience\nManager, Rahman & Sons Ltd.  Jan 2018 - Present\n').industry).toBe('');
    expect(parseCvText('Sara Ali\nSkills:\nExcel\n').industry).toBe('');
  });
});
