import { useMemo } from 'react';
import { STAGE_LABEL } from '../lib/assessment';
import { dateMedium } from '../lib/format';
import { rejectionsByStep, roundSummary, type RoundSummary } from '../lib/interviewSummary';
import { useStore } from '../lib/store';
import type { Candidate, InterviewStage } from '../types';

/** One interview round of a bucket, worked out from its candidates, panel and forms. */
export function useRound(bucketId: string, items: Candidate[], stage: InterviewStage): RoundSummary {
  const { panels, team, assessments } = useStore();
  return useMemo(() => roundSummary(items, stage, { bucketId, panels, team, assessments }), [items, stage, bucketId, panels, team, assessments]);
}

const names = (people: Candidate[], limit = 4) =>
  people.length === 0 ? '' : `${people.slice(0, limit).map((c) => c.full_name).join(', ')}${people.length > limit ? ` +${people.length - limit} more` : ''}`;

/** Who interviewed, when, and how many came, missed or were given a new date. */
export function RoundDetails({ round, showNames = false }: { round: RoundSummary; showNames?: boolean }) {
  const rows: [string, Candidate[]][] = [
    ['Attended', round.attended],
    ['Passed', round.passed],
    ['Rejected after interview', round.failed],
    ['Waiting for the interview', round.waiting],
    ['Absent', round.absent],
    ["Can't attend", round.cantAttend],
    ['Not interested', round.notInterested],
    ['Given a new date', round.rescheduled],
  ];
  return (
    <section className="[&+section]:mt-2.5 [&+section]:border-t [&+section]:border-line [&+section]:pt-2.5">
      <h3 className="mb-1 font-semibold text-ink">{STAGE_LABEL[round.stage]}</h3>
      {round.scheduled.length === 0 ? (
        <p className="text-ink-muted">Nobody scheduled yet.</p>
      ) : (
        <>
          <p className="text-ink-soft">
            {round.days.length > 0 ? round.days.slice(0, 3).map((d) => dateMedium(d)).join(', ') : 'Day not set'}
            {round.days.length > 3 ? ` +${round.days.length - 3} more` : ''} · {round.scheduled.length} scheduled
          </p>
          <ul className="mt-1 space-y-0.5">
            {rows.filter(([, people]) => people.length > 0).map(([label, people]) => (
              <li key={label}>
                <span className="flex justify-between gap-3">
                  <span className="text-ink">{label}</span>
                  <span className="tabular font-semibold text-ink">{people.length}</span>
                </span>
                {showNames && <span className="block text-ink-muted">{names(people)}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-1 text-ink-soft">
        <span className="font-medium text-ink">Interviewers: </span>
        {round.interviewers.length > 0 ? round.interviewers.join(', ') : 'none on the panel yet'}
      </p>
    </section>
  );
}

/** Where the rejected candidates stopped, with their names. */
export function RejectionDetails({ items, limit = 5 }: { items: Candidate[]; limit?: number }) {
  const groups = rejectionsByStep(items);
  return (
    <section className="[&+section]:mt-2.5 [&+section]:border-t [&+section]:border-line [&+section]:pt-2.5">
      <h3 className="mb-1 font-semibold text-ink">Rejected, by step</h3>
      {groups.length === 0 ? <p className="text-ink-muted">Nobody rejected.</p> : (
        <ul className="space-y-1.5">
          {groups.map((group) => (
            <li key={group.label}>
              <span className="flex justify-between gap-3">
                <span className="text-ink">{group.label}</span>
                <span className="tabular font-semibold text-ink">{group.people.length}</span>
              </span>
              <span className="block text-ink-muted">
                {group.people.slice(0, limit).map((p) => (p.detail.includes('·') && /Absent|attend|interested/i.test(p.detail) ? `${p.name} (${p.detail.split('·')[1].trim()})` : p.name)).join(', ')}
                {group.people.length > limit ? ` +${group.people.length - limit} more` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
