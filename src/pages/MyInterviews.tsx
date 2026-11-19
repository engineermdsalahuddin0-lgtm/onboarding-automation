import { ArrowLeft, CalendarDays, CheckCircle2, LogOut, RefreshCw, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import tabLogo from '../assets/images/bitopi_group_logo_for_tab.jpg';
import { AssessmentForm, type FormHeader } from '../components/AssessmentForm';
import { CandidateProfileDialog, InterviewCandidateCard, InterviewFolder } from '../components/InterviewCandidates';
import { SignaturePad } from '../components/SignaturePad';
import { Avatar, Button, Dialog, EmptyState, errorText, IconButton, Spinner, StatusBadge, Tabs, TextInput, useToast } from '../components/ui';
import { isFilled, RECOMMENDATION_LABEL, scoreOf, STAGE_LABEL, todayBd } from '../lib/assessment';
import { backend } from '../lib/backend';
import { useFileUrls } from '../lib/store';
import { classNames } from '../lib/format';
import type { AssessmentInput, InterviewAssessment, InterviewAssignment, InterviewCandidate, InterviewerDetails, MyInterviews } from '../types';

type When = 'today' | 'upcoming' | 'earlier' | 'all';

const inWhen = (when: When, date: string | null, today: string) => when === 'all'
  || (when === 'today' && date === today)
  || (when === 'upcoming' && (date === null || date > today))
  || (when === 'earlier' && date !== null && date < today);

/**
 * The interviews this person sits on: first their positions as folders, then inside one, its candidates as
 * cards with photo and profile, each marked with Give marks. For interviewer accounts it is the whole app.
 */
export function MyInterviewsPage({ standalone = false }: { standalone?: boolean }) {
  const [data, setData] = useState<MyInterviews | null>(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const [when, setWhen] = useState<When>('all');
  const [marking, setMarking] = useState<InterviewCandidate | null>(null);
  const [viewing, setViewing] = useState<InterviewCandidate | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await backend.rpc<MyInterviews>('my_interviews', {}));
      setError('');
    } catch (failure) {
      setError(errorText(failure));
    }
  }, []);

  useEffect(() => {
    void load();
    // Candidates scheduled or moved while the page is open show up without a reload.
    return backend.subscribe((table) => {
      if (table === 'candidates' || table === 'interview_panels' || table === 'interview_assessments') void load();
    });
  }, [load]);

  const today = todayBd();
  const mine = useMemo(() => new Map((data?.assessments ?? []).map((a) => [`${a.candidate_id}:${a.stage}`, a])), [data]);
  // The folder that is open lives in the link, so Back returns to the folders.
  const assignment = data?.assignments.find((a) => a.bucket_id === params.get('bucket') && a.stage === params.get('stage')) ?? null;
  const openFolder = (a: InterviewAssignment | null) => {
    setParams((current) => {
      if (a) {
        current.set('bucket', a.bucket_id);
        current.set('stage', a.stage);
      } else {
        current.delete('bucket');
        current.delete('stage');
      }
      return current;
    });
    if (a) setWhen(a.candidates.some((c) => c.date === today) ? 'today' : 'all');
  };
  const candidates = assignment?.candidates.filter((c) => inWhen(when, c.date, today)) ?? [];
  const photoUrls = useFileUrls(assignment?.candidates.map((c) => c.photo_path) ?? []);
  // Folders with an interview today first, then upcoming, then the rest.
  const folders = useMemo(() => [...(data?.assignments ?? [])].sort((a, b) => {
    const rank = (x: InterviewAssignment) => (x.candidates.some((c) => c.date === today) ? 0 : x.candidates.some((c) => c.date === null || c.date > today) ? 1 : 2);
    return rank(a) - rank(b);
  }), [data, today]);

  let body;
  if (!data) {
    body = error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</p> : <Spinner label="Loading your interviews" />;
  } else if (!assignment) {
    body = (
      <div className="space-y-4">
        {!data.profile.signature && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <span className="flex-1">Save your signature once and it is added to every form you mark.</span>
            <Button size="sm" onClick={() => setEditingProfile(true)}>Add my signature</Button>
          </div>
        )}
        {folders.length === 0 ? (
          <EmptyState icon={CalendarDays} title="You are not on any interview panel yet">
            HR adds you to a position's primary or final interview. It shows here as soon as they do.
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {folders.map((a) => (
              <InterviewFolder key={`${a.bucket_id}:${a.stage}`} assignment={a} forms={data.assessments} onOpen={() => openFolder(a)} />
            ))}
          </div>
        )}
      </div>
    );
  } else {
    const count = (w: When) => assignment.candidates.filter((c) => inWhen(w, c.date, today)).length;
    body = (
      <div className="space-y-4">
        <div>
          <button type="button" onClick={() => openFolder(null)} className="mb-1 inline-flex items-center gap-1 text-xs text-ink-soft hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> All my interviews
          </button>
          <h2 className="text-lg font-semibold">{assignment.designation} · {STAGE_LABEL[assignment.stage]}</h2>
          <p className="text-sm text-ink-soft">{[assignment.unit, assignment.department, assignment.section, assignment.subsection].filter(Boolean).join(' › ')}</p>
        </div>
        <Tabs<When>
          label="Which candidates"
          value={when}
          onChange={setWhen}
          items={[
            { value: 'today', label: 'Today', count: count('today') },
            { value: 'upcoming', label: 'Upcoming', count: count('upcoming') },
            { value: 'earlier', label: 'Earlier', count: count('earlier') },
            { value: 'all', label: 'All', count: count('all') },
          ]}
        />
        {candidates.length === 0 ? (
          <EmptyState icon={CalendarDays} title={when === 'today' ? 'No interview today' : 'No candidate here'}>Try another tab.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {candidates.map((candidate, index) => {
              const form = mine.get(`${candidate.id}:${assignment.stage}`);
              return (
                <InterviewCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  index={index}
                  photoUrl={candidate.photo_path ? photoUrls[candidate.photo_path] ?? null : null}
                  status={<FormStatus form={form} />}
                  marked={Boolean(form && isFilled(form))}
                  onMark={() => setMarking(candidate)}
                  onProfile={() => setViewing(candidate)}
                />
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const dialogs = data && assignment && (
    <>
      {viewing && (
        <CandidateProfileDialog
          candidate={viewing}
          photoUrl={viewing.photo_path ? photoUrls[viewing.photo_path] ?? null : null}
          canOpenFiles
          marked={Boolean(mine.get(`${viewing.id}:${assignment.stage}`) && isFilled(mine.get(`${viewing.id}:${assignment.stage}`)!))}
          onMark={() => {
            setMarking(viewing);
            setViewing(null);
          }}
          onClose={() => setViewing(null)}
        />
      )}
      {marking && (
        <MarkDialog
          profile={data.profile}
          assignment={assignment}
          candidate={marking}
          existing={mine.get(`${marking.id}:${assignment.stage}`)}
          onClose={() => setMarking(null)}
          onSaved={() => void load()}
        />
      )}
    </>
  );
  const profileDialog = data && editingProfile && <ProfileDialog profile={data.profile} onClose={() => setEditingProfile(false)} onSaved={() => void load()} />;

  if (!standalone) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">My interviews</h1>
            <p className="text-sm text-ink-soft">The interviews you sit on. Give each candidate your marks; the score works itself out.</p>
          </div>
          <div className="flex gap-2">
            <Button icon={UserRound} onClick={() => setEditingProfile(true)} disabled={!data}>My details and signature</Button>
            <IconButton label="Refresh" icon={RefreshCw} onClick={() => void load()} />
          </div>
        </div>
        {body}
        {dialogs}
        {profileDialog}
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas">
      {backend.mode === 'demo' && <p className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-950">Demo mode: sample data</p>}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface px-4">
        <img src={tabLogo} alt="" className="size-8 rounded-md object-contain" />
        <span className="flex-1 truncate text-sm font-semibold">My interviews</span>
        <button type="button" onClick={() => setEditingProfile(true)} disabled={!data} className="flex items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-hover">
          <span className="hidden text-right sm:block">
            <span className="block max-w-48 truncate text-xs font-medium">{data?.profile.full_name}</span>
            <span className="block max-w-48 truncate text-[11px] text-ink-muted">{data?.profile.job_title || 'Interviewer'}</span>
          </span>
          <Avatar name={data?.profile.full_name || '?'} size={32} />
        </button>
        <IconButton label="Refresh" icon={RefreshCw} onClick={() => void load()} />
        <IconButton label="Sign out" icon={LogOut} onClick={() => void backend.signOut()} />
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-5">{body}</main>
      {dialogs}
      {profileDialog}
    </div>
  );
}

export function FormStatus({ form }: { form: Pick<InterviewAssessment, 'rated' | 'ratings' | 'recommendation'> | undefined }) {
  if (!form || !isFilled(form)) return <StatusBadge tone="neutral">Not marked</StatusBadge>;
  const score = scoreOf(form.ratings);
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <CheckCircle2 className="size-4 text-emerald-700" aria-hidden />
      <strong className="tabular">{score.obtained}/50</strong>
      <span className="tabular text-ink-soft">({score.percent}%)</span>
      {form.recommendation && (
        <span className={classNames('font-medium', form.recommendation === 'employ' ? 'text-emerald-800' : 'text-red-800')}>
          {RECOMMENDATION_LABEL[form.recommendation]}
        </span>
      )}
    </span>
  );
}

export const inputOf = (a: InterviewAssessment | undefined): AssessmentInput | undefined =>
  a && { ratings: a.ratings, strengths: a.strengths, weaknesses: a.weaknesses, comment: a.comment, recommendation: a.recommendation };

function MarkDialog({ profile, assignment, candidate, existing, onClose, onSaved }: {
  profile: InterviewerDetails;
  assignment: InterviewAssignment;
  candidate: InterviewCandidate;
  existing: InterviewAssessment | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [signature, setSignature] = useState('');
  const [keep, setKeep] = useState(!profile.signature);
  const [busy, setBusy] = useState(false);
  const header: FormHeader = {
    ...assignment,
    candidateName: candidate.full_name,
    stage: assignment.stage,
    date: candidate.date,
    interviewerName: profile.full_name || profile.email,
    interviewerDesignation: profile.job_title,
    interviewerDepartment: profile.department,
  };
  const current = existing?.signature || profile.signature;

  async function save(input: AssessmentInput) {
    setBusy(true);
    try {
      await backend.rpc('save_my_assessment', {
        p_candidate: candidate.id, p_stage: assignment.stage, p_payload: input, p_signature: signature, p_keep_signature: keep && Boolean(signature),
      });
      const score = scoreOf(input.ratings);
      toast(score.rated === 0 ? `${candidate.full_name}: saved with no marks. It is not counted until you mark it.` : `${candidate.full_name}: ${score.obtained}/50 (${score.percent}%) saved.`);
      onSaved();
      onClose();
    } catch (failure) {
      toast(errorText(failure), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`${candidate.full_name}: ${STAGE_LABEL[assignment.stage]}`}
      description={existing?.marks_by === 'moderator' ? `${existing.entered_by_name || 'HR'} entered these marks for you. You can change them.` : undefined}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="my-assessment" variant="primary" loading={busy}>Save marks</Button>
        </>
      }
    >
      <AssessmentForm
        id="my-assessment"
        header={header}
        initial={inputOf(existing)}
        onSubmit={(input) => void save(input)}
        signature={
          <div className="border-t border-line pt-3">
            <SignaturePad label="Interviewer's signature" saved={current} value={signature} onChange={setSignature} />
            {signature && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-brand-600" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
                Save as my signature, to add it to every form
              </label>
            )}
            {!current && !signature && <p className="mt-1 text-xs text-ink-muted">You can save without signing and sign later.</p>}
          </div>
        }
      />
    </Dialog>
  );
}

export function ProfileDialog({ profile, onClose, onSaved }: { profile: InterviewerDetails; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: profile.full_name, job_title: profile.job_title, department: profile.department });
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await backend.rpc('save_my_details', {
        p_full_name: form.full_name, p_job_title: form.job_title, p_department: form.department, p_signature: signature,
      });
      toast('Your details are saved.');
      onSaved();
      onClose();
    } catch (failure) {
      toast(errorText(failure), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="My details and signature"
      description="These are printed on every interview form you mark."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="my-details" variant="primary" loading={busy}>Save</Button>
        </>
      }
    >
      <form id="my-details" onSubmit={submit} className="space-y-3">
        <TextInput label="Name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Designation (position)" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
          <TextInput label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </div>
        <SignaturePad label="Signature" saved={profile.signature} value={signature ?? ''} onChange={setSignature} />
      </form>
    </Dialog>
  );
}
