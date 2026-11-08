import type {
  CandidateProfileFields,
  EducationItem,
  ExperienceItem,
  ReferenceItem,
  TrainingItem,
} from '../../types';
import { isoDate } from '../format';

// Rule-based CV reader (no AI). It is deliberately conservative: a field it cannot find stays empty
// and raises a warning. It never fills in a plausible-looking value. The complete text and every
// section it found are kept alongside, so nothing in the CV is lost even when a field is missed.

export interface ParsedCv extends CandidateProfileFields {
  sections: Record<string, string>;
  raw_text: string;
  warnings: string[];
}

export function emptyParsedCv(rawText = ''): ParsedCv {
  return {
    full_name: '',
    email: '',
    phone: '',
    alt_phone: '',
    address: '',
    permanent_address: '',
    date_of_birth: null,
    father_name: '',
    mother_name: '',
    spouse_name: '',
    gender: '',
    marital_status: '',
    religion: '',
    nationality: '',
    blood_group: '',
    national_id: '',
    passport_no: '',
    tin_no: '',
    linkedin: '',
    current_designation: '',
    current_company: '',
    industry: '',
    total_experience_years: null,
    present_salary: '',
    expected_salary: '',
    notice_period: '',
    career_summary: '',
    education: [],
    experience: [],
    training: [],
    skills: [],
    languages: [],
    references_list: [],
    sections: {},
    raw_text: rawText,
    warnings: [],
  };
}

type SectionKind =
  | 'summary'
  | 'experience'
  | 'education'
  | 'training'
  | 'skills'
  | 'languages'
  | 'references'
  | 'personal'
  | 'contact'
  | 'other';

const SECTION_PATTERNS: [RegExp, SectionKind][] = [
  [/^(career\s+)?(objective|summary)|^(professional|executive)\s+(summary|profile)|^(about\s+me|profile|personal\s+statement)$|^(key\s+)?career\s+highlights?$|^career\s+profile$|^profile\s+summary$/i, 'summary'],
  [/^(employment|work|working|job|professional|career)\s+(history|experience|record)|^experiences?$|^work\s*history$/i, 'experience'],
  [/^(academic|educational)(\s+(qualifications?|background|details|records?|summary|information))?$|^education(al)?(\s+.*)?$|^qualifications?$/i, 'education'],
  // "TRAINING&CERTIFICATIONS", "PROFESSIONAL TRAINING & MILITARY COURSES", "CERTIFICATIONS, AWARDS & RECOGNITION".
  [/^((professional|military|relevant)\s+)?(trainings?|certifications?|courses?|workshops?)\b[\s&,a-z]*$/i, 'training'],
  [/^(language(s)?(\s+(proficiency|skills?))?)$/i, 'languages'],
  [/^(special\s+qualifications?|(key|core|technical|computer|it|professional|relevant|soft)\s+skills?|skills?(\s+.*)?|competenc(y|ies)|core\s+competenc(y|ies)|areas?\s+of\s+expertise|expertise)$|^[a-z\s&,/]*\bskills?$|^[a-z\s&]*\bexpertise$/i, 'skills'],
  [/^references?(\s*\(s\))?$|^referees?$/i, 'references'],
  [/^(personal\s+(details?|information|data|profile)|bio\s*-?\s*data)$/i, 'personal'],
  [/^(contact(\s+(details?|information|address))?|address)$/i, 'contact'],
  [/^(projects?|achievements?|awards?|publications?|interests?|hobbies|extra\s*-?\s*curricular(\s+activities)?|activities|declaration|career\s+and\s+application\s+information|volunteer(ing)?(\s+experience)?|membership(s)?|strengths?|additional\s+information|other\s+information|portfolio)(\s+.*)?$/i, 'other'],
];

