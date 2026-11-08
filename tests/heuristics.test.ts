import { describe, expect, it } from 'vitest';
import { findGutter, pagesToText } from '../src/lib/cv/extract';
import { normalizeDate, parseCvText } from '../src/lib/cv/heuristics';

const BDJOBS_STYLE = `MD. ABDUL KARIM
House 12, Road 3, Mirpur-10, Dhaka
Mobile No: 01711-234567
e-mail: abdul.karim@example.com

Career Objective:
To build a career in human resources with a growing organization.

Employment History:
Total Year of Experience : 4.5 Year(s)
1. HR Executive (January 1, 2021 - Continuing)
Sample Apparels Ltd.
Department: HR & Admin
Duties/Responsibilities:
Handled recruitment and joining documents for 300 staff.

2. Jr. Officer (March 1, 2019 - December 31, 2020)
Demo Garments Ltd.
Maintained attendance records.

Academic Qualification:
Exam/Degree    Concentration/Major    Institute    Result    Pas.Year
MBA    Human Resource    University of Dhaka    CGPA:3.50 out of 4    2018
BBA    Management    National University    CGPA:3.20 out of 4    2016
HSC    Commerce    Dhaka College    GPA:4.50 out of 5    2011

Training Summary:
Training Title    Topic    Institute    Year
Labour Law Basics    Compliance    BIHR Institute    2020

Special Qualification:
MS Office, HRIS, Payroll Management

Language Proficiency:
Language    Reading    Writing    Speaking
Bangla    High    High    High
English    High    Medium    Medium

Personal Details :
Father's Name : Abdul Malek
Mother's Name : Rahima Begum
Date of Birth : 14 March 1996
Gender : Male
Marital Status : Single
Nationality : Bangladeshi
Religion : Islam
National Id No : 1995269261012
Permanent Address : Village Rampur, Comilla
Blood Group : O+
Expected Salary : Tk. 40000

Reference (s):
Name : Dr. Rafiq Islam
Designation : Professor
Organization : University of Dhaka
Mobile : 01819-000000
E-mail : rafiq@example.org
`;

describe('parseCvText on a BDJobs-style CV', () => {
  const cv = parseCvText(BDJOBS_STYLE, 'cv.pdf');

  it('reads identity and contact details', () => {
    expect(cv.full_name).toBe('Md. Abdul Karim');
    expect(cv.address).toBe('House 12, Road 3, Mirpur-10, Dhaka');
    expect(cv.phone).toBe('01711234567');
    expect(cv.email).toBe('abdul.karim@example.com');
    expect(cv.father_name).toBe('Abdul Malek');
    expect(cv.mother_name).toBe('Rahima Begum');
    expect(cv.date_of_birth).toBe('1996-03-14');
    expect(cv.gender).toBe('Male');
    expect(cv.marital_status).toBe('Single');
    expect(cv.religion).toBe('Islam');
    expect(cv.national_id).toBe('1995269261012');
    expect(cv.permanent_address).toBe('Village Rampur, Comilla');
    expect(cv.blood_group).toBe('O+');
    expect(cv.expected_salary).toBe('Tk. 40000');
  });

  it('never takes a referee details as the applicant details', () => {
    expect(cv.alt_phone).toBe('');
    expect(cv.email).not.toContain('rafiq');
    expect(cv.references_list).toEqual([
      expect.objectContaining({
        name: 'Dr. Rafiq Islam',
        designation: 'Professor',
        organization: 'University of Dhaka',
        phone: '01819-000000',
        email: 'rafiq@example.org',
      }),
    ]);
  });

  it('reads education rows', () => {
    expect(cv.education).toHaveLength(3);
    expect(cv.education[0]).toMatchObject({ institution: 'University of Dhaka', year: '2018' });
    expect(cv.education[0].degree).toContain('MBA');
    expect(cv.education[0].result).toContain('3.50');
    expect(cv.education[2].degree).toContain('HSC');
  });

  it('reads experience with the stated total', () => {
    expect(cv.total_experience_years).toBe(4.5);
    expect(cv.experience).toHaveLength(2);
    expect(cv.experience[0]).toMatchObject({ role: 'HR Executive', company: 'Sample Apparels Ltd.' });
    expect(cv.experience[1]).toMatchObject({ role: 'Jr. Officer', company: 'Demo Garments Ltd.' });
    expect(cv.current_designation).toBe('HR Executive');
    expect(cv.current_company).toBe('Sample Apparels Ltd.');
  });

  it('reads skills, languages and training', () => {
    expect(cv.skills).toEqual(['MS Office', 'HRIS', 'Payroll Management']);
    expect(cv.languages).toEqual(['Bangla', 'English']);
    expect(cv.training[0]).toMatchObject({ title: 'Labour Law Basics', year: '2020' });
  });

  it('keeps every section and the complete text', () => {
    expect(cv.raw_text).toBe(BDJOBS_STYLE);
    expect(Object.keys(cv.sections)).toEqual(
      expect.arrayContaining(['Career Objective', 'Employment History', 'Academic Qualification', 'Personal Details']),
    );
    expect(cv.career_summary).toContain('career in human resources');
    expect(cv.warnings).toEqual([]);
  });
});

