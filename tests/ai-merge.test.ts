import { describe, expect, it, vi } from 'vitest';

// The merge logic is pure; the rest of that module only needs a browser when a file is read.
vi.mock('../src/lib/backend', () => ({ backend: { mode: 'demo', accessToken: async () => null } }));
vi.mock('../src/lib/cv/extract', () => ({}));
vi.mock('../src/lib/cv/photo', () => ({}));

const { mergeAiResult } = await import('../src/lib/cv/index');
const { parseCvText } = await import('../src/lib/cv/heuristics');

const TEXT = 'Sara Ali\nMobile: 01711234567\nEmail: sara@example.com\nEducation\nBBA, Dhaka College, 2018\n';

describe('mergeAiResult', () => {
  const rules = parseCvText(TEXT);

  it('takes AI values but keeps everything the rule reader found', () => {
    const merged = mergeAiResult(rules, { full_name: 'Sara Ali Khan', father_name: 'Ali Khan', skills: ['Excel'] }, TEXT);
    expect(merged.full_name).toBe('Sara Ali Khan');
    expect(merged.father_name).toBe('Ali Khan');
    expect(merged.skills).toEqual(['Excel']);
    expect(merged.phone).toBe('01711234567');
    expect(merged.education).toEqual(rules.education);
    expect(merged.raw_text).toBe(TEXT);
  });

  it('refuses contact details that are not in the CV, and says so', () => {
    const merged = mergeAiResult(rules, { phone: '01999999999', email: 'made-up@example.com' }, TEXT);
    expect(merged.phone).toBe('01711234567');
    expect(merged.email).toBe('sara@example.com');
    expect(merged.warnings.join(' ')).toContain('not in the CV text');
  });

  it('accepts a number written differently from the CV', () => {
    expect(mergeAiResult(rules, { phone: '+8801711234567' }, TEXT).phone).toBe('+8801711234567');
  });

  it('trusts AI contact details on scans, where there is no text to compare with', () => {
    const merged = mergeAiResult(parseCvText('', 'scan.pdf'), { full_name: 'Sara Ali', phone: '01711234567', full_text: 'Sara Ali 01711234567' }, '');
    expect(merged.phone).toBe('01711234567');
    expect(merged.raw_text).toBe('Sara Ali 01711234567');
    expect(merged.warnings).not.toContain('Name not found.');
    expect(merged.warnings).not.toContain('Mobile number not found.');
  });

  it('keeps information that fits no field, and ignores bad dates and shapes', () => {
    const merged = mergeAiResult(rules, {
      other_information: [{ heading: 'Awards', content: 'Best employee 2020' }],
      date_of_birth: 'around 1996',
      education: 'not a list',
      total_experience_years: 'many',
    }, TEXT);
    expect(merged.sections['AI: Awards']).toBe('Best employee 2020');
    expect(merged.date_of_birth).toBeNull();
    expect(merged.education).toEqual(rules.education);
    expect(merged.total_experience_years).toBeNull();
  });
});
