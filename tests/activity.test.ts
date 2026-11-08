import { describe, expect, it } from 'vitest';
import { activityText, buildFeed, stillInProcess, summarise } from '../src/lib/activity';
import { buildDemoData, DEMO_PEOPLE } from '../src/lib/backend/seed';
import { TOURS } from '../src/lib/guide';
import type { CandidateEvent } from '../src/types';

const event = (id: string, fields: Partial<CandidateEvent>): CandidateEvent => ({
  id, candidate_id: 'cand-1', field: 'received', from_value: null, to_value: 'BDJobs', actor_name: 'Tareq Azij',
  actor_id: DEMO_PEOPLE.agm, created_at: '2026-11-08T10:00:00.000Z', ...fields,
});

describe('team activity', () => {
  it('says what each step was in words', () => {
    expect(activityText(event('1', { field: 'screening_status', to_value: 'shortlisted' }))).toBe('Selected the CV');
    expect(activityText(event('2', { field: 'assigned_to', to_value: 'Nafis' }))).toBe('Handed to Nafis');
    expect(activityText(event('3', { field: 'assigned_to', from_value: 'Nafis', to_value: 'Mili' }))).toBe('Moved from Nafis to Mili');
    expect(activityText(event('4', { field: 'call_status', to_value: 'confirm' }))).toBe('Call: candidate confirmed');
    expect(activityText(event('5', { field: 'final_decision', to_value: 'confirmed' }))).toBe('Sent the confirmation letter');
    expect(activityText(event('6', { field: 'received', actor_name: 'Candidate / system' }))).toBe('Applied through the company form');
  });

  it('counts each person\'s work by account, and by name for older records', () => {
    const { profiles, candidates } = buildDemoData();
    const events = [
      event('1', {}),
      event('2', { field: 'screening_status', to_value: 'shortlisted' }),
      event('3', { field: 'call_status', to_value: 'confirm', actor_id: null, actor_name: 'Nafis' }),
      event('4', { field: 'primary_status', to_value: 'selected', actor_id: DEMO_PEOPLE.mili, actor_name: 'Mili', created_at: '2026-11-08T12:00:00.000Z' }),
    ];
    const rows = summarise(profiles, events, [{ id: 's', candidate_id: 'cand-1', reviewer_name: 'Tareq Azij', reviewer_id: DEMO_PEOPLE.agm, started_at: '', ended_at: '', seconds: 90 }], candidates);
    const of = (id: string) => rows.find((r) => r.person.id === id)!;
    expect(of(DEMO_PEOPLE.agm)).toMatchObject({ uploaded: 1, screened: 1, reviewSeconds: 90, total: 2 });
    expect(of(DEMO_PEOPLE.nafis)).toMatchObject({ calls: 1, total: 1 });
    expect(of(DEMO_PEOPLE.mili)).toMatchObject({ interviews: 1, lastAt: '2026-11-08T12:00:00.000Z' });
    // In hand: handed to that person by name and not finished or stopped.
    expect(of(DEMO_PEOPLE.nafis).inHand).toBe(candidates.filter((c) => c.assigned_to.includes(DEMO_PEOPLE.nafis) && stillInProcess(c)).length);
    expect(of(DEMO_PEOPLE.nafis).inHand).toBeGreaterThan(0);
  });

  it('shows a bulk upload as one line, but keeps other steps apart', () => {
    const uploads = Array.from({ length: 40 }, (_, i) => event(`u${i}`, { candidate_id: `c${i}`, created_at: new Date(Date.parse('2026-11-08T10:00:00Z') + i * 1000).toISOString() }));
    const feed = buildFeed([...uploads, event('x', { field: 'screening_status', to_value: 'rejected', created_at: '2026-11-08T11:00:00.000Z' })], () => 'bkt-1');
    expect(feed.map((item) => [item.event.field, item.count])).toEqual([['screening_status', 1], ['received', 40]]);
  });

  it('gives the sample data a believable history', () => {
    const { candidate_events: events, candidates } = buildDemoData();
    expect(events.length).toBeGreaterThan(candidates.length);
    const mahmud = candidates.find((c) => c.full_name === 'Mahmud Karim')!;
    expect(events.filter((e) => e.candidate_id === mahmud.id).map((e) => e.field)).toContain('final_decision');
  });
});

describe('guided tours', () => {
  it('give every step a target and words', () => {
    for (const [id, tour] of Object.entries(TOURS)) {
      expect(tour.steps.length, id).toBeGreaterThan(0);
      for (const step of tour.steps) {
        expect(step.target, id).toMatch(/^[a-z-]+$/);
        expect(step.body.length, `${id}/${step.target}`).toBeGreaterThan(20);
      }
      expect(new Set(tour.steps.map((s) => s.target)).size, `${id} repeats a target`).toBe(tour.steps.length);
    }
  });
});
