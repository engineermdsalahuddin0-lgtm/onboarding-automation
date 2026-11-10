import {
  Calendar,
  CalendarClock,
  FileUser,
  PhoneCall,
  PhoneForwarded,
  Send,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Button, Card, EmptyState, HoverTooltip, InsightTile, PageHeader, RecommendationStars, Select, StatusBadge, TooltipList, TooltipTable, type TooltipRow, type TooltipTableRow } from '../components/ui';
import { BarList, CountTable, DataTable, DetailDialog, Figures, InterviewCalendar, Section, type InterviewEvent } from '../components/DashboardDetails';
import { classNames, dateMedium, dateTime, dayMonth, daysBetween, duration, isoDate, time12, todayIso, whenText } from '../lib/format';
import { placeText } from '../lib/org';
import { afterFinal, bucketStats, CATEGORY_LABELS, fillsVacancy, isActive, isRejected, JOINING, joiningWhen, matchesStageFilter, nextAction, recommendationCount, stageOf, type StageFilter } from '../lib/pipeline';
import { byNewest, daysOpen, isOpenRequisition, requisitionFigures } from '../lib/requisitions';
import { CorrectionRequestsCard } from '../components/Corrections';
import { RequisitionDetails, STATUS_TONE } from './Requisitions';
import { HelpTip, WelcomeGuide } from '../components/Guide';
import { WorkingNow } from '../components/WorkingNow';
import { useFileUrls, useStore } from '../lib/store';
import { COMPLETES_PROCESS, handlerNames, isHandledBy, notificationLink, notificationText } from '../lib/team';
import type { AppNotification, Candidate, CvBucket } from '../types';
import { BucketFolder } from './Buckets';

// An ordered ramp from light to dark: one hue, because the stages are one process narrowing down.
const FUNNEL_COLORS = ['#7cc25a', '#6baa4c', '#59913f', '#487931', '#3f6d2a', '#376123', '#254816', '#143008'];

// The stages in process order, for the "where they stand" breakdown.
const STAGE_ORDER = [
  'New CV', 'Shortlisted', 'Call follow-up', 'Call confirmed', 'Primary scheduled', 'Primary selected',
  'Final scheduled', 'Final selected', 'Confirmed', 'Joining confirmed', 'Joined', 'Did not confirm', 'Rejected',
];

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

type NameOf = (c: Candidate) => string;

/** Counts people by one of their values, largest group first. */
function countBy(items: Candidate[], nameOf: NameOf): TooltipRow[] {
  const counts = new Map<string, number>();
  for (const c of items) counts.set(nameOf(c), (counts.get(nameOf(c)) ?? 0) + 1);
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => (b.value as number) - (a.value as number));
}

function Funnel({ items, positionOf }: { items: Candidate[]; positionOf: NameOf }) {
  const steps = [
    { label: 'CVs received', people: items },
    { label: 'Shortlisted', people: items.filter((c) => c.screening_status === 'shortlisted') },
    { label: 'Call confirmed', people: items.filter((c) => c.call_status === 'confirm') },
    { label: 'Primary scheduled', people: items.filter((c) => c.message_status === 'message_done') },
    { label: 'Primary selected', people: items.filter((c) => c.primary_status === 'selected') },
    { label: 'Final selected', people: items.filter((c) => c.secondary_status === 'selected') },
    { label: 'Confirmed', people: items.filter((c) => c.final_decision === 'confirmed') },
    { label: 'Joined', people: items.filter((c) => c.joining_status === 'joined') },
  ];
  const max = Math.max(1, items.length);
  return (
    <ol className="-mx-1">
      {steps.map((step, index) => {
        const count = step.people.length;
        const previous = steps[index - 1];
        const conversion = previous?.people.length ? percent(count, previous.people.length) : null;
        // Everyone who reached the step before but not this one has either been rejected or is still on the way.
        const here = new Set(step.people);
        const stopped = (previous?.people ?? []).filter((c) => !here.has(c));
        const rejected = stopped.filter(isRejected).length;
        return (
          <li key={step.label}>
            <HoverTooltip
              side="beside"
              label={`${step.label}: ${count}`}
              className="grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-2 rounded px-1 py-[3px] text-sm transition-colors hover:bg-hover"
              details={
                <>
                  <TooltipList
                    title={`${step.label}: ${count}`}
                    rows={[
                      { label: 'Share of all CVs', value: `${percent(count, items.length)}%` },
                      ...(previous
                        ? [
                            { label: `Out of ${previous.label}`, value: `${count} of ${previous.people.length}` },
                            { label: 'Rejected before this step', value: rejected },
                            { label: 'Still on the way', value: stopped.length - rejected },
                          ]
                        : [
                            { label: 'In process', value: items.filter(isActive).length },
                            { label: 'Rejected', value: items.filter(isRejected).length },
                          ]),
                    ]}
                  />
                  {count > 0 && <TooltipList title="By position" rows={countBy(step.people, positionOf)} limit={3} />}
                </>
              }
            >
              <span className="truncate text-xs text-ink-soft">{step.label}</span>
              <span className="h-4 overflow-hidden rounded-r bg-canvas" aria-hidden>
                <span
                  className="block h-full rounded-r transition-[width] duration-300"
                  style={{ width: `${Math.max(count ? 2 : 0, (count / max) * 100)}%`, background: FUNNEL_COLORS[index] }}
                />
              </span>
              <span className="tabular text-right">
                <span className="font-semibold">{count}</span>
                {conversion !== null && <span className="ml-1.5 text-xs text-ink-muted">{conversion}%</span>}
              </span>
            </HoverTooltip>
          </li>
        );
      })}
    </ol>
  );
}

const SOURCE_COLUMNS = 'grid grid-cols-[7.5rem_1fr_2rem_3.25rem] items-center gap-2';