describe('parseCvText never invents data', () => {
  it('leaves everything empty and warns on an empty CV', () => {
    const cv = parseCvText('', '');
    expect(cv.full_name).toBe('');
    expect(cv.phone).toBe('');
    expect(cv.email).toBe('');
    expect(cv.total_experience_years).toBeNull();
    expect(cv.education).toEqual([]);
    expect(cv.warnings).toEqual(expect.arrayContaining(['Name not found.', 'Mobile number not found.', 'Email not found.']));
  });

  it('flags a name that came from the file name', () => {
    const cv = parseCvText('Skills:\nExcel\n', 'Rahima_Khatun_CV.pdf');
    expect(cv.full_name).toBe('Rahima Khatun');
    expect(cv.warnings.join(' ')).toContain('file name');
  });

  it('calculates experience without double counting overlapping jobs', () => {
    const cv = parseCvText(
      `Sara Ali\nWork Experience\nManager, A Ltd.  Jan 2018 - Dec 2019\nConsultant, B Ltd.  Jan 2019 - Dec 2020\n`,
    );
    expect(cv.total_experience_years).toBe(3);
  });

  it('does not guess an address from a line that is not one', () => {
    expect(parseCvText('Sara Ali\nHard working professional\nSkills:\nExcel').address).toBe('');
  });

  it('does not treat a non-Bangladeshi number-like string as a mobile', () => {
    expect(parseCvText('Sara Ali\nRoll: 123456789012\n').phone).toBe('');
  });

  it('accepts the +880 and spaced forms of a mobile number', () => {
    expect(parseCvText('Sara Ali\nPhone: +880 1711 234567').phone).toBe('01711234567');
    expect(parseCvText('Sara Ali\nPhone: 88-01811-234567').phone).toBe('01811234567');
  });
});

describe('education written on one line, with no table columns', () => {
  const read = (line: string) => parseCvText(`Sara Ali\nEducation\n${line}\n`).education[0];

  it.each([
    ['MBA Human Resource University of Dhaka CGPA:3.50 out of 4 2018', 'MBA Human Resource', 'University of Dhaka', '2018'],
    ['BBA Management National University CGPA:3.20 out of 4 2016', 'BBA Management', 'National University', '2016'],
    ['B.Sc in CSE, North South University, 2020', 'B.Sc in CSE', 'North South University', '2020'],
    ['HSC, Dhaka College, GPA 5.00, 2012', 'HSC', 'Dhaka College', '2012'],
    ['BBA Management, National University 2019', 'BBA Management', 'National University', '2019'],
  ])('%s', (line, degree, institution, year) => {
    expect(read(line)).toMatchObject({ degree, institution, year });
  });

  it('reads an institute on the following line', () => {
    expect(parseCvText('Sara Ali\nEducation\nMaster of Business Administration\nUniversity of Chittagong\n2019\n').education[0]).toMatchObject({
      degree: 'Master of Business Administration',
      institution: 'University of Chittagong',
      year: '2019',
    });
  });

  it('removes OCR specks after a name but keeps real short name parts', () => {
    expect(parseCvText('KARIM MIAH y\nEmail: k@example.com').full_name).toBe('Karim Miah');
    expect(parseCvText('Md. Ali Ah\nEmail: k@example.com').full_name).toBe('Md. Ali Ah');
  });
});