function classifyHeading(line: string): SectionKind | null {
  const clean = line.replace(/[:：.\s]+$/, '').replace(/^[\s\-–•*#]+/, '').trim();
  if (clean.length < 3 || clean.length > 50) return null;
  // A label with a value on the same line ("Address: Mirpur") is a field, not a heading.
  if (/:\s*\S/.test(line)) return null;
  // OCR reads a heading's icon as a few stray marks ("(o] LANGUAGES", "oO CERTIFICATIONS").
  const iconless = clean.replace(/^(\S{1,3}\s+){1,2}(?=[A-Z]{3,})/, '');
  const readings = iconless !== clean && iconless === iconless.toUpperCase() ? [clean, iconless] : [clean];
  for (const text of readings) {
    // A heading starts with a capital. "workshops." alone on a line is the end of a wrapped sentence.
    if (/^\p{Ll}/u.test(text)) continue;
    for (const [pattern, kind] of SECTION_PATTERNS) {
      if (pattern.test(text)) return kind;
    }
  }
  return null;
}

/** Headings outside the known list: short standalone lines in capitals or ending in a colon. */
function looksLikeUnknownHeading(line: string): boolean {
  const clean = line.trim();
  // A company in capitals ("SAMPLE APPARELS LTD.") is not a heading, so lines with a full stop or dash are left alone.
  if (clean.length < 4 || clean.length > 55 || /\d/.test(clean) || /[@,—–.|]/.test(clean)) return false;
  // These labels sit inside a job or course entry and must not end the section around them.
  if (/^(duties|responsibilit|department|company|location|designation|position|role|tasks?)\b|\bresponsibilit/i.test(clean)) return false;
  if (/^[^:]+:$/.test(clean)) return true;
  return clean === clean.toUpperCase() && /[A-Z]{2}/.test(clean) && clean.split(/\s+/).length <= 7;
}

interface Section {
  heading: string;
  kind: SectionKind;
  lines: string[];
}

function splitSections(lines: string[]): { preamble: string[]; sections: Section[] } {
  const preamble: string[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const kind = classifyHeading(line);
    if (kind) {
      current = { heading: line.replace(/[:：\s]+$/, '').trim(), kind, lines: [] };
      sections.push(current);
    } else if (current && looksLikeUnknownHeading(line)) {
      current = { heading: line.replace(/[:：\s]+$/, '').trim(), kind: 'other', lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  return { preamble, sections };
}

const LABELS: [RegExp, keyof CandidateProfileFields][] = [
  [/^(full\s+name|applicant'?s?\s+name|candidate'?s?\s+name|name(\s+of\s+(the\s+)?(applicant|candidate))?)$/i, 'full_name'],
  [/^father'?s?(\s+name)?$/i, 'father_name'],
  [/^mother'?s?(\s+name)?$/i, 'mother_name'],
  [/^(spouse|husband|wife)'?s?(\s+name)?$/i, 'spouse_name'],
  [/^(gender|sex)$/i, 'gender'],
  [/^marital\s+status$/i, 'marital_status'],
  [/^religion$/i, 'religion'],
  [/^nationality$/i, 'nationality'],
  [/^blood(\s+group)?$/i, 'blood_group'],
  [/^(national\s+id(entity)?(\s+(card|no\.?|number))*|nid(\s+(no\.?|number))?)$/i, 'national_id'],
  [/^passport(\s+(no\.?|number))?$/i, 'passport_no'],
  [/^(e?\s*-?\s*tin|tin)(\s+(no\.?|number|certificate))?$/i, 'tin_no'],
  [/^(present|current|mailing|contact)\s+address$|^current\s+location$|^address$/i, 'address'],
  [/^permanent\s+address$/i, 'permanent_address'],
  [/^(present|current)\s+salary$/i, 'present_salary'],
  [/^(expected|desired)\s+salary$/i, 'expected_salary'],
  [/^notice\s+period$/i, 'notice_period'],
  [/^linkedin(\s+(profile|url))?$/i, 'linkedin'],
  [/^(industry|industry\s+type|company\s+business|business\s+type)$/i, 'industry'],
];

const INDUSTRIES: [RegExp, string][] = [
  [/garment|apparel|textile|knit|denim|sweater|spinning|dyeing|composite|buying\s*house|fashion|\brmg\b/i, 'Garments & Textile'],
  [/\bbank|financ|insurance|leasing|\bnbfi\b/i, 'Banking & Finance'],
  [/pharma|hospital|clinic|health\s*care|diagnostic/i, 'Pharma & Healthcare'],
  [/software|technolog|telecom|digital|e-?commerce/i, 'IT & Telecom'],
  [/university|college|school|academy|education/i, 'Education'],
  [/\bngo\b|foundation|non-?profit/i, 'NGO'],
  [/real\s*estate|construction|engineering|cement|steel/i, 'Construction & Engineering'],
  [/\bfood|beverage|\bfmcg\b|consumer\s+goods/i, 'FMCG & Food'],
  [/logistics|freight|shipping|supply\s+chain/i, 'Logistics'],
];

/** Groups different wordings under one name, so the industry filter does not split "RMG" from "Garments". */
export function canonicalIndustry(text: string): string | null {
  return INDUSTRIES.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

const DOB_LABEL = /^(date\s+of\s+birth|d\.?o\.?b\.?|birth\s*date)$/i;

function labelKey(label: string): keyof CandidateProfileFields | 'date_of_birth' | null {
  const clean = label.replace(/[:：.\s]+$/, '').trim();
  if (DOB_LABEL.test(clean)) return 'date_of_birth';
  for (const [pattern, key] of LABELS) {
    if (pattern.test(clean)) return key;
  }
  return null;
}

/** Splits a line into cells on wide gaps, keeping "Label : value" together. */
function cells(line: string): string[] {
  return line
    .replace(/\s*[:：]\s+/g, ': ')
    .replace(/\s+[:：]\s*/g, ': ')
    .split(/\s{3,}|\t|\s\|\s/)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function validIso(year: number, month: number, day: number): string | null {
  if (year < 100) year += year < 40 ? 2000 : 1900;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return isoDate(d);
}

/** Understands the date styles seen on Bangladeshi CVs. Returns null rather than guess. */
export function normalizeDate(input: string): string | null {
  const text = input.replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (m) return validIso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(text);
  if (m) return validIso(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[-\s/.]([A-Za-z]{3,9})\.?[-\s/.](\d{2,4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return month ? validIso(+m[3], month, +m[1]) : null;
  }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s+(\d{2,4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return month ? validIso(+m[3], month, +m[2]) : null;
  }
  return null;
}

const ADDRESS_WORD = /\b(house|road|flat|block|sector|lane|avenue|village|vill|thana|upazila|post\s*office|dhaka|chattogram|chittagong|sylhet|khulna|rajshahi|barishal|rangpur|mymensingh|comilla|cumilla|gazipur|narayanganj|mirpur|uttara|dhanmondi|gulshan|banani|mohammadpur|savar|tongi)\b/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BD_PHONE = /(?:\+?\s?880?[\s-]?)?\(?0?1[3-9]\d?\)?(?:[\s-]?\d){7,9}/g;

function findPhones(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(BD_PHONE)) {
    const digits = match[0].replace(/\D/g, '');
    const local = digits.startsWith('880') ? digits.slice(2) : digits;
    if (!/^01[3-9]\d{8}$/.test(local) || seen.has(local)) continue;
    seen.add(local);
    found.push(local);
  }
  return found;
}

function looksLikeName(line: string): boolean {
  const clean = line.trim();
  if (clean.length < 3 || clean.length > 45) return false;
  if (/[\d@:/\\|]/.test(clean)) return false;
  if (/^(curriculum\s+vitae|resume|résumé|cv|bio\s*-?\s*data|page\b)/i.test(clean)) return false;
  if (classifyHeading(clean)) return false;
  const words = clean.split(/\s+/);
  if (words.length > 6) return false;
  return words.every((word) => /^[\p{L}.'-]+$/u.test(word));
}

function nameFromFile(fileName: string): string {
  const stem = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\b(cv|resume|résumé|curriculum|vitae|updated|final|new|copy|\d+)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return looksLikeName(stem) ? stem : '';
}

const DEGREE =
  /\b(s\.?s\.?c\.?|h\.?s\.?c\.?|dakhil|alim|fazil|kamil|o[\s-]?levels?|a[\s-]?levels?|b\.?\s?b\.?\s?a\.?|m\.?\s?b\.?\s?a\.?|b\.?\s?sc\.?|m\.?\s?sc\.?|b\.?\s?a\.?(?=\s|$|\()|m\.?\s?a\.?(?=\s|$|\()|b\.?\s?com\.?|m\.?\s?com\.?|b\.?\s?s\.?\s?s\.?|m\.?\s?s\.?\s?s\.?|ll\.?\s?b\.?|ll\.?\s?m\.?|ph\.?\s?d\.?|bachelor|master'?s?|masters|diploma|honou?rs|graduate|post\s*graduate|secondary|higher\s+secondary)\b/i;
const INSTITUTE = /(university|college|school|institute|institution|academy|polytechnic|madrasa|madrasah|\bbuet\b|\bnsu\b|\bbrac\b|\baiub\b|\bdiu\b)/i;
const RESULT = /(c\.?g\.?p\.?a\.?|g\.?p\.?a\.?)\s*[:\-]?\s*\d(?:\.\d{1,2})?(?:\s*(?:out\s+of|\/)\s*\d(?:\.\d{1,2})?)?|\b\d\.\d{1,2}\s*(?:out\s+of|\/)\s*\d(?:\.\d{1,2})?|\b(first|second|third|1st|2nd|3rd)\s+(class|division)\b/i;
const YEAR = /\b(19[6-9]\d|20[0-4]\d)\b/g;
const TABLE_HEADER = /exam\s*\/?\s*degree|concentration|pas+\.?\s*year|^(degree|institut\w*|result|board|year)\s*$/i;

// Subjects often sit right before the institute ("BBA Management National University"), so they
// must not be taken as part of its name.
const SUBJECT_WORD = /^(management|accounting|finance|marketing|commerce|science|arts|humanities|business|administration|economics|english|bangla|textile|engineering|technology|computer|hrm|resource|resources|statistics|mathematics|physics|chemistry|law|general|major|group|studies)$/i;

// "Secondary School Certificate" is a degree, not a school: its "School" must not start an institute name.
const isCertificateWord = (words: string[], index: number) => /^school$/i.test(words[index]) && /^certificate/i.test(words[index + 1] ?? '');
const hasInstitute = (text: string) => {
  const words = text.split(/\s+/);
  return words.some((word, index) => INSTITUTE.test(word) && !isCertificateWord(words, index));
};

/** Finds the institute's name inside a line where it is not separated from the degree. */
function splitInstitute(text: string): { before: string; institute: string } | null {
  const words = text.split(/\s+/);
  const at = words.findIndex((word, index) => INSTITUTE.test(word) && !isCertificateWord(words, index));
  if (at === -1) return null;

  // Capitalised words before it are part of the name ("Bangladesh University of ...", "G.K. Pilot High School"),
  // up to a comma, a subject or a degree.
  let start = at;
  while (start > 0 && at - start < 4) {
    const previous = words[start - 1].replace(/[,;:]$/, '');
    if (previous !== words[start - 1] || !/^\p{Lu}/u.test(previous) || SUBJECT_WORD.test(previous) || DEGREE.test(previous)) break;
    start -= 1;
  }
  // After it: more capitalised words, joined by "of", "and" or "&" ("Institute of Science and Technology"),
  // and a short form in brackets ("(MIST)").
  let end = at;
  while (end + 1 < words.length && !/[,;]$/.test(words[end]) && end - at < 7) {
    const next = words[end + 1];
    if (/^\p{Lu}/u.test(next) && !/^[—–-]$/.test(next)) end += 1;
    else if (/^(of|and|&|for)$/i.test(next) && /^\p{Lu}/u.test(words[end + 2] ?? '')) end += 2;
    else if (/^\(\p{Lu}{2,}\)[,;]?$/u.test(next)) end += 1;
    else break;
  }

  return {
    before: words.slice(0, start).join(' '),
    institute: words.slice(start, end + 1).join(' ').replace(/[,;]$/, ''),
  };
}

const trimPunctuation = (text: string) =>
  text.replace(/\s{2,}/g, ' ').replace(/^[,;|()\-–—:\s]+|[,;|(\-–—:\s]+$/g, '').replace(/\(\s*\)/g, '').trim();

/** A list marker at the start of a line: a bullet, or a number like "1." Not a year like "2016,". */
const LIST_MARKER = /^[\s•*\-–—▪●➢►■◦·»+«]*(?:\d{1,2}[.)]\s+)?/;
const STUDY_STATUS = /\(?\b(pursuing|studying|running|ongoing|continuing|appeared|in\s+progress|passed)\b\)?\s*:?/i;

function parseEducation(lines: string[]): EducationItem[] {
  const items: EducationItem[] = [];
  let current: EducationItem | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(LIST_MARKER, '').trim();
    if (!line || TABLE_HEADER.test(line)) continue;

    const startsEntry = DEGREE.test(line);
    if (startsEntry) {
      current = { degree: '', institution: '' };
      items.push(current);
    }
    if (!current) continue;

    let rest = line;
    const result = RESULT.exec(rest);
    if (result) {
      current.result ||= result[0].trim();
      rest = rest.replace(result[0], ' ');
    }
    const status = STUDY_STATUS.exec(rest);
    if (status) {
      // "Pursuing" or "Studying" is the result of a degree not finished yet; "Passed" says nothing new.
      if (!/passed|appeared/i.test(status[1])) current.result ||= status[1][0].toUpperCase() + status[1].slice(1).toLowerCase();
      rest = rest.replace(status[0], ' ');
    }
    const years = rest.match(YEAR);
    if (years) {
      current.year ||= years[years.length - 1];
      for (const year of years) rest = rest.replace(year, ' ');
    }
    // Leftovers of a removed result ("(out of 5.00)", "Passing Year:") are not part of any name.
    rest = rest.replace(/\(\s*out\s+of\s+[\d.]+\s*\)/gi, ' ').replace(/\b(passing\s+year|year\s+of\s+passing|result)\s*:?/gi, ' ');

    for (const rawPiece of cells(rest)) {
      const piece = trimPunctuation(rawPiece);
      if (!piece) continue;
      if (/\bboard\b/i.test(piece) && !current.board) {
        current.board = piece;
      } else if (hasInstitute(piece) && !current.institution) {
        const split = splitInstitute(piece);
        current.institution = split?.institute ?? piece;
        if (split?.before && !current.degree) current.degree = trimPunctuation(split.before);
      } else if (!current.degree) {
        current.degree = trimPunctuation(piece);
      } else if (startsEntry && !hasInstitute(piece) && !current.institution) {
        // A second column before the institute is the subject: keep it with the degree.
        current.degree = trimPunctuation(`${current.degree} ${piece}`);
      }
    }
  }
  return items;
}

const MONTH_WORD = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE_POINT = `(?:(?:\\d{1,2}\\s+)?${MONTH_WORD}\\s*,?\\s*(?:\\d{1,2}\\s*,\\s*)?\\d{2,4}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{1,2}[/-]\\d{4}|(?:19|20)\\d{2})`;
const OPEN_END = '(?:present|current|continuing|till\\s+(?:date|now)|to\\s*date|now|running|ongoing)';
const DATE_RANGE = new RegExp(`(${DATE_POINT})\\s*(?:-|–|—|to|till|until)\\s*(${DATE_POINT}|${OPEN_END})`, 'i');
const COMPANY_WORD = /\b(ltd|limited|group|inc|corp|plc|llc|company|co\.|garments?|industries|industry|bank|textiles?|apparels?|fashions?|composite|knit\w*|denim|sweater|mills?|pharma\w*|university|foundation|organization|enterprise|solutions|technologies|associates|army|navy|air\s+force|coast\s+guard|police|ministry|directorate|cooperation|programme|office|hospitals?|clinic|agency|authority|council|commission|corporation|bureau|ngo)\b/i;
const ROLE_WORD = /\b(manager|executive|officer|engineer|assistant|head|director|lead|specialist|merchandiser|supervisor|analyst|developer|designer|inspector|coordinator|consultant|accountant|auditor|intern|trainee|programmer|administrator|in-?charge|associate|advisor|technician|operator|teacher|lecturer|instructor|trainer|receptionist|commander|president|chairman|clerk|controller)\b/i;

/** An employer's name: has a company word, and is not a job title that happens to contain one ("Company Commander"). */
const isCompany = (text: string) => COMPANY_WORD.test(text) && (!ROLE_WORD.test(text) || /\b(ltd|limited|plc|inc|llc)\b/i.test(text));
const isAddressLike = (text: string) => /\d/.test(text) && ADDRESS_WORD.test(text);
/** "BANGLADESH ARMY" reads better as "Bangladesh Army"; short forms like "GIZ" stay as they are. */
const calmCapitals = (text: string) =>
  text === text.toUpperCase() && /\p{Lu}{3}/u.test(text) && text.trim().includes(' ')
    ? text.toLowerCase().replace(/(^|[\s(.'-])(\p{L})/gu, (m) => m.toUpperCase())
    : text;

/** Splits a job heading into its parts: "Company — Role", "Role | Company", "Lieutenant (Retd), Bangladesh Navy". */
function headingParts(text: string): string[] {
  return text
    .split(/\s{3,}|\s\|\s|\s[–—-]\s/)
    .flatMap((part) => {
      const trailing = /^(.+),\s*([^,]+)$/.exec(part);
      return trailing && isCompany(trailing[2]) && !isCompany(trailing[1]) ? [trailing[1], trailing[2]] : [part];
    })
    .map((part) => part.trim())
    .filter(Boolean);
}

function pointToMonth(point: string, isEnd: boolean): number | null {
  const text = point.trim().toLowerCase();
  if (new RegExp(`^${OPEN_END}$`, 'i').test(text)) {
    const now = new Date();
    return now.getFullYear() * 12 + now.getMonth();
  }
  const year = text.match(/(?:19|20)\d{2}/)?.[0];
  const shortYear = /[/-](\d{2})$/.exec(text)?.[1];
  const fullYear = year ? +year : shortYear ? 2000 + +shortYear : null;
  if (!fullYear) return null;
  const word = /[a-z]{3,}/.exec(text)?.[0];
  let month = word ? MONTHS[word.slice(0, 3)] : undefined;
  if (!month) {
    const numeric = /^(?:\d{1,2}[/-])?(\d{1,2})[/-]\d{2,4}$/.exec(text);
    if (numeric) month = +numeric[1];
  }
  if (!month || month > 12) month = isEnd ? 12 : 1;
  return fullYear * 12 + (month - 1);
}

type JobDraft = ExperienceItem & { detailLines: string[]; span: [number, number] | null };

const BULLET = /^[\s•*\-–—▪●➢►■◦·»+«]+/;

function parseExperience(lines: string[]): { items: ExperienceItem[]; months: number | null } {
  const items: JobDraft[] = [];
  const spans: [number, number][] = [];
  let current: JobDraft | null = null;
  let pending: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const range = DATE_RANGE.exec(line);

    if (range) {
      const start = pointToMonth(range[1], false);
      const end = pointToMonth(range[2], true);
      const span: [number, number] | null = start !== null && end !== null && end >= start ? [start, end + 1] : null;
      if (span) spans.push(span);

      const head = line
        .replace(range[0], ' ')
        // "· 9 yrs" after the dates is a length, not a title.
        .replace(/[·•]\s*\d+(\.\d+)?\s*(yrs?|years?|months?|mos?)\b\.?/gi, ' ')
        .replace(/\(\s*\)|\[\s*\]/g, ' ')
        .replace(/^\s*\d+\.\s*/, '')
        .replace(/[\s|,–—-]+$/g, '')
        .trim();
      // The dates' own line is the likeliest place for the employer; titles above it come next.
      const headParts = headingParts(head).map((text) => ({ text, line: -1 }));
      const pendingParts = pending.flatMap((text, index) => headingParts(text).map((part) => ({ text: part, line: index })));
      const companyPart = headParts.find((part) => isCompany(part.text)) ?? pendingParts.find((part) => isCompany(part.text));
      const roleParts = [...pendingParts, ...headParts].filter((part) => part !== companyPart && !isAddressLike(part.text));
      const rolePart = roleParts.find((part) => ROLE_WORD.test(part.text)) ?? roleParts[0];
      // Keep a title whole ("Major — Company Commander", "IT Assistant — Rule of Law Programme").
      const role = rolePart ? roleParts.filter((part) => part.line === rolePart.line).map((part) => part.text).join(' — ') : '';
      current = { company: calmCapitals(companyPart?.text ?? ''), role, duration: range[0].trim(), detailLines: [], span };
      items.push(current);
      pending = [];
    } else if (current) {
      // A full stop usually ends a sentence of duties, but "Ltd." is just part of a company name.
      const isShort = line.length < 70 && (!/[.;]$/.test(line) || /\b(ltd|inc|co|corp)\.$/i.test(line));
      if (!current.company && isShort && current.detailLines.length === 0 && isCompany(line)) current.company = calmCapitals(line);
      else if (!current.role && isShort && ROLE_WORD.test(line)) current.role = line;
      else if (isShort && (COMPANY_WORD.test(line) || ROLE_WORD.test(line)) && current.detailLines.length > 0 && !BULLET.test(line)) {
        // A short title after the details belongs to the next job; its dates come on a following line.
        pending.push(line);
      } else current.detailLines.push(line);
    } else if (!line.includes(':')) {
      pending.push(line);
      if (pending.length > 3) pending.shift();
    }
  }

  // A rank or post held inside a longer employment ("Major", 2019-2026, inside "Bangladesh Army", 2013-2026)
  // is at the same employer.
  for (const item of items) {
    if (item.company || !item.span) continue;
    const parent = items.find((other) => other !== item && other.company && other.span && other.span[0] <= item.span![0] && other.span[1] >= item.span![1]);
    if (parent) item.company = parent.company;
  }

  // No dates anywhere: read the entries by their shape instead, a title line, the employer under it, then duties.
  if (items.length === 0) {
    let entry: JobDraft | null = null;
    for (const rawLine of lines) {
      const bullet = BULLET.test(rawLine);
      const text = rawLine.replace(BULLET, '').trim();
      if (!text) continue;
      const isShort = text.length < 70 && !/[.;]$/.test(text);
      if (!bullet && isShort && ROLE_WORD.test(text) && !isCompany(text)) {
        entry = { role: text, company: '', duration: '', detailLines: [], span: null };
        items.push(entry);
      } else if (entry && !bullet && isShort && !entry.company && entry.detailLines.length === 0) {
        entry.company = calmCapitals(text);
      } else if (entry) {
        entry.detailLines.push(rawLine.trim());
      }
    }
  }

  // Overlapping jobs must not be counted twice in total experience.
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let coveredTo = -1;
  for (const [start, end] of spans) {
    const from = Math.max(start, coveredTo);
    if (end > from) months += end - from;
    coveredTo = Math.max(coveredTo, end);
  }

  return {
    items: items.map(({ detailLines, span: _span, ...item }) => ({ ...item, details: detailLines.join('\n') })),
    months: spans.length > 0 ? months : null,
  };
}

/**
 * Joins lines that a PDF wrapped in the middle of one entry: "...Military Academy — July 2013 to June"
 * then "2015 (24 months)". With bullets, every line that has none belongs to the bullet above it.
 */
function joinWrapped(lines: string[]): string[] {
  const bulleted = lines.filter((line) => BULLET.test(line)).length >= 2;
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const previous = out.at(-1);
    const continues =
      previous !== undefined &&
      (bulleted
        ? !BULLET.test(line) && line !== line.toUpperCase()
        : /^[\p{Ll}(]/u.test(line) || /^\d{4}\s*\(/.test(line) || /[,&/]$|\b(and|of|to|in|for)$/i.test(previous));
    if (continues) out[out.length - 1] = `${previous} ${line}`;
    else out.push(line);
  }
  return out;
}

function parseTraining(lines: string[]): TrainingItem[] {
  return joinWrapped(lines)
    .map((line) => line.replace(LIST_MARKER, '').trim())
    .filter((line) => line.length > 2 && !/^(training\s+title|title|topic|institute|country|location|year|duration)\b/i.test(line))
    .map((line) => {
      const pieces = line.split(/\s{3,}|\t|\s\|\s|\s[—–]\s/).map((piece) => piece.trim()).filter(Boolean);
      // "Course — Institute — 2015 (2 months)": with dashes the second part is the institute.
      const dashed = /\s[—–]\s/.test(line);
      const institute =
        pieces.find((piece, index) => index > 0 && INSTITUTE.test(piece) && piece.length <= 80) ??
        (dashed && pieces[1] && pieces[1].length <= 80 && !/^\(?(19|20)\d{2}\b/.test(pieces[1]) ? pieces[1] : undefined);
      return {
        // An award described in a sentence is kept whole rather than cut at its first dash.
        title: institute || pieces.length === 1 ? (pieces[0] ?? line) : line,
        institute,
        year: line.match(YEAR)?.at(-1),
      };
    });
}

const LANGUAGES_LINE = /^\s*languages?(\s+(known|proficiency))?\s*[:：]/i;

function parseSkills(lines: string[]): string[] {
  const seen = new Set<string>();
  const skills: string[] = [];
  // A "Languages:" line inside a skills block is read as languages instead.
  const usable = lines.filter((line) => !LANGUAGES_LINE.test(line));
  // A list wrapped across lines is joined first, so "Crisis & Emergency" + "Management" stays one skill.
  const joined: string[] = [];
  for (const line of usable) {
    const previous = joined.at(-1);
    const labelled = /^\s*[\p{L}][\p{L} &]{1,20}:\s/u.test(line);
    if (previous !== undefined && !BULLET.test(line) && !labelled && (previous.length >= 60 || /[,&|/]$|\band$/i.test(previous.trim()) || /^\p{Ll}/u.test(line.trim()))) {
      joined[joined.length - 1] = `${previous.trimEnd()} ${line.trim()}`;
    } else {
      joined.push(line);
    }
  }
  for (const joinedLine of joined) {
    // A bulleted line is one item: wide gaps in it are justified spacing, not columns.
    const line = BULLET.test(joinedLine) ? joinedLine.replace(/\s{2,}/g, ' ') : joinedLine;
    // "Technical: Networking, MS Office": the label is not a skill.
    const body = line.replace(/^\s*[\p{L}][\p{L} &]{1,20}:\s+/u, '');
    // With pipes between skills, commas belong inside one ("Logistics, Materials & Resource Management").
    const separator = body.includes('|') ? /[|;•·●▪➢]|\s{3,}|\t/ : /[,;•|·●▪➢]|\s{3,}|\t/;
    for (const piece of body.split(separator)) {
      const skill = piece.replace(/^[\s\-–—*\d.)]+/, '').replace(/[.\s]+$/, '').trim();
      const key = skill.toLowerCase();
      if (skill.length < 2 || skill.length > 70 || seen.has(key)) continue;
      if (/^(skill|description|extracurricular)\b/i.test(skill)) continue;
      seen.add(key);
      skills.push(skill);
    }
  }
  return skills;
}

const KNOWN_LANGUAGES = /\b(bangla|bengali|english|hindi|urdu|arabic|french|chinese|mandarin|japanese|korean|german|spanish)\b/gi;

function parseLanguages(lines: string[]): string[] {
  const found = new Map<string, string>();
  for (const match of lines.join(' ').matchAll(KNOWN_LANGUAGES)) {
    const key = match[0].toLowerCase();
    if (!found.has(key)) found.set(key, match[0][0].toUpperCase() + match[0].slice(1).toLowerCase());
  }
  return [...found.values()];
}

/**
 * A referee written on one line: "Capt. Md. Shah Alam, Managing Director, Marine Group — Phone: +8801711-487615"
 * or "Brig Gen Zahid Hossain, NDC, psc — Director ICT, MIST. Phone: 01734500500".
 */
function inlineReference(line: string): ReferenceItem | null {
  const text = line.replace(BULLET, '').trim();
  const phone = findPhones(text)[0] ?? /\+\d[\d\s()-]{8,16}\d/.exec(text)?.[0];
  const email = text.match(EMAIL)?.[0];
  if (!phone && !email) return null;
  const body = text
    .replace(EMAIL, ' ')
    .replace(/\b(phone|mobile|mob|cell|tel|contact|e-?mail)\b\.?\s*(no\.?)?\s*[:：]?[\s\S]*$/i, '')
    .replace(/[\s,;.—–-]+$/, '')
    .trim();
  const [head, ...after] = body.split(/\s*[—–]\s*|\s+-\s+/);
  const [name, ...titles] = head.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  if (!name || name.split(/\s+/).length < 2 || /\d/.test(name)) return null;
  // After a dash comes the post and the organisation; without one, they follow the name after commas.
  const rest = after.length > 0 ? after.join(', ').split(/\s*,\s*/).filter(Boolean) : titles;
  return {
    name,
    designation: rest[0] || undefined,
    organization: rest.slice(1).join(', ').replace(/\.$/, '') || undefined,
    phone: findPhones(text)[0] ?? phone?.trim(),
    email,
  };
}

function parseReferences(lines: string[], ownName: string): ReferenceItem[] {
  const items: ReferenceItem[] = [];
  let current: ReferenceItem | null = null;
  const own = ownName.trim().toLowerCase();

  for (const line of lines) {
    // The applicant's own signature block ends the references: "Abdul Wadud    Date: 02/11/2026".
    if ((own && line.trim().toLowerCase().startsWith(own)) || /^\s*(date|signature|place)\s*[:：]/i.test(line)) break;
    const inline = !/^[^:]{2,30}:/.test(line.replace(BULLET, '')) ? inlineReference(line) : null;
    if (inline) {
      items.push(inline);
      current = null;
      continue;
    }
    for (const cell of cells(line)) {
      const pair = /^([^:]{2,30}):\s*(.+)$/.exec(cell);
      const label = pair?.[1].trim().toLowerCase() ?? '';
      const value = pair?.[2].trim() ?? '';
      if (pair && /^(ref\w*\s*)?name$/.test(label)) {
        current = { name: value };
        items.push(current);
      } else if (pair && current) {
        if (/designation|position|title/.test(label)) current.designation = value;
        else if (/organi[sz]ation|company|institute/.test(label)) current.organization = value;
        else if (/mobile|phone|cell|contact/.test(label)) current.phone = value;
        else if (/mail/.test(label)) current.email = value;
      } else if (!pair && looksLikeName(cell) && (!current || current.phone || current.email || (current.designation && current.organization))) {
        // A new name after a complete referee starts the next one.
        current = { name: cell };
        items.push(current);
      } else if (!pair && current) {
        const phone = findPhones(cell)[0];
        const email = cell.match(EMAIL)?.[0];
        if (phone && !current.phone) current.phone = phone;
        else if (email && !current.email) current.email = email;
        else if (ROLE_WORD.test(cell) && !current.designation) current.designation = cell;
        else if (!current.organization && cell.length < 80 && !phone && !email) current.organization = cell;
      }
    }
  }
  return items.filter((item) => item.name);
}

export function parseCvText(rawText: string, fileName = ''): ParsedCv {
  const result = emptyParsedCv(rawText);
  const unique = <T,>(values: T[], key: (value: T) => string) => [...new Map(values.map((value) => [key(value), value])).values()];
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/ /g, ' ').trimEnd())
    .filter((line) => line.trim() !== '');

  const { preamble, sections } = splitSections(lines);
  const sectionsOf = (kind: SectionKind) => sections.filter((section) => section.kind === kind);
  const linesOf = (kind: SectionKind) => sectionsOf(kind).flatMap((section) => section.lines);

  // Keep every section under its own heading, numbering repeats instead of overwriting them.
  for (const section of sections) {
    let key = section.heading;
    for (let n = 2; key in result.sections; n += 1) key = `${section.heading} (${n})`;
    result.sections[key] = section.lines.join('\n');
  }
  if (preamble.length > 0) result.sections['Top of CV'] = preamble.join('\n');

  // Labelled fields, read outside the references so a referee's details are never taken as the applicant's.
  const referenceLines = new Set(linesOf('references'));
  const ownLines = lines.filter((line) => !referenceLines.has(line));
  for (let i = 0; i < ownLines.length; i += 1) {
    const row = cells(ownLines[i]);
    for (let c = 0; c < row.length; c += 1) {
      const pair = /^([^:]{2,40}):\s*(.*)$/.exec(row[c]);
      const label = pair ? pair[1] : row[c];
      const key = labelKey(label);
      if (!key) continue;

      let value = pair ? pair[2].trim() : '';
      // "Date of Birth    14 March 1996": the value sits in the next cell, without a colon.
      if (!value && row[c + 1] && !labelKey(row[c + 1].split(':')[0])) {
        value = row[c + 1].trim();
        c += 1;
      }
      // "Address:" alone on its line, with the value on the line below (sidebar layouts).
      if (!value && pair && row.length === 1 && ownLines[i + 1]) {
        const next = ownLines[i + 1].trim();
        if (!next.includes(':') && !classifyHeading(next) && !labelKey(next) && next.length < 140) value = next;
      }
      if (!value) continue;

      if ((key === 'address' || key === 'permanent_address') && row.length === 1) {
        for (let extra = 1; extra <= 2 && /,\s*$/.test(value) && ownLines[i + extra]; extra += 1) {
          const next = ownLines[i + extra].trim();
          if (next.includes(':') || classifyHeading(next)) break;
          value = `${value} ${next}`;
        }
      }

      if (key === 'date_of_birth') {
        if (!result.date_of_birth) {
          result.date_of_birth = normalizeDate(value);
          if (!result.date_of_birth) result.warnings.push(`Date of birth "${value}" could not be read.`);
        }
      } else if (key !== 'total_experience_years' && !result[key]) {
        (result as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  const ownText = ownLines.join('\n');

  // Contact details: the applicant's own lines first, the whole CV only as a last resort.
  const emails = ownText.match(EMAIL) ?? [];
  result.email = (emails[0] ?? '').toLowerCase();
  const phones = findPhones(ownText);
  result.phone = phones[0] ?? '';
  result.alt_phone = phones[1] ?? '';
  if (!result.phone) {
    const international = /\+\d[\d\s()-]{8,16}\d/.exec(ownText);
    if (international) result.phone = international[0].trim();
  }

  // Many CVs put the address under the name with no label.
  if (!result.address) {
    const pieces = preamble.flatMap(cells).filter((piece) => !piece.includes('@') && findPhones(piece).length === 0);
    const address = pieces.find((piece) => piece.length < 140 && ADDRESS_WORD.test(piece));
    if (address) result.address = address;
  }
  // Or under a Contact heading, over a few lines ("Village: Solmaid, Post Office: Gulshan" / "Police Station: Vatara").
  if (!result.address) {
    const contactLines = linesOf('contact').filter((line) => !line.includes('@') && findPhones(line).length === 0 && ADDRESS_WORD.test(line) && line.length < 140);
    if (contactLines.length > 0) result.address = contactLines.slice(0, 3).map((line) => line.trim().replace(/,$/, '')).join(', ');
  }

  if (!result.linkedin) {
    const linkedin = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s,;)]+/i.exec(ownText);
    if (linkedin) result.linkedin = linkedin[0];
  }

  // Name: an explicit label wins, otherwise the first line that reads like a person's name.
  if (result.full_name && !looksLikeName(result.full_name)) {
    result.full_name = result.full_name.trim().slice(0, 80);
  }
  if (!result.full_name) {
    const pool = [...preamble, ...linesOf('contact'), ...linesOf('personal')];
    const at = pool.findIndex(looksLikeName);
    if (at !== -1) {
      result.full_name = pool[at].trim();
      // A big name set on two lines ("TAHSINA" over "AKTER") is one name.
      const next = pool[at + 1]?.trim() ?? '';
      const oneWord = !result.full_name.includes(' ');
      if (oneWord && looksLikeName(next) && next.split(/\s+/).length <= 3 && (next === next.toUpperCase()) === (result.full_name === result.full_name.toUpperCase())) {
        result.full_name = `${result.full_name} ${next}`;
      }
    }
  }
  if (!result.full_name && fileName) {
    result.full_name = nameFromFile(fileName);
    if (result.full_name) result.warnings.push('Name was taken from the file name. Please check it.');
  }
  // OCR turns specks beside a name into stray letters at its end.
  result.full_name = result.full_name.replace(/(\s+[^\s.]{1,2})+$/, (tail) => (tail === tail.toLowerCase() ? '' : tail));
  // CVs often shout the name in capitals; Title Case reads better in lists and letters.
  if (result.full_name === result.full_name.toUpperCase()) {
    result.full_name = result.full_name.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (m) => m.toUpperCase());
  }

  result.career_summary = linesOf('summary').map((line) => line.replace(BULLET, '')).join(' ').replace(/\s+/g, ' ').trim();
  result.education = parseEducation(linesOf('education'));
  const experience = parseExperience(linesOf('experience'));
  result.experience = experience.items;
  result.current_designation = experience.items[0]?.role ?? '';
  result.current_company = experience.items[0]?.company ?? '';
  // A stated industry wins. Otherwise only a clear word in the current employer's name counts ("... Apparels Ltd.").
  result.industry = result.industry
    ? canonicalIndustry(result.industry) ?? result.industry
    : canonicalIndustry(result.current_company) ?? '';
  // Wrapped lines are joined within one section only, never across two.
  result.training = sectionsOf('training').flatMap((section) => parseTraining(section.lines));
  result.skills = unique(sectionsOf('skills').flatMap((section) => parseSkills(section.lines)), (skill) => skill.toLowerCase());
  // Languages have their own section, or a "Languages:" line inside another one.
  result.languages = parseLanguages([...linesOf('languages'), ...ownLines.filter((line) => LANGUAGES_LINE.test(line))]);
  result.references_list = parseReferences(linesOf('references'), result.full_name);

  const stated =
    /(?:total\s+(?:year|yr)s?\s+of\s+experience\s*[:\-]?\s*|experience\s*[:\-]\s*)(\d{1,2}(?:\.\d+)?)/i.exec(ownText) ??
    /(\d{1,2}(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:\w+\s+){0,2}experience/i.exec(ownText);
  if (stated) result.total_experience_years = Number(stated[1]);
  else if (experience.months !== null) result.total_experience_years = Math.round((experience.months / 12) * 10) / 10;

  if (!result.full_name) result.warnings.push('Name not found.');
  if (!result.phone) result.warnings.push('Mobile number not found.');
  if (!result.email) result.warnings.push('Email not found.');
  if (result.education.length === 0) result.warnings.push('Education could not be read into a table. See the full CV text.');
  if (linesOf('experience').length > 0 && result.experience.length === 0) {
    result.warnings.push('Work experience could not be read into a table. See the full CV text.');
  }
  return result;
}
