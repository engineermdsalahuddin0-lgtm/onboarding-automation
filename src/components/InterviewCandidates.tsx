import { Briefcase, Calendar, CalendarClock, ClipboardPen, Eye, FileText, FolderOpen, GraduationCap, MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { isFilled, STAGE_LABEL } from '../lib/assessment';
import { ageYears, classNames, dateMedium, time12, todayIso } from '../lib/format';
import { fileUrls } from '../lib/store';
import type { InterviewAssessment, InterviewAssignment, InterviewCandidate } from '../types';
import { FOLDER_COLORS } from './BucketForm';
import { Avatar, Button, Dialog, StatusBadge, useToast } from './ui';

// What an interviewer sees: their positions as folders, like the CV Buckets page, and inside each the
// candidates as cards with photo and summary, with the full profile one click away before marking.

const ATTENDANCE_TEXT: Record<string, string> = { cant_attend: "Can't attend", absent: 'Absent', not_interested: 'Not interested' };
const GENDER_TEXT: Record<string, string> = { male: 'Male', female: 'Female', m: 'Male', f: 'Female' };
const genderText = (gender: string) => GENDER_TEXT[gender.trim().toLowerCase()] ?? '';
const years = (value: number | null) => (value === null ? '' : `${value} year${value === 1 ? '' : 's'}`);

/** The day to show for a folder: the next interview day from today, or the latest one. */
function nextDay(days: string[], today: string) {
  const sorted = [...new Set(days)].sort();
  if (sorted.length === 0) return null;
  return { day: sorted.find((d) => d >= today) ?? sorted[sorted.length - 1], more: sorted.length - 1 };
}

export function InterviewFolder({ assignment, forms, onOpen }: {
  assignment: InterviewAssignment;
  /** This interviewer's own forms. */
  forms: InterviewAssessment[];
  onOpen: () => void;
}) {
  const color = FOLDER_COLORS[assignment.color] ?? FOLDER_COLORS.stone;
  const today = todayIso();
  const total = assignment.candidates.length;
  const marked = assignment.candidates.filter((c) => forms.some((a) => a.candidate_id === c.id && a.stage === assignment.stage && isFilled(a))).length;
  const todayCount = assignment.candidates.filter((c) => c.date === today).length;
  const days = nextDay(assignment.candidates.map((c) => c.date).filter((d): d is string => Boolean(d)).concat(
    assignment.stage === 'primary' && assignment.primary_date ? [assignment.primary_date] : [],
  ), today);
  return (
    <button type="button" onClick={onOpen} className="group block w-full rounded-2xl text-left transition-transform hover:-translate-y-0.5">
      <div className={classNames('ml-3 h-3 w-24 rounded-t-lg', color.tab)} aria-hidden />
      <div className={classNames('rounded-2xl rounded-tl-md border p-4 transition-shadow group-hover:shadow-md', color.body)}>
        <div className="flex items-start gap-3">
          <FolderOpen className={classNames('mt-0.5 size-5 shrink-0', color.icon)} aria-hidden />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold" title={assignment.designation}>{assignment.designation}</h3>
            <p className="truncate text-xs text-ink-soft">{[assignment.unit, assignment.department, assignment.section].filter(Boolean).join(' › ') || 'No department'}</p>
          </div>
        </div>
        <p className="mt-2 flex items-start gap-1 text-xs text-ink-soft">
          <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="flex-1">
            {days
              ? <><span className="font-medium text-ink">{dateMedium(days.day)}</span>{days.day < today ? ' (done)' : ''}{days.more > 0 ? ` +${days.more} more day${days.more === 1 ? '' : 's'}` : ''}</>
              : 'Interview day not set'}
          </span>
          <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-ink-soft">{STAGE_LABEL[assignment.stage]}</span>
        </p>
        <dl className="mt-3 flex justify-between gap-1 border-t border-black/5 pt-3 text-center">
          {([['Candidates', total], ['Today', todayCount], ['Marked', marked], ['Not marked', total - marked]] as const).map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="text-[11px] text-ink-soft">{label}</dt>
              <dd className={classNames('tabular text-base font-semibold', label === 'Not marked' && value > 0 && 'text-amber-800')}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </button>
  );
}

/** One candidate as a card: photo and the figures at a glance on the left, education and experience, then marking. */
export function InterviewCandidateCard({ candidate: c, index, photoUrl, status, marked, onMark, onProfile }: {
  candidate: InterviewCandidate;
  index: number;
  photoUrl: string | null;
  /** Marked or not, as a badge. */
  status: React.ReactNode;
  marked: boolean;
  onMark: () => void;
  onProfile: () => void;
}) {
  const age = ageYears(c.date_of_birth);
  const gender = genderText(c.gender ?? '');
  const education = (c.education ?? []).filter((e) => e.degree || e.institution);
  const jobs = (c.experience ?? []).filter((e) => e.company || e.role);
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface sm:flex-row">
      <div className="flex shrink-0 items-center gap-3 bg-brand-700 px-3 py-3 text-xs text-white sm:w-36 sm:flex-col sm:text-center">
        <span className="tabular self-start rounded bg-white/15 px-1.5 text-[11px] font-semibold">{index + 1}</span>
        <span className="rounded-full ring-2 ring-white/70"><Avatar name={c.full_name} url={photoUrl} size={64} /></span>
        <div className="space-y-0.5">
          {c.date && (
            <span className="tabular flex items-center gap-1 font-medium sm:justify-center">
              <Calendar className="size-3" aria-hidden />{dateMedium(c.date)}{c.time ? `, ${time12(c.time)}` : ''}
            </span>
          )}
          {(age !== null || gender) && <span className="tabular block">{[age !== null ? `Age: ${age}` : '', gender].filter(Boolean).join(' · ')}</span>}
          {c.expected_salary && <span className="block"><span className="text-white/80">Expected </span><span className="font-semibold">{c.expected_salary}</span></span>}
          {c.present_salary && <span className="block"><span className="text-white/80">Current </span><span className="font-semibold">{c.present_salary}</span></span>}
        </div>
      </div>

      <div className="grid min-w-0 flex-1 gap-3 p-3 text-sm md:grid-cols-[1.2fr_1fr_1fr_auto]">
        <div className="min-w-0">
          <button type="button" onClick={onProfile} className="text-left text-base font-semibold text-brand-700 hover:underline">{c.full_name}</button>
          {(c.current_designation || c.current_company) && (
            <p className="text-ink-soft">{[c.current_designation, c.current_company].filter(Boolean).join(', ')}</p>
          )}
          {c.address && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-muted">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /><span className="line-clamp-2">{c.address}</span>
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            {c.attendance && <StatusBadge tone="warning">{ATTENDANCE_TEXT[c.attendance] ?? c.attendance}</StatusBadge>}
            {c.cv_path && <span className="inline-flex items-center gap-1 text-ink-muted"><FileText className="size-3.5 text-red-700" aria-hidden />CV</span>}
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-0.5 flex items-center gap-1 text-xs font-medium text-ink-muted"><GraduationCap className="size-3.5" aria-hidden />Education</p>
          {education.length === 0 ? <p className="text-ink-muted">Not stated</p> : (
            <>
              <p className="font-semibold">{education[0].degree}</p>
              {education[0].institution && <p className="text-ink-soft">{education[0].institution}</p>}
              {(education[0].result || education[0].year) && <p className="text-xs text-ink-muted">{[education[0].result, education[0].year].filter(Boolean).join(' · ')}</p>}
              {education.length > 1 && <p className="text-xs text-ink-muted">+{education.length - 1} more</p>}
            </>
          )}
        </div>

        <div className="min-w-0">
          <p className="mb-0.5 flex items-center gap-1 text-xs font-medium text-ink-muted">
            <Briefcase className="size-3.5" aria-hidden />Experience{c.total_experience_years !== null ? `: ${years(c.total_experience_years)}` : ''}
          </p>
          {jobs.length === 0 ? <p className="text-ink-muted">{c.current_company || 'Not stated'}</p> : (
            <ul className="space-y-1">
              {jobs.slice(0, 2).map((job, i) => (
                <li key={i}>
                  {job.company && <p className="font-semibold">{job.company}</p>}
                  <p className="text-ink-soft">{job.role}{job.duration ? <span className="text-xs text-ink-muted"> ({job.duration})</span> : null}</p>
                </li>
              ))}
              {jobs.length > 2 && <li className="text-xs text-ink-muted">+{jobs.length - 2} more</li>}
            </ul>
          )}
        </div>

        <div className="flex flex-row flex-wrap items-center gap-2 md:flex-col md:items-end">
          {status}
          <Button size="sm" variant={marked ? 'secondary' : 'primary'} icon={ClipboardPen} onClick={onMark}>{marked ? 'Edit marks' : 'Give marks'}</Button>
          <Button size="sm" variant="ghost" icon={Eye} onClick={onProfile}>Profile</Button>
        </div>
      </div>
    </li>
  );
}

/** The candidate's full profile, read before marking. The CV opens when the interviewer may see it. */
export function CandidateProfileDialog({ candidate: c, photoUrl, canOpenFiles, marked, onMark, onClose }: {
  candidate: InterviewCandidate;
  photoUrl: string | null;
  canOpenFiles: boolean;
  marked: boolean;
  onMark: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const age = ageYears(c.date_of_birth);
  const facts: [string, string][] = [
    ['Current role', [c.current_designation, c.current_company].filter(Boolean).join(', ')],
    ['Industry', c.industry],
    ['Total experience', years(c.total_experience_years)],
    ['Age', age !== null ? String(age) : ''],
    ['Gender', genderText(c.gender ?? '')],
    ['Present address', c.address],
    ['Present salary', c.present_salary],
    ['Expected salary', c.expected_salary],
    ['Notice period', c.notice_period],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  async function openCv() {
    if (!c.cv_path) return;
    setOpening(true);
    const urls = await fileUrls([c.cv_path]);
    setOpening(false);
    if (urls[c.cv_path]) window.open(urls[c.cv_path], '_blank', 'noopener');
    else toast('The CV could not be opened. Ask HR.', 'bad');
  }

  return (
    <Dialog
      title={c.full_name}
      description={c.date ? `Interview ${dateMedium(c.date)}${c.time ? `, ${time12(c.time)}` : ''}` : undefined}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          {c.cv_path && canOpenFiles && <Button icon={FileText} loading={opening} onClick={() => void openCv()} className="mr-auto">Open CV</Button>}
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={ClipboardPen} onClick={onMark}>{marked ? 'Edit marks' : 'Give marks'}</Button>
        </>
      }
    >
      <div className="space-y-5 text-sm">
        <div className="flex items-start gap-4">
          <Avatar name={c.full_name} url={photoUrl} size={88} />
          <dl className="grid flex-1 grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        {c.career_summary && <Block title="Summary"><p className="whitespace-pre-wrap">{c.career_summary}</p></Block>}
        {(c.experience ?? []).length > 0 && (
          <Block title="Work experience">
            <ul className="space-y-2.5">
              {c.experience.map((job, i) => (
                <li key={i}>
                  <p className="font-medium">{job.role || 'Role not stated'}{job.company ? `, ${job.company}` : ''}</p>
                  {job.duration && <p className="text-xs text-ink-muted">{job.duration}</p>}
                  {job.details && <p className="mt-0.5 whitespace-pre-wrap text-ink-soft">{job.details}</p>}
                </li>
              ))}
            </ul>
          </Block>
        )}
        {(c.education ?? []).length > 0 && (
          <Block title="Education">
            <ul className="space-y-1.5">
              {c.education.map((item, i) => (
                <li key={i}>
                  <p className="font-medium">{item.degree}</p>
                  <p className="text-xs text-ink-muted">{[item.institution, item.board, item.result, item.year].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
            </ul>
          </Block>
        )}
        {(c.training ?? []).length > 0 && (
          <Block title="Training">
            <ul className="list-disc space-y-0.5 pl-5">
              {c.training.map((item, i) => <li key={i}>{[item.title, item.institute, item.year].filter(Boolean).join(', ')}</li>)}
            </ul>
          </Block>
        )}
        {((c.skills ?? []).length > 0 || (c.languages ?? []).length > 0) && (
          <Block title="Skills and languages">
            <ul className="flex flex-wrap gap-1">
              {[...(c.skills ?? []), ...(c.languages ?? [])].map((skill) => <li key={skill} className="rounded-full bg-hover px-2 py-0.5 text-xs">{skill}</li>)}
            </ul>
          </Block>
        )}
        {facts.length === 0 && !c.career_summary && (c.experience ?? []).length === 0 && (c.education ?? []).length === 0 && (
          <p className="flex items-center gap-2 text-ink-muted"><Users className="size-4" aria-hidden />No details on record{c.cv_path ? '; open the CV.' : '.'}</p>
        )}
      </div>
    </Dialog>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-3">
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}