// Layouts seen in real CVs (src/assets/cv), rewritten with made-up people.
describe('layouts from real CVs', () => {
  it('reads "Employer — Role" job lines, and ranks inside one employer', () => {
    const cv = parseCvText(`KARIM UDDIN
PROFESSIONAL EXPERIENCE
BANGLADESH ARMY — Commissioned Officer (Signals)    Jul 2013 – Jul 2026
Major — Company Commander / Senior Operations Officer    Dec 2019 – Jul 2026
• Commanded two companies.
Lieutenant (Retd), Bangladesh Navy    Jul 13, 2013 - Jun 11, 2020
Administrative & Security Officer
`);
    expect(cv.experience[0]).toMatchObject({ role: 'Commissioned Officer (Signals)', company: 'Bangladesh Army' });
    expect(cv.experience[1]).toMatchObject({ role: 'Major — Company Commander / Senior Operations Officer', company: 'Bangladesh Army' });
    expect(cv.experience[2]).toMatchObject({ role: 'Lieutenant (Retd)', company: 'Bangladesh Navy' });
  });

  it('takes the employer from the dates line and the title from the line above', () => {
    const cv = parseCvText(`Sara Ali
PROFESSIONAL EXPERIENCE
Receptionist and IT Focal — Textile Cluster
German Development Cooperation (GIZ) | Jun 2024 – Aug 2026
▪ Answered phone queries.
Hardware Technician — Sample Hospitals Dhaka
Plot 81, Block E, Bashundhara R/A, Dhaka-1229 | Jun 2005 – Aug 2011 · 6 yrs
▪ Installed software.
`);
    expect(cv.experience[0]).toMatchObject({ role: 'Receptionist and IT Focal — Textile Cluster', company: 'German Development Cooperation (GIZ)' });
    expect(cv.experience[1]).toMatchObject({ role: 'Hardware Technician', company: 'Sample Hospitals Dhaka' });
  });

  it('reads jobs with no dates by their shape', () => {
    const cv = parseCvText(`Sara Ali
PROFESSIONAL EXPERIENCE
Intern — Textile Production & Quality Control
Sample Knitwears Ltd., Narayanganj
Assisted in merchandising operations, buyer communications, and
order tracking.
`);
    expect(cv.experience).toEqual([expect.objectContaining({ role: 'Intern — Textile Production & Quality Control', company: 'Sample Knitwears Ltd., Narayanganj' })]);
  });

  it('keeps "Secondary School Certificate" as a degree and finds the school after it', () => {
    const cv = parseCvText(`Sara Ali
EDUCATION
Bachelor of Military Studies & Maritime Science, Bangladesh University of Professionals (BUP) — Passing Year:
2016, CGPA 2.91 (out of 4.00)
Secondary School Certificate (SSC), Science, Sample Thana Pilot High School — Passing Year: 2010, GPA 5.00
Secondary School Certificate (Science)    2008
G.K. Sample High School — GPA 5.00 / 5.00
B.Sc. in Electrical Engineering    2023
Military Institute of Science and Technology (MIST), Dhaka — CGPA 3.12 / 4.00
Master of Human Rights    Pursuing
`);
    expect(cv.education[0]).toMatchObject({ degree: 'Bachelor of Military Studies & Maritime Science', institution: 'Bangladesh University of Professionals (BUP)', year: '2016' });
    expect(cv.education[1]).toMatchObject({ degree: 'Secondary School Certificate (SSC), Science', institution: 'Sample Thana Pilot High School', year: '2010' });
    expect(cv.education[2]).toMatchObject({ degree: 'Secondary School Certificate (Science)', institution: 'G.K. Sample High School', year: '2008' });
    expect(cv.education[3]).toMatchObject({ institution: 'Military Institute of Science and Technology (MIST)' });
    expect(cv.education[4]).toMatchObject({ degree: 'Master of Human Rights', result: 'Pursuing' });
  });

  it('joins wrapped skills and training lines, and reads a Languages line anywhere', () => {
    const cv = parseCvText(`Sara Ali
SKILLS
Corporate & Industrial Security, Security Risk & Audit, Executive Protection & VVIP Protocol, Crisis & Emergency
Management, HR &
Personnel Management
CORE COMPETENCIES
Leadership & Workforce Management | Logistics, Materials & Resource Management | Human Resource
Records & Performance Monitoring
TRAININGS
Basic Officer's Training — Sample Naval Academy — July 2013 to June
2015 (24 months)
Firefighting Course — Sample Institute, Navy — 2015 (2 months)
TECHNICAL & LANGUAGE SKILLS
Technical: Networking (CCNA), Microsoft Office Suite.
Languages: Bengali (native), English, French (DELF Level A2).
`);
    expect(cv.skills).toEqual(expect.arrayContaining(['Crisis & Emergency Management', 'HR & Personnel Management', 'Logistics, Materials & Resource Management', 'Human Resource Records & Performance Monitoring', 'Networking (CCNA)']));
    expect(cv.training).toHaveLength(2);
    expect(cv.training[0]).toMatchObject({ title: "Basic Officer's Training", institute: 'Sample Naval Academy', year: '2015' });
    expect(cv.languages).toEqual(['Bengali', 'English', 'French']);
  });

  it('reads one-line referees and stops at the applicant signature', () => {
    const cv = parseCvText(`Sara Ali
Email: sara@example.com
REFERENCES
• Brig Gen Sample Hossain, NDC, psc— Director ICT, MIST. Phone: (+88) 01734500500
Capt. Md. Sample Alam, Managing Director, Marine Group — Phone: +8801711-487615
Sara Ali    Date: 02/11/2026
Major, Sample Army
`);
    expect(cv.references_list).toEqual([
      expect.objectContaining({ name: 'Brig Gen Sample Hossain', designation: 'Director ICT', organization: 'MIST', phone: '01734500500' }),
      expect.objectContaining({ name: 'Capt. Md. Sample Alam', designation: 'Managing Director', organization: 'Marine Group', phone: '01711487615' }),
    ]);
  });

  it('starts a new referee at a new name once the last one is complete', () => {
    const cv = parseCvText(`Sara Ali
REFERENCES
Moinul Sample
Chief Technology Officer
Sample Hospitals PLC
Mobile: 01714338774
Md. Second Referee
IT Specialist, Sample Office Dhaka
Mobile: 01615141516
`);
    expect(cv.references_list.map((r) => r.name)).toEqual(['Moinul Sample', 'Md. Second Referee']);
  });

  it('reads a sidebar: a name over two lines, a value under its label, a heading with an OCR icon', () => {
    const cv = parseCvText(`TAHSINA
SAMPLE
CONTACT
Phone:
01625510271
Address:
Matuail ,Dhaka
(o] LANGUAGES
Bengali (Native)
`);
    expect(cv.full_name).toBe('Tahsina Sample');
    expect(cv.address).toBe('Matuail ,Dhaka');
    expect(cv.languages).toEqual(['Bengali']);
  });

  it('does not take the end of a wrapped sentence for a heading', () => {
    const cv = parseCvText(`Sara Ali
PROFESSIONAL EXPERIENCE
IT Assistant
Sample Office Dhaka | Jan 2020 – Dec 2022
▪ Supported logistics for events and
workshops.
IT Support Assistant
Sample Office Dhaka | Jan 2018 – Dec 2019
`);
    expect(cv.experience).toHaveLength(2);
    expect(cv.training).toEqual([]);
  });
});

