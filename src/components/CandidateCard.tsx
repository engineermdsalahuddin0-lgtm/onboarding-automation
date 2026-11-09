import {
  AlertTriangle,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Download,
  ExternalLink,
  Eye,
  FilePen,
  FileQuestion,
  FileText,
  Lock,
  LockOpen,
  MessageSquareHeart,
  Pencil,
  PhoneCall,
  Star,
  Timer,
  Trash2,
  Undo2,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { backend } from '../lib/backend';
import { classNames, dateMedium, dateTime, duration, money, whenText } from '../lib/format';
import { CATEGORY_LABELS, correctableSteps, EDIT_STEP_LABELS, isLocked, JOINING, openReviewStage, setCategory, shortlist, stageOf, stepBack, unlockDecision } from '../lib/pipeline';
import { usePresence } from '../lib/presence';
import { useFileUrls, useReviewTimer, useStore } from '../lib/store';
import { handlerNames, personName, processTeam } from '../lib/team';
import { HelpTip, useGuide } from './Guide';
import type { Candidate, CandidateEvent, CvReviewSession, EditStep, InterviewerScore, MessageLogEntry } from '../types';
import { CorrectionsStrip, RequestCorrectionDialog } from './Corrections';
import { HandoverDialog } from './HandoverDialog';
import { CallDialog, DecisionDialog, InterviewResultDialog, JoiningCallDialog, JoiningDialog, ReviewLinkDialog, ScheduleDialog, ScreeningRejectDialog } from './PipelineDialogs';
import { ProcessBar } from './ProcessBar';
import { fromDraft, ProfileEditor, sameDraft, toDraft, type ProfileDraft } from './ProfileEditor';
import { Avatar, Button, Confirm, Dialog, errorText, RecommendationStars, Spinner, StatusBadge, Tabs, useToast } from './ui';

type Tab = 'details' | 'cv' | 'text' | 'history';

const FIELD_NAMES: Record<string, string> = {
  received: 'CV received',
  screening_status: 'CV review',
  call_status: 'Phone call',
  message_status: 'Primary schedule',
  primary_status: 'Primary interview',
  secondary_message_status: 'Final schedule',
  secondary_status: 'Final interview',
  selection_category: 'Selection list',
  final_decision: 'Final decision',
  joining_status: 'Joining',
  bucket_id: 'Moved bucket',
  assigned_to: 'Handed to',
};

const VALUE_NAMES: Record<string, string> = {
  new: 'New',
  shortlisted: 'Selected for the process',
  rejected: 'Rejected',
  pending: 'Pending',
  confirm: 'Candidate confirmed',
  confirmed: 'Confirmed',
  followup: 'Follow-up',
  reject: 'Candidate rejected',
  not_sent: 'Not set',
  message_done: 'Set',
  scheduled: 'Scheduled',
  selected: 'Selected',
  offer_sent: 'Confirmation letter sent',
  accepted: 'Joining confirmed',
  joined: 'Joined',
  declined: 'Did not confirm',
  merit: 'Merit',
  waiting: 'Waiting',
};

function Facts({ items }: { items: [string, string | number | null | undefined][] }) {
  const present = items.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (present.length === 0) return null;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {present.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-ink-muted">{label}</dt>
          <dd className="text-sm break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-3">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function PanelTable({ title, panel }: { title: string; panel: InterviewerScore[] }) {
  if (panel.length === 0) return null;
  return (
    <table className="mt-3 w-full text-sm">
      <caption className="mb-1 text-left text-xs text-ink-muted">{title}</caption>
      <thead>
        <tr className="text-left text-xs text-ink-muted">
          <th scope="col" className="py-1 font-medium">Interviewer</th>
          <th scope="col" className="py-1 text-right font-medium">Score</th>
          <th scope="col" className="py-1 pl-6 font-medium">Recommended</th>
        </tr>
      </thead>
      <tbody>
        {panel.map((entry, index) => (
          <tr key={index} className="border-t border-line">
            <td className="py-1.5">{entry.name}</td>
            <td className="tabular py-1.5 text-right">{entry.score}</td>
            <td className="py-1.5 pl-6">
              <span className="inline-flex items-center gap-1.5 text-xs">
                <Star className={classNames('size-3.5', entry.referred ? 'fill-amber-500 text-amber-500' : 'text-ink-muted')} aria-hidden />
                {entry.referred ? 'Yes' : 'No'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DetailsTab({ c }: { c: Candidate }) {
  const { reviews } = useStore();
  const feedback = reviews.filter((review) => review.candidate_id === c.id && review.submitted_at);
  return (
    <div className="space-y-4">
      <Facts
        items={[
          ['Mobile', c.phone],
          ['Other mobile', c.alt_phone],
          ['Email', c.email],
          ['Present address', c.address],
          ['Current role', [c.current_designation, c.current_company].filter(Boolean).join(', ')],
          ['Industry', c.industry],
          ['Total experience', c.total_experience_years !== null ? `${c.total_experience_years} years` : ''],
          ['Present salary', c.present_salary],
          ['Expected salary', c.expected_salary],
          ['Notice period', c.notice_period],
          ['LinkedIn', c.linkedin],
        ]}
      />
      {(c.screening_status !== 'new' || c.call_status !== 'pending') && (
        <Section title="Call and interviews">
          <Facts
            items={[
              ['Reason for rejection', c.screening_note],
              ['Called on', whenText(c.call_date, c.call_time)],
              ['Called by', c.called_by],
              ['Candidate confirmed on', whenText(c.confirmed_date, c.confirmed_time)],
              ['Candidate rejected on', whenText(c.call_rejected_date, c.call_rejected_time)],
              ['Call again on', whenText(c.followup_on, c.followup_time)],
              ['Call note', c.call_note],
              ['Primary interview on', whenText(c.primary_date, c.primary_time)],
              ['Primary score', c.primary_score !== null ? `${c.primary_score}/10` : ''],
              ['Primary feedback', c.primary_feedback],
              ['Final interview on', whenText(c.secondary_date, c.secondary_time)],
              ['Final score', c.secondary_score !== null ? `${c.secondary_score}/10` : ''],
              ['Final interview remarks', c.secondary_feedback],
              ['Selection list', c.selection_category ? CATEGORY_LABELS[c.selection_category] : ''],
              ['Selected on', c.final_decision === 'confirmed' ? whenText(c.decision_date, c.decision_time) : ''],
              ['Offered joining', c.final_decision === 'confirmed' ? whenText(c.joining_date, c.joining_time) : ''],
              ['Called for joining on', whenText(c.joining_call_date, c.joining_call_time)],
              ['Candidate confirmed joining on', whenText(c.joining_confirmed_date, c.joining_confirmed_time)],
              ['Joining remarks', c.joining_remarks],
              ['Offered salary', money(c.offered_salary)],
            ]}
          />
          <PanelTable title="Primary interview panel" panel={c.primary_panel} />
          <PanelTable title="Final interview panel" panel={c.secondary_panel} />
        </Section>
      )}
      {c.career_summary && <Section title="Summary"><p className="text-sm whitespace-pre-wrap">{c.career_summary}</p></Section>}
      {c.experience.length > 0 && (
        <Section title="Work experience">
          <ul className="space-y-3">
            {c.experience.map((item, index) => (
              <li key={index} className="text-sm">
                <p className="font-medium">{item.role || 'Role not stated'}{item.company ? `, ${item.company}` : ''}</p>
                {item.duration && <p className="text-xs text-ink-muted">{item.duration}</p>}
                {item.details && <p className="mt-1 whitespace-pre-wrap text-ink-soft">{item.details}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {c.education.length > 0 && (
        <Section title="Education">
          <ul className="space-y-2">
            {c.education.map((item, index) => (
              <li key={index} className="text-sm">
                <p className="font-medium">{item.degree}</p>
                <p className="text-xs text-ink-muted">{[item.institution, item.board, item.result, item.year].filter(Boolean).join(' · ')}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {c.skills.length > 0 && (
        <Section title="Skills">
          <ul className="flex flex-wrap gap-1.5">
            {c.skills.map((skill) => <li key={skill} className="rounded-full bg-hover px-2.5 py-0.5 text-xs">{skill}</li>)}
          </ul>
        </Section>
      )}
      {c.training.length > 0 && (
        <Section title="Training">
          <ul className="space-y-1 text-sm">
            {c.training.map((item, index) => <li key={index}>{[item.title, item.institute, item.year].filter(Boolean).join(' · ')}</li>)}
          </ul>
        </Section>
      )}
      {c.languages.length > 0 && <Section title="Languages"><p className="text-sm">{c.languages.join(', ')}</p></Section>}
      <Section title="Personal details">
        <Facts
          items={[
            ["Father's name", c.father_name],
            ["Mother's name", c.mother_name],
            ["Spouse's name", c.spouse_name],
            ['Date of birth', dateMedium(c.date_of_birth)],
            ['Gender', c.gender],
            ['Marital status', c.marital_status],
            ['Religion', c.religion],
            ['Nationality', c.nationality],
            ['Blood group', c.blood_group],
            ['NID', c.national_id],
            ['TIN', c.tin_no],
            ['Passport', c.passport_no],
            ['Permanent address', c.permanent_address],
          ]}
        />
      </Section>
      {c.references_list.length > 0 && (
        <Section title="References">
          <ul className="space-y-2 text-sm">
            {c.references_list.map((item, index) => (
              <li key={index}>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-ink-muted">{[item.designation, item.organization, item.phone, item.email].filter(Boolean).join(' · ')}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {feedback.length > 0 && (
        <Section title="Candidate's feedback on the interview">
          <ul className="space-y-2 text-sm">
            {feedback.map((review) => (
              <li key={review.id}>
                <p className="font-medium">{review.stage === 'primary' ? 'Primary' : 'Final'} interview: {review.overall}/5</p>
                {review.comments && <p className="text-ink-soft">{review.comments}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function CvTab({ c }: { c: Candidate }) {
  const urls = useFileUrls([c.cv_path]);
  const url = c.cv_path ? urls[c.cv_path] : undefined;
  if (!c.cv_path) return <p className="py-8 text-center text-sm text-ink-muted">No original file was uploaded for this candidate.</p>;
  if (!url) return <Spinner label="Opening CV" />;
  const isPdf = c.cv_file_name.toLowerCase().endsWith('.pdf') || c.cv_path.endsWith('.pdf');
  const isImage = /\.(jpe?g|png|webp)$/i.test(c.cv_path);
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex gap-2">
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-xs font-medium hover:bg-hover"><ExternalLink className="size-3.5" aria-hidden /> Open in a new tab</a>
        <a href={url} download={c.cv_file_name || 'cv'} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-xs font-medium hover:bg-hover"><Download className="size-3.5" aria-hidden /> Download</a>
      </div>
      {isPdf && <iframe title={`CV of ${c.full_name}`} src={url} className="min-h-[70vh] w-full flex-1 rounded-lg border border-line" />}
      {isImage && <img src={url} alt={`CV of ${c.full_name}`} className="w-full rounded-lg border border-line" />}
      {!isPdf && !isImage && <p className="py-8 text-center text-sm text-ink-muted">Word files cannot be previewed here. Download the file to read it.</p>}
    </div>
  );
}

function TextTab({ c }: { c: Candidate }) {
  const [full, setFull] = useState<Candidate | null>(null);
  useEffect(() => {
    void backend.get<Candidate>('candidates', { id: c.id }).then(setFull);
  }, [c.id]);
  if (!full) return <Spinner />;
  const sections = Object.entries(full.sections ?? {}).filter(([, text]) => text.trim());
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">Everything read from the CV, including what did not fit a field above.</p>
      {sections.map(([heading, text]) => (
        <Section key={heading} title={heading}><p className="text-sm whitespace-pre-wrap">{text}</p></Section>
      ))}
      <details className="border-t border-line pt-3">
        <summary className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Complete text</summary>
        <pre className="mt-2 font-sans text-sm whitespace-pre-wrap">{full.raw_text || 'No text was read from this CV.'}</pre>
      </details>
    </div>
  );
}

function HistoryTab({ c }: { c: Candidate }) {
  const [events, setEvents] = useState<CandidateEvent[] | null>(null);
  const [messages, setMessages] = useState<MessageLogEntry[]>([]);
  const [sessions, setSessions] = useState<CvReviewSession[]>([]);
  useEffect(() => {
    void Promise.all([
      backend.list<CandidateEvent>('candidate_events', { match: { candidate_id: c.id }, order: { column: 'created_at', ascending: false } }),
      backend.list<MessageLogEntry>('message_log', { match: { candidate_id: c.id }, order: { column: 'created_at', ascending: false } }),
      backend.list<CvReviewSession>('cv_review_sessions', { match: { candidate_id: c.id }, order: { column: 'started_at', ascending: false } }),
    ]).then(([eventRows, messageRows, sessionRows]) => {
      setEvents(eventRows);
      setMessages(messageRows);
      setSessions(sessionRows);
    });
  }, [c.id, c.updated_at, c.screening_status, c.call_status, c.message_status, c.primary_status, c.secondary_status, c.final_decision, c.joining_status]);
  if (!events) return <Spinner />;
  return (
    <div className="space-y-4">
      <ol className="space-y-2.5">
        {events.map((event) => (
          <li key={event.id} className={classNames('border-l-2 pl-3 text-sm', event.field === 'correction' ? 'border-amber-400' : 'border-line')}>
            {event.field === 'correction' ? (
              <>
                <p><span className="font-medium">Correction, approved: {EDIT_STEP_LABELS[event.from_value as EditStep] ?? event.from_value}</span></p>
                <ul className="mt-0.5 text-xs text-ink-soft">
                  {(event.to_value ?? '').split('; ').filter(Boolean).map((change) => <li key={change} className="break-words">{change.replace(' -> ', ' → ')}</li>)}
                </ul>
              </>
            ) : (
              <p>
                <span className="font-medium">{FIELD_NAMES[event.field] ?? event.field}</span>
                {event.to_value && event.field !== 'bucket_id' && <>: {VALUE_NAMES[event.to_value] ?? event.to_value}</>}
              </p>
            )}
            <p className="text-xs text-ink-muted">{dateTime(event.created_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</p>
          </li>
        ))}
        {events.length === 0 && <li className="text-sm text-ink-muted">No changes recorded yet.</li>}
      </ol>
      {sessions.length > 0 && (
        <Section title={`CV reviews: ${duration(c.review_seconds)} in total`}>
          <ul className="space-y-1.5 text-sm">
            {sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap justify-between gap-x-4">
                <span className="tabular font-medium">{duration(session.seconds)}</span>
                <span className="text-xs text-ink-muted">{dateTime(session.started_at)}{session.reviewer_name ? ` · ${session.reviewer_name}` : ''}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {messages.length > 0 && (
        <Section title="Messages">
          <ul className="space-y-2.5">
            {messages.map((message) => (
              <li key={message.id} className="text-sm">
                <p className="whitespace-pre-wrap text-ink-soft">{message.body}</p>
                <p className="text-xs text-ink-muted">{message.channel} · {dateTime(message.created_at)}{message.sent_by ? ` · ${message.sent_by}` : ''}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

type StepModal =
  | { kind: 'screening' }
  | { kind: 'handover' }
  | { kind: 'reassign' }
  | { kind: 'call'; status: 'confirm' | 'followup' | 'reject' }
  | { kind: 'schedule'; stage: 'primary' | 'secondary' }
  | { kind: 'result'; stage: 'primary' | 'secondary'; result: 'selected' | 'rejected' }
  | { kind: 'decision'; decision: 'confirmed' | 'rejected' }
  | { kind: 'review'; stage: 'primary' | 'secondary' }
  | { kind: 'joining' }
  | { kind: 'joiningCall' }
  | { kind: 'unlock' }
  | { kind: 'requestCorrection' };

type PanelTone = 'current' | 'good' | 'bad' | 'muted';

const PANEL: Record<PanelTone, string> = {
  current: 'border-brand-300 bg-brand-50',
  good: 'border-brand-300 bg-brand-50',
  bad: 'border-red-200 bg-red-50',
  muted: 'border-line bg-canvas',
};

/** What this step asks of HR: one panel, only the choices that make sense right now. */
function NextStep({ c, open }: { c: Candidate; open: (modal: StepModal) => void }) {
  const { canWrite, canScreen, canProcess, isAdmin, team, user, buckets, updateCandidate } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  // Undoing a step is for whoever does that step: the screening desk for the CV review, the process team after it.
  const back = stepBack(c);
  const previous = back && ('screening_status' in back.patch ? canScreen : canProcess) ? back : null;
  // A new CV is the screening desk's to decide; every step after the handover is the process team's.
  const mine = c.screening_status === 'new' ? canScreen : canProcess;
  const handOver = () => {
    if (processTeam(team).some((p) => p.id !== user?.id)) open({ kind: 'handover' });
    else run(shortlist({ by: user?.full_name || user?.email || '' }), `${c.full_name} selected. Next: the phone call.`);
  };

  const run = (patch: Partial<Candidate>, done: string) =>
    void updateCandidate(c.id, patch).then(() => toast(done), (error) => toast(errorText(error), 'bad'));

  let tone: PanelTone = 'current';
  let icon = ClipboardList;
  let title = '';
  let body: ReactNode = null;
  let actions: ReactNode = null;
  // What the buttons of this step mean, for the ? beside the title.
  let tip = '';

  const reject = (onClick: () => void, label = 'Reject') => <Button variant="danger" icon={X} onClick={onClick}>{label}</Button>;

  if (c.final_decision === 'confirmed') {
    tone = 'good';
    icon = Lock;
    // The joining call comes next while the candidate is still to join: it records the day they confirm.
    const joiningOpen = c.joining_status === 'offer_sent' || c.joining_status === 'accepted';
    const needsCall = c.joining_status === 'offer_sent';
    title = `${JOINING[c.joining_status].label}. Process locked.${needsCall ? (c.joining_call_date ? ' Called for joining, no day confirmed yet.' : ' Next: call for joining.') : ''}`;
    const dates: [string, string][] = [
      ['Selected on', whenText(c.decision_date, c.decision_time)],
      ['Offered joining', whenText(c.joining_date, c.joining_time)],
      ...(c.joining_call_date ? [['Called for joining', whenText(c.joining_call_date, c.joining_call_time)] as [string, string]] : []),
      ...(c.joining_confirmed_date ? [['Candidate confirmed joining', whenText(c.joining_confirmed_date, c.joining_confirmed_time)] as [string, string]] : []),
    ];
    body = (
      <span className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
        {dates.map(([label, value]) => (
          <span key={label} className="block">{label} <strong className="tabular">{value}</strong></span>
        ))}
        {c.joining_remarks && <span className="block whitespace-pre-wrap sm:col-span-2">Remarks: <strong className="font-medium">{c.joining_remarks}</strong></span>}
      </span>
    );
    actions = (
      <>
        {canProcess && joiningOpen && (
          <Button variant={needsCall ? 'primary' : 'secondary'} icon={PhoneCall} onClick={() => open({ kind: 'joiningCall' })}>
            {c.joining_call_date ? 'Change joining call' : 'Call for joining'}
          </Button>
        )}
        <Button variant={needsCall && canProcess ? 'secondary' : 'primary'} icon={FileText} onClick={() => navigate(`/selected/${c.id}/documents`)}>Letter and joining pack</Button>
        {canProcess && <Button icon={Pencil} onClick={() => open({ kind: 'joining' })}>Joining details</Button>}
      </>
    );
  } else if (c.final_decision === 'rejected') {
    tone = 'bad';
    icon = Lock;
    title = 'Rejected. Process locked.';
    body = <>Rejected on <strong className="tabular">{whenText(c.decision_date, c.decision_time)}</strong> · Informed on <strong className="tabular">{whenText(c.informed_date, c.informed_time)}</strong></>;
  } else if (c.screening_status === 'rejected') {
    tone = 'bad';
    icon = X;
    title = 'Rejected at CV review';
    body = c.screening_note || 'The process stopped here.';
  } else if (c.screening_status === 'new') {
    title = 'Review this CV';
    body = canScreen ? 'Select to hand it over to the process team, or reject.' : 'Waiting for the CV screening desk to select or reject it.';
    tip = 'Select accepts the CV: it goes to the process team, to one person or everyone, for the phone call. Reject stops the process here and asks for the reason. Both are kept in History with your name and the time.';
    actions = (
      <>
        <Button variant="primary" icon={Check} onClick={handOver}>Select</Button>
        {reject(() => open({ kind: 'screening' }))}
      </>
    );
  } else if (c.call_status === 'reject') {
    tone = 'bad';
    icon = X;
    title = 'Candidate rejected on the call';
    body = [c.call_rejected_date ? `On ${whenText(c.call_rejected_date, c.call_rejected_time)}.` : '', c.call_note].filter(Boolean).join(' ') || 'The process stopped here.';
  } else if (c.call_status === 'pending' || c.call_status === 'followup') {
    icon = PhoneCall;
    title = c.call_status === 'followup' ? 'Call again' : 'Call the candidate';
    tip = 'Candidate confirmed: they want to come for an interview. Candidate rejected: they turned the job down, and the process stops. Follow up: no answer yet; choose when to call again.';
    body = c.call_status === 'followup' && c.followup_on ? `Call again on ${whenText(c.followup_on, c.followup_time)}.` : c.phone ? <a className="tabular underline" href={`tel:${c.phone}`}>{c.phone}</a> : 'No mobile on record.';
    actions = (
      <>
        <Button variant="primary" icon={Check} onClick={() => open({ kind: 'call', status: 'confirm' })}>Candidate confirmed</Button>
        {reject(() => open({ kind: 'call', status: 'reject' }), 'Candidate rejected')}
        <Button onClick={() => open({ kind: 'call', status: 'followup' })}>Follow up</Button>
      </>
    );
  } else if (c.message_status === 'not_sent') {
    icon = Calendar;
    title = 'Set the primary interview schedule';
    tip = 'Choose the day and time. The message to the candidate is prepared for you to send by SMS, WhatsApp or email.';
    body = `Candidate confirmed on ${whenText(c.confirmed_date, c.confirmed_time)}.`;
    actions = <Button variant="primary" icon={Calendar} onClick={() => open({ kind: 'schedule', stage: 'primary' })}>Set interview schedule</Button>;
  } else if (c.primary_status === 'pending' || c.primary_status === 'scheduled') {
    icon = ClipboardList;
    title = 'Primary interview result';
    tip = 'Select: passed the primary interview; enter each interviewer\'s score and whether they recommend the candidate. Reject: the process stops here. Change schedule moves the interview.';
    body = c.primary_date ? `Scheduled for ${whenText(c.primary_date, c.primary_time)}.` : 'Enter the result after the interview.';
    actions = (
      <>
        <Button variant="primary" icon={Check} onClick={() => open({ kind: 'result', stage: 'primary', result: 'selected' })}>Select</Button>
        {reject(() => open({ kind: 'result', stage: 'primary', result: 'rejected' }))}
        <Button icon={Calendar} onClick={() => open({ kind: 'schedule', stage: 'primary' })}>Change schedule</Button>
      </>
    );
  } else if (c.primary_status === 'rejected') {
    tone = 'bad';
    icon = X;
    title = 'Rejected at the primary interview';
    body = c.primary_score !== null ? `Score ${c.primary_score}/10.` : 'The process stopped here.';
  } else if (c.secondary_status === 'pending') {
    icon = Calendar;
    title = 'Set the final interview schedule';
    tip = 'Choose the day and time of the final interview. The message to the candidate is prepared for you.';
    body = c.primary_score !== null ? `Passed the primary interview with ${c.primary_score}/10.` : 'Passed the primary interview.';
    actions = <Button variant="primary" icon={Calendar} onClick={() => open({ kind: 'schedule', stage: 'secondary' })}>Set interview schedule</Button>;
  } else if (c.secondary_status === 'scheduled') {
    icon = ClipboardList;
    title = 'Final interview result';
    tip = 'Select: passed the final interview; enter the scores and put the candidate on the merit or the waiting list. Reject: the process stops here.';
    body = `Scheduled for ${whenText(c.secondary_date, c.secondary_time)}.`;
    actions = (
      <>
        <Button variant="primary" icon={Check} onClick={() => open({ kind: 'result', stage: 'secondary', result: 'selected' })}>Select</Button>
        {reject(() => open({ kind: 'result', stage: 'secondary', result: 'rejected' }))}
        <Button icon={Calendar} onClick={() => open({ kind: 'schedule', stage: 'secondary' })}>Change schedule</Button>
      </>
    );
  } else if (c.secondary_status === 'rejected') {
    // Rejected before final decisions were recorded: only the dates are missing.
    tone = 'bad';
    icon = X;
    title = 'Rejected at the final interview';
    body = 'Record the dates to close this candidate.';
    actions = reject(() => open({ kind: 'decision', decision: 'rejected' }), 'Record rejection');
  } else if (c.selection_category === 'waiting') {
    icon = ClipboardList;
    title = 'On the waiting list';
    body = (
      <>
        Move to Merit when a place opens, to send the confirmation letter.
        {c.secondary_feedback && <span className="mt-1 block whitespace-pre-wrap">Remarks: <strong className="font-medium">{c.secondary_feedback}</strong></span>}
      </>
    );
    actions = (
      <>
        <Button variant="primary" icon={Check} onClick={() => run(setCategory(c, 'merit'), `${c.full_name} moved to Merit.`)}>Move to Merit</Button>
        {reject(() => open({ kind: 'decision', decision: 'rejected' }))}
      </>
    );
  } else {
    icon = FileText;
    title = 'Final decision';
    body = (
      <>
        On the merit list. Send the confirmation letter, or reject. Either one locks the process.
        {c.secondary_feedback && <span className="mt-1 block whitespace-pre-wrap">Remarks: <strong className="font-medium">{c.secondary_feedback}</strong></span>}
      </>
    );
    tip = 'Send confirmation letter is the final acceptance: it asks when they were selected and when they join. Reject is the final rejection: it asks when it was decided and when they were told. Either one locks the process; only an admin can unlock it.';
    actions = (
      <>
        <Button variant="primary" icon={FileText} onClick={() => open({ kind: 'decision', decision: 'confirmed' })}>Send confirmation letter</Button>
        {reject(() => open({ kind: 'decision', decision: 'rejected' }))}
        <Button onClick={() => run(setCategory(c, 'waiting'), `${c.full_name} moved to Waiting.`)}>Move to Waiting</Button>
      </>
    );
  }

  const Icon = icon;
  // The feedback link can be shared before or after the interview, while the candidate is still at that step.
  const feedbackStage = canProcess ? openReviewStage(c) : null;
  // The locked panel's letter button is for everyone; elsewhere the buttons are for whoever does the step.
  const showActions = Boolean(actions) && canWrite && (mine || c.final_decision === 'confirmed');
  const waitingFor = canWrite && !mine && actions && c.screening_status !== 'new' && c.final_decision === null ? handlerNames(c, team) : '';
  // An interview is coming up or being held: the panel's questions are one click away.
  const interviewing = c.final_decision === null && (
    (c.message_status === 'message_done' && (c.primary_status === 'pending' || c.primary_status === 'scheduled')) ||
    (c.primary_status === 'selected' && (c.secondary_status === 'pending' || c.secondary_status === 'scheduled')));
  const designation = buckets.find((b) => b.id === c.bucket_id)?.designation ?? '';
  // A step recorded wrongly is corrected after an admin approves; the process team asks, for the steps it records.
  const correctable = canProcess && correctableSteps(c).length > 0;

  return (
    <div className={classNames('rounded-xl border px-4 py-3', PANEL[tone])}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <Icon className={classNames('size-5 shrink-0', tone === 'bad' ? 'text-red-800' : 'text-brand-700')} aria-hidden />
        <div className="min-w-48 flex-1">
          <div className="flex items-center gap-1 text-sm font-semibold"><p>{title}</p>{tip && <HelpTip label={`What the buttons do: ${title}`}>{tip}</HelpTip>}</div>
          {body && <p className="text-sm text-ink-soft">{body}</p>}
          {waitingFor && <p className="mt-0.5 text-xs font-medium text-ink-soft">With {waitingFor}. You are told when they finish this step.</p>}
        </div>
        {showActions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {canWrite && (previous || feedbackStage || interviewing || correctable || (isLocked(c) && isAdmin)) && (
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-black/5 pt-1.5">
          {interviewing && (
            <Button size="sm" variant="ghost" icon={FileQuestion} onClick={() => navigate(`/questions?kind=interview&designation=${encodeURIComponent(designation)}`)}>
              Interview questions
            </Button>
          )}
          {previous && (
            <Button
              size="sm"
              variant="ghost"
              icon={Undo2}
              title="Corrects a mistake: clears this result and everything after it"
              onClick={() => run(previous.patch, `Moved back: ${previous.label}.`)}
            >
              {previous.label}
            </Button>
          )}
          {feedbackStage && <Button size="sm" variant="ghost" icon={MessageSquareHeart} onClick={() => open({ kind: 'review', stage: feedbackStage })}>Ask for feedback</Button>}
          {correctable && (
            <Button size="sm" variant="ghost" icon={FilePen} title="A date, score or note was entered wrongly: ask an admin to let you correct it" onClick={() => open({ kind: 'requestCorrection' })}>
              Ask to correct a step
            </Button>
          )}
          {isLocked(c) && isAdmin && <Button size="sm" variant="ghost" icon={LockOpen} className="ml-auto" onClick={() => open({ kind: 'unlock' })}>Unlock (admin)</Button>}
        </div>
      )}
    </div>
  );
}

/** Everything about one candidate, and the only place their process moves forward. Opened from any row in the app. */
export function CandidateCard({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  const { candidates, buckets, team, user, updateCandidate, removeCandidate, canWrite, canScreen, isAdmin, lastSave } = useStore();
  const toast = useToast();
  const [openedAt] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>('details');
  const [modal, setModal] = useState<StepModal | null>(null);
  // The profile is edited in place on the Full details tab: one form, one Save.
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [baseline, setBaseline] = useState<ProfileDraft | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [discard, setDiscard] = useState<'close' | 'cancel' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const c = candidates.find((candidate) => candidate.id === candidateId);
  const urls = useFileUrls([c?.photo_path]);
  // CV review is one step: timed from opening the CV until it is selected, rejected or closed.
  // Once the CV is decided, opening the card again for later steps is not reviewing it.
  // Only the screening desk reviews CVs, so only its time counts.
  const reviewing = Boolean(c) && canScreen && c?.screening_status === 'new';
  const elapsed = useReviewTimer(candidateId, reviewing);
  const { startTour } = useGuide();
  // Someone else with this card open: worth knowing before two people record the same call.
  const alsoOpen = usePresence()
    .filter((person) => person.user_id !== user?.id && person.tabs.some((t) => t.candidate_id === candidateId))
    .map((person) => personName(team.find((p) => p.id === person.user_id)));

  if (!c) return null;
  const bucket = buckets.find((b) => b.id === c.bucket_id);
  const stage = stageOf(c);
  const closeModal = () => setModal(null);
  // Each step saves as soon as its own dialog does; this says so, and what the candidate's state is now.
  const savedAt = lastSave?.id === c.id && lastSave.at >= openedAt ? lastSave.at : null;
  const saveAndClose = () => {
    toast(`${c.full_name}: saved. Now at ${stage.label}.`);
    onClose();
  };
  const editing = draft !== null;
  const dirty = draft !== null && baseline !== null && !sameDraft(draft, baseline);
  const startEditing = () => {
    const fresh = toDraft(c);
    setDraft(fresh);
    setBaseline(fresh);
    setTab('details');
  };
  const stopEditing = () => {
    setDraft(null);
    setBaseline(null);
  };
  // Closing with unsaved profile changes asks first, so typing is never lost to a stray Esc.
  const requestClose = () => (dirty ? setDiscard('close') : onClose());
  const cancelEditing = () => (dirty ? setDiscard('cancel') : stopEditing());

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!draft || !c) return;
    setSavingProfile(true);
    try {
      await updateCandidate(c.id, fromDraft(draft));
      toast(`${draft.full_name.trim()}: profile saved.`);
      stopEditing();
    } catch (error) {
      toast(errorText(error), 'bad');
    } finally {
      setSavingProfile(false);
    }
  }

  async function replacePhoto(file: File | undefined) {
    if (!file || !c) return;
    try {
      const path = `photos/${c.bucket_id}/${crypto.randomUUID()}.${file.name.split('.').pop()?.toLowerCase() ?? 'jpg'}`;
      await backend.upload(path, file, file.type || 'image/jpeg');
      await updateCandidate(c.id, { photo_path: path });
      toast('Photo updated.');
    } catch (error) {
      toast(errorText(error), 'bad');
    }
  }

  return (
    <Dialog
      title={c.full_name}
      description={`${bucket?.designation ?? ''}${c.source ? ` · ${c.source}` : ''} · Received ${dateMedium(c.received_at)}`}
      onClose={requestClose}
      holdOpen={editing}
      width="max-w-5xl"
      footer={editing ? (
        <>
          <p className="mr-auto min-w-0 text-xs font-medium text-amber-900">
            {dirty ? 'Editing the profile. Changes are not saved until you press Save profile.' : 'Editing the profile. Nothing changed yet.'}
          </p>
          <Button onClick={cancelEditing}>Cancel editing</Button>
          <Button type="submit" form="profile-form" variant="primary" icon={Check} loading={savingProfile} onClick={() => setTab('details')}>Save profile</Button>
        </>
      ) : (
        <>
          <div className="mr-auto min-w-0 text-xs text-ink-soft">
            {savedAt !== null && (
              <p role="status" className="mb-0.5 flex items-center gap-1.5 font-semibold text-brand-700">
                <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                Saved {dateTime(new Date(savedAt))}. Now at {stage.label}.
              </p>
            )}
            {(reviewing || c.review_seconds > 0) && (
              <p className="tabular flex flex-wrap items-center gap-x-1.5">
                <Timer className="size-3.5" aria-hidden />
                {reviewing
                  ? <span>Reviewing the CV: <strong>{duration(c.review_seconds + elapsed)}</strong>. Stops at Select, Reject or Close.</span>
                  : <span>CV review time: <strong>{duration(c.review_seconds)}</strong></span>}
              </p>
            )}
          </div>
          {isAdmin && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmingDelete(true)}>Delete candidate</Button>}
          {canWrite && <Button data-tour="card-save" variant="primary" icon={Check} onClick={saveAndClose}>Save and close</Button>}
        </>
      )}
    >
      <div className="bg-surface [@media(min-height:800px)]:sticky [@media(min-height:800px)]:-top-4 [@media(min-height:800px)]:z-10 -mx-5 -mt-4 border-b border-line px-5 pt-4 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Avatar name={c.full_name} url={c.photo_path ? urls[c.photo_path] : null} size={52} />
            {canWrite && (
              <>
                <button type="button" aria-label="Replace photo" title="Replace photo" onClick={() => photoInput.current?.click()} className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-ink-soft hover:bg-hover">
                  <Camera className="size-3" aria-hidden />
                </button>
                <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void replacePhoto(e.target.files?.[0])} />
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
              <RecommendationStars candidate={c} />
            </p>
            <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
              {c.phone ? <a className="tabular underline" href={`tel:${c.phone}`}>{c.phone}</a> : <span className="text-ink-muted">No mobile</span>}
              {c.email && <a className="truncate underline" href={`mailto:${c.email}`}>{c.email}</a>}
            </p>
          </div>
          <Button size="sm" variant="ghost" icon={CircleHelp} onClick={() => startTour('card')}>How this card works</Button>
          {canWrite && !editing && <Button size="sm" icon={Pencil} onClick={startEditing}>Edit profile</Button>}
        </div>
        {alsoOpen.length > 0 && (
          <p role="status" className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs text-amber-950">
            <Eye className="size-3.5 shrink-0" aria-hidden />
            {alsoOpen.join(' and ')} {alsoOpen.length === 1 ? 'has' : 'have'} this card open too. Steps you save show for them straight away.
          </p>
        )}
        <div data-tour="card-process" className="mt-3"><ProcessBar candidate={c} /></div>
        {c.screening_status === 'shortlisted' && (
          <p data-tour="card-handler" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
            <UserRound className="size-3.5 shrink-0" aria-hidden />
            <span>Handled by <strong className="text-ink">{handlerNames(c, team)}</strong></span>
            {c.handed_over_by && <span className="text-ink-muted">· handed over by {c.handed_over_by}{c.handed_over_at ? ` on ${dateTime(c.handed_over_at)}` : ''}</span>}
            {c.handover_note && <span className="text-ink-muted">· "{c.handover_note}"</span>}
            {canScreen && c.final_decision === null && processTeam(team).length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'reassign' })}>Change</Button>
            )}
          </p>
        )}
        <div data-tour="card-next" className="mt-2"><NextStep c={c} open={setModal} /></div>
        <CorrectionsStrip candidate={c} />
      </div>

      {c.parse_warnings.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <p className="flex items-center gap-1 font-medium"><AlertTriangle className="size-3.5" aria-hidden /> Please check, from automatic reading</p>
          <ul className="mt-1 list-disc pl-5">{c.parse_warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          {canWrite && !editing && <p className="mt-1">Anything missed can be filled in with <button type="button" className="font-medium underline" onClick={startEditing}>Edit profile</button>.</p>}
        </div>
      )}

      <div data-tour="card-tabs" className="mt-3">
        <Tabs<Tab>
          label="Candidate details"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'details', label: 'Full details' },
            { value: 'cv', label: 'Original CV' },
            { value: 'text', label: 'All CV text' },
            { value: 'history', label: 'History' },
          ]}
        />
      </div>
      <div className="mt-4">
        {/* The form stays mounted on other tabs, so a glance at the original CV keeps what was typed. */}
        {draft && (
          <form id="profile-form" hidden={tab !== 'details'} onSubmit={saveProfile} aria-label={`Edit profile of ${c.full_name}`}>
            <ProfileEditor draft={draft} onChange={setDraft} />
          </form>
        )}
        {tab === 'details' && !draft && <DetailsTab c={c} />}
        {tab === 'cv' && <CvTab c={c} />}
        {tab === 'text' && <TextTab c={c} />}
        {tab === 'history' && <HistoryTab c={c} />}
      </div>

      {modal?.kind === 'screening' && <ScreeningRejectDialog candidate={c} onClose={closeModal} />}
      {modal?.kind === 'handover' && <HandoverDialog candidates={[c]} mode="select" onClose={closeModal} />}
      {modal?.kind === 'reassign' && <HandoverDialog candidates={[c]} mode="reassign" onClose={closeModal} />}
      {modal?.kind === 'call' && <CallDialog candidate={c} status={modal.status} onClose={closeModal} />}
      {modal?.kind === 'schedule' && <ScheduleDialog candidates={[c]} stage={modal.stage} onClose={closeModal} />}
      {modal?.kind === 'result' && <InterviewResultDialog candidate={c} stage={modal.stage} result={modal.result} onClose={closeModal} />}
      {modal?.kind === 'decision' && <DecisionDialog candidate={c} decision={modal.decision} onClose={closeModal} />}
      {modal?.kind === 'review' && <ReviewLinkDialog candidate={c} stage={modal.stage} onClose={closeModal} />}
      {modal?.kind === 'joining' && <JoiningDialog candidate={c} onClose={closeModal} />}
      {modal?.kind === 'joiningCall' && <JoiningCallDialog candidate={c} onClose={closeModal} />}
      {modal?.kind === 'requestCorrection' && <RequestCorrectionDialog candidate={c} onClose={closeModal} />}
      {modal?.kind === 'unlock' && (
        <Confirm
          danger
          title={`Unlock ${c.full_name}?`}
          body="This clears the final decision and its dates, so the decision can be made again. History keeps a record of it."
          confirmLabel="Unlock"
          onCancel={closeModal}
          onConfirm={async () => {
            try {
              await updateCandidate(c.id, unlockDecision());
              toast('Process unlocked.');
            } catch (error) {
              toast(errorText(error), 'bad');
            }
            closeModal();
          }}
        />
      )}
      {discard && (
        <Confirm
          title="Discard the profile changes?"
          body="What you typed in the profile has not been saved."
          confirmLabel="Discard changes"
          danger
          onCancel={() => setDiscard(null)}
          onConfirm={() => {
            const closing = discard === 'close';
            setDiscard(null);
            stopEditing();
            if (closing) onClose();
          }}
        />
      )}
      {confirmingDelete && (
        <Confirm
          danger
          title={`Delete ${c.full_name}?`}
          body="This permanently removes the candidate's record and history. To keep the record, reject the candidate instead."
          confirmLabel="Delete permanently"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            try {
              await removeCandidate(c.id);
              toast('Candidate deleted.');
              onClose();
            } catch (error) {
              toast(errorText(error), 'bad');
              setConfirmingDelete(false);
            }
          }}
        />
      )}
    </Dialog>
  );
}
