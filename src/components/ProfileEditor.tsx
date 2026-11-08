import { Plus, Trash2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import type { Candidate, EducationItem, ExperienceItem, ReferenceItem, TrainingItem } from '../types';
import { Button, IconButton, TextArea, TextInput } from './ui';

// The whole profile is edited in place, inside the candidate's card, and saved once. Everything the
// CV reader can miss can be filled in here, including the lists (experience, education, training, references).

const TEXT_FIELDS = [
  'full_name', 'phone', 'alt_phone', 'email', 'address', 'permanent_address', 'linkedin',
  'current_designation', 'current_company', 'industry', 'present_salary', 'expected_salary', 'notice_period',
  'career_summary', 'father_name', 'mother_name', 'spouse_name', 'gender', 'marital_status', 'religion',
  'nationality', 'blood_group', 'national_id', 'tin_no', 'passport_no',
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

export interface ProfileDraft extends Record<TextField, string> {
  date_of_birth: string;
  total_experience_years: string;
  skills: string;
  languages: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  training: TrainingItem[];
  references_list: ReferenceItem[];
}

export function toDraft(c: Candidate): ProfileDraft {
  const text = Object.fromEntries(TEXT_FIELDS.map((key) => [key, String(c[key] ?? '')])) as Record<TextField, string>;
  return {
    ...text,
    date_of_birth: c.date_of_birth ?? '',
    total_experience_years: c.total_experience_years === null ? '' : String(c.total_experience_years),
    skills: c.skills.join(', '),
    languages: c.languages.join(', '),
    experience: c.experience.map((item) => ({ ...item })),
    education: c.education.map((item) => ({ ...item })),
    training: c.training.map((item) => ({ ...item })),
    references_list: c.references_list.map((item) => ({ ...item })),
  };
}

const list = (text: string) => [...new Set(text.split(',').map((s) => s.trim()).filter(Boolean))];

/** Drops rows left completely empty, so an "Add" pressed by mistake leaves nothing behind. */
function filled<T extends object>(rows: T[]): T[] {
  return rows
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) as T)
    .filter((row) => Object.values(row).some((value) => typeof value === 'string' && value !== ''));
}

export function fromDraft(draft: ProfileDraft): Partial<Candidate> {
  const text = Object.fromEntries(TEXT_FIELDS.map((key) => [key, draft[key].trim()]));
  return {
    ...text,
    email: draft.email.trim().toLowerCase(),
    date_of_birth: draft.date_of_birth || null,
    total_experience_years: draft.total_experience_years === '' ? null : Number(draft.total_experience_years),
    skills: list(draft.skills),
    languages: list(draft.languages),
    experience: filled(draft.experience),
    education: filled(draft.education),
    training: filled(draft.training),
    references_list: filled(draft.references_list),
  };
}

export function sameDraft(a: ProfileDraft, b: ProfileDraft): boolean {
  return JSON.stringify(fromDraft(a)) === JSON.stringify(fromDraft(b));
}

function Group({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-t border-line pt-3">
      <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
        <h3 id={id} className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

interface RowListProps<T> {
  title: string;
  noun: string;
  rows: T[];
  empty: T;
  onChange: (rows: T[]) => void;
  render: (row: T, set: (patch: Partial<T>) => void, label: (field: string) => string) => ReactNode;
}

function RowList<T extends object>({ title, noun, rows, empty, onChange, render }: RowListProps<T>) {
  return (
    <Group title={title} action={<Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...rows, { ...empty }])}>Add {noun}</Button>}>
      {rows.length === 0 && <p className="text-sm text-ink-muted">None yet.</p>}
      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li key={index} className="flex items-start gap-2 rounded-lg border border-line p-2.5">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {render(
                row,
                (patch) => onChange(rows.map((current, at) => (at === index ? { ...current, ...patch } : current))),
                (field) => `${noun[0].toUpperCase()}${noun.slice(1)} ${index + 1}: ${field}`,
              )}
            </div>
            <IconButton label={`Remove ${noun} ${index + 1}`} icon={Trash2} onClick={() => onChange(rows.filter((_, at) => at !== index))} />
          </li>
        ))}
      </ol>
    </Group>
  );
}