describe('two-column PDF pages', () => {
  const item = (str: string, x: number, y: number, width = str.length * 5) => ({ str, transform: [1, 0, 0, 10, x, y], width, height: 10 });

  it('finds the gutter between a sidebar and the main column, and reads each column whole', () => {
    const items = [];
    for (let i = 0; i < 20; i += 1) items.push(item(`sidebar line ${i}`, 60, 760 - i * 23));
    for (let i = 0; i < 25; i += 1) items.push(item(`main column text that is a good deal longer ${i}`, 240, 770 - i * 17));
    expect(findGutter(items, 612)).not.toBeNull();
    const text = pagesToText([{ items, width: 612 }]);
    const lines = text.split('\n');
    // The main column starts higher, so it is read first, and never mixed with the sidebar.
    expect(lines[0]).toBe('main column text that is a good deal longer 0');
    expect(lines.every((line) => !(line.includes('sidebar') && line.includes('main')))).toBe(true);
  });

  it('leaves a label and value table as one column', () => {
    const items = [];
    for (let i = 0; i < 15; i += 1) {
      items.push(item(`Label ${i}`, 60, 760 - i * 15, 60));
      items.push(item(`: value ${i}`, 200, 760 - i * 15, 80));
    }
    expect(findGutter(items, 612)).toBeNull();
  });
});

describe('normalizeDate', () => {
  it.each([
    ['14 March 1996', '1996-03-14'],
    ['March 14, 1996', '1996-03-14'],
    ['14th March, 1996', '1996-03-14'],
    ['14-03-1996', '1996-03-14'],
    ['14/03/96', '1996-03-14'],
    ['1996-03-14', '1996-03-14'],
    ['14-Mar-96', '1996-03-14'],
  ])('%s', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });

  it('rejects impossible and unclear dates', () => {
    expect(normalizeDate('13/13/1996')).toBeNull();
    expect(normalizeDate('31-02-1996')).toBeNull();
    expect(normalizeDate('sometime in 1996')).toBeNull();
  });
});