function Sources({ items, positionOf }: { items: Candidate[]; positionOf: NameOf }) {
  const rows = useMemo(() => {
    const map = new Map<string, Candidate[]>();
    for (const c of items) map.set(c.source, [...(map.get(c.source) ?? []), c]);
    return [...map.entries()].map(([source, people]) => ({ source, people })).sort((a, b) => b.people.length - a.people.length);
  }, [items]);
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-ink-muted">No CVs in this period.</p>;
  const max = rows[0].people.length;
  return (
    <div className="-mx-1">
      <div className={`${SOURCE_COLUMNS} px-1 pb-1.5 text-xs text-ink-muted`} aria-hidden>
        <span>Source</span>
        <span />
        <span className="text-right">CVs</span>
        <span className="text-right">Selected</span>
      </div>
      <ul>
        {rows.map(({ source, people }) => {
          const selected = people.filter((c) => c.secondary_status === 'selected').length;
          return (
            <li key={source}>
              <HoverTooltip
                side="beside"
                label={`${source}: ${people.length} CVs, ${selected} selected`}
                className={`${SOURCE_COLUMNS} rounded px-1 py-[5px] text-sm transition-colors hover:bg-hover`}
                details={
                  <>
                    <TooltipList
                      title={`${source}: ${people.length} CV${people.length === 1 ? '' : 's'}`}
                      rows={[
                        { label: 'Share of all CVs', value: `${percent(people.length, items.length)}%` },
                        { label: 'Shortlisted', value: people.filter((c) => c.screening_status === 'shortlisted').length },
                        { label: 'Final selected', value: `${selected} (${percent(selected, people.length)}%)` },
                        { label: 'Rejected', value: people.filter(isRejected).length },
                        { label: 'In process', value: people.filter(isActive).length },
                      ]}
                    />
                    <TooltipList title="By position" rows={countBy(people, positionOf)} limit={3} />
                  </>
                }
              >
                <span className="truncate text-xs text-ink-soft">{source}</span>
                <span className="block h-2 rounded-r bg-brand-500" style={{ width: `${Math.max(2, (people.length / max) * 100)}%` }} aria-hidden />
                <span className="tabular text-right font-medium">{people.length}</span>
                <span className="tabular text-right">{selected}</span>
              </HoverTooltip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Inflow({ items, positionOf }: { items: Candidate[]; positionOf: NameOf }) {
  const weeks = useMemo(() => {
    const now = new Date();
    const result: { start: Date; label: string; people: Candidate[] }[] = [];
    for (let i = 7; i >= 0; i -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - i * 7);
      result.push({ start, label: dayMonth(start), people: [] });
    }
    for (const c of items) {
      const received = new Date(c.received_at);
      for (let i = result.length - 1; i >= 0; i -= 1) {
        if (received >= result[i].start) {
          result[i].people.push(c);
          break;
        }
      }
    }
    return result;
  }, [items]);
  const max = Math.max(1, ...weeks.map((w) => w.people.length));
  return (
    <div>
      <div className="flex h-24 items-end gap-1.5">
        {weeks.map((week, index) => {
          const count = week.people.length;
          const end = new Date(week.start);
          end.setDate(end.getDate() + 6);
          const change = index > 0 ? count - weeks[index - 1].people.length : null;
          return (
            <HoverTooltip
              key={week.label}
              side="above"
              label={`Week of ${week.label}: ${count} CVs`}
              className="group flex h-full flex-1 items-end justify-center rounded transition-colors hover:bg-hover"
              details={
                <>
                  <TooltipList
                    title={`${week.label} to ${dayMonth(end)}: ${count} CV${count === 1 ? '' : 's'}`}
                    rows={[
                      ...(change !== null ? [{ label: 'Compared with the week before', value: change > 0 ? `+${change}` : change }] : []),
                      { label: 'Shortlisted so far', value: week.people.filter((c) => c.screening_status === 'shortlisted').length },
                      { label: 'Rejected so far', value: week.people.filter(isRejected).length },
                    ]}
                  />
                  {count > 0 && <TooltipList title="By source" rows={countBy(week.people, (c) => c.source)} limit={3} />}
                  {count > 0 && <TooltipList title="By position" rows={countBy(week.people, positionOf)} limit={3} />}
                </>
              }
            >
              <div className="w-full max-w-5 rounded-t bg-brand-500 transition-colors group-hover:bg-brand-700 group-focus:bg-brand-700" style={{ height: `${count ? Math.max(4, (count / max) * 100) : 1}%` }} />
            </HoverTooltip>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between border-t border-line-strong pt-1 text-[11px] text-ink-muted">
        <span>{weeks[0].label}</span>
        <span>This week</span>
      </div>
    </div>
  );
}

function FillMeter({ vacancies, people, filled }: { vacancies: number; people: Candidate[]; filled: number }) {
  const selected = people.filter((c) => c.secondary_status === 'selected');
  const filling = selected.filter(fillsVacancy);
  // Named as selected on the vacancy sheet, without a candidate in the app.
  const fromSheet = Math.max(0, filled - filling.length);
  const waiting = selected.filter((c) => c.selection_category === 'waiting' && c.joining_status !== 'declined');
  const notConfirmed = selected.filter((c) => c.selection_category === 'merit' && c.joining_status === 'declined');
  return (
    <HoverTooltip
      side="above"
      label={`${filled} of ${vacancies} vacancies filled`}
      className="inline-flex items-center gap-2 rounded px-1 py-1 transition-colors hover:bg-hover"
      details={
        <>
          <TooltipList
            title={`${filled} of ${vacancies} filled`}
            empty="No one on the merit list yet."
            rows={[
              ...filling.map((c) => ({ label: c.full_name, value: JOINING[c.joining_status].label })),
              ...(fromSheet ? [{ label: 'Named on the vacancy sheet', value: fromSheet }] : []),
            ]}
          />
          <TooltipList
            title="Still to fill"
            rows={[
              { label: 'Vacancies left', value: Math.max(0, vacancies - filled) },
              { label: 'On the waiting list', value: waiting.length },
              { label: 'Did not confirm', value: notConfirmed.length },
              { label: 'CVs still in process', value: people.filter(isActive).length },
            ]}
          />
        </>
      }
    >
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-hover" aria-hidden>
        <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (filled / vacancies) * 100)}%` }} />
      </span>
      <span className="tabular text-xs">{filled}/{vacancies}</span>
    </HoverTooltip>
  );
}

interface WorkItem {
  key: string;
  icon: LucideIcon;
  text: string;
  to: string;
  urgent?: boolean;
}

/** Each desk's own to-do: the screening desk screens new CVs; the process team does everything after. */
const SCREENING_WORK = new Set(['screen']);

function buildWorkList(candidates: Candidate[], buckets: CvBucket[], only?: (key: string) => boolean): WorkItem[] {
  const today = todayIso();
  const work: WorkItem[] = [];
  const bucketName = new Map(buckets.map((b) => [b.id, b.designation]));
  const perBucket = (filter: (c: Candidate) => boolean) => {
    const counts = new Map<string, number>();
    for (const c of candidates) if (filter(c)) counts.set(c.bucket_id, (counts.get(c.bucket_id) ?? 0) + 1);
    return [...counts.entries()];
  };
  const add = (
    key: string, icon: LucideIcon, stage: StageFilter, filter: (c: Candidate) => boolean, text: (count: number, name: string) => string, urgent = false,
  ) => {
    if (only && !only(key)) return;
    for (const [bucketId, count] of perBucket(filter)) {
      work.push({ key: `${key}-${bucketId}`, icon, text: text(count, bucketName.get(bucketId) ?? ''), to: `/buckets/${bucketId}${stage === 'all' ? '' : `?stage=${stage}`}`, urgent });
    }
  };

  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

  add('overdue-result', CalendarClock, 'all',
    (c) => (c.primary_status === 'scheduled' && c.primary_date !== null && c.primary_date < today) || (c.secondary_status === 'scheduled' && c.secondary_date !== null && c.secondary_date < today),
    (n, name) => `${plural(n, 'interview result')} overdue: ${name}`, true);
  add('followup', PhoneForwarded, 'calling',
    (c) => c.call_status === 'followup' && (!c.followup_on || c.followup_on <= today),
    (n, name) => `${plural(n, 'follow-up call')} due: ${name}`, true);
  add('call', PhoneCall, 'calling', (c) => c.screening_status === 'shortlisted' && c.call_status === 'pending', (n, name) => `${plural(n, 'call')} to make: ${name}`);
  add('message', Calendar, 'messaging', (c) => matchesStageFilter(c, 'messaging'), (n, name) => `${plural(n, 'primary schedule')} to set: ${name}`);
  add('final', Calendar, 'secondary', (c) => c.primary_status === 'selected' && c.secondary_status === 'pending', (n, name) => `${plural(n, 'final schedule')} to set: ${name}`);
  add('screen', FileUser, 'new', (c) => c.screening_status === 'new', (n, name) => `${plural(n, 'new CV')} to screen: ${name}`);
  add('offer', Send, 'decision', (c) => c.selection_category === 'merit' && c.joining_status === 'pending', (n, name) => `${plural(n, 'confirmation letter')} to send: ${name}`);
  add('joining-call', PhoneCall, 'confirmed', (c) => c.final_decision === 'confirmed' && c.joining_status === 'offer_sent', (n, name) => `${plural(n, 'joining call')} to make: ${name}`);
  // Only a position where someone is actually waiting has a decision to make.
  const waitingIn = new Set(candidates.filter((c) => c.selection_category === 'waiting' && c.joining_status !== 'declined').map((c) => c.bucket_id));
  add('waiting', UserCheck, 'decision', (c) => c.selection_category === 'merit' && c.joining_status === 'declined' && waitingIn.has(c.bucket_id),
    (n, name) => `${n} merit did not confirm, consider the waiting list: ${name}`, true);
  return work;
}

const TEAM_COLUMNS: { label: string; hint: string; test: (c: Candidate) => boolean }[] = [
  { label: 'Shortlisted & To call', hint: 'Handed over, call not made or follow-up due', test: (c) => matchesStageFilter(c, 'calling') },
  { label: 'Interviews', hint: 'Primary or final interview to schedule or hold', test: (c) => ['messaging', 'primary', 'secondary'].some((stage) => matchesStageFilter(c, stage as StageFilter)) },
  { label: 'Decision', hint: 'Passed the final interview, letter not sent yet', test: (c) => matchesStageFilter(c, 'decision') },
  { label: 'Confirmed', hint: 'Confirmation letter sent', test: (c) => c.final_decision === 'confirmed' && c.joining_status !== 'joined' && c.joining_status !== 'declined' },
  { label: 'Joined', hint: 'Joined the company', test: (c) => c.joining_status === 'joined' },
  { label: 'Stopped', hint: 'Rejected after the handover: on the call, at an interview, or did not confirm', test: (c) => c.screening_status === 'shortlisted' && isRejected(c) },
];

/** For the screening desk: everything handed over, by who handles it and where it stands now. */
function TeamProgress({ items }: { items: Candidate[] }) {
  const { team } = useStore();
  const groups = useMemo(() => {
    const map = new Map<string, Candidate[]>();
    for (const c of items) {
      if (c.screening_status !== 'shortlisted') continue;
      const key = [...(c.assigned_to ?? [])].sort().join(',');
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()]
      .map(([key, people]) => ({ key, label: handlerNames(people[0], team), people }))
      .sort((a, b) => b.people.length - a.people.length);
  }, [items, team]);

  if (groups.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">Nothing handed over yet. Select a CV to hand it to the process team.</p>;
  }
  const cell = (people: Candidate[], title: string) => (
    people.length === 0 ? <span className="text-ink-muted">0</span> : (
      <HoverTooltip
        side="above"
        label={`${title}: ${people.length}`}
        className="tabular inline-block rounded px-1.5 font-semibold hover:bg-hover"
        details={<TooltipList title={`${title}: ${people.length}`} rows={people.map((c) => ({ label: c.full_name, value: nextAction(c) }))} limit={8} />}
      >
        {people.length}
      </HoverTooltip>
    )
  );
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th scope="col" className="px-1 py-1.5 font-medium">Handled by</th>
            <th scope="col" className="px-1 py-1.5 text-right font-medium">Handed over</th>
            {TEAM_COLUMNS.map((column) => <th key={column.label} scope="col" title={column.hint} className="px-1 py-1.5 text-right font-medium">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ key, label, people }) => (
            <tr key={key || 'team'} className="border-t border-line">
              <th scope="row" className="px-1 py-2 text-left font-medium">{label}</th>
              <td className="px-1 py-2 text-right">{cell(people, `${label}: handed over`)}</td>
              {TEAM_COLUMNS.map((column) => (
                <td key={column.label} className="px-1 py-2 text-right">{cell(people.filter(column.test), `${label}: ${column.label}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The latest notifications of a few kinds, as a list on the dashboard. */
function RecentUpdates({ events, empty }: { events: (n: AppNotification) => boolean; empty: string }) {
  const { notifications, markNotificationsRead } = useStore();
  const rows = notifications.filter(events).slice(0, 7);
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className="-mx-2 space-y-0.5">
      {rows.map((n) => {
        const { title, detail } = notificationText(n);
        const link = notificationLink(n);
        return (
          <li key={n.id}>
            <Link
              to={link.candidate ? { search: `?candidate=${link.candidate}` } : (link.pathname ?? '/')}
              onClick={() => void markNotificationsRead([n.id])}
              className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-hover"
            >
              <span className={classNames('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-line-strong' : 'bg-brand-600')} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={classNames('block', !n.read_at && 'font-semibold')}>{title}</span>
                <span className="block truncate text-xs text-ink-muted">{detail} · {dateTime(n.created_at)}</span>
              </span>
              {COMPLETES_PROCESS.includes(n.event) && <span className="shrink-0 rounded bg-emerald-100 px-1.5 text-[11px] font-medium text-emerald-900">Complete</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** For the process team: the candidates handed to this person, newest handover first. */
function HandedToMe({ items }: { items: Candidate[] }) {
  const { user, buckets } = useStore();
  const mine = items
    .filter((c) => c.screening_status === 'shortlisted' && isHandledBy(c, user?.id) && isActive(c))
    .sort((a, b) => (b.handed_over_at ?? '').localeCompare(a.handed_over_at ?? ''));
  if (mine.length === 0) return <p className="py-6 text-center text-sm text-ink-muted">Nothing waiting. New handovers appear here and under the bell.</p>;
  return (
    <>
      <ul className="-mx-2 space-y-0.5">
        {mine.slice(0, 8).map((c) => (
          <li key={c.id}>
            <Link to={{ search: `?candidate=${c.id}` }} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-hover">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.full_name} <span className="font-normal text-ink-muted">· {buckets.find((b) => b.id === c.bucket_id)?.designation}</span></span>
                <span className="block truncate text-xs text-ink-soft">{nextAction(c)}{c.handover_note ? ` · "${c.handover_note}"` : ''}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-ink-muted">
                {c.assigned_to.length === 0 ? 'Whole team' : 'To you'}
                {c.handed_over_at && <span className="block">{dayMonth(c.handed_over_at)}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {mine.length > 8 && <p className="mt-2 text-xs text-ink-muted">and {mine.length - 8} more</p>}
    </>
  );
}

const PROCESS_EVENTS = (n: AppNotification) => !['new_cvs', 'posting', 'handover'].includes(n.event);
const INCOMING_EVENTS = (n: AppNotification) => ['new_cvs', 'posting', 'handover'].includes(n.event);

export function DashboardPage() {
  const { candidates, requisitions, buckets, reviews, team, canScreen, canProcess, user } = useStore();
  // Someone on one desk sees that desk's work; desk "all" sees all of it, as before desks existed.
  const screeningOnly = canScreen && !canProcess;
  const processOnly = canProcess && !canScreen;
  // Whoever screens and hands over to a process team leads it, and sees how it is getting on.
  const leadsTeam = canScreen && team.some((p) => p.id !== user?.id && p.desk === 'process' && (p.role === 'admin' || p.role === 'hr'));
  const [period, setPeriod] = useState('all');
  const [department, setDepartment] = useState('');

  const bucketById = useMemo(() => new Map(buckets.map((b) => [b.id, b])), [buckets]);
  const departments = useMemo(() => [...new Set(buckets.map((b) => b.department).filter(Boolean))], [buckets]);

  const inDepartment = useMemo(
    () => (department ? candidates.filter((c) => bucketById.get(c.bucket_id)?.department === department) : candidates),
    [candidates, department, bucketById],
  );

  const scoped = useMemo(() => {
    if (period === 'all') return inDepartment;
    const days = Number(period);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return inDepartment.filter((c) => new Date(c.received_at) >= cutoff);
  }, [inDepartment, period]);

  // The same rule as "Still open" on the Requisitions page, so the two always show the same number.
  const openRequisitions = useMemo(
    () => requisitionFigures(
      requisitions.filter((r) => isOpenRequisition(r) && (!department || r.department === department)).sort(byNewest),
      buckets,
      candidates,
    ),
    [requisitions, buckets, candidates, department],
  );
  const [detail, setDetail] = useState<null | 'requisitions' | 'cvs' | 'interviews' | 'review' | 'selected' | 'shortlisted' | 'hire' | 'rating'>(null);
  const [requisitionShown, setRequisitionShown] = useState<string | null>(null);
  const navigate = useNavigate();
  const closeDetail = () => setDetail(null);
  const openCandidate = (c: Candidate) => {
    setDetail(null);
    navigate({ search: `?candidate=${c.id}` });
  };

  const today = todayIso();
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const week = isoDate(in7);

  const interviews = useMemo(() => {
    const list: { c: Candidate; date: string; time: string; round: string }[] = [];
    for (const c of inDepartment) {
      if (c.primary_status === 'scheduled' && c.primary_date && c.primary_date >= today) list.push({ c, date: c.primary_date, time: c.primary_time, round: 'Primary' });
      if (c.secondary_status === 'scheduled' && c.secondary_date && c.secondary_date >= today) list.push({ c, date: c.secondary_date, time: c.secondary_time, round: 'Final' });
    }
    return list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [inDepartment, today]);

  const selected = scoped.filter((c) => c.secondary_status === 'selected');

  const hireDays = selected.filter((c) => c.selected_at).map((c) => daysBetween(c.received_at, c.selected_at!));
  const avgHire = hireDays.length ? Math.round(hireDays.reduce((a, b) => a + b, 0) / hireDays.length) : null;

  const scopedIds = useMemo(() => new Set(scoped.map((c) => c.id)), [scoped]);
  const submitted = reviews.filter((r) => r.submitted_at && r.overall && scopedIds.has(r.candidate_id));
  const avgReview = submitted.length ? submitted.reduce((sum, r) => sum + (r.overall ?? 0), 0) / submitted.length : null;

  const vacancies = openRequisitions.filter(({ left }) => left > 0).sort((a, b) => b.left - a.left);
  const openVacancies = vacancies.reduce((sum, { left }) => sum + left, 0);
  const requisitionPlace = (r: (typeof openRequisitions)[number]['r']) => r.unit || r.department || 'No unit';
  const countRows = (labels: string[]) => {
    const counts = new Map<string, number>();
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
    return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };

  // Every interview with a day, for the calendar: still to come, overdue, or held with its result.
  const interviewEvents = useMemo(() => {
    const list: InterviewEvent[] = [];
    const add = (c: Candidate, round: 'Primary' | 'Final', date: string | null, time: string, status: string, score: number | null) => {
      if (!date || status === 'pending') return;
      const held = status === 'selected' || status === 'rejected';
      list.push({
        key: `${c.id}-${round}`,
        candidate: c,
        date,
        time,
        round,
        state: held ? 'held' : date < today ? 'overdue' : 'scheduled',
        result: held ? `${status === 'selected' ? 'Selected' : 'Rejected'}${score !== null ? ` · ${score}/10` : ''}` : date < today ? 'Result not recorded yet' : 'Scheduled',
        position: bucketById.get(c.bucket_id)?.designation ?? '',
      });
    };
    for (const c of inDepartment) {
      add(c, 'Primary', c.primary_date, c.primary_time, c.primary_status, c.primary_score);
      add(c, 'Final', c.secondary_date, c.secondary_time, c.secondary_status, c.secondary_score);
    }
    return list;
  }, [inDepartment, bucketById, today]);

  const meritList = selected.filter((c) => c.selection_category === 'merit');
  const waitingList = selected.filter((c) => c.selection_category === 'waiting');
  const offersToSend = meritList.filter((c) => c.joining_status === 'pending').length;
  const upcoming = interviews.filter((i) => i.date <= week);
  const designationOf = (c: Candidate) => bucketById.get(c.bucket_id)?.designation ?? '';
  const slotText = (date: string, time: string) => `${date === today ? 'Today' : dayMonth(date)}, ${time12(time)}`;

  const stageRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of scoped) {
      const stage = stageOf(c);
      const label = stage.tone === 'bad' ? 'Rejected' : stage.label;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return STAGE_ORDER.filter((label) => counts.has(label)).map((label) => ({ label, value: counts.get(label) }));
  }, [scoped]);

  const positionRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of scoped) counts.set(designationOf(c), (counts.get(designationOf(c)) ?? 0) + 1);
    return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    // designationOf only reads bucketById.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, bucketById]);

  // Department breakdowns for the card tooltips. An interview counts as held once its result is recorded.
  const departmentOf = (c: Candidate) => bucketById.get(c.bucket_id)?.department || 'No department';
  const perDepartment = (people: Candidate[], measures: ((c: Candidate) => number | boolean)[]): TooltipTableRow[] => {
    const table = new Map<string, number[]>();
    for (const c of people) {
      const row = table.get(departmentOf(c)) ?? measures.map(() => 0);
      measures.forEach((measure, index) => {
        row[index] += Number(measure(c));
      });
      table.set(departmentOf(c), row);
    }
    return [...table.entries()]
      .map(([label, values]) => ({ label, values }))
      .filter((row) => row.values.some((value) => value > 0))
      .sort((a, b) => b.values[0] - a.values[0] || a.label.localeCompare(b.label));
  };
  const primaryHeld = (c: Candidate) => c.primary_status === 'selected' || c.primary_status === 'rejected';
  const finalHeld = (c: Candidate) => c.secondary_status === 'selected' || c.secondary_status === 'rejected';
  const upcomingCount = new Map<string, number>();
  for (const { c } of interviews.filter((i) => i.date <= week)) upcomingCount.set(c.id, (upcomingCount.get(c.id) ?? 0) + 1);
  const cvsByDepartment = perDepartment(scoped, [() => 1, (c) => Number(primaryHeld(c)) + Number(finalHeld(c)), primaryHeld]);
  const interviewsByDepartment = perDepartment(inDepartment, [
    (c) => scopedIds.has(c.id) && primaryHeld(c),
    (c) => scopedIds.has(c.id) && finalHeld(c),
    (c) => upcomingCount.get(c.id) ?? 0,
  ]);
  const lettersByDepartment = perDepartment(selected, [
    (c) => c.final_decision === 'confirmed',
    (c) => c.joining_status === 'accepted' || c.joining_status === 'joined',
    (c) => c.joining_status === 'declined',
  ]);

  const hireRows = selected
    .filter((c) => c.selected_at)
    .map((c) => ({ c, days: daysBetween(c.received_at, c.selected_at!) }))
    .sort((a, b) => a.days - b.days);
  const scopedReviews = reviews.filter((r) => scopedIds.has(r.candidate_id));
  const averageOf = (pick: (r: (typeof reviews)[number]) => number | null) => {
    const values = submitted.map(pick).filter((v): v is number => v !== null);
    return values.length ? `${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)} / 5` : '-';
  };

  const work = useMemo(() => {
    const open = buckets.filter((b) => b.status !== 'Archived');
    if (screeningOnly) return buildWorkList(inDepartment, open, (key) => SCREENING_WORK.has(key));
    if (processOnly) return buildWorkList(inDepartment.filter((c) => isHandledBy(c, user?.id)), open, (key) => !SCREENING_WORK.has(key));
    return buildWorkList(inDepartment, open);
  }, [inDepartment, buckets, screeningOnly, processOnly, user?.id]);
  const photoUrls = useFileUrls(interviews.slice(0, 6).map((i) => i.c.photo_path));
  const recommended = useMemo(
    () => scoped.filter((c) => recommendationCount(c) > 0).sort((a, b) => recommendationCount(b) - recommendationCount(a)),
    [scoped],
  );
  const recommendedPhotos = useFileUrls(recommended.slice(0, 9).map((c) => c.photo_path));
  // Everyone the screening desk selected from their CV, whatever happened after, the latest handover first.
  const shortlisted = useMemo(
    () => scoped
      .filter((c) => c.screening_status === 'shortlisted')
      .sort((a, b) => (b.handed_over_at ?? b.received_at).localeCompare(a.handed_over_at ?? a.received_at)),
    [scoped],
  );
  const shortlistedPhotos = useFileUrls(shortlisted.slice(0, 9).map((c) => c.photo_path));
  const waitingForCall = shortlisted.filter((c) => c.call_status === 'pending' || c.call_status === 'followup');
  const shortlistedConfirmed = shortlisted.filter((c) => c.final_decision === 'confirmed');
  const shortlistedRejected = shortlisted.filter(isRejected);
  // One CV, one review: the average is per CV, however many sittings it took.
  const reviewedPeople = scoped.filter((c) => c.review_seconds > 0);
  const reviewSeconds = reviewedPeople.reduce((sum, c) => sum + c.review_seconds, 0);
  const reviewCount = reviewedPeople.length;
  const recentBuckets = buckets.filter((b) => b.status === 'Open' && (!department || b.department === department)).slice(0, 4);

  return (
    <>
      <WelcomeGuide />
      <PageHeader
        title="Dashboard"
        titleActions={
          <HelpTip label="How to use the dashboard">
            The tiles show how hiring is going: point at one for a quick look, click it for the full details with charts and tables. To do lists your next steps; click a line to
            open it. Use Period and Department on the right to narrow everything. The ? at the top right gives a full tour.
          </HelpTip>
        }
        description="What needs doing today, and how hiring is going."
        actions={
          <>
            <div className="w-40">
              <Select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="all">All time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </Select>
            </div>
            <div className="w-44">
              <Select aria-label="Department" value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="">All departments</option>
                {departments.map((d) => <option key={d}>{d}</option>)}
              </Select>
            </div>
          </>
        }
      />

      <CorrectionRequestsCard />

      <div data-tour="dash-tiles" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <InsightTile
          label="Open requisitions"
          value={openRequisitions.length}
          hint={`${openVacancies} vacanc${openVacancies === 1 ? 'y' : 'ies'} to fill`}
          onOpen={() => setDetail('requisitions')}
          details={
            <>
              <TooltipList title="By status" empty="No open requisitions." rows={countRows(openRequisitions.map(({ r }) => r.status))} />
              <TooltipList
                title="Positions still to fill"
                empty="No open vacancies."
                rows={vacancies.map(({ r, left }) => ({
                  label: r.designation,
                  note: `${r.ref_no} · ${r.status}`,
                  value: `${left} of ${r.vacancies}`,
                }))}
                limit={4}
              />
            </>
          }
        />
        <InsightTile
          label="CVs received"
          value={scoped.length}
          hint={`${scoped.filter(isActive).length} in process`}
          onOpen={() => setDetail('cvs')}
          details={
            <>
              <TooltipTable
                title="By department"
                columns={['CVs', 'Interviews', 'Primary']}
                rows={cvsByDepartment}
                empty="No CVs in this period."
                note="Interviews: primary and final interviews held. Primary: primary interviews held."
              />
              <TooltipList title="Where they stand" empty="No CVs in this period." rows={stageRows} limit={10} />
              {positionRows.length > 0 && <TooltipList title="By position" rows={positionRows} limit={4} />}
            </>
          }
        />
        <InsightTile
          label="Interviews, next 7 days"
          value={upcoming.length}
          hint="Click for the calendar"
          onOpen={() => setDetail('interviews')}
          details={
            <>
              <TooltipTable
                title="By department"
                columns={['Primary', 'Final', 'Next 7 days']}
                rows={interviewsByDepartment}
                empty="No interviews held or scheduled."
                note="Primary and Final: interviews held, with a result recorded."
              />
              <TooltipList
                title="Scheduled"
                empty="No interviews in the next 7 days."
                rows={upcoming.map(({ c, date, time, round }) => ({
                  label: c.full_name,
                  note: `${round} · ${designationOf(c)}`,
                  value: slotText(date, time),
                }))}
              />
            </>
          }
        />
        <InsightTile
          label="Avg. CV review time"
          value={reviewCount ? duration(reviewSeconds / reviewCount) : '-'}
          hint={`${reviewCount} CV${reviewCount === 1 ? '' : 's'} reviewed`}
          onOpen={() => setDetail('review')}
          details={
            <TooltipList
              title="Longest CV reviews"
              empty="No CV has been reviewed in this period."
              rows={[...reviewedPeople]
                .sort((a, b) => b.review_seconds - a.review_seconds)
                .map((c) => ({
                  label: c.full_name,
                  note: designationOf(c),
                  value: duration(c.review_seconds),
                }))}
            />
          }
        />
        <InsightTile
          label="Merit and waiting"
          value={
            <span className="flex flex-wrap items-baseline gap-x-3">
              <span>{meritList.length} <span className="text-xs font-medium tracking-normal text-ink-muted">Merit</span></span>
              <span>{waitingList.length} <span className="text-xs font-medium tracking-normal text-ink-muted">Waiting</span></span>
            </span>
          }
          hint={offersToSend > 0 ? `${offersToSend} letter${offersToSend === 1 ? '' : 's'} to send` : undefined}
          onOpen={() => setDetail('selected')}
          details={
            <>
              <TooltipTable
                title="Offer letters by department"
                columns={['Sent', 'Accepted', 'Rejected']}
                rows={lettersByDepartment}
                empty="No offer letter sent yet."
                note="Accepted: joining confirmed or joined. Rejected: did not confirm after the letter."
              />
              <TooltipList
                title={`Merit list: ${meritList.length}`}
                empty="No one on the merit list."
                rows={meritList.map((c) => ({ label: c.full_name, note: designationOf(c) + (joiningWhen(c).date ? ` · Joins ${whenText(joiningWhen(c).date, joiningWhen(c).time)}` : ''), value: JOINING[c.joining_status].label }))}
              />
              <TooltipList
                title={`Waiting list: ${waitingList.length}`}
                empty="No one on the waiting list."
                rows={waitingList.map((c) => ({ label: c.full_name, note: designationOf(c), value: afterFinal(c).label }))}
              />
            </>
          }
        />
        <InsightTile
          label="Avg. time to hire"
          value={avgHire === null ? '-' : `${avgHire} day${avgHire === 1 ? '' : 's'}`}
          hint="CV received to final selection"
          onOpen={() => setDetail('hire')}
          details={
            <TooltipList
              title="Days from CV to final selection"
              empty="No one selected in this period."
              rows={hireRows.map(({ c, days }) => ({
                label: c.full_name,
                note: designationOf(c),
                value: `${days} day${days === 1 ? '' : 's'}`,
              }))}
            />
          }
        />
        <InsightTile
          label="Candidate rating"
          value={avgReview === null ? '-' : `${avgReview.toFixed(1)} / 5`}
          hint={`${submitted.length} review${submitted.length === 1 ? '' : 's'}`}
          onOpen={() => setDetail('rating')}
          details={
            <TooltipList
              title={`From ${submitted.length} of ${scopedReviews.length} candidates asked`}
              empty="No reviews yet."
              rows={submitted.length === 0 ? [] : [
                { label: 'Overall', value: averageOf((r) => r.overall) },
                { label: 'Communication', value: averageOf((r) => r.communication) },
                { label: 'Professionalism', value: averageOf((r) => r.professionalism) },
                { label: 'Clear process', value: averageOf((r) => r.clarity) },
                { label: 'Waiting for a reply', value: scopedReviews.length - submitted.length },
              ]}
            />
          }
        />
      </div>

      {leadsTeam && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card tour="dash-team" title="Process team progress" className="lg:col-span-2"><TeamProgress items={inDepartment} /></Card>
          <Card title="Decisions by the process team">
            <RecentUpdates events={PROCESS_EVENTS} empty="No decisions yet. Confirmation letters, final rejections and joining outcomes appear here." />
          </Card>
          <Card tour="dash-now" title="Who is working now" className="lg:col-span-3" action={<Link to="/activity" className="text-xs underline">Team activity</Link>}>
            <WorkingNow compact />
          </Card>
        </div>
      )}
      {processOnly && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title="Handed to you" className="lg:col-span-2"><HandedToMe items={inDepartment} /></Card>
          <Card title="New CVs, postings and handovers">
            <RecentUpdates events={INCOMING_EVENTS} empty="Nothing new yet." />
          </Card>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card tour="dash-todo" title={screeningOnly ? 'To do: CV screening' : processOnly ? 'To do: your candidates' : 'To do'} className="lg:row-span-2">
          {work.length === 0 ? (
            <EmptyState icon={UserCheck} title="Nothing waiting">New work appears here as CVs move through the process.</EmptyState>
          ) : (
            <ul className="-mx-2 max-h-[30rem] space-y-0.5 overflow-y-auto">
              {work.map(({ key, icon: Icon, text, to, urgent }) => (
                <li key={key}>
                  <Link to={to} className="flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-hover">
                    <Icon className={classNames('mt-0.5 size-4 shrink-0', urgent ? 'text-red-700' : 'text-ink-muted')} aria-hidden />
                    <span className={urgent ? 'font-medium' : ''}>{text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Hiring funnel"><Funnel items={scoped} positionOf={designationOf} /></Card>
        <Card title="Where CVs come from"><Sources items={scoped} positionOf={designationOf} /></Card>

        <Card
          title="Upcoming interviews"
          action={<Button size="sm" variant="ghost" icon={Calendar} onClick={() => setDetail('interviews')}>Calendar</Button>}
        >
          {interviews.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">No interviews scheduled.</p>
          ) : (
            <ul className="space-y-2.5">
              {interviews.slice(0, 6).map(({ c, date, time, round }) => (
                <li key={`${c.id}-${round}`}>
                  <Link to={{ search: `?candidate=${c.id}` }} className="flex items-center gap-2.5 text-sm hover:underline">
                    <Avatar name={c.full_name} url={c.photo_path ? photoUrls[c.photo_path] : null} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 font-medium"><span className="truncate">{c.full_name}</span><RecommendationStars candidate={c} /></span>
                      <span className="block truncate text-xs text-ink-muted">{round} · {bucketById.get(c.bucket_id)?.designation}</span>
                    </span>
                    <span className="tabular shrink-0 text-right text-xs text-ink-soft">
                      {date === today ? <strong>Today</strong> : dayMonth(date)}
                      <span className="block">{time12(time)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="CVs per week"><Inflow items={inDepartment} positionOf={designationOf} /></Card>
      </div>

      <Card
        tour="dash-shortlisted"
        title={`Shortlisted candidates (${shortlisted.length})`}
        className="mt-4"
        action={shortlisted.length > 0 ? <Button size="sm" variant="ghost" icon={UserCheck} onClick={() => setDetail('shortlisted')}>See all</Button> : undefined}
      >
        {shortlisted.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">No one shortlisted yet. Candidates you select at CV review appear here.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-ink-soft">
              {waitingForCall.length} waiting for the call · {shortlisted.length - waitingForCall.length - shortlistedConfirmed.length - shortlistedRejected.length} further in the process
              {' '}· {shortlistedConfirmed.length} confirmed · {shortlistedRejected.length} rejected later
            </p>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {shortlisted.slice(0, 9).map((c) => {
                const stage = stageOf(c);
                return (
                  <li key={c.id}>
                    <Link to={{ search: `?candidate=${c.id}` }} className="flex items-center gap-2.5 text-sm hover:underline">
                      <Avatar name={c.full_name} url={c.photo_path ? shortlistedPhotos[c.photo_path] : null} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 font-medium"><span className="truncate">{c.full_name}</span><RecommendationStars candidate={c} /></span>
                        <span className="block truncate text-xs text-ink-muted">
                          {designationOf(c)}{c.handed_over_at ? ` · Shortlisted ${dayMonth(c.handed_over_at)}` : ''}
                        </span>
                      </span>
                      <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {shortlisted.length > 9 && (
              <button type="button" className="mt-2 text-xs text-ink-muted underline hover:text-ink" onClick={() => setDetail('shortlisted')}>
                and {shortlisted.length - 9} more
              </button>
            )}
          </>
        )}
      </Card>

      <Card title="Recommended by interviewers" className="mt-4">
        {recommended.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">No candidate has been recommended yet. Interviewers recommend candidates when their score is entered.</p>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {recommended.slice(0, 9).map((c) => (
                <li key={c.id}>
                  <Link to={{ search: `?candidate=${c.id}` }} className="flex items-center gap-2.5 text-sm hover:underline">
                    <Avatar name={c.full_name} url={c.photo_path ? recommendedPhotos[c.photo_path] : null} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.full_name}</span>
                      <span className="block truncate text-xs text-ink-muted">{designationOf(c)} · {stageOf(c).label}</span>
                    </span>
                    <RecommendationStars candidate={c} />
                  </Link>
                </li>
              ))}
            </ul>
            {recommended.length > 9 && <p className="mt-2 text-xs text-ink-muted">and {recommended.length - 9} more</p>}
          </>
        )}
      </Card>

      {recentBuckets.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent CV buckets</h2>
            <Link to="/buckets" className="text-xs underline">All buckets</Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recentBuckets.map((bucket) => (
              <BucketFolder key={bucket.id} bucket={bucket} stats={bucketStats(candidates.filter((c) => c.bucket_id === bucket.id))} />
            ))}
          </div>
        </section>
      )}

      {detail === 'requisitions' && (
        <DetailDialog
          title={`Open requisitions: ${openRequisitions.length}`}
          description={`Everything not filled or cancelled${department ? ` in ${department}` : ''}, the same as "Still open" on the Requisitions page. Click a row for its details.`}
          page={{ to: '/requisitions?tab=requisitions&status=open', label: 'the Requisitions page' }}
          onClose={closeDetail}
        >
          <Figures
            items={[
              { label: 'Open requisitions', value: openRequisitions.length },
              { label: 'Vacancies to fill', value: openVacancies },
              { label: 'On hold', value: openRequisitions.filter(({ r }) => r.status === 'On hold').length },
              { label: 'Open over 30 days', value: openRequisitions.filter(({ r }) => daysOpen(r) > 30).length, tone: openRequisitions.some(({ r }) => daysOpen(r) > 30) ? 'warning' : undefined },
            ]}
          />
          <div className="grid gap-5 md:grid-cols-2">
            <Section title="By unit"><BarList rows={countRows(openRequisitions.map(({ r }) => requisitionPlace(r)))} empty="No open requisitions." /></Section>
            <Section title="By status"><BarList rows={countRows(openRequisitions.map(({ r }) => r.status))} empty="No open requisitions." color="bg-sky-600" /></Section>
          </div>
          <Section title="Requisitions">
            <DataTable
              rows={openRequisitions}
              rowKey={({ r }) => r.id}
              rowLabel={({ r }) => `Details of ${r.ref_no} ${r.designation}`}
              onRowClick={({ r }) => setRequisitionShown(r.id)}
              empty="No open requisitions."
              columns={[
                { label: 'Ref.', value: ({ r }) => r.ref_no, className: 'tabular whitespace-nowrap text-xs' },
                { label: 'Position', value: ({ r }) => <><span className="font-medium">{r.designation}</span><span className="block text-xs text-ink-muted">{placeText(r) || r.department}</span></> },
                { label: 'Status', value: ({ r }) => <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge> },
                { label: 'Filled', value: ({ r, cvs, filled }) => <span onClick={(event) => event.stopPropagation()}><FillMeter vacancies={r.vacancies} people={cvs} filled={filled} /></span> },
                { label: 'CVs', align: 'right', value: ({ cvs }) => cvs.length },
                { label: 'Days open', align: 'right', value: ({ r }) => <span className={daysOpen(r) > 30 ? 'font-semibold text-amber-800' : undefined}>{daysOpen(r)}</span> },
              ]}
            />
          </Section>
        </DetailDialog>
      )}
      {requisitionShown && requisitions.some((r) => r.id === requisitionShown) && (
        <RequisitionDetails requisition={requisitions.find((r) => r.id === requisitionShown)!} onClose={() => setRequisitionShown(null)} />
      )}

      {detail === 'cvs' && (
        <DetailDialog title={`CVs received: ${scoped.length}`} description={period === 'all' ? 'All time.' : `Last ${period} days.`} page={{ to: '/buckets', label: 'CV Buckets' }} onClose={closeDetail}>
          <Figures
            items={[
              { label: 'CVs received', value: scoped.length },
              { label: 'In process', value: scoped.filter(isActive).length },
              { label: 'Shortlisted', value: scoped.filter((c) => c.screening_status === 'shortlisted').length },
              { label: 'Rejected', value: scoped.filter(isRejected).length },
            ]}
          />
          <Section title="By department">
            <CountTable heading="Department" columns={['CVs', 'Interviews held', 'Primary held']} rows={cvsByDepartment} empty="No CVs in this period." />
          </Section>
          <div className="grid gap-5 md:grid-cols-2">
            <Section title="Where they stand"><BarList rows={stageRows.map((row) => ({ label: row.label, value: Number(row.value) }))} empty="No CVs in this period." limit={20} /></Section>
            <Section title="By position"><BarList rows={positionRows} empty="No CVs in this period." color="bg-sky-600" /></Section>
          </div>
          <Section title="By source"><BarList rows={countRows(scoped.map((c) => c.source))} empty="No CVs in this period." color="bg-amber-500" /></Section>
        </DetailDialog>
      )}

      {detail === 'interviews' && (
        <DetailDialog
          title="Interview calendar"
          description="Every interview day is marked. Choose a day to see who is coming and when; click a name to open the candidate."
          onClose={closeDetail}
        >
          <InterviewCalendar events={interviewEvents} onOpenCandidate={openCandidate} />
          <Section title="Interviews by department">
            <CountTable heading="Department" columns={['Primary held', 'Final held', 'Next 7 days']} rows={interviewsByDepartment} empty="No interviews held or scheduled." />
          </Section>
        </DetailDialog>
      )}

      {detail === 'review' && (
        <DetailDialog title="CV review time" description="Time the screening desk spent with each CV open, from opening it to selecting, rejecting or closing it." onClose={closeDetail}>
          <Figures
            items={[
              { label: 'Average per CV', value: reviewCount ? duration(reviewSeconds / reviewCount) : '-' },
              { label: 'CVs reviewed', value: reviewCount },
              { label: 'Total time', value: duration(reviewSeconds) },
              { label: 'Not reviewed yet', value: scoped.filter((c) => c.screening_status === 'new').length },
            ]}
          />
          <Section title="How long each review took">
            <BarList
              rows={[
                { label: 'Under 1 minute', value: reviewedPeople.filter((c) => c.review_seconds < 60).length },
                { label: '1 to 3 minutes', value: reviewedPeople.filter((c) => c.review_seconds >= 60 && c.review_seconds < 180).length },
                { label: '3 to 10 minutes', value: reviewedPeople.filter((c) => c.review_seconds >= 180 && c.review_seconds < 600).length },
                { label: 'Over 10 minutes', value: reviewedPeople.filter((c) => c.review_seconds >= 600).length },
              ]}
              empty="No CV has been reviewed in this period."
            />
          </Section>
          <Section title="CVs reviewed, longest first">
            <DataTable
              rows={[...reviewedPeople].sort((a, b) => b.review_seconds - a.review_seconds)}
              rowKey={(c) => c.id}
              rowLabel={(c) => `Open ${c.full_name}`}
              onRowClick={openCandidate}
              empty="No CV has been reviewed in this period."
              columns={[
                { label: 'Name', value: (c) => <span className="font-medium">{c.full_name}</span> },
                { label: 'Position', value: designationOf },
                { label: 'Where they stand', value: (c) => stageOf(c).label },
                { label: 'Sittings', align: 'right', value: (c) => c.review_count },
                { label: 'Time', align: 'right', value: (c) => duration(c.review_seconds) },
              ]}
            />
          </Section>
        </DetailDialog>
      )}

      {detail === 'selected' && (
        <DetailDialog title="Merit and waiting lists" page={{ to: '/selected', label: 'Selected Candidates' }} onClose={closeDetail}>
          <Figures
            items={[
              { label: 'Merit list', value: meritList.length },
              { label: 'Waiting list', value: waitingList.length },
              { label: 'Letters to send', value: offersToSend, tone: offersToSend ? 'warning' : undefined },
              { label: 'Joined', value: selected.filter((c) => c.joining_status === 'joined').length },
            ]}
          />
          <Section title="Offer letters by department">
            <CountTable heading="Department" columns={['Sent', 'Accepted', 'Did not confirm']} rows={lettersByDepartment} empty="No offer letter sent yet." />
          </Section>
          {(['merit', 'waiting'] as const).map((list) => (
            <Section key={list} title={`${CATEGORY_LABELS[list]} list`}>
              <DataTable
                rows={list === 'merit' ? meritList : waitingList}
                rowKey={(c) => c.id}
                rowLabel={(c) => `Open ${c.full_name}`}
                onRowClick={openCandidate}
                empty={`No one on the ${list} list.`}
                maxHeight="max-h-72"
                columns={[
                  { label: 'Name', value: (c) => <span className="font-medium">{c.full_name}</span> },
                  { label: 'Position', value: designationOf },
                  { label: 'Final score', align: 'right', value: (c) => (c.secondary_score !== null ? `${c.secondary_score}/10` : '-') },
                  { label: 'Status', value: (c) => (list === 'merit' ? JOINING[c.joining_status].label : afterFinal(c).label) },
                  ...(list === 'merit' ? [{ label: 'Joins', value: (c: Candidate) => whenText(joiningWhen(c).date, joiningWhen(c).time) || '-' }] : []),
                  { label: 'Remarks', value: (c) => <span className="line-clamp-2 text-xs" title={c.secondary_feedback}>{c.secondary_feedback || '-'}</span> },
                ]}
              />
            </Section>
          ))}
        </DetailDialog>
      )}

      {detail === 'shortlisted' && (
        <DetailDialog title="Shortlisted candidates" description="Everyone selected at CV review and handed to the process team, and where each one stands now." onClose={closeDetail}>
          <Figures
            items={[
              { label: 'Shortlisted', value: shortlisted.length },
              { label: 'Waiting for the call', value: waitingForCall.length, tone: waitingForCall.length ? 'warning' : undefined },
              { label: 'Confirmed', value: shortlistedConfirmed.length },
              { label: 'Rejected later', value: shortlistedRejected.length },
            ]}
          />
          <Section title="By position">
            <BarList rows={countRows(shortlisted.map(designationOf))} empty="No one shortlisted." />
          </Section>
          <Section title="Everyone shortlisted">
            <DataTable
              rows={shortlisted}
              rowKey={(c) => c.id}
              rowLabel={(c) => `Open ${c.full_name}`}
              onRowClick={openCandidate}
              empty="No one shortlisted."
              columns={[
                { label: 'Name', value: (c) => <span className="font-medium">{c.full_name}</span> },
                { label: 'Position', value: designationOf },
                { label: 'Mobile', value: (c) => <span className="tabular whitespace-nowrap">{c.phone || '-'}</span> },
                { label: 'Shortlisted on', value: (c) => <span className="tabular whitespace-nowrap">{c.handed_over_at ? dateMedium(c.handed_over_at) : '-'}</span> },
                { label: 'Handled by', value: (c) => handlerNames(c, team) },
                { label: 'Stage', value: (c) => <StatusBadge tone={stageOf(c).tone}>{stageOf(c).label}</StatusBadge> },
              ]}
            />
          </Section>
        </DetailDialog>
      )}

      {detail === 'hire' && (
        <DetailDialog title="Time to hire" description="Days from receiving the CV to selection at the final interview." page={{ to: '/selected', label: 'Selected Candidates' }} onClose={closeDetail}>
          <Figures
            items={[
              { label: 'Average', value: avgHire === null ? '-' : `${avgHire} d` },
              { label: 'Fastest', value: hireRows.length ? `${hireRows[0].days} d` : '-' },
              { label: 'Slowest', value: hireRows.length ? `${hireRows[hireRows.length - 1].days} d` : '-' },
              { label: 'People selected', value: hireRows.length },
            ]}
          />
          <div className="grid gap-5 md:grid-cols-2">
            <Section title="Each person">
              <BarList rows={hireRows.map(({ c, days }) => ({ label: c.full_name, note: designationOf(c), value: days, text: `${days} d` }))} empty="No one selected in this period." limit={15} />
            </Section>
            <Section title="Average by position">
              <BarList
                rows={[...new Set(hireRows.map(({ c }) => designationOf(c)))].map((position) => {
                  const days = hireRows.filter(({ c }) => designationOf(c) === position).map((row) => row.days);
                  const average = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
                  return { label: position, value: average, text: `${average} d`, note: `${days.length} selected` };
                }).sort((a, b) => b.value - a.value)}
                empty="No one selected in this period."
                color="bg-sky-600"
              />
            </Section>
          </div>
        </DetailDialog>
      )}

      {detail === 'rating' && (
        <DetailDialog title="Candidate rating" description={`From ${submitted.length} of ${scopedReviews.length} candidates asked for feedback.`} page={{ to: '/reviews', label: 'Candidate Reviews' }} onClose={closeDetail}>
          <Section title="Average out of 5">
            <BarList
              max={5}
              color="bg-amber-500"
              empty="No reviews yet."
              rows={submitted.length === 0 ? [] : [
                { label: 'Overall', pick: (r: (typeof reviews)[number]) => r.overall },
                { label: 'Communication', pick: (r: (typeof reviews)[number]) => r.communication },
                { label: 'Professionalism', pick: (r: (typeof reviews)[number]) => r.professionalism },
                { label: 'Clear process', pick: (r: (typeof reviews)[number]) => r.clarity },
              ].map(({ label, pick }) => {
                const values = submitted.map(pick).filter((v): v is number => v !== null);
                const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
                return { label, value: average, text: values.length ? average.toFixed(1) : '-' };
              })}
            />
          </Section>
          <Section title="Latest feedback">
            <DataTable
              rows={[...submitted].sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''))}
              rowKey={(r) => r.id}
              empty="No reviews yet."
              columns={[
                { label: 'Candidate', value: (r) => <span className="font-medium">{candidates.find((c) => c.id === r.candidate_id)?.full_name}</span> },
                { label: 'Interview', value: (r) => (r.stage === 'primary' ? 'Primary' : 'Final') },
                { label: 'Overall', align: 'right', value: (r) => `${r.overall}/5` },
                { label: 'Comments', value: (r) => <span className="line-clamp-2 text-xs">{r.comments || '-'}</span> },
                { label: 'Sent', value: (r) => dayMonth(r.submitted_at), className: 'whitespace-nowrap text-xs' },
              ]}
            />
          </Section>
        </DetailDialog>
      )}
    </>
  );
}
