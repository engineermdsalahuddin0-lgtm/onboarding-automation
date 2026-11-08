import type { Candidate, CvBucket, Settings } from '../types';
import { dateDmy, dateDmyShort, dateMedium, dateOrdinal, dayName, dayShort, money, time12 } from './format';

export type TemplateVars = Record<string, string>;

export interface InterviewSlot {
  date?: string | null;
  time?: string | null;
}

export function candidateVars(
  c: Candidate,
  bucket: Pick<CvBucket, 'designation' | 'department' | 'company'> | undefined,
  settings: Settings,
  today: Date = new Date(),
): TemplateVars {
  return {
    name: c.full_name,
    designation: bucket?.designation ?? '',
    department: bucket?.department ?? '',
    company: bucket?.company || settings.default_company,
    group_name: settings.group_name,
    phone: c.phone,
    alt_phone: c.alt_phone,
    email: c.email,
    address: c.address,
    permanent_address: c.permanent_address,
    father_name: c.father_name,
    mother_name: c.mother_name,
    spouse_name: c.spouse_name,
    date_of_birth_long: dateMedium(c.date_of_birth),
    gender: c.gender,
    marital_status: c.marital_status,
    religion: c.religion,
    nationality: c.nationality,
    blood_group: c.blood_group,
    national_id: c.national_id,
    tin_no: c.tin_no,
    passport_no: c.passport_no,
    employee_code: c.employee_code,
    reporting_to: c.reporting_to,
    probation_period: c.probation_period,
    offered_salary: money(c.offered_salary),
    today_long: dateOrdinal(today),
    // The day the candidate confirmed on the joining call wins over the one first offered.
    joining_date_long: dateOrdinal(c.joining_confirmed_date ?? c.joining_date),
    corporate_address: settings.corporate_address,
    interview_address: settings.interview_address,
    interview_landmark: settings.interview_landmark,
    hr_signature: settings.hr_signature,
    signatory_name: settings.signatory_name,
    signatory_designation: settings.signatory_designation,
    signatory_mobile: settings.signatory_mobile,
    signatory_phone: settings.signatory_phone,
    signatory_ext: settings.signatory_ext,
    signatory_fax: settings.signatory_fax,
    signatory_email: settings.signatory_email,
  };
}

export function slotVars(slot: InterviewSlot): TemplateVars {
  return {
    date: dateDmy(slot.date),
    day: dayName(slot.date),
    date_short: dateDmyShort(slot.date),
    day_short: dayShort(slot.date),
    time: time12(slot.time),
  };
}

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Fills {{placeholders}}. Unknown or empty ones become the fallback and are reported back. */
export function renderTemplate(
  body: string,
  vars: TemplateVars,
  fallback = '',
): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = body.replace(PLACEHOLDER, (_, key: string) => {
    const value = vars[key];
    if (value === undefined || value === '') {
      missing.add(key);
      return fallback;
    }
    return value;
  });
  return { text, missing: [...missing] };
}

export const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  employee_code: 'Employee ID',
  designation: 'Designation',
  department: 'Department',
  company: 'Company',
  joining_date_long: 'Date of joining',
  reporting_to: 'Reporting to',
  father_name: "Father's name",
  mother_name: "Mother's name",
  spouse_name: "Spouse's name",
  date_of_birth_long: 'Date of birth',
  gender: 'Gender',
  marital_status: 'Marital status',
  religion: 'Religion',
  nationality: 'Nationality',
  blood_group: 'Blood group',
  national_id: 'NID no.',
  tin_no: 'TIN no.',
  passport_no: 'Passport no.',
  phone: 'Mobile',
  alt_phone: 'Alternate mobile',
  email: 'Email',
  address: 'Present address',
  permanent_address: 'Permanent address',
  offered_salary: 'Salary',
  probation_period: 'Probation period',
  signatory_name: 'Signatory name',
  signatory_designation: 'Signatory designation',
  signatory_mobile: 'Signatory mobile',
  signatory_phone: 'Signatory phone',
  signatory_ext: 'Signatory extension',
  signatory_fax: 'Signatory fax',
  signatory_email: 'Signatory email',
  corporate_address: 'Corporate office address',
  today_long: "Today's date",
};
