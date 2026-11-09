import { CheckCircle2, FileUp, Loader2, LockKeyhole, Plus, Star, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import fullLogo from '../assets/images/Bitopi_Logo_Final.png';
import { Button, errorText, IconButton, Select, Spinner, TextArea, TextInput } from '../components/ui';
import { backend } from '../lib/backend';
import { extensionOf, MIME_BY_EXTENSION, parseCvFile } from '../lib/cv';
import { classNames } from '../lib/format';
import type { EducationItem, ExperienceItem, PublicBucket, ReviewInvite } from '../types';

const MAX_BYTES = 15 * 1024 * 1024;

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface px-5 py-3">
        <img src={fullLogo} alt="Bitopi Group, 50 Years and Beyond" className="mx-auto h-16 object-contain" />
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}

function Message({ title, children, icon: Icon = CheckCircle2 }: { title: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-12 text-center">
      <Icon className={`mx-auto mb-3 size-10 ${Icon === CheckCircle2 ? 'text-brand-600' : 'text-ink-muted'}`} aria-hidden />
      <h1 className="text-lg font-semibold">{title}</h1>
      {children && <p className="mt-1 text-sm text-ink-soft">{children}</p>}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-line bg-surface p-5">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

const EMPTY_EDUCATION: EducationItem = { degree: '', institution: '', result: '', year: '' };
const EMPTY_EXPERIENCE: ExperienceItem = { company: '', role: '', duration: '', details: '' };

const EMPTY_FORM = {
  full_name: '', email: '', phone: '', alt_phone: '', address: '', permanent_address: '', date_of_birth: '',
  father_name: '', mother_name: '', spouse_name: '', gender: '', marital_status: '', religion: '',
  nationality: 'Bangladeshi', blood_group: '', national_id: '', tin_no: '', linkedin: '',
  industry: '', total_experience_years: '', present_salary: '', expected_salary: '', notice_period: '', career_summary: '', skills: '',
};

export function ApplyPage() {
  const { code = '' } = useParams();
  const [bucket, setBucket] = useState<PublicBucket | null | undefined>(undefined);
  const [form, setForm] = useState(EMPTY_FORM);
  const [education, setEducation] = useState<EducationItem[]>([{ ...EMPTY_EDUCATION }]);
  const [experience, setExperience] = useState<ExperienceItem[]>([{ ...EMPTY_EXPERIENCE }]);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    backend.rpc<PublicBucket | null>('get_public_bucket', { p_code: code }).then(setBucket).catch(() => setBucket(null));
  }, [code]);

  const set = (patch: Partial<typeof EMPTY_FORM>) => setForm((current) => ({ ...current, ...patch }));

  function choosePhoto(blob: Blob | null) {
    setPhoto(blob);
    setPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return blob ? URL.createObjectURL(blob) : '';
    });
  }

  // Reading happens in the applicant's browser: their CV goes nowhere until they press Submit.
  async function chooseCv(file: File | undefined) {
    if (!file) return;
    setError('');
    if (file.size > MAX_BYTES || !MIME_BY_EXTENSION[extensionOf(file.name)]) {
      setError('Please choose a PDF, Word or image file under 15 MB.');
      return;
    }
    setCvFile(file);
    setReading(true);
    setReadNote('');
    try {
      const { parsed, photo: found } = await parseCvFile(file, 'rules');
      // Only fills what is still empty, so nothing the applicant typed is overwritten.
      setForm((current) => {
        const next = { ...current };
        const take = (key: keyof typeof EMPTY_FORM, value: string | number | null | undefined) => {
          const isDefault = key === 'nationality' ? current[key] === EMPTY_FORM.nationality : current[key] === '';
          if (value !== null && value !== undefined && value !== '' && isDefault) next[key] = String(value);
        };
        take('full_name', parsed.full_name);
        take('email', parsed.email);
        take('phone', parsed.phone);
        take('alt_phone', parsed.alt_phone);
        take('address', parsed.address);
        take('permanent_address', parsed.permanent_address);
        take('date_of_birth', parsed.date_of_birth);
        take('father_name', parsed.father_name);
        take('mother_name', parsed.mother_name);
        take('spouse_name', parsed.spouse_name);
        take('gender', parsed.gender);
        take('marital_status', parsed.marital_status);
        take('religion', parsed.religion);
        take('nationality', parsed.nationality);
        take('blood_group', parsed.blood_group);
        take('national_id', parsed.national_id);
        take('tin_no', parsed.tin_no);
        take('linkedin', parsed.linkedin);
        take('industry', parsed.industry);
        take('total_experience_years', parsed.total_experience_years);
        take('present_salary', parsed.present_salary);
        take('expected_salary', parsed.expected_salary);
        take('notice_period', parsed.notice_period);
        take('career_summary', parsed.career_summary);
        take('skills', parsed.skills.join(', '));
        return next;
      });
      if (parsed.education.length > 0) setEducation((current) => (current.some((e) => e.degree) ? current : parsed.education));
      if (parsed.experience.length > 0) setExperience((current) => (current.some((e) => e.company || e.role) ? current : parsed.experience));
      if (found && !photo) choosePhoto(found);
      setReadNote('We filled in what we could read from your CV. Please check everything below and correct anything that is wrong.');
    } catch {
      setReadNote('We could not read this file automatically, but it will still be attached. Please fill in the form below.');
    } finally {
      setReading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const folder = `applications/${crypto.randomUUID()}`;
      let cvPath = '';
      if (cvFile) {
        const extension = extensionOf(cvFile.name);
        cvPath = `${folder}/cv.${extension}`;
        await backend.upload(cvPath, cvFile, MIME_BY_EXTENSION[extension]);
      }
      let photoPath = '';
      if (photo) {
        photoPath = `${folder}/photo.jpg`;
        await backend.upload(photoPath, photo, photo.type || 'image/jpeg');
      }
      await backend.rpc('submit_application', {
        p_code: code,
        p_payload: {
          ...form,
          skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
          education: education.filter((e) => e.degree || e.institution),
          experience: experience.filter((e) => e.company || e.role),
          current_designation: experience[0]?.role ?? '',
          current_company: experience[0]?.company ?? '',
        },
        p_cv_path: cvPath,
        p_photo_path: photoPath,
        p_cv_file_name: cvFile?.name ?? '',
        p_website: website,
      });
      setDone(true);
      window.scrollTo(0, 0);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  if (bucket === undefined) return <PublicShell><Spinner /></PublicShell>;
  if (bucket === null) return <PublicShell><div className="rounded-2xl border border-line bg-surface px-6 py-12 text-center text-sm">This application link is not valid.</div></PublicShell>;
  if (!bucket.accepting) return <PublicShell><div className="rounded-2xl border border-line bg-surface px-6 py-12 text-center"><h1 className="font-semibold">{bucket.designation}</h1><p className="mt-1 text-sm text-ink-soft">Applications for this position are closed.</p></div></PublicShell>;
  if (done) return <PublicShell><Message title="Application received">Thank you, {form.full_name}. We will contact you on {form.phone} if you are shortlisted for {bucket.designation}.</Message></PublicShell>;

  return (
    <PublicShell>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-balance">Apply for {bucket.designation}</h1>
        <p className="text-sm text-ink-soft">{[bucket.department, bucket.company].filter(Boolean).join(' · ')}</p>
        {bucket.job_description && <p className="mt-2 text-sm whitespace-pre-wrap text-ink-soft">{bucket.job_description}</p>}
      </div>

      <form onSubmit={submit} className="space-y-4">
        <FormSection title="Your CV">
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-line-strong px-4 py-6 text-center hover:bg-canvas">
            {reading ? <Loader2 className="size-6 animate-spin text-ink-muted" aria-hidden /> : <FileUp className="size-6 text-ink-muted" aria-hidden />}
            <span className="text-sm font-medium">{cvFile ? cvFile.name : 'Upload your CV to fill this form automatically'}</span>
            <span className="text-xs text-ink-muted">PDF, Word or photo, up to 15 MB. Optional.</span>
            <input type="file" accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp" className="sr-only" onChange={(e) => void chooseCv(e.target.files?.[0])} />
          </label>
          {reading && <p className="mt-2 text-xs text-ink-soft" role="status">Reading your CV…</p>}
          {readNote && <p className="mt-2 text-xs text-brand-900" role="status">{readNote}</p>}
        </FormSection>

        <FormSection title="About you">
          <div className="mb-3 flex items-center gap-3">
            {photoPreview
              ? <img src={photoPreview} alt="Your photo" className="size-20 rounded-lg border border-line object-cover" />
              : <span className="flex size-20 items-center justify-center rounded-lg bg-hover text-center text-[11px] text-ink-muted">No photo</span>}
            <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-line-strong px-3 text-sm font-medium hover:bg-hover">
              {photoPreview ? 'Change photo' : 'Add photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => choosePhoto(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Full name" name="name" autoComplete="name" required value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} />
            <TextInput label="Mobile" name="tel" type="tel" autoComplete="tel" inputMode="tel" required pattern="[+0-9 \-]{10,20}" placeholder="01XXXXXXXXX" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            <TextInput label="Email" name="email" type="email" autoComplete="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            <TextInput label="Other mobile" type="tel" inputMode="tel" value={form.alt_phone} onChange={(e) => set({ alt_phone: e.target.value })} />
            <TextInput label="Date of birth" type="date" autoComplete="bday" value={form.date_of_birth} onChange={(e) => set({ date_of_birth: e.target.value })} />
            <Select label="Gender" value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
              <option value="">Choose…</option>
              {[...new Set(['Male', 'Female', 'Other', form.gender].filter(Boolean))].map((g) => <option key={g}>{g}</option>)}
            </Select>
            <TextInput label="Father's name" value={form.father_name} onChange={(e) => set({ father_name: e.target.value })} />
            <TextInput label="Mother's name" value={form.mother_name} onChange={(e) => set({ mother_name: e.target.value })} />
            <Select label="Marital status" value={form.marital_status} onChange={(e) => set({ marital_status: e.target.value })}>
              <option value="">Choose…</option>
              {[...new Set(['Single', 'Married', 'Other', form.marital_status].filter(Boolean))].map((g) => <option key={g}>{g}</option>)}
            </Select>
            <TextInput label="Spouse's name" value={form.spouse_name} onChange={(e) => set({ spouse_name: e.target.value })} />
            <TextInput label="Religion" value={form.religion} onChange={(e) => set({ religion: e.target.value })} />
            <TextInput label="Nationality" value={form.nationality} onChange={(e) => set({ nationality: e.target.value })} />
            <TextInput label="Blood group" value={form.blood_group} onChange={(e) => set({ blood_group: e.target.value })} />
            <TextInput label="NID no." inputMode="numeric" value={form.national_id} onChange={(e) => set({ national_id: e.target.value })} />
            <TextInput label="TIN no." inputMode="numeric" value={form.tin_no} onChange={(e) => set({ tin_no: e.target.value })} />
            <TextInput label="LinkedIn" type="url" value={form.linkedin} onChange={(e) => set({ linkedin: e.target.value })} />
            <div className="sm:col-span-2"><TextInput label="Present address" autoComplete="street-address" value={form.address} onChange={(e) => set({ address: e.target.value })} /></div>
            <div className="sm:col-span-2"><TextInput label="Permanent address" value={form.permanent_address} onChange={(e) => set({ permanent_address: e.target.value })} /></div>
          </div>
        </FormSection>

        <FormSection title="Education">
          <div className="space-y-3">
            {education.map((item, index) => (
              <div key={index} className="grid items-end gap-2 sm:grid-cols-[2fr_2fr_1fr_1fr_auto]">
                <TextInput label="Degree" value={item.degree} onChange={(e) => setEducation((list) => list.map((row, i) => (i === index ? { ...row, degree: e.target.value } : row)))} />
                <TextInput label="Institution" value={item.institution} onChange={(e) => setEducation((list) => list.map((row, i) => (i === index ? { ...row, institution: e.target.value } : row)))} />
                <TextInput label="Result" value={item.result ?? ''} onChange={(e) => setEducation((list) => list.map((row, i) => (i === index ? { ...row, result: e.target.value } : row)))} />
                <TextInput label="Year" inputMode="numeric" value={item.year ?? ''} onChange={(e) => setEducation((list) => list.map((row, i) => (i === index ? { ...row, year: e.target.value } : row)))} />
                <IconButton label={`Remove education ${index + 1}`} icon={Trash2} className="mb-0.5" onClick={() => setEducation((list) => list.filter((_, i) => i !== index))} />
              </div>
            ))}
          </div>
          <Button size="sm" icon={Plus} className="mt-3" onClick={() => setEducation((list) => [...list, { ...EMPTY_EDUCATION }])}>Add education</Button>
        </FormSection>

        <FormSection title="Work experience">
          <div className="space-y-3">
            {experience.map((item, index) => (
              <div key={index} className="grid items-end gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
                <TextInput label="Organization" value={item.company} onChange={(e) => setExperience((list) => list.map((row, i) => (i === index ? { ...row, company: e.target.value } : row)))} />
                <TextInput label="Designation" value={item.role} onChange={(e) => setExperience((list) => list.map((row, i) => (i === index ? { ...row, role: e.target.value } : row)))} />
                <TextInput label="Duration" placeholder="2021 - Present" value={item.duration ?? ''} onChange={(e) => setExperience((list) => list.map((row, i) => (i === index ? { ...row, duration: e.target.value } : row)))} />
                <IconButton label={`Remove experience ${index + 1}`} icon={Trash2} className="mb-0.5" onClick={() => setExperience((list) => list.filter((_, i) => i !== index))} />
              </div>
            ))}
          </div>
          <Button size="sm" icon={Plus} className="mt-3" onClick={() => setExperience((list) => [...list, { ...EMPTY_EXPERIENCE }])}>Add experience</Button>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TextInput label="Total experience (years)" type="number" min={0} max={60} step={0.1} value={form.total_experience_years} onChange={(e) => set({ total_experience_years: e.target.value })} />
            <TextInput label="Industry" placeholder="e.g. Garments & Textile" value={form.industry} onChange={(e) => set({ industry: e.target.value })} />
            <TextInput label="Notice period" value={form.notice_period} onChange={(e) => set({ notice_period: e.target.value })} />
            <TextInput label="Present salary" value={form.present_salary} onChange={(e) => set({ present_salary: e.target.value })} />
            <TextInput label="Expected salary" value={form.expected_salary} onChange={(e) => set({ expected_salary: e.target.value })} />
          </div>
        </FormSection>

        <FormSection title="Anything else">
          <div className="space-y-3">
            <TextInput label="Skills (comma separated)" value={form.skills} onChange={(e) => set({ skills: e.target.value })} />
            <TextArea label="About your career" rows={3} value={form.career_summary} onChange={(e) => set({ career_summary: e.target.value })} />
          </div>
        </FormSection>

        {/* Hidden from people; bots filling every field reveal themselves here. */}
        <div className="absolute left-[-9999px]" aria-hidden>
          <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
        </div>

        <p className="text-xs text-ink-muted">By submitting, you agree that {bucket.group_name} may store and use these details for recruitment.</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}
        <Button type="submit" variant="primary" loading={busy} disabled={reading} className="w-full sm:w-auto">Submit application</Button>
      </form>
    </PublicShell>
  );
}

function StarRating({ label, value, onChange, required }: { label: string; value: number; onChange: (value: number) => void; required?: boolean }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}{required && <span className="text-red-800"> *</span>}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer rounded p-0.5 has-focus-visible:outline-2 has-focus-visible:outline-brand-600">
            <input type="radio" name={label} value={n} required={required} checked={value === n} onChange={() => onChange(n)} className="sr-only" aria-label={`${n} out of 5`} />
            <Star aria-hidden className={classNames('size-7 transition-colors', n <= value ? 'fill-amber-500 text-amber-500' : 'text-line-strong hover:text-amber-400')} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewFormPage() {
  const { token = '' } = useParams();
  const [invite, setInvite] = useState<ReviewInvite | null | undefined>(undefined);
  const [overall, setOverall] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [professionalism, setProfessionalism] = useState(0);
  const [clarity, setClarity] = useState(0);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    backend.rpc<ReviewInvite | null>('get_review_invite', { p_token: token }).then(setInvite).catch(() => setInvite(null));
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!overall) {
      setError('Please give an overall rating.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await backend.rpc('submit_review', {
        p_token: token,
        p_overall: overall,
        p_communication: communication || null,
        p_professionalism: professionalism || null,
        p_clarity: clarity || null,
        p_would_recommend: recommend,
        p_comments: comments,
      });
      setDone(true);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  if (invite === undefined) return <PublicShell><Spinner /></PublicShell>;
  if (invite === null) return <PublicShell><div className="rounded-2xl border border-line bg-surface px-6 py-12 text-center text-sm">This link is not valid.</div></PublicShell>;
  if (done || invite.submitted) return <PublicShell><Message title="Thank you for your feedback">It helps {invite.group_name} treat every candidate better.</Message></PublicShell>;
  if (invite.open === false) {
    return (
      <PublicShell>
        <Message title="This feedback link has closed" icon={LockKeyhole}>
          The {invite.stage === 'primary' ? 'primary' : 'final'} interview for {invite.designation} has moved on to its next step, so this link no longer takes answers.
        </Message>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <h1 className="text-xl font-semibold text-balance">How was your interview, {invite.first_name}?</h1>
      <p className="mb-4 text-sm text-ink-soft">
        {invite.stage === 'primary' ? 'Primary' : 'Final'} interview for {invite.designation}. Your answer does not affect your application.
      </p>
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-line bg-surface p-5">
        <StarRating label="Overall experience" required value={overall} onChange={setOverall} />
        <div className="grid gap-4 sm:grid-cols-3">
          <StarRating label="Communication" value={communication} onChange={setCommunication} />
          <StarRating label="Professionalism" value={professionalism} onChange={setProfessionalism} />
          <StarRating label="Clear process" value={clarity} onChange={setClarity} />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Would you recommend applying here?</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="radio" name="recommend" className="accent-brand-600" checked={recommend === true} onChange={() => setRecommend(true)} /> Yes</label>
            <label className="flex items-center gap-1.5"><input type="radio" name="recommend" className="accent-brand-600" checked={recommend === false} onChange={() => setRecommend(false)} /> No</label>
          </div>
        </fieldset>
        <TextArea label="Share your experience" rows={5} value={comments} onChange={(e) => setComments(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        <Button type="submit" variant="primary" loading={busy}>Send feedback</Button>
      </form>
    </PublicShell>
  );
}
