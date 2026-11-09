// The full details behind each dashboard card, shown in a window over the dashboard instead of on another page:
// small bar charts, tables and, for interviews, a calendar.
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { classNames, dateMedium, dayName, isoDate, time12, todayIso } from '../lib/format';
import type { Candidate } from '../types';
import { Button, Dialog, TABLE, TD, TH, THEAD } from './ui';

/** A window of details, with a way to the page it is about for whoever wants the whole list. */
export function DetailDialog({ title, description, page, onClose, children }: {
  title: string;
  description?: ReactNode;
  /** The page with everything, e.g. { to: '/buckets', label: 'CV Buckets' }. */
  page?: { to: string; label: string };
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      title={title}
      description={description}
      onClose={onClose}
      width="max-w-5xl"
      footer={
        <>
          {page && (
            <Link to={page.to} className="mr-auto inline-flex items-center gap-1.5 text-sm text-ink-soft underline hover:text-ink">
              <ExternalLink className="size-3.5" aria-hidden /> Open {page.label}
            </Link>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="space-y-5">{children}</div>
    </Dialog>
  );
}

/** A row of headline figures at the top of a details window. */
export function Figures({ items }: { items: { label: string; value: ReactNode; hint?: string; tone?: 'bad' | 'warning' }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-line bg-canvas px-3 py-2.5">
          <dt className="text-xs text-ink-muted">{item.label}</dt>
          <dd className={classNames('tabular text-xl font-semibold', item.tone === 'bad' && 'text-red-800', item.tone === 'warning' && 'text-amber-800')}>{item.value}</dd>
          {item.hint && <dd className="text-xs text-ink-muted">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

export interface Bar {
  label: string;
  value: number;
  /** What is written at the end of the bar, when not the bare number. */
  text?: string;
  note?: string;
}

/** A horizontal bar chart: one labelled bar per row, longest first unless the order matters. */
export function BarList({ rows, empty = 'Nothing to show.', max: fixedMax, color = 'bg-brand-600', limit = 12 }: {
  rows: Bar[];
  empty?: string;
  /** The value of a full bar, e.g. 5 for a rating out of 5. Defaults to the largest value. */
  max?: number;
  color?: string;
  limit?: number;
}) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  const max = fixedMax ?? Math.max(1, ...rows.map((row) => row.value));
  const shown = rows.slice(0, limit);
  return (
    <>
      <ul className="space-y-1.5">
        {shown.map((row, index) => (
          <li key={`${row.label}-${index}`} className="grid grid-cols-[minmax(6rem,11rem)_1fr_auto] items-center gap-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate text-ink-soft" title={row.label}>{row.label}</span>
              {row.note && <span className="block truncate text-[11px] text-ink-muted">{row.note}</span>}
            </span>
            <span className="h-3 overflow-hidden rounded-r bg-canvas" aria-hidden>
              <span className={classNames('block h-full rounded-r', color)} style={{ width: `${Math.max(row.value ? 2 : 0, (row.value / max) * 100)}%` }} />
            </span>
            <span className="tabular min-w-10 text-right font-semibold">{row.text ?? row.value}</span>
          </li>
        ))}
      </ul>
      {rows.length > limit && <p className="mt-1 text-xs text-ink-muted">and {rows.length - limit} more</p>}
    </>
  );
}

export interface Column<T> {
  label: string;
  value: (row: T) => ReactNode;
  align?: 'right';
  className?: string;
}

/** A plain table that scrolls on its own when long, so the window stays a sensible size. */
export function DataTable<T>({ rows, columns, rowKey, onRowClick, rowLabel, empty = 'Nothing to show.', maxHeight = 'max-h-96' }: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Makes each row a button, e.g. to open the candidate. */
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
  empty?: string;
  maxHeight?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <div className={classNames('overflow-auto rounded-xl border border-line', maxHeight)}>
      <table className={TABLE}>
        <thead className={classNames(THEAD, 'sticky top-0 z-[1]')}>
          <tr>
            {columns.map((column) => <th key={column.label} scope="col" className={classNames(TH, column.align === 'right' && 'text-right')}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? 'cursor-pointer hover:bg-hover' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onRowClick(row); } } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
            >
              {columns.map((column) => (
                <td key={column.label} className={classNames(TD, 'py-2', column.align === 'right' && 'tabular text-right', column.className)}>{column.value(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Counts per group (department, unit) with a total row, as a full-size table. */
export function CountTable({ heading, columns, rows, empty }: { heading: string; columns: string[]; rows: { label: string; values: number[] }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  const totals = columns.map((_, index) => rows.reduce((sum, row) => sum + row.values[index], 0));
  return (
    <div className="overflow-auto rounded-xl border border-line">
      <table className={TABLE}>
        <thead className={THEAD}>
          <tr>
            <th scope="col" className={TH}>{heading}</th>
            {columns.map((column) => <th key={column} scope="col" className={`${TH} text-right`}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className={`${TD} py-2 text-left font-normal`}>{row.label}</th>
              {row.values.map((value, index) => <td key={columns[index]} className={`${TD} tabular py-2 text-right font-medium`}>{value}</td>)}
            </tr>
          ))}
          {rows.length > 1 && (
            <tr className="bg-canvas">
              <th scope="row" className={`${TD} py-2 text-left font-semibold`}>Total</th>
              {totals.map((value, index) => <td key={columns[index]} className={`${TD} tabular py-2 text-right font-semibold`}>{value}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interview calendar
// ---------------------------------------------------------------------------

export interface InterviewEvent {
  key: string;
  candidate: Candidate;
  date: string;
  time: string;
  round: 'Primary' | 'Final';
  /** scheduled: still to come; overdue: the day passed with no result; held: a result is recorded. */
  state: 'scheduled' | 'overdue' | 'held';
  result: string;
  position: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ROUND_DOT: Record<InterviewEvent['round'], string> = { Primary: 'bg-brand-600', Final: 'bg-amber-500' };

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

/** A month at a time, every interview day marked; choosing a day lists its interviews beside the month. */
export function InterviewCalendar({ events, onOpenCandidate }: { events: InterviewEvent[]; onOpenCandidate: (candidate: Candidate) => void }) {
  const today = todayIso();
  const weekEnd = addDays(today, 7);
  const byDay = useMemo(() => {
    const map = new Map<string, InterviewEvent[]>();
    for (const event of events) map.set(event.date, [...(map.get(event.date) ?? []), event]);
    for (const list of map.values()) list.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    return map;
  }, [events]);
  // Opens on the next day that has an interview, so the first thing seen is what is coming.
  const firstUpcoming = useMemo(() => [...byDay.keys()].filter((day) => day >= today).sort()[0], [byDay, today]);
  const [selected, setSelected] = useState(firstUpcoming ?? today);
  const [month, setMonth] = useState(() => (firstUpcoming ?? today).slice(0, 7));

  const [year, monthIndex] = month.split('-').map(Number);
  const first = new Date(year, monthIndex - 1, 1);
  const start = isoDate(new Date(year, monthIndex - 1, 1 - first.getDay()));
  const cells = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  // Six rows only when the month needs them.
  const rows = cells.slice(35).some((day) => day.slice(0, 7) === month) ? 6 : 5;
  const shiftMonth = (by: number) => setMonth(isoDate(new Date(year, monthIndex - 1 + by, 1)).slice(0, 7));

  const nextWeek = events.filter((event) => event.date >= today && event.date <= weekEnd && event.state === 'scheduled');
  const overdue = events.filter((event) => event.state === 'overdue');
  const dayEvents = byDay.get(selected) ?? [];

  return (
    <div className="space-y-4">
      <Figures
        items={[
          { label: 'Next 7 days', value: nextWeek.length, hint: `${nextWeek.filter((e) => e.round === 'Primary').length} primary · ${nextWeek.filter((e) => e.round === 'Final').length} final` },
          { label: 'Today', value: (byDay.get(today) ?? []).filter((e) => e.state !== 'held').length },
          { label: 'All still to come', value: events.filter((e) => e.state === 'scheduled').length },
          { label: 'Result not recorded', value: overdue.length, hint: 'The day passed', tone: overdue.length ? 'bad' : undefined },
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold" aria-live="polite">{MONTH_NAMES[monthIndex - 1]} {year}</h3>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" icon={ChevronLeft} aria-label="Previous month" onClick={() => shiftMonth(-1)} />
              <Button size="sm" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>Today</Button>
              <Button size="sm" variant="ghost" icon={ChevronRight} aria-label="Next month" onClick={() => shiftMonth(1)} />
            </div>
          </div>
          <div role="grid" aria-label={`Interviews in ${MONTH_NAMES[monthIndex - 1]} ${year}`} className="overflow-hidden rounded-xl border border-line">
            <div role="row" className="grid grid-cols-7 bg-canvas text-center text-xs font-medium text-ink-muted">
              {WEEKDAYS.map((day) => <span key={day} role="columnheader" className="py-1.5">{day}</span>)}
            </div>
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} role="row" className="grid grid-cols-7">
                {cells.slice(row * 7, row * 7 + 7).map((day) => {
                  const list = byDay.get(day) ?? [];
                  const inMonth = day.slice(0, 7) === month;
                  const inWeek = day >= today && day <= weekEnd;
                  const isSelected = day === selected;
                  const coming = list.filter((e) => e.state !== 'held').length;
                  const late = list.some((e) => e.state === 'overdue');
                  return (
                    <button
                      key={day}
                      type="button"
                      role="gridcell"
                      aria-selected={isSelected}
                      aria-label={`${dayName(day)} ${dateMedium(day)}: ${list.length ? `${list.length} interview${list.length === 1 ? '' : 's'}` : 'no interviews'}`}
                      onClick={() => { setSelected(day); if (!inMonth) setMonth(day.slice(0, 7)); }}
                      className={classNames(
                        'relative flex min-h-16 flex-col items-stretch gap-1 border-t border-l border-line p-1.5 text-left text-xs transition-colors first:border-l-0 hover:bg-hover',
                        !inMonth && 'text-ink-muted/60',
                        inWeek && !list.length && 'bg-brand-50/40',
                        list.length > 0 && (late ? 'bg-red-50' : coming ? 'bg-brand-50' : 'bg-canvas'),
                        isSelected && 'z-[1] outline-2 -outline-offset-2 outline-brand-600',
                      )}
                    >
                      <span className={classNames('tabular inline-flex size-6 items-center justify-center rounded-full', day === today && 'bg-ink font-semibold text-white')}>
                        {Number(day.slice(8))}
                      </span>
                      {list.length > 0 && (
                        <span className="flex flex-wrap items-center gap-1">
                          {list.slice(0, 4).map((event) => <span key={event.key} className={classNames('size-2 rounded-full', event.state === 'held' ? 'bg-line-strong' : ROUND_DOT[event.round])} aria-hidden />)}
                          <span className={classNames('tabular text-[11px] font-semibold', late ? 'text-red-800' : 'text-ink')}>{list.length}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand-600" aria-hidden /> Primary</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" aria-hidden /> Final</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-line-strong" aria-hidden /> Held</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-red-50 ring-1 ring-red-200" aria-hidden /> Result not recorded</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-brand-50/40 ring-1 ring-line" aria-hidden /> Next 7 days</span>
          </p>
        </div>

        <section aria-label={`Interviews on ${dateMedium(selected)}`} className="rounded-xl border border-line p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarDays className="size-4 text-ink-muted" aria-hidden />
            {selected === today ? 'Today' : dayName(selected)}, {dateMedium(selected)}
          </h3>
          {dayEvents.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">No interviews on this day.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {dayEvents.map((event) => (
                <li key={event.key}>
                  <button type="button" onClick={() => onOpenCandidate(event.candidate)} className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-hover">
                    <span className={classNames('mt-1.5 size-2 shrink-0 rounded-full', event.state === 'held' ? 'bg-line-strong' : ROUND_DOT[event.round])} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{event.candidate.full_name}</span>
                      <span className="block truncate text-xs text-ink-muted">{event.round} · {event.position}</span>
                      <span className={classNames('block text-xs', event.state === 'overdue' ? 'font-medium text-red-800' : 'text-ink-soft')}>{event.result}</span>
                    </span>
                    <span className="tabular shrink-0 text-xs text-ink-soft">{time12(event.time) || '-'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nextWeek.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <h4 className="mb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">Next 7 days</h4>
              <ul className="space-y-0.5 text-xs">
                {[...new Set(nextWeek.map((event) => event.date))].sort().map((day) => (
                  <li key={day}>
                    <button type="button" onClick={() => { setSelected(day); setMonth(day.slice(0, 7)); }} className={classNames('flex w-full justify-between rounded px-1.5 py-1 hover:bg-hover', day === selected && 'bg-hover font-semibold')}>
                      <span>{day === today ? 'Today' : `${dayName(day).slice(0, 3)}, ${dateMedium(day)}`}</span>
                      <span className="tabular">{nextWeek.filter((event) => event.date === day).length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
