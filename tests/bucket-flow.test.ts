import { describe, expect, it } from 'vitest';
import { bucketFlow, findFlowBox } from '../src/lib/bucketFlow';
import type { Candidate } from '../src/types';

let next = 0;
const person = (overrides: Partial<Candidate> = {}) =>
  ({
    id: `c${(next += 1)}`,
    full_name: `Person ${next}`,
    received_at: '2026-11-10T09:00:00Z',
    screening_status: 'new',
    screening_note: '',
    call_status: 'pending',
    call_note: '',
    message_status: 'not_sent',
    primary_status: 'pending',
    primary_attendance: '',
    secondary_message_status: 'not_sent',
    secondary_status: 'pending',
    secondary_attendance: '',
    selection_category: null,
    joining_status: 'pending',
    final_decision: null,
    ...overrides,
  }) as Candidate;

const selected = { screening_status: 'shortlisted' } as const;
const confirmed = { ...selected, call_status: 'confirm', message_status: 'message_done' } as const;
const primaryPassed = { ...confirmed, primary_status: 'selected' } as const;
const finalPassed = { ...primaryPassed, secondary_status: 'selected' } as const;

const TODAY = '2026-11-19';

function counts(items: Candidate[]) {
  const steps = bucketFlow(items, TODAY);
  return Object.fromEntries(steps.flatMap((s) => [s.node, ...s.branches]).map((b) => [b.id, b.people.length]));
}

describe('bucket flow', () => {
  const items = [
    person(),
    person({ screening_status: 'rejected' }),
    person({ screening_status: 'rejected' }),
    person({ ...selected }),
    person({ ...selected, call_status: 'followup' }),
    person({ ...selected, call_status: 'reject' }),
    person({ ...selected, call_status: 'confirm' }),
    person({ ...confirmed, primary_status: 'scheduled', primary_date: '2026-11-25' }),
    person({ ...confirmed, primary_status: 'scheduled', primary_date: '2026-11-16' }),
    person({ ...confirmed, primary_status: 'scheduled', primary_date: '2026-11-16', primary_attendance: 'absent' }),
    person({ ...confirmed, primary_status: 'rejected' }),
    person({ ...primaryPassed }),
    person({ ...primaryPassed, secondary_status: 'rejected' }),
    person({ ...finalPassed, selection_category: 'waiting' }),
    person({ ...finalPassed, final_decision: 'confirmed', joining_status: 'offer_sent' }),
    person({ ...finalPassed, final_decision: 'confirmed', joining_status: 'joined' }),
  ];

  it('counts everyone who reached a step, wherever they are now', () => {
    expect(counts(items)).toMatchObject({
      all: 16,
      'cv.selected': 13,
      'cv.rejected': 2,
      'cv.new': 1,
      'call.confirmed': 10,
      'call.rejected': 1,
      'call.followup': 1,
      'call.pending': 1,
      'primary.selected': 5,
      'primary.rejected': 1,
      'primary.absent': 1,
      'primary.scheduled': 1,
      'primary.due': 1,
      'primary.unscheduled': 1,
      'final.selected': 3,
      'final.rejected': 1,
      'final.unscheduled': 1,
      'decision.letter': 2,
      'decision.waiting': 1,
      'joining.joined': 1,
      'joining.due': 1,
    });
  });

  it('splits every step among its boxes, with nobody counted twice', () => {
    for (const step of bucketFlow(items, TODAY).slice(1)) {
      const ids = [...step.node.people, ...step.branches.flatMap((b) => b.people)].map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const [, review, call, primary, final] = bucketFlow(items, TODAY);
    const total = (s: typeof review) => s.node.people.length + s.branches.reduce((n, b) => n + b.people.length, 0);
    expect(total(review)).toBe(items.length);
    expect(total(call)).toBe(review.node.people.length);
    expect(total(primary)).toBe(call.node.people.length);
    expect(total(final)).toBe(primary.node.people.length);
  });

  it('leaves out boxes with nobody in them', () => {
    const steps = bucketFlow([person({ ...selected })], TODAY);
    expect(steps[1].branches).toEqual([]);
    expect(steps[2].branches.map((b) => b.id)).toEqual(['call.pending']);
  });

  it('finds a box by its id', () => {
    const steps = bucketFlow(items, TODAY);
    expect(findFlowBox(steps, 'call.followup')?.people).toHaveLength(1);
    expect(findFlowBox(steps, 'nothing')).toBeNull();
    expect(findFlowBox(steps, null)).toBeNull();
  });
});
