import { ClipboardPen, Copy, Download, Link2, PenLine, Plus, Printer, Trash2, UserPlus, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { enteredByText, guestLinkUrl, isFilled, RECOMMENDATION_LABEL, scoreOf, stageAverage, STAGE_LABEL, todayBd, type FormHeader } from '../lib/assessment';
import { downloadAssessments, printAssessments, type PrintableAssessment } from '../lib/assessmentPdf';
import { classNames, dateDmy } from '../lib/format';
import { useStore } from '../lib/store';
import { personName } from '../lib/team';
import type { AssessmentInput, Candidate, CvBucket, InterviewAssessment, InterviewStage, Profile } from '../types';
import { AssessmentForm } from './AssessmentForm';
import { copyText } from './PipelineDialogs';
import { SignaturePad } from './SignaturePad';
import { Avatar, Button, Confirm, Dialog, errorText, IconButton, Select, StatusBadge, TextInput, useToast } from './ui';

const STAGES: InterviewStage[] = ['primary', 'secondary'];

/** People who can sit on a panel: interviewer accounts and staff who can act. */
const panelPeople = (team: Profile[]) => team.filter((p) => p.role === 'interviewer' || p.role === 'admin' || p.role === 'hr');

const roleText = (p: Profile) => (p.role === 'interviewer' ? 'Interviewer' : p.role === 'admin' ? 'Admin' : 'HR');

// ---------------------------------------------------------------------------
// Who interviews: a bucket's primary and final interview panels, and links for guests.
// ---------------------------------------------------------------------------

export function InterviewPanelDialog({ bucket, onClose }: { bucket: CvBucket; onClose: () => void }) {
  return (
    <Dialog
      title={`Interview panel: ${bucket.designation}`}
      description="Interviewers on a panel see this position's candidates when they sign in, and mark each one on the Interview Assessment Form."
      onClose={onClose}
      width="max-w-3xl"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-6">
        {STAGES.map((stage) => <StagePanel key={stage} bucket={bucket} stage={stage} />)}
      </div>
    </Dialog>
  );
}

function StagePanel({ bucket, stage }: { bucket: CvBucket; stage: InterviewStage }) {
  const { panels, team, guestLinks, canWrite, addToPanel, removeFromPanel, createGuestLink, removeGuestLink } = useStore();
  const toast = useToast();
  const [adding, setAdding] = useState('');
  const [linkDay, setLinkDay] = useState(() => (stage === 'primary' && bucket.primary_date && bucket.primary_date >= todayBd() ? bucket.primary_date : todayBd()));
  const [busy, setBusy] = useState(false);
  const members = panels.filter((p) => p.bucket_id === bucket.id && p.stage === stage);
  const available = panelPeople(team).filter((p) => !members.some((m) => m.interviewer_id === p.id));
  const links = guestLinks.filter((l) => l.bucket_id === bucket.id && l.stage === stage);
  const today = todayBd();

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast(done);
    } catch (error) {
      toast(errorText(error), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{STAGE_LABEL[stage]}</h3>
      {members.length === 0 ? (
        <p className="text-sm text-ink-muted">No interviewer yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {members.map((member) => {
            const person = team.find((p) => p.id === member.interviewer_id);
            return (
              <li key={member.id} className="flex items-center gap-3 px-3 py-2">
                <Avatar name={personName(person)} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{personName(person)}</span>
                  <span className="block truncate text-xs text-ink-muted">{[person?.job_title, person?.department].filter(Boolean).join(', ') || (person ? roleText(person) : '')}</span>
                </span>
                {person && !person.signature && <StatusBadge tone="neutral">No saved signature</StatusBadge>}
                {canWrite && (
                  <IconButton
                    label={`Take ${personName(person)} off the ${STAGE_LABEL[stage].toLowerCase()}`}
                    icon={X}
                    disabled={busy}
                    onClick={() => void run(() => removeFromPanel(member.id), `${personName(person)} is off the panel.`)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canWrite && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-60 flex-1">
            <Select label="Add an interviewer" value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Choose…</option>
              {available.map((p) => <option key={p.id} value={p.id}>{personName(p)}{p.job_title ? `, ${p.job_title}` : ''} ({roleText(p)})</option>)}
            </Select>
          </div>
          <Button
            icon={UserPlus}
            disabled={!adding || busy}
            onClick={() => void run(async () => {
              await addToPanel(bucket.id, stage, adding);
              setAdding('');
            }, 'Added to the panel.')}
          >
            Add
          </Button>
        </div>
      )}

      <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
        <p className="text-sm font-medium">Guest interviewers</p>
        <p className="mb-2 text-xs text-ink-muted">
          For someone without an account. They open the link, write their name and designation, sign once and mark the candidates of that day. The link works on that day only.
        </p>
        {links.length > 0 && (
          <ul className="mb-2 space-y-1">
            {links.map((link) => {
              const state = link.valid_on === today ? { text: 'Today', tone: 'good' as const } : link.valid_on > today ? { text: 'Upcoming', tone: 'info' as const } : { text: 'Expired', tone: 'neutral' as const };
              return (
                <li key={link.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link2 className="size-4 text-ink-muted" aria-hidden />
                  <span className="tabular">For {dateDmy(link.valid_on)}</span>
                  <StatusBadge tone={state.tone}>{state.text}</StatusBadge>
                  <span className="text-xs text-ink-muted">by {link.created_by_name || 'HR'}</span>
                  <span className="ml-auto flex gap-1">
                    {link.valid_on >= today && (
                      <Button size="sm" icon={Copy} onClick={() => void copyText(guestLinkUrl(link.token)).then(() => toast('Guest link copied. Send it to the interviewer.'))}>Copy link</Button>
                    )}
                    {canWrite && <IconButton label="Delete this link" icon={Trash2} disabled={busy} onClick={() => void run(() => removeGuestLink(link.id), 'Link deleted. It no longer works.')} />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {canWrite && (
          <div className="flex flex-wrap items-end gap-2">
            <TextInput label="Interview day" type="date" min={today} value={linkDay} onChange={(e) => setLinkDay(e.target.value)} />
            <Button
              icon={Plus}
              disabled={!linkDay || busy}
              onClick={() => void run(async () => {
                const link = await createGuestLink(bucket.id, stage, linkDay);
                await copyText(guestLinkUrl(link.token)).catch(() => undefined);
              }, 'Guest link made and copied. Send it to the interviewer.')}
            >
              Make guest link
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The forms on a candidate's card: one row per interviewer, with the score, Download and Print.
// ---------------------------------------------------------------------------

/** Reached this interview: its forms can be filled. */
export const interviewReached = (c: Candidate, stage: InterviewStage) =>
  stage === 'primary' ? c.message_status === 'message_done' : c.secondary_status !== 'pending';

function headerFor(c: Candidate, bucket: CvBucket | undefined, stage: InterviewStage, who: { name: string; designation: string; department: string }): FormHeader {
  return {
    designation: bucket?.designation ?? '',
    department: bucket?.department ?? '',
    section: bucket?.section ?? '',
    subsection: bucket?.subsection ?? '',
    unit: bucket?.unit ?? '',
    company: bucket?.company ?? '',
    candidateName: c.full_name,
    stage,
    date: stage === 'primary' ? c.primary_date : c.secondary_date,
    interviewerName: who.name,
    interviewerDesignation: who.designation,
    interviewerDepartment: who.department,
  };
}

export function printableOf(a: InterviewAssessment, c: Candidate, bucket: CvBucket | undefined, groupName: string): PrintableAssessment {
  return {
    groupName,
    header: headerFor(c, bucket, a.stage, { name: a.interviewer_name, designation: a.interviewer_designation, department: a.interviewer_department }),
    assessment: a,
  };
}

type Editing =
  | { kind: 'marks'; stage: InterviewStage; interviewerId: string | null; existing?: InterviewAssessment }
  | { kind: 'sign'; assessment: InterviewAssessment }
  | { kind: 'view'; assessment: InterviewAssessment }
  | { kind: 'delete'; assessment: InterviewAssessment };

export function AssessmentsSection({ candidate }: { candidate: Candidate }) {
  const stages = STAGES.filter((stage) => interviewReached(candidate, stage));
  const [editing, setEditing] = useState<Editing | null>(null);
  if (stages.length === 0) return null;
  return (
    <>
      {stages.map((stage) => <StageForms key={stage} candidate={candidate} stage={stage} onEdit={setEditing} />)}
      {editing?.kind === 'marks' && (
        <ModeratorMarkDialog candidate={candidate} stage={editing.stage} interviewerId={editing.interviewerId} existing={editing.existing} onClose={() => setEditing(null)} />
      )}
      {editing?.kind === 'sign' && <SignDialog assessment={editing.assessment} onClose={() => setEditing(null)} />}
      {editing?.kind === 'view' && <ViewDialog candidate={candidate} assessment={editing.assessment} onClose={() => setEditing(null)} />}
      {editing?.kind === 'delete' && <DeleteFormDialog assessment={editing.assessment} onClose={() => setEditing(null)} />}
    </>
  );
}

function StageForms({ candidate, stage, onEdit }: { candidate: Candidate; stage: InterviewStage; onEdit: (editing: Editing) => void }) {
  const { assessments, panels, team, buckets, settings, canWrite, isAdmin } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const bucket = buckets.find((b) => b.id === candidate.bucket_id);
  const forms = assessments.filter((a) => a.candidate_id === candidate.id && a.stage === stage);
  const filled = forms.filter(isFilled);
  // Panel members who have not filled their form yet.
  const missing = panels
    .filter((p) => p.bucket_id === candidate.bucket_id && p.stage === stage)
    .filter((p) => !filled.some((a) => a.interviewer_id === p.interviewer_id));
  const average = stageAverage(forms);

  async function output(kind: 'download' | 'print', list: InterviewAssessment[], key: string) {
    setBusy(key);
    try {
      const items = list.map((a) => printableOf(a, candidate, bucket, settings.group_name));
      await (kind === 'download' ? downloadAssessments(items) : printAssessments(items));
    } catch (error) {
      toast(`The PDF could not be made: ${errorText(error)}`, 'bad');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mt-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <h4 className="text-xs font-semibold text-ink-soft">{STAGE_LABEL[stage]}: assessment forms</h4>
        {average.percent !== null && (
          <span className="text-xs text-ink-soft">
            Average of {average.forms} form{average.forms === 1 ? '' : 's'}: <strong className="tabular text-ink">{average.percent}%</strong> ({average.obtained}/50)
          </span>
        )}
        {filled.length > 1 && (
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" icon={Download} loading={busy === 'all-download'} onClick={() => void output('download', filled, 'all-download')}>Download all</Button>
            <Button size="sm" variant="ghost" icon={Printer} loading={busy === 'all-print'} onClick={() => void output('print', filled, 'all-print')}>Print all</Button>
          </span>
        )}
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {filled.map((a, index) => {
          const score = scoreOf(a.ratings);
          const unsigned = !a.signature;
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="w-6 text-xs text-ink-muted">{index + 1}.</span>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit({ kind: 'view', assessment: a })}>
                <span className="block truncate font-medium hover:underline">{a.interviewer_name || 'Name not given'}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {[a.interviewer_designation, a.marks_by !== 'interviewer' ? enteredByText(a) : ''].filter(Boolean).join(' · ')}
                </span>
              </button>
              <span className="tabular text-sm"><strong>{score.obtained}/50</strong> <span className="text-ink-soft">({score.percent}%)</span></span>
              <span className={classNames('w-20 text-xs font-medium', a.recommendation === 'employ' ? 'text-emerald-800' : a.recommendation === 'turn_down' ? 'text-red-800' : 'text-ink-muted')}>
                {RECOMMENDATION_LABEL[a.recommendation]}
              </span>
              {unsigned && <StatusBadge tone="warning">Not signed</StatusBadge>}
              <span className="flex gap-0.5">
                <IconButton label={`Download ${a.interviewer_name}'s form`} icon={Download} disabled={busy !== ''} onClick={() => void output('download', [a], `${a.id}-d`)} />
                <IconButton label={`Print ${a.interviewer_name}'s form`} icon={Printer} disabled={busy !== ''} onClick={() => void output('print', [a], `${a.id}-p`)} />
                {canWrite && a.marks_by === 'moderator' && (
                  <IconButton label="Change the marks you entered" icon={ClipboardPen} onClick={() => onEdit({ kind: 'marks', stage, interviewerId: a.interviewer_id, existing: a })} />
                )}
                {canWrite && (unsigned || !a.interviewer_name || !a.interviewer_designation || a.marks_by === 'moderator') && (
                  <IconButton label="Add name or signature" icon={PenLine} onClick={() => onEdit({ kind: 'sign', assessment: a })} />
                )}
                {isAdmin && <IconButton label="Delete this form" icon={Trash2} onClick={() => onEdit({ kind: 'delete', assessment: a })} />}
              </span>
            </li>
          );
        })}
        {missing.map((member) => {
          const person = team.find((p) => p.id === member.interviewer_id);
          const blank = forms.find((a) => a.interviewer_id === member.interviewer_id);
          return (
            <li key={member.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="w-6" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{personName(person)}</span>
                <span className="block truncate text-xs text-ink-muted">{person?.job_title}</span>
              </span>
              <StatusBadge tone="neutral">Not filled</StatusBadge>
              {canWrite && (
                <Button size="sm" icon={ClipboardPen} onClick={() => onEdit({ kind: 'marks', stage, interviewerId: member.interviewer_id, existing: blank?.marks_by === 'moderator' ? blank : undefined })}>
                  Enter marks
                </Button>
              )}
            </li>
          );
        })}
        {filled.length === 0 && missing.length === 0 && (
          <li className="px-3 py-2 text-sm text-ink-muted">No form yet. Put interviewers on this position's panel from the CV bucket page.</li>
        )}
      </ul>
      {canWrite && (
        <Button size="sm" variant="ghost" icon={Plus} className="mt-1" onClick={() => onEdit({ kind: 'marks', stage, interviewerId: null })}>
          Enter marks for another interviewer
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HR (the moderator) enters marks for an interviewer who could not.
// ---------------------------------------------------------------------------

type SignatureChoice = 'none' | 'profile' | 'draw';

function ModeratorMarkDialog({ candidate, stage, interviewerId, existing, onClose }: {
  candidate: Candidate;
  stage: InterviewStage;
  interviewerId: string | null;
  existing?: InterviewAssessment;
  onClose: () => void;
}) {
  const { team, panels, buckets, saveModeratorAssessment } = useStore();
  const toast = useToast();
  const bucket = buckets.find((b) => b.id === candidate.bucket_id);
  const [who, setWho] = useState<string>(interviewerId ?? (existing ? '' : ''));
  const [other, setOther] = useState({
    name: existing && !existing.interviewer_id ? existing.interviewer_name : '',
    designation: existing && !existing.interviewer_id ? existing.interviewer_designation : '',
    department: existing && !existing.interviewer_id ? existing.interviewer_department : '',
  });
  const [choice, setChoice] = useState<SignatureChoice>('none');
  const [drawn, setDrawn] = useState('');
  const [busy, setBusy] = useState(false);
  const fixed = interviewerId !== null || existing !== undefined;
  const person = team.find((p) => p.id === who);
  const onPanel = useMemo(() => new Set(panels.filter((p) => p.bucket_id === candidate.bucket_id && p.stage === stage).map((p) => p.interviewer_id)), [panels, candidate.bucket_id, stage]);
  const people = panelPeople(team).sort((a, b) => Number(onPanel.has(b.id)) - Number(onPanel.has(a.id)));
  const name = person ? personName(person) : other.name;

  async function save(input: AssessmentInput) {
    if (!person && other.name.trim().length < 2) {
      toast("Choose the interviewer, or write the name of someone without an account.", 'bad');
      return;
    }
    if (choice === 'draw' && !drawn) {
      toast('Sign in the box, or choose to leave the signature empty.', 'bad');
      return;
    }
    setBusy(true);
    try {
      await saveModeratorAssessment({
        candidateId: candidate.id,
        stage,
        interviewerId: person?.id ?? null,
        name: other.name,
        designation: other.designation,
        department: other.department,
        input,
        signature: choice === 'profile' ? 'profile' : choice === 'draw' ? drawn : '',
      });
      toast(`${name}: marks saved for ${candidate.full_name}.`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Enter marks for an interviewer: ${candidate.full_name}`}
      description="For an interviewer who could not enter the marks. The form will say you entered them on their behalf. The interviewer can still change them later; you cannot change marks an interviewer entered."
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="moderator-assessment" variant="primary" loading={busy}>Save marks</Button>
        </>
      }
    >
      {!fixed && (
        <div className="mb-4 space-y-3 rounded-xl border border-line p-3">
          <Select label="Interviewer" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Someone without an account…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{personName(p)}{p.job_title ? `, ${p.job_title}` : ''}{onPanel.has(p.id) ? ' (on this panel)' : ''}</option>)}
          </Select>
          {!person && (
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput label="Name" required value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} />
              <TextInput label="Designation" value={other.designation} onChange={(e) => setOther({ ...other, designation: e.target.value })} />
              <TextInput label="Department" value={other.department} onChange={(e) => setOther({ ...other, department: e.target.value })} />
            </div>
          )}
        </div>
      )}
      <AssessmentForm
        id="moderator-assessment"
        header={headerFor(candidate, bucket, stage, {
          name,
          designation: person ? person.job_title : other.designation,
          department: person ? person.department : other.department,
        })}
        initial={existing && { ratings: existing.ratings, strengths: existing.strengths, weaknesses: existing.weaknesses, comment: existing.comment, recommendation: existing.recommendation }}
        onSubmit={(input) => void save(input)}
        signature={
          <fieldset className="space-y-2 border-t border-line pt-3">
            <legend className="text-sm font-semibold">Interviewer's signature</legend>
            {existing?.signature && <p className="text-xs text-ink-muted">Signed already. Leaving it as it is keeps that signature.</p>}
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="sig" className="accent-brand-600" checked={choice === 'none'} onChange={() => setChoice('none')} />
              {existing?.signature ? 'Leave it as it is' : 'Leave it empty (the interviewer can sign later)'}
            </label>
            {person?.signature && (
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="sig" className="accent-brand-600" checked={choice === 'profile'} onChange={() => setChoice('profile')} />
                Add {personName(person)}'s saved signature
                <img src={person.signature} alt="" className="h-8 rounded border border-line bg-white" />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="sig" className="accent-brand-600" checked={choice === 'draw'} onChange={() => setChoice('draw')} />
              The interviewer signs here
            </label>
            {choice === 'draw' && <SignaturePad label="Signature" value={drawn} onChange={setDrawn} />}
          </fieldset>
        }
      />
    </Dialog>
  );
}

/** Adds a missing name, designation or signature to any form; on a form HR entered, replaces the signature too. */
function SignDialog({ assessment, onClose }: { assessment: InterviewAssessment; onClose: () => void }) {
  const { team, signAssessment } = useStore();
  const toast = useToast();
  const person = team.find((p) => p.id === assessment.interviewer_id);
  const [name, setName] = useState(assessment.interviewer_name);
  const [designation, setDesignation] = useState(assessment.interviewer_designation);
  const [choice, setChoice] = useState<SignatureChoice | 'remove'>(person?.signature && !assessment.signature ? 'profile' : 'draw');
  const [drawn, setDrawn] = useState('');
  const [busy, setBusy] = useState(false);
  const canReplace = assessment.marks_by === 'moderator';
  const canSign = !assessment.signature || canReplace;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (canSign && choice === 'draw' && !drawn && !(!assessment.interviewer_name || !assessment.interviewer_designation)) {
      toast('Sign in the box first.', 'bad');
      return;
    }
    setBusy(true);
    try {
      const signature = !canSign ? '' : choice === 'profile' ? 'profile' : choice === 'draw' ? drawn : '';
      await signAssessment(assessment.id, { name, designation, signature: choice === 'remove' ? '' : signature });
      toast('Form updated.');
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Complete the form: ${assessment.interviewer_name || 'interviewer'}`}
      description={canReplace ? 'You entered these marks, so you can add, change or remove the signature.' : 'You can add what the interviewer left out. Their marks stay as they entered them.'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="sign-assessment" variant="primary" loading={busy}>Save</Button>
        </>
      }
    >
      <form id="sign-assessment" onSubmit={submit} className="space-y-3">
        {(!assessment.interviewer_name || !assessment.interviewer_designation) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Interviewer's name" disabled={Boolean(assessment.interviewer_name)} value={name} onChange={(e) => setName(e.target.value)} />
            <TextInput label="Designation" disabled={Boolean(assessment.interviewer_designation)} value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </div>
        )}
        {canSign ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Signature</legend>
            {assessment.signature && (
              <img src={assessment.signature} alt="Current signature" className="h-14 rounded-lg border border-line bg-white" />
            )}
            {person?.signature && (
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="sign" className="accent-brand-600" checked={choice === 'profile'} onChange={() => setChoice('profile')} />
                {personName(person)}'s saved signature
                <img src={person.signature} alt="" className="h-8 rounded border border-line bg-white" />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="sign" className="accent-brand-600" checked={choice === 'draw'} onChange={() => setChoice('draw')} />
              The interviewer signs here
            </label>
            {canReplace && assessment.signature && (
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="sign" className="accent-brand-600" checked={choice === 'remove'} onChange={() => setChoice('remove')} />
                Remove the signature
              </label>
            )}
            {choice === 'draw' && <SignaturePad label="Signature" value={drawn} onChange={setDrawn} />}
          </fieldset>
        ) : (
          <p className="text-sm text-ink-muted">This form is signed.</p>
        )}
      </form>
    </Dialog>
  );
}

function ViewDialog({ candidate, assessment, onClose }: { candidate: Candidate; assessment: InterviewAssessment; onClose: () => void }) {
  const { buckets } = useStore();
  const bucket = buckets.find((b) => b.id === candidate.bucket_id);
  return (
    <Dialog
      title={`${assessment.interviewer_name}: ${STAGE_LABEL[assessment.stage]}`}
      description={enteredByText(assessment)}
      onClose={onClose}
      width="max-w-3xl"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <AssessmentForm
        id="view-assessment"
        readOnly
        header={headerFor(candidate, bucket, assessment.stage, { name: assessment.interviewer_name, designation: assessment.interviewer_designation, department: assessment.interviewer_department })}
        initial={assessment}
        onSubmit={() => undefined}
        signature={
          <div className="border-t border-line pt-3">
            <p className="mb-1 text-xs font-medium text-ink-soft">Interviewer's signature</p>
            {assessment.signature ? <img src={assessment.signature} alt="Signature" className="h-16 rounded-lg border border-line bg-white" /> : <p className="text-sm text-ink-muted">Not signed</p>}
          </div>
        }
      />
    </Dialog>
  );
}

function DeleteFormDialog({ assessment, onClose }: { assessment: InterviewAssessment; onClose: () => void }) {
  const { removeAssessment } = useStore();
  const toast = useToast();
  return (
    <Confirm
      title={`Delete ${assessment.interviewer_name}'s form?`}
      body="The marks are removed from the candidate's average. This cannot be undone."
      confirmLabel="Delete form"
      danger
      onCancel={onClose}
      onConfirm={async () => {
        try {
          await removeAssessment(assessment.id);
          toast('Form deleted.');
        } catch (error) {
          toast(errorText(error), 'bad');
        }
        onClose();
      }}
    />
  );
}