/** Every field of the profile on one form. Nothing is saved until the card's Save profile button. */
export function ProfileEditor({ draft, onChange }: { draft: ProfileDraft; onChange: (draft: ProfileDraft) => void }) {
  const set = (patch: Partial<ProfileDraft>) => onChange({ ...draft, ...patch });
  const field = (key: TextField, label: string, extra: { required?: boolean; type?: string; inputMode?: 'tel' | 'email' } = {}) => (
    <TextInput label={label} value={draft[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<ProfileDraft>)} {...extra} />
  );

  return (
    <div className="space-y-4">
      <Group title="Contact">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {field('full_name', 'Name', { required: true })}
          {field('phone', 'Mobile', { type: 'tel' })}
          {field('alt_phone', 'Other mobile', { type: 'tel' })}
          {field('email', 'Email', { type: 'email' })}
          {field('linkedin', 'LinkedIn')}
          <div className="sm:col-span-2 lg:col-span-3 grid gap-3 sm:grid-cols-2">
            {field('address', 'Present address')}
            {field('permanent_address', 'Permanent address')}
          </div>
        </div>
      </Group>

      <Group title="Current work">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {field('current_designation', 'Current designation')}
          {field('current_company', 'Current company')}
          {field('industry', 'Industry')}
          <TextInput label="Total experience (years)" type="number" min={0} step={0.1} value={draft.total_experience_years} onChange={(e) => set({ total_experience_years: e.target.value })} />
          {field('present_salary', 'Present salary')}
          {field('expected_salary', 'Expected salary')}
          {field('notice_period', 'Notice period')}
        </div>
      </Group>

      <Group title="Summary">
        <TextArea label="Summary" rows={3} value={draft.career_summary} onChange={(e) => set({ career_summary: e.target.value })} />
      </Group>

      <RowList<ExperienceItem>
        title="Work experience"
        noun="job"
        rows={draft.experience}
        empty={{ role: '', company: '', duration: '', details: '' }}
        onChange={(experience) => set({ experience })}
        render={(row, update, label) => (
          <>
            <TextInput label="Role" aria-label={label('role')} value={row.role} onChange={(e) => update({ role: e.target.value })} />
            <TextInput label="Company" aria-label={label('company')} value={row.company} onChange={(e) => update({ company: e.target.value })} />
            <TextInput label="Duration" aria-label={label('duration')} placeholder="e.g. Jan 2021 - Present" value={row.duration ?? ''} onChange={(e) => update({ duration: e.target.value })} />
            <div className="sm:col-span-2 lg:col-span-3">
              <TextArea label="Duties" aria-label={label('duties')} rows={2} value={row.details ?? ''} onChange={(e) => update({ details: e.target.value })} />
            </div>
          </>
        )}
      />

      <RowList<EducationItem>
        title="Education"
        noun="degree"
        rows={draft.education}
        empty={{ degree: '', institution: '', board: '', result: '', year: '' }}
        onChange={(education) => set({ education })}
        render={(row, update, label) => (
          <>
            <TextInput label="Degree" aria-label={label('degree')} value={row.degree} onChange={(e) => update({ degree: e.target.value })} />
            <TextInput label="Institution" aria-label={label('institution')} value={row.institution} onChange={(e) => update({ institution: e.target.value })} />
            <TextInput label="Board" aria-label={label('board')} value={row.board ?? ''} onChange={(e) => update({ board: e.target.value })} />
            <TextInput label="Result" aria-label={label('result')} value={row.result ?? ''} onChange={(e) => update({ result: e.target.value })} />
            <TextInput label="Year" aria-label={label('year')} inputMode="numeric" value={row.year ?? ''} onChange={(e) => update({ year: e.target.value })} />
          </>
        )}
      />

      <RowList<TrainingItem>
        title="Training"
        noun="training"
        rows={draft.training}
        empty={{ title: '', institute: '', year: '' }}
        onChange={(training) => set({ training })}
        render={(row, update, label) => (
          <>
            <TextInput label="Title" aria-label={label('title')} value={row.title} onChange={(e) => update({ title: e.target.value })} />
            <TextInput label="Institute" aria-label={label('institute')} value={row.institute ?? ''} onChange={(e) => update({ institute: e.target.value })} />
            <TextInput label="Year" aria-label={label('year')} inputMode="numeric" value={row.year ?? ''} onChange={(e) => update({ year: e.target.value })} />
          </>
        )}
      />

      <Group title="Skills and languages">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Skills" hint="Separate with commas" value={draft.skills} onChange={(e) => set({ skills: e.target.value })} />
          <TextInput label="Languages" hint="Separate with commas" value={draft.languages} onChange={(e) => set({ languages: e.target.value })} />
        </div>
      </Group>

      <Group title="Personal details">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {field('father_name', "Father's name")}
          {field('mother_name', "Mother's name")}
          {field('spouse_name', "Spouse's name")}
          <TextInput label="Date of birth" type="date" value={draft.date_of_birth} onChange={(e) => set({ date_of_birth: e.target.value })} />
          {field('gender', 'Gender')}
          {field('marital_status', 'Marital status')}
          {field('religion', 'Religion')}
          {field('nationality', 'Nationality')}
          {field('blood_group', 'Blood group')}
          {field('national_id', 'NID')}
          {field('tin_no', 'TIN')}
          {field('passport_no', 'Passport')}
        </div>
      </Group>

      <RowList<ReferenceItem>
        title="References"
        noun="reference"
        rows={draft.references_list}
        empty={{ name: '', designation: '', organization: '', phone: '', email: '' }}
        onChange={(references_list) => set({ references_list })}
        render={(row, update, label) => (
          <>
            <TextInput label="Name" aria-label={label('name')} value={row.name} onChange={(e) => update({ name: e.target.value })} />
            <TextInput label="Designation" aria-label={label('designation')} value={row.designation ?? ''} onChange={(e) => update({ designation: e.target.value })} />
            <TextInput label="Organization" aria-label={label('organization')} value={row.organization ?? ''} onChange={(e) => update({ organization: e.target.value })} />
            <TextInput label="Mobile" aria-label={label('mobile')} type="tel" value={row.phone ?? ''} onChange={(e) => update({ phone: e.target.value })} />
            <TextInput label="Email" aria-label={label('email')} type="email" value={row.email ?? ''} onChange={(e) => update({ email: e.target.value })} />
          </>
        )}
      />
    </div>
  );
}
