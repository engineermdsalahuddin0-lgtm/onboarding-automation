import { Activity as ActivityIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HelpTip } from '../components/Guide';
import { Button, Card, EmptyState, PageHeader, Select, Spinner, StatusBadge, TABLE, TD, TH, THEAD } from '../components/ui';
import { WorkingNow } from '../components/WorkingNow';
import { ACTIVITY_KINDS, activityText, actorOf, buildFeed, kindOf, summarise, type ActivityKind } from '../lib/activity';
import { backend } from '../lib/backend';
import { classNames, dateMedium, duration, timeAgo } from '../lib/format';
import { stageOf } from '../lib/pipeline';
import { useStore } from '../lib/store';
import { DESK_LABELS, personName } from '../lib/team';
import type { CandidateEvent, CvReviewSession } from '../types';

type Period = 'today' | 'week' | 'month';

const PERIODS: { value: Period; label: string; days: number }[] = [
  { value: 'today', label: 'Today', days: 0 },
  { value: 'week', label: 'Last 7 days', days: 7 },
  { value: 'month', label: 'Last 30 days', days: 30 },
];

const FEED_PAGE = 60;

function startOf(period: Period): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (PERIODS.find((p) => p.value === period)?.days ?? 0));
  return d.toISOString();
}

export function ActivityPage() {
  const { team, candidates, buckets, user } = useStore();
  const [period, setPeriod] = useState<Period>('week');
  const [personId, setPersonId] = useState('');
  const [kind, setKind] = useState<ActivityKind | ''>('');
  const [events, setEvents] = useState<CandidateEvent[] | null>(null);
  const [sessions, setSessions] = useState<CvReviewSession[]>([]);
  const [shown, setShown] = useState(FEED_PAGE);
  const [refreshKey, setRefreshKey] = useState(0);
  const [, setParams] = useSearchParams();

  // Steps saved anywhere in the team show up here within a moment.
  useEffect(() => backend.subscribe((table) => {
    if (table === 'candidates' || table === 'cv_review_sessions') setRefreshKey((n) => n + 1);
  }), []);

  useEffect(() => {
    let cancelled = false;
    const since = startOf(period);
    void Promise.all([
      backend.list<CandidateEvent>('candidate_events', { since: { column: 'created_at', value: since }, order: { column: 'created_at', ascending: false }, limit: 5000 }),
      backend.list<CvReviewSession>('cv_review_sessions', { since: { column: 'started_at', value: since }, order: { column: 'started_at', ascending: false }, limit: 5000 }),
    ]).then(([eventRows, sessionRows]) => {
      if (cancelled) return;
      setEvents(eventRows);
      setSessions(sessionRows);
    }).catch(() => !cancelled && setEvents([]));
    return () => {
      cancelled = true;
    };
  }, [period, refreshKey]);

  const candidateOf = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const summary = useMemo(
    () => (events ? summarise(team, events, sessions, candidates).sort((a, b) => b.total - a.total || personName(a.person).localeCompare(personName(b.person))) : []),
    [team, events, sessions, candidates],
  );
  const feed = useMemo(() => {
    if (!events) return [];
    const wanted = events.filter((event) => (!kind || kindOf(event) === kind) && (!personId || actorOf(event, team)?.id === personId));
    return buildFeed(wanted, (id) => candidateOf.get(id)?.bucket_id);
  }, [events, kind, personId, team, candidateOf]);
  const sharedInHand = candidates.filter((c) => c.screening_status === 'shortlisted' && c.assigned_to.length === 0 && !c.final_decision).length;

  const openCandidate = (id: string) => setParams((current) => {
    current.set('candidate', id);
    return current;
  });

  let lastDay = '';
  return (
    <>
      <PageHeader
        title="Team activity"
        titleActions={<HelpTip label="About team activity">Every step anyone saves is recorded with their name and the time, by the database itself, so nothing can be skipped. Use this page to see who is doing what, and how much each person has done.</HelpTip>}
        description="Who is working on what right now, what each person has done, and every step in order."
        actions={
          <Select label="Period" className="w-40" value={period} onChange={(e) => { setPeriod(e.target.value as Period); setShown(FEED_PAGE); }}>
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        }
      />

      <div className="space-y-4">
        <Card title="Working now" action={<HelpTip label="About working now">Shows who has the app open and which candidate card each person has open at this moment. It updates by itself.</HelpTip>}>
          <div data-tour="activity-now"><WorkingNow /></div>
        </Card>

        <Card title={`What each person did · ${PERIODS.find((p) => p.value === period)?.label}`}>
          <div data-tour="activity-people" className="-mx-4 overflow-x-auto">
            {!events ? <Spinner /> : (
              <table className={TABLE}>
                <thead className={THEAD}>
                  <tr>
                    <th scope="col" className={TH}>Person</th>
                    <th scope="col" className={classNames(TH, 'text-right')} title="CVs uploaded">Uploaded</th>
                    <th scope="col" className={classNames(TH, 'text-right')} title="CVs selected or rejected">Screened</th>
                    <th scope="col" className={classNames(TH, 'text-right')}>Handed over</th>
                    <th scope="col" className={classNames(TH, 'text-right')}>Calls</th>
                    <th scope="col" className={classNames(TH, 'text-right')} title="Schedules set and results entered">Interviews</th>
                    <th scope="col" className={classNames(TH, 'text-right')}>Decisions</th>
                    <th scope="col" className={classNames(TH, 'text-right')}>Joining</th>
                    <th scope="col" className={classNames(TH, 'text-right')} title="Time with new CVs open">CV review time</th>
                    <th scope="col" className={classNames(TH, 'text-right')} title="Candidates handed to this person by name, still in the process">In hand now</th>
                    <th scope="col" className={TH}>Last step</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.person.id}>
                      <th scope="row" className={classNames(TD, 'text-left font-normal')}>
                        <button type="button" className="text-left" onClick={() => setPersonId(row.person.id === personId ? '' : row.person.id)} aria-pressed={row.person.id === personId} title="Show only this person's steps below">
                          <span className="block font-medium underline-offset-2 hover:underline">{personName(row.person)}{row.person.id === user?.id ? ' (you)' : ''}</span>
                          <span className="block text-xs text-ink-muted">{row.person.job_title || DESK_LABELS[row.person.desk]}</span>
                        </button>
                      </th>
                      {[row.uploaded, row.screened, row.handedOver, row.calls, row.interviews, row.decisions, row.joining].map((value, index) => (
                        <td key={index} className={classNames(TD, 'tabular text-right', value === 0 && 'text-ink-muted')}>{value}</td>
                      ))}
                      <td className={classNames(TD, 'tabular text-right', row.reviewSeconds === 0 && 'text-ink-muted')}>{row.reviewSeconds ? duration(row.reviewSeconds) : '0'}</td>
                      <td className={classNames(TD, 'tabular text-right', row.inHand === 0 && 'text-ink-muted')}>{row.inHand}</td>
                      <td className={classNames(TD, 'text-xs text-ink-soft')}>{row.lastAt ? timeAgo(row.lastAt) : 'Nothing in this period'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {sharedInHand > 0 && <p className="mt-2 text-xs text-ink-muted">{sharedInHand} more candidate{sharedInHand === 1 ? ' is' : 's are'} with the whole process team, not one person.</p>}
        </Card>

        <Card title="Every step, newest first">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Select label="Person" className="w-48" value={personId} onChange={(e) => { setPersonId(e.target.value); setShown(FEED_PAGE); }}>
              <option value="">Everyone</option>
              {team.filter((p) => p.role !== 'pending').map((p) => <option key={p.id} value={p.id}>{personName(p)}</option>)}
            </Select>
            <Select label="Work" className="w-48" value={kind} onChange={(e) => { setKind(e.target.value as ActivityKind | ''); setShown(FEED_PAGE); }}>
              <option value="">All work</option>
              {ACTIVITY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
            <span className="pb-2 text-xs text-ink-muted">{feed.length} step{feed.length === 1 ? '' : 's'}</span>
          </div>
          {!events ? <Spinner /> : feed.length === 0 ? (
            <EmptyState icon={ActivityIcon} title="Nothing recorded for this choice">Try a longer period, or another person or kind of work.</EmptyState>
          ) : (
            <ol data-tour="activity-feed" className="divide-y divide-line">
              {feed.slice(0, shown).map(({ key, event, count }) => {
                const c = candidateOf.get(event.candidate_id);
                const bucket = buckets.find((b) => b.id === c?.bucket_id);
                const actor = actorOf(event, team);
                const day = dateMedium(event.created_at);
                const heading = day !== lastDay ? day : '';
                lastDay = day;
                return (
                  <li key={key}>
                    {heading && <p className="bg-canvas px-2 py-1 text-xs font-semibold text-ink-muted">{heading}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 text-sm">
                      <span className="tabular w-16 shrink-0 text-xs text-ink-muted">{new Date(event.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="w-32 shrink-0 truncate font-medium" title={event.actor_name}>{actor ? personName(actor) : event.actor_name || 'System'}</span>
                      <span className="min-w-48 flex-1">
                        {count > 1
                          ? <>Uploaded <strong>{count} CVs</strong>{bucket && <> to <Link className="underline" to={`/buckets/${bucket.id}`}>{bucket.designation}</Link></>}</>
                          : <>
                              {activityText(event)}
                              {c ? <>{': '}<button type="button" className="font-medium underline" onClick={() => openCandidate(c.id)}>{c.full_name}</button></> : <span className="text-ink-muted"> (candidate removed)</span>}
                              {bucket && <span className="text-xs text-ink-muted"> · {bucket.designation}</span>}
                            </>}
                      </span>
                      {c && count === 1 && <StatusBadge tone={stageOf(c).tone}>Now: {stageOf(c).label}</StatusBadge>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {feed.length > shown && <div className="mt-3 text-center"><Button onClick={() => setShown((n) => n + FEED_PAGE)}>Show {Math.min(FEED_PAGE, feed.length - shown)} more</Button></div>}
        </Card>
      </div>
    </>
  );
}
