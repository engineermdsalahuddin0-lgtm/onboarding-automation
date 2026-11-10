// The group's designations, as on the company's grade chart, in grade order. HR picks one; its grade is kept
// with the requisition behind the scenes and never shown. Roles that share a grade on the chart
// (e.g. CEO and CFO at MS-2) are separate designations.

export interface DesignationGrade {
  title: string;
  grade: string;
}

export const DESIGNATIONS: DesignationGrade[] = [
  { title: 'Executive Director', grade: 'MS-1' },
  { title: 'CSO', grade: 'MS-1' },
  { title: 'CEO', grade: 'MS-2' },
  { title: 'COO', grade: 'MS-2' },
  { title: 'CHRO', grade: 'MS-2' },
  { title: 'CFO', grade: 'MS-2' },
  { title: 'CMO', grade: 'MS-2' },
  { title: 'CTO', grade: 'MS-2' },
  { title: 'Sr. General Manager', grade: 'MS-3' },
  { title: 'General Manager', grade: 'MS-4' },
  { title: 'Deputy General Manager', grade: 'MS-5' },
  { title: 'Asst General Manager', grade: 'MS-6' },
  { title: 'Sr. Manager', grade: 'MS-7' },
  { title: 'Manager', grade: 'MS-8' },
  { title: 'Dy Manager', grade: 'MS-9' },
  { title: 'Assistant Manager', grade: 'MS-10' },
  { title: 'Senior Executive', grade: 'MS-11' },
  { title: 'Executive', grade: 'MS-12' },
  { title: 'Junior Executive', grade: 'MS-13' },
];

// Short forms used in the vacancy sheet and elsewhere, so "Sr. Executive" and "Senior Executive" are one title.
const WORDS: Record<string, string> = { sr: 'senior', jr: 'junior', asst: 'assistant', dy: 'deputy', dgm: 'deputy general manager', agm: 'assistant general manager', gm: 'general manager' };

function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => WORDS[word] ?? word)
    .join(' ');
}

const BY_KEY = new Map(DESIGNATIONS.map((d) => [titleKey(d.title), d]));

/**
 * The grade of a designation, however it is written. A range such as "Executive / Sr. Executive" takes the grade
 * of the first title. Blank for a title not on the chart, e.g. Incharge.
 */
export function gradeOf(title: string): string {
  const first = (title ?? '').split('/')[0].replace(/\(.*\)/, '');
  return BY_KEY.get(titleKey(first))?.grade ?? '';
}
