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
import { Link } from 'react-router-dom';
import { Avatar, Card, EmptyState, HoverTooltip, InsightTile, PageHeader, RecommendationStars, Select, TooltipList, TooltipTable, type TooltipRow, type TooltipTableRow } from '../components/ui';
import { classNames, dateMedium, dateTime, dayMonth, daysBetween, duration, isoDate, time12, todayIso, whenText } from '../lib/format';
import { afterFinal, bucketStats, fillsVacancy, isActive, isRejected, JOINING, joiningWhen, matchesStageFilter, nextAction, recommendationCount, stageOf, type StageFilter } from '../lib/pipeline';
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

function FillMeter({ vacancies, people }: { vacancies: number; people: Candidate[] }) {
  const selected = people.filter((c) => c.secondary_status === 'selected');
  const filling = selected.filter(fillsVacancy);
  const waiting = selected.filter((c) => c.selection_category === 'waiting' && c.joining_status !== 'declined');
  const notConfirmed = selected.filter((c) => c.selection_category === 'merit' && c.joining_status === 'declined');
  return (
    <HoverTooltip
      side="above"
      label={`${filling.length} of ${vacancies} vacancies filled`}
      className="inline-flex items-center gap-2 rounded px-1 py-1 transition-colors hover:bg-hover"
      details={
        <>
          <TooltipList
            title={`${filling.length} of ${vacancies} filled`}
            empty="No one on the merit list yet."
            rows={filling.map((c) => ({ label: c.full_name, value: JOINING[c.joining_status].label }))}
          />
          <TooltipList
            title="Still to fill"
            rows={[
              { label: 'Vacancies left', value: Math.max(0, vacancies - filling.length) },
              { label: 'On the waiting list', value: waiting.length },
              { label: 'Did not confirm', value: notConfirmed.length },
              { label: 'CVs still in process', value: people.filter(isActive).length },
            ]}
          />
        </>
      }
    >
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-hover" aria-hidden>
        <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (filling.length / vacancies) * 100)}%` }} />
      </span>
      <span className="tabular text-xs">{filling.length}/{vacancies}</span>
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
  { label: 'To call', hint: 'Handed over, call not made or follow-up due', test: (c) => matchesStageFilter(c, 'calling') },
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

  const activeRequisitions = requisitions.filter(
    (r) => ['Approved', 'In progress', 'Pending approval'].includes(r.status) && (!department || r.department === department),
  );

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

  const vacancies = activeRequisitions
    .map((r) => {
      const filled = buckets
        .filter((b) => b.requisition_id === r.id)
        .reduce((count, b) => count + candidates.filter((c) => c.bucket_id === b.id && fillsVacancy(c)).length, 0);
      return { r, left: Math.max(0, r.vacancies - filled) };
    })
    .filter(({ left }) => left > 0)
    .sort((a, b) => b.left - a.left);
  const openVacancies = vacancies.reduce((sum, { left }) => sum + left, 0);

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
            The tiles show how hiring is going: point at one for details, click it to open its page. To do lists your next steps; click a line to
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

      <div data-tour="dash-tiles" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <InsightTile
          label="Open vacancies"
          value={openVacancies}
          hint={`${activeRequisitions.length} requisition${activeRequisitions.length === 1 ? '' : 's'}`}
          to="/requisitions"
          linkLabel="Requisitions"
          details={
            <TooltipList
              title="Positions still to fill"
              empty="No open vacancies."
              rows={vacancies.map(({ r, left }) => ({
                label: r.designation,
                note: `${r.ref_no} · ${r.status}`,
                value: `${left} of ${r.vacancies}`,
              }))}
            />
          }
        />
        <InsightTile
          label="CVs received"
          value={scoped.length}
          hint={`${scoped.filter(isActive).length} in process`}
          to="/buckets"
          linkLabel="CV Buckets"
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
          to="/buckets"
          linkLabel="CV Buckets"
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
          to="/buckets"
          linkLabel="CV Buckets"
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
          to="/selected"
          linkLabel="Selected Candidates"
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
          to="/selected"
          linkLabel="Selected Candidates"
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
          to="/reviews"
          linkLabel="Candidate Reviews"
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

        <Card title="Upcoming interviews">
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

      <Card title="Open requisitions" className="mt-4" action={<Link to="/requisitions" className="text-xs underline">All requisitions</Link>}>
        {activeRequisitions.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No open requisitions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th scope="col" className="py-1.5 pr-3 font-medium">Position</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Status</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Filled</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">CVs</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">Open for</th>
                  <th scope="col" className="py-1.5 font-medium">Target date</th>
                </tr>
              </thead>
              <tbody>
                {activeRequisitions.map((r) => {
                  const linked = buckets.filter((b) => b.requisition_id === r.id);
                  const ids = new Set(linked.map((b) => b.id));
                  const cvs = candidates.filter((c) => ids.has(c.bucket_id));
                  const late = r.target_date !== null && r.target_date < today;
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className="py-2 pr-3">
                        {linked[0] ? <Link to={`/buckets/${linked[0].id}`} className="font-medium hover:underline">{r.designation}</Link> : <span className="font-medium">{r.designation}</span>}
                        <span className="block text-xs text-ink-muted">{r.ref_no} · {r.department}</span>
                      </td>
                      <td className="py-2 pr-3 text-xs">{r.status}</td>
                      <td className="py-2 pr-3">
                        <FillMeter vacancies={r.vacancies} people={cvs} />
                      </td>
                      <td className="tabular py-2 pr-3 text-right">{cvs.length}</td>
                      <td className="tabular py-2 pr-3 text-right">{daysBetween(r.created_at, new Date())} d</td>
                      <td className={classNames('tabular py-2 text-xs', late && 'font-medium text-red-800')}>{dateMedium(r.target_date) || '-'}{late && ' (late)'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
    </>
  );
}
