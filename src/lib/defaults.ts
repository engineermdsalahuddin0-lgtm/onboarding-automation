import type { DocumentTemplate, MessageTemplate, Settings } from '../types';

export const DOCUMENT_CHECKLIST = [
  'NID (Self 2 Copy & Nominee 2 Copy)',
  'Copy of all educational certificates (Will have to Show Original Copies at the time of Joining)',
  'Experience & Clearance Certificate of previous Organization',
  'TIN certificate',
  'Passport size Photograph (Self- 4 Copy & Nominee - 2 Copy)',
];

export const DEFAULT_SETTINGS: Omit<Settings, 'id'> = {
  group_name: 'Bitopi Group',
  default_company: 'Tarasima Apparels Ltd.(Corporate Office)',
  companies: ['Tarasima Apparels Ltd.(Corporate Office)'],
  departments: ['HR & Admin', 'Accounts & Finance', 'Merchandising', 'Production', 'Quality', 'Commercial', 'IT', 'Supply Chain'],
  media: ['BDJobs', 'LinkedIn', 'Facebook', 'Company Website', 'Newspaper', 'Employee Referral', 'Walk-in'],
  corporate_address: '823/3 Begum Rokeya Sharani, Shewrapara, Mirpur',
  interview_address: '823/3 Begum Rokeya Sharani, Shewrapara, Mirpur.',
  interview_landmark: 'Close to metrorail pillar no 321',
  hr_signature: 'B/R, HRD, BITOPI GROUP',
  signatory_name: '',
  signatory_designation: '',
  signatory_mobile: '',
  signatory_phone: '',
  signatory_ext: '',
  signatory_fax: '',
  signatory_email: '',
  seal_path: null,
  upload_max_files: 1000,
  upload_batch_size: 50,
  upload_batch_pause: 10,
};

// Wording comes from src/assets/images/sample_message_for_onboarding.txt; only the
// "[auto fetch]" markers became placeholders.
export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: 'primary_invite',
    name: 'Interview invitation (Primary)',
    stage: 'primary',
    body: 'Dear Concern, Interview for "{{designation}}" on {{date_short}} ({{day_short}}) at {{time}}.{{hr_signature}}, {{interview_address}}',
  },
  {
    key: 'final_invite',
    name: 'Final interview invitation (Secondary)',
    stage: 'secondary',
    body: 'Dear Concern {{name}},\nyou are shortlisted & Invited to attend the final interview on {{date}} ({{day}}) at {{time}}. {{interview_address}} ({{interview_landmark}})\n{{hr_signature}}',
  },
  {
    key: 'review_invite',
    name: 'Interview experience request',
    stage: 'review',
    body: 'Dear {{name}}, thank you for attending the interview for "{{designation}}". Please share your experience here: {{review_link}}\n{{hr_signature}}',
  },
];

// Mini markup, rendered by DocumentBody: **bold**, "- " bullets, "# " headings and these blocks on
// their own line: [[photo]], [[fields:a,b]], [[education]], [[experience]], [[checklist]],
// [[blank-table:Col A|Col B:rows]], [[signatures:Left|Right]], [[signatory]].
export const DEFAULT_DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    key: 'offer_letter',
    title: 'Offer Letter',
    sort_order: 10,
    is_active: true,
    body: `{{today_long}}

Attention: **{{name}}**,

Further to the interview and discussions with us we are pleased to offer you employment in {{company}} as "{{designation}}" under {{department}} Department with monthly salary and benefits package as committed to you verbally.

Please note that this is just an employment offer and the formal letter of appointment with details of salary, benefits, terms, and conditions of services will be issued to you when you will join in the Company.

You are requested to confirm us by return e-mail as a token of your acceptance of the offer.

This offer letter is subject to your joining in the Company on {{joining_date_long}}.

We congratulate you on your selection and very welcome you to us.

**N.B: Please submit following Documents on joining (If discrepancy found in any documents, your offer will be postponed at any time):**

[[checklist]]

Best Regards,

[[signatory]]`,
  },
  {
    key: 'joining_report',
    title: 'Joining Report',
    sort_order: 20,
    is_active: true,
    body: `# Joining Report

Date: {{joining_date_long}}

To
The Head of HR
{{company}}

**Subject: Joining as "{{designation}}"**

Dear Sir/Madam,

With reference to your offer, I am reporting for duty today as "{{designation}}" under {{department}} Department of {{company}}. I confirm that all information I have provided to the Company is true and correct.

[[signatures:Signature of {{name}}|Received by (HR)]]`,
  },
  {
    key: 'employee_information',
    title: 'Employee Information Form',
    sort_order: 30,
    is_active: true,
    body: `# Employee Information Form

[[photo]]

[[fields:name,employee_code,designation,department,company,joining_date_long,reporting_to,father_name,mother_name,spouse_name,date_of_birth_long,gender,marital_status,religion,nationality,blood_group,national_id,tin_no,passport_no,phone,alt_phone,email,address,permanent_address]]

**Educational Qualification**

[[education]]

**Employment History**

[[experience]]

I hereby declare that the above information is true and correct to the best of my knowledge.

[[signatures:Signature of {{name}}|Verified by (HR)]]`,
  },
  {
    key: 'document_checklist',
    title: 'Document Submission Checklist',
    sort_order: 40,
    is_active: true,
    body: `# Document Submission Checklist

Name: **{{name}}** | Designation: **{{designation}}** | Joining date: **{{joining_date_long}}**

[[checklist]]

[[signatures:Submitted by {{name}}|Received by (HR)]]`,
  },
  {
    key: 'nominee_form',
    title: 'Nominee Information Form',
    sort_order: 50,
    is_active: true,
    body: `# Nominee Information Form

Employee: **{{name}}** | Designation: **{{designation}}** | Department: **{{department}}**

I nominate the following person(s) to receive my dues from the Company in the event of my death:

[[blank-table:Nominee name|Relationship|NID no.|Mobile|Share %:3]]

[[signatures:Signature of {{name}}|Received by (HR)]]`,
  },
  {
    key: 'appointment_letter',
    title: 'Appointment Letter',
    sort_order: 60,
    is_active: false,
    body: `{{today_long}}

To
**{{name}}**
{{address}}

**Subject: Letter of Appointment**

Dear {{name}},

We are pleased to appoint you as "{{designation}}" under {{department}} Department of {{company}} with effect from {{joining_date_long}}.

Monthly gross salary: BDT {{offered_salary}}
Probation period: {{probation_period}}
Reporting to: {{reporting_to}}

(Replace this paragraph with the Company's approved terms and conditions of service before activating this template.)

[[signatures:Accepted by {{name}}|For {{company}}]]`,
  },
];

export const DEFAULT_COLORS = ['stone', 'green', 'blue', 'amber', 'rose', 'violet', 'teal'] as const;
