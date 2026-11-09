import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/lib/export';
import { dateDmy, dateDmyShort, dateOrdinal, dayName, dayShort, duration, time12, whenText } from '../src/lib/format';
import { sliderBounds } from '../src/lib/filters';
import {
  afterFinal,
  bucketStats,
  confirmDecision,
  correctableSteps,
  correctionChanges,
  EDIT_STEP_FIELDS,
  fillsVacancy,
  findDuplicate,
  isLocked,
  isReviewOpen,
  joiningWhen,
  openReviewStage,
  matchesStageFilter,
  nextAction,
  normalizePhone,
  panelColumns,
  processSteps,
  recommendationCount,
  recommendations,
  recommendationSummary,
  recordJoiningCall,
  rejectDecision,
  rejectScreening,
  scheduleFinal,
  schedulePrimary,
  setCall,
  setCategory,
  setPrimary,
  setSecondary,
  shortlist,
  stageOf,
  stepBack,
  unlockDecision,
  type StageFilter,
} from '../src/lib/pipeline';
import { DEFAULT_DOCUMENT_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES, DEFAULT_SETTINGS } from '../src/lib/defaults';
import { candidateVars, renderTemplate, slotVars } from '../src/lib/templates';
import { isOpenRequisition, requisitionFigures, selectedNames } from '../src/lib/requisitions';
import type { Candidate, CvBucket, Requisition, Settings } from '../src/types';

const fresh = (overrides: Partial<Candidate> = {}) =>
  ({
    full_name: 'Md. Salah Uddin',
    phone: '01711234567',
    email: 'a@example.com',
    source: 'BDJobs',
    screening_status: 'new',
    call_status: 'pending',
    message_status: 'not_sent',
    primary_status: 'pending',
    secondary_message_status: 'not_sent',
    secondary_status: 'pending',
    joining_status: 'pending',
    final_decision: null,
    ...overrides,
  }) as Candidate;

function valid(c: Candidate) {
  return (
    (c.call_status === 'pending' || c.screening_status === 'shortlisted') &&
    (c.message_status === 'not_sent' || c.call_status === 'confirm') &&
    (c.primary_status === 'pending' || c.message_status === 'message_done') &&
    (c.secondary_status === 'pending' || c.primary_status === 'selected') &&
    (c.joining_status === 'pending' || c.secondary_status === 'selected') &&
    (c.secondary_status === 'selected') === (c.selection_category != null) &&
    (c.joining_status === 'pending' || c.joining_status === 'declined' || c.selection_category === 'merit') &&
    (c.final_decision !== 'confirmed' || (c.secondary_status === 'selected' && c.selection_category === 'merit' && Boolean(c.decision_date) && Boolean(c.joining_date) && c.joining_status !== 'pending')) &&
    (c.final_decision !== 'rejected' || (c.secondary_status === 'rejected' && Boolean(c.decision_date) && c.joining_status === 'pending'))
  );
}

function fullySelected() {
  let c = fresh();
  c = { ...c, ...shortlist() };
  c = { ...c, ...setCall('confirm', { by: 'HR' }) };
  c = { ...c, ...schedulePrimary({ channel: 'SMS', date: '2026-11-10', time: '11:00' }) };
  c = { ...c, ...setPrimary('selected') };
  c = { ...c, ...scheduleFinal({ date: '2026-11-12', time: '15:00' }) };
  c = { ...c, ...setSecondary('selected', { selection_category: 'merit' }) };
  return c;
}

describe('pipeline', () => {
  it('walks the full process and always satisfies the database rules', () => {
    let c = fresh();
    expect(stageOf(c).label).toBe('New CV');
    c = { ...c, ...shortlist() };
    expect(stageOf(c).label).toBe('Shortlisted');
    c = { ...c, ...setCall('followup', { by: 'HR', followupOn: '2026-11-08' }) };
    expect(stageOf(c).label).toBe('Call follow-up');
    c = { ...c, ...setCall('confirm', { by: 'HR' }) };
    expect(c.followup_on).toBeNull();
    expect(stageOf(c).label).toBe('Call confirmed');
    c = { ...c, ...schedulePrimary({ channel: 'SMS', date: '2026-11-10', time: '11:00' }) };
    expect(stageOf(c).label).toBe('Primary scheduled');
    expect(valid(c)).toBe(true);
    c = { ...c, ...setPrimary('selected') };
    expect(stageOf(c).label).toBe('Primary selected');
    c = { ...c, ...scheduleFinal({ date: '2026-11-12', time: '15:00' }) };
    expect(stageOf(c).label).toBe('Final scheduled');
    c = { ...c, ...setSecondary('selected', { selection_category: 'merit' }) };
    expect(stageOf(c).label).toBe('Final selected');
    expect(valid(c)).toBe(true);
  });

  it.each([
    ['screening reject', () => rejectScreening('no')],
    ['call follow-up', () => setCall('followup')],
    ['call reject', () => setCall('reject')],
    ['primary reject', () => setPrimary('rejected')],
    ['secondary reject', () => setSecondary('rejected')],
  ])('going back with %s clears later stages', (_label, patch) => {
    const c = { ...fullySelected(), ...patch() };
    expect(valid(c)).toBe(true);
    expect(c.secondary_status).not.toBe('selected');
  });

  it('can step back from every stage without breaking the database rules', () => {
    let c = fullySelected();
    const seen: string[] = [];
    for (let step = stepBack(c); step; step = stepBack(c)) {
      seen.push(step.label);
      c = { ...c, ...step.patch };
      expect(valid(c)).toBe(true);
    }
    expect(seen).toEqual([
      'Undo final result', 'Undo final schedule', 'Undo primary result', 'Undo primary schedule', 'Undo call result', 'Back to new CV',
    ]);
    expect(stageOf(c).label).toBe('New CV');
  });

  it('records the day and time of the call and of the confirmation separately', () => {
    const patch = setCall('confirm', { callDate: '2026-11-03', callTime: '10:30', confirmedDate: '2026-11-05', confirmedTime: '16:15' });
    expect(patch).toMatchObject({ call_date: '2026-11-03', call_time: '10:30', confirmed_date: '2026-11-05', confirmed_time: '16:15', call_status: 'confirm' });
    expect(setCall('followup', { callDate: '2026-11-03', confirmedDate: '2026-11-05', confirmedTime: '16:15', followupOn: '2026-11-06', followupTime: '17:00' })).toMatchObject({ call_date: '2026-11-03', confirmed_date: null, confirmed_time: '', followup_on: '2026-11-06', followup_time: '17:00' });
    expect(stepBack({ ...fresh({ screening_status: 'shortlisted' }), ...patch })?.patch).toMatchObject({ call_date: null, call_time: '', confirmed_date: null, confirmed_time: '' });
  });

  it('records the day and time a candidate turned the job down on the call', () => {
    const shortlisted = fresh({ screening_status: 'shortlisted' });
    const patch = setCall('reject', { callDate: '2026-11-03', callTime: '10:30', confirmedDate: '2026-11-04', confirmedTime: '12:00', rejectedDate: '2026-11-04', rejectedTime: '12:00' });
    expect(patch).toMatchObject({ call_status: 'reject', call_rejected_date: '2026-11-04', call_rejected_time: '12:00', confirmed_date: null, confirmed_time: '' });
    const rejected = { ...shortlisted, ...patch };
    expect(valid(rejected)).toBe(true);
    expect(processSteps(rejected).find((step) => step.key === 'call')).toMatchObject({ state: 'stopped', detail: 'Rejected 4 Nov, 12:00 PM' });
    expect(setCall('confirm', { rejectedDate: '2026-11-04', rejectedTime: '12:00' })).toMatchObject({ call_rejected_date: null, call_rejected_time: '' });
    expect(stepBack(rejected)?.patch).toMatchObject({ call_rejected_date: null, call_rejected_time: '' });
  });

  it('adds up a panel: average score, names and one star per interviewer across rounds', () => {
    const panel = [
      { name: 'A', score: 8, referred: true },
      { name: 'B', score: 7, referred: false },
      { name: 'C', score: 8, referred: true },
    ];
    expect(panelColumns('primary', panel)).toMatchObject({ primary_score: 7.7, primary_interviewer: 'A, B, C', primary_panel: panel });
    expect(panelColumns('secondary', panel)).toMatchObject({ secondary_score: 7.7, secondary_interviewer: 'A, B, C' });
    const both = { primary_panel: panel, secondary_panel: [{ name: 'D', score: 9, referred: true }] };
    expect(recommendationCount(both)).toBe(3);
    expect(recommendations(both)).toEqual({ recommended: 3, total: 4 });
    expect(recommendations({ primary_panel: [], secondary_panel: [] })).toEqual({ recommended: 0, total: 0 });
  });

  it('says who recommended the candidate and who did not', () => {
    const panels = {
      primary_panel: [{ name: 'A', score: 8, referred: true }, { name: 'B', score: 7, referred: false }],
      secondary_panel: [{ name: 'C', score: 9, referred: true }],
    };
    expect(recommendationSummary(panels)).toBe('Recommended by A, C. Not recommended by B');
    expect(recommendationSummary({ primary_panel: [], secondary_panel: [] })).toBe('');
  });

  it('clears stars when a round is undone, so they cannot outlive the interview', () => {
    const c = fullySelected();
    const scored = { ...c, ...panelColumns('primary', [{ name: 'A', score: 8, referred: true }]), ...panelColumns('secondary', [{ name: 'B', score: 9, referred: true }]) };
    expect(recommendationCount(scored)).toBe(2);
    expect(recommendationCount({ ...scored, ...setCall('reject') })).toBe(0);
    expect(recommendationCount({ ...scored, ...setPrimary('rejected') })).toBe(1);
  });

  it('does not ask for a letter from someone on the waiting list', () => {
    expect(afterFinal({ selection_category: 'waiting', joining_status: 'pending' }).label).toBe('Waiting for a place');
    expect(afterFinal({ selection_category: 'merit', joining_status: 'pending' }).label).toBe('Letter not sent');
    expect(afterFinal({ selection_category: 'merit', joining_status: 'offer_sent' }).label).toBe('Confirmed');
  });

  it('keeps offers to the merit list and moves people by hand', () => {
    const merit = fullySelected();
    const sent = { ...merit, joining_status: 'offer_sent' as const };
    expect(fillsVacancy(merit)).toBe(true);
    expect(fillsVacancy({ ...merit, joining_status: 'declined' })).toBe(false);

    const waiting = { ...merit, ...setCategory(merit, 'waiting') };
    expect(fillsVacancy(waiting)).toBe(false);
    expect(valid(waiting)).toBe(true);

    const movedWithOffer = { ...sent, ...setCategory(sent, 'waiting') };
    expect(movedWithOffer).toMatchObject({ selection_category: 'waiting', joining_status: 'pending', offer_sent_at: null });
    expect(valid(movedWithOffer)).toBe(true);

    const declined = { ...merit, joining_status: 'declined' as const };
    expect({ ...declined, ...setCategory(declined, 'waiting') }).toMatchObject({ joining_status: 'declined' });

    const promoted = { ...waiting, ...setCategory(waiting, 'merit') };
    expect(promoted.selection_category).toBe('merit');
    expect(valid({ ...promoted, joining_status: 'offer_sent' })).toBe(true);
  });

  it('removes the list when the final result is undone', () => {
    const undone = { ...fullySelected(), ...stepBack(fullySelected())!.patch };
    expect(undone).toMatchObject({ secondary_status: 'scheduled', selection_category: null });
    expect(valid(undone)).toBe(true);
  });

  it('counts a bucket for the at-a-glance tiles', () => {
    const items = [
      fullySelected(),
      fresh({ source: 'Facebook' }),
      fresh({ screening_status: 'rejected', source: 'Facebook' }),
      fresh({ screening_status: 'shortlisted', call_status: 'followup' }),
    ];
    const stats = bucketStats(items);
    expect(stats).toMatchObject({ total: 4, shortlisted: 2, called: 2, secondarySelected: 1, rejected: 1 });
    expect(stats.sources).toEqual([
      { source: 'BDJobs', count: 2 },
      { source: 'Facebook', count: 2 },
    ]);
  });

  const CONFIRM = { selectedDate: '2026-11-13', selectedTime: '16:00', joiningDate: '2026-12-01', joiningTime: '09:00', by: 'HR', now: '2026-11-13T10:00:00Z' };
  const REJECT = { rejectedDate: '2026-11-13', rejectedTime: '16:00', informedDate: '2026-11-14', informedTime: '10:00', by: 'HR', now: '2026-11-13T10:00:00Z' };

  it('takes two days and times for a confirmation, and locks', () => {
    const c = { ...fullySelected(), ...confirmDecision(CONFIRM) };
    expect(c).toMatchObject({ final_decision: 'confirmed', decision_date: '2026-11-13', decision_time: '16:00', joining_date: '2026-12-01', joining_time: '09:00', joining_status: 'offer_sent', decided_by: 'HR' });
    expect(valid(c)).toBe(true);
    expect(isLocked(c)).toBe(true);
    expect(stageOf(c).label).toBe('Confirmed');
    expect(stepBack(c)).toBeNull();
    expect(fillsVacancy(c)).toBe(true);
  });

  it('takes two days and times for a rejection, whether the candidate was selected or not, and locks', () => {
    const afterSelection = { ...fullySelected(), ...rejectDecision(REJECT) };
    const atInterview = { ...fullySelected(), ...setSecondary('rejected'), ...rejectDecision(REJECT) };
    for (const c of [afterSelection, atInterview]) {
      expect(c).toMatchObject({ final_decision: 'rejected', decision_date: '2026-11-13', informed_date: '2026-11-14', informed_time: '10:00', secondary_status: 'rejected', selection_category: null });
      expect(valid(c)).toBe(true);
      expect(isLocked(c)).toBe(true);
      expect(stageOf(c).label).toBe('Rejected · Final');
      expect(stepBack(c)).toBeNull();
      expect(fillsVacancy(c)).toBe(false);
    }
  });

  it('unlocks to the decision step, not further back', () => {
    const confirmed = { ...fullySelected(), ...confirmDecision(CONFIRM) };
    const reopened = { ...confirmed, ...unlockDecision() };
    expect(isLocked(reopened)).toBe(false);
    expect(reopened).toMatchObject({ secondary_status: 'selected', selection_category: 'merit', decision_date: null, joining_status: 'pending' });
    expect(valid(reopened)).toBe(true);
    expect(stepBack(reopened)?.label).toBe('Undo final result');
  });

  it('leaves no decision behind when a stage is undone', () => {
    const selected = fullySelected();
    expect({ ...selected, ...stepBack(selected)!.patch }).toMatchObject({ final_decision: null, decision_date: null, joining_status: 'pending' });
  });

  it('shows one process bar from CV to final decision, with the candidate on the right step', () => {
    const states = (c: Candidate) => processSteps(c).map((step) => step.state[0]).join('');
    expect(processSteps(fresh()).map((step) => step.label)).toEqual(['CV review', 'Call', 'Primary schedule', 'Primary interview', 'Final schedule', 'Final interview', 'Final decision']);
    expect(states(fresh())).toBe('cuuuuuu');
    expect(states(fresh({ screening_status: 'rejected' }))).toBe('suuuuuu');
    expect(states(fresh({ screening_status: 'shortlisted' }))).toBe('dcuuuuu');
    expect(states(fresh({ screening_status: 'shortlisted', call_status: 'reject' }))).toBe('dsuuuuu');
    expect(states(fresh({ screening_status: 'shortlisted', call_status: 'confirm' }))).toBe('ddcuuuu');
    expect(states(fresh({ screening_status: 'shortlisted', call_status: 'confirm', message_status: 'message_done', primary_status: 'scheduled' }))).toBe('dddcuuu');
    expect(states(fresh({ screening_status: 'shortlisted', call_status: 'confirm', message_status: 'message_done', primary_status: 'rejected' }))).toBe('dddsuuu');
    expect(states(fullySelected())).toBe('ddddddc');
    expect(states({ ...fullySelected(), ...confirmDecision(CONFIRM) })).toBe('ddddddd');
    expect(states({ ...fullySelected(), ...rejectDecision(REJECT) })).toBe('dddddds');
  });

  it('puts the day and time on the step they belong to', () => {
    const confirmed = { ...fullySelected(), ...setCall('confirm', { confirmedDate: '2026-11-05', confirmedTime: '16:15' }), ...confirmDecision(CONFIRM) };
    const steps = processSteps(confirmed);
    expect(steps.find((step) => step.key === 'call')?.detail).toBe('5 Nov, 4:15 PM');
    expect(steps.find((step) => step.key === 'primary_schedule')?.detail).toBe('10 Nov, 11:00 AM');
    expect(steps.find((step) => step.key === 'decision')?.detail).toBe('Joins 1 Dec, 9:00 AM');
    expect(nextAction(confirmed)).toBe('Next: call for joining');
    expect(nextAction(fresh())).toBe('Next: review the CV');
    expect(nextAction(fullySelected())).toBe('Next: send confirmation letter');
  });

  it('records the joining call and the day the candidate confirms, which can differ from the letter', () => {
    const confirmed = { ...fullySelected(), ...confirmDecision(CONFIRM) };
    const called = { ...confirmed, ...recordJoiningCall({ callDate: '2026-11-20', callTime: '11:00', confirmedDate: null, confirmedTime: '' }) };
    expect(called).toMatchObject({ joining_status: 'offer_sent', joining_call_date: '2026-11-20', joining_confirmed_date: null });
    expect(nextAction(called)).toBe('Called for joining, no day confirmed');
    expect(joiningWhen(called)).toEqual({ date: '2026-12-01', time: '09:00', confirmed: false });

    const agreed = { ...confirmed, ...recordJoiningCall({ callDate: '2026-11-20', callTime: '11:00', confirmedDate: '2026-12-03', confirmedTime: '10:00' }) };
    expect(agreed).toMatchObject({ joining_status: 'accepted', joining_confirmed_date: '2026-12-03', joining_confirmed_time: '10:00' });
    expect(stageOf(agreed).label).toBe('Joining confirmed');
    expect(nextAction(agreed)).toBe('Joins 3 Dec, 10:00 AM (confirmed)');
    expect(processSteps(agreed).find((step) => step.key === 'decision')?.detail).toBe('Joins 3 Dec, 10:00 AM');
    // The letter's own joining day is locked and stays as it was.
    expect(agreed.joining_date).toBe('2026-12-01');
    expect(valid(agreed)).toBe(true);
    // Unlocking clears the joining call with the decision.
    expect({ ...agreed, ...unlockDecision() }).toMatchObject({ joining_call_date: null, joining_confirmed_date: null, joining_status: 'pending' });
  });

  it('puts every candidate in exactly one stage tab', () => {
    const tabs: StageFilter[] = ['new', 'calling', 'messaging', 'primary', 'secondary', 'decision', 'confirmed', 'rejected'];
    const people: [string, Candidate][] = [
      ['new', fresh()],
      ['calling', fresh({ screening_status: 'shortlisted' })],
      ['calling', fresh({ screening_status: 'shortlisted', call_status: 'followup' })],
      ['rejected', fresh({ screening_status: 'rejected' })],
      ['rejected', fresh({ screening_status: 'shortlisted', call_status: 'reject' })],
      ['messaging', fresh({ screening_status: 'shortlisted', call_status: 'confirm' })],
      ['primary', fresh({ screening_status: 'shortlisted', call_status: 'confirm', message_status: 'message_done', primary_status: 'scheduled' })],
      ['secondary', fresh({ screening_status: 'shortlisted', call_status: 'confirm', message_status: 'message_done', primary_status: 'selected' })],
      ['decision', fullySelected()],
      ['decision', { ...fullySelected(), selection_category: 'waiting' }],
      ['confirmed', { ...fullySelected(), ...confirmDecision(CONFIRM) }],
      ['rejected', { ...fullySelected(), ...confirmDecision(CONFIRM), joining_status: 'declined' }],
      ['rejected', { ...fullySelected(), ...rejectDecision(REJECT) }],
    ];
    for (const [expected, person] of people) {
      expect(tabs.filter((tab) => matchesStageFilter(person, tab))).toEqual([expected]);
    }
  });

  it('filters by stage', () => {
    expect(matchesStageFilter(fresh({ screening_status: 'rejected' }), 'rejected')).toBe(true);
    expect(matchesStageFilter(fullySelected(), 'decision')).toBe(true);
    expect(matchesStageFilter(fullySelected(), 'rejected')).toBe(false);
    expect(matchesStageFilter(fresh({ screening_status: 'shortlisted' }), 'calling')).toBe(true);
    expect(matchesStageFilter(fresh({ screening_status: 'shortlisted', call_status: 'confirm' }), 'messaging')).toBe(true);
  });

  it('spots duplicates across phone formats', () => {
    expect(normalizePhone('+880 1711-234567')).toBe('01711234567');
    expect(findDuplicate({ phone: '8801711234567', email: '' }, [fresh()])).toBeDefined();
    expect(findDuplicate({ phone: '', email: 'A@EXAMPLE.COM' }, [fresh()])).toBeDefined();
    expect(findDuplicate({ phone: '', email: '' }, [fresh({ phone: '', email: '' })])).toBeUndefined();
  });
});

describe('sample message formats', () => {
  it('match the date styles in the company samples', () => {
    expect(`${dateDmy('2026-08-13')} (${dayName('2026-08-13')})`).toBe('13/08/2026 (Thursday)');
    expect(`${dateDmyShort('2026-07-07')} (${dayShort('2026-07-07')})`).toBe('07/07/26 (Tue)');
    expect(time12('15:00')).toBe('3:00 PM');
    expect(time12('11:20')).toBe('11:20 AM');
    expect(dateOrdinal('2026-09-21')).toBe('21st September 2026');
    expect(dateOrdinal('2026-09-19')).toBe('19th September 2026');
    expect(dateOrdinal('2026-09-12')).toBe('12th September 2026');
  });

  it('writes a day with its time, and how long a review took', () => {
    expect(whenText('2026-11-05', '15:15')).toBe('5 Nov 2026, 3:15 PM');
    expect(whenText('2026-11-05', '')).toBe('5 Nov 2026');
    expect(whenText(null, '')).toBe('');
    expect(duration(42)).toBe('42s');
    expect(duration(200)).toBe('3m 20s');
    expect(duration(3900)).toBe('1h 5m');
    expect(duration(null)).toBe('0s');
  });

  it('sizes a range slider to the figures on record', () => {
    expect(sliderBounds([25000, 50000], 1000, { min: 0, max: 1 })).toEqual({ min: 25000, max: 50000 });
    expect(sliderBounds([25500, 49100], 1000, { min: 0, max: 1 })).toEqual({ min: 25000, max: 50000 });
    expect(sliderBounds([40000], 1000, { min: 0, max: 1 })).toEqual({ min: 40000, max: 41000 });
    expect(sliderBounds([], 1000, { min: 0, max: 200000 })).toEqual({ min: 0, max: 200000 });
  });

  const settings: Settings = { ...DEFAULT_SETTINGS, id: 1 };
  const bucket = { designation: 'HR Tech & Automation Specialist', department: 'HR & Admin', company: '' };

  it('renders the primary interview message from the sample', () => {
    const template = DEFAULT_MESSAGE_TEMPLATES.find((t) => t.key === 'primary_invite')!;
    const vars = { ...candidateVars(fresh(), bucket, settings), ...slotVars({ date: '2026-07-07', time: '15:00' }) };
    expect(renderTemplate(template.body, vars).text).toBe(
      'Dear Concern, Interview for "HR Tech & Automation Specialist" on 07/07/26 (Tue) at 3:00 PM.B/R, HRD, BITOPI GROUP, 823/3 Begum Rokeya Sharani, Shewrapara, Mirpur.',
    );
  });

  it('renders the final interview message from the sample', () => {
    const template = DEFAULT_MESSAGE_TEMPLATES.find((t) => t.key === 'final_invite')!;
    const vars = { ...candidateVars(fresh(), bucket, settings), ...slotVars({ date: '2026-08-13', time: '11:20' }) };
    expect(renderTemplate(template.body, vars).text).toBe(
      'Dear Concern Md. Salah Uddin,\nyou are shortlisted & Invited to attend the final interview on 13/08/2026 (Thursday) at 11:20 AM. 823/3 Begum Rokeya Sharani, Shewrapara, Mirpur. (Close to metrorail pillar no 321)\nB/R, HRD, BITOPI GROUP',
    );
  });

  it('reports missing values rather than printing a wrong one', () => {
    const offer = DEFAULT_DOCUMENT_TEMPLATES.find((t) => t.key === 'offer_letter')!;
    const { missing, text } = renderTemplate(offer.body, candidateVars(fresh(), bucket, settings), '____');
    expect(missing).toContain('joining_date_long');
    expect(text).toContain('in the Company on ____.');
    expect(text).toContain('Tarasima Apparels Ltd.(Corporate Office) as "HR Tech & Automation Specialist" under HR & Admin Department');
  });
});

describe('CSV export', () => {
  const columns = [
    { header: 'Name', value: (r: { name: string }) => r.name },
    { header: 'Phone', value: () => '+880 1711-234567' },
  ];

  it('keeps Bangla readable, quotes commas and blocks spreadsheet formulas', () => {
    const csv = toCsv([{ name: 'রহিম, করিম' }, { name: '=HYPERLINK("x")' }, { name: '@cmd' }, { name: '+1+cmd' }], columns);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"রহিম, করিম",+880 1711-234567');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`'@cmd`);
    expect(csv).toContain(`'+1+cmd`);
  });
});

describe('feedback links', () => {
  it('open from the primary schedule until the final schedule, then for the final until the decision', () => {
    let c = { ...fresh(), ...shortlist(), ...setCall('confirm', { by: 'HR' }) };
    expect(openReviewStage(c)).toBeNull();
    c = { ...c, ...schedulePrimary({ channel: 'SMS', date: '2026-11-10', time: '11:00' }) };
    expect(openReviewStage(c)).toBe('primary');
    c = { ...c, ...setPrimary('selected') };
    expect(openReviewStage(c)).toBe('primary');
    c = { ...c, ...scheduleFinal({ date: '2026-11-12', time: '15:00' }) };
    expect(isReviewOpen(c, 'primary')).toBe(false);
    expect(openReviewStage(c)).toBe('secondary');
    c = { ...c, ...setSecondary('selected', { selection_category: 'merit' }) };
    expect(openReviewStage(c)).toBe('secondary');
    c = { ...c, ...confirmDecision({ selectedDate: '2026-11-13', selectedTime: '', joiningDate: '2026-12-01', joiningTime: '' }) };
    expect(openReviewStage(c)).toBeNull();
  });

  it('stays open after a primary rejection, as there is no next step', () => {
    const c = { ...fresh(), ...shortlist(), ...setCall('confirm', { by: 'HR' }), ...schedulePrimary({ channel: 'SMS' }), ...setPrimary('rejected') };
    expect(openReviewStage(c)).toBe('primary');
  });
});

describe('open requisitions', () => {
  const req = (overrides: Partial<Requisition>) => ({ id: 'r', vacancies: 2, status: 'In progress', selected_names: '', created_at: '2026-10-01T06:00:00Z', requisition_date: null, approved_on: null, offer_date: null, sheet_data: {}, ...overrides }) as Requisition;

  it('counts On hold as open, like "Still open" on the Requisitions page', () => {
    expect(['Pending approval', 'Approved', 'In progress', 'On hold', 'Filled', 'Cancelled'].filter((status) => isOpenRequisition({ status } as Requisition))).toEqual(['Pending approval', 'Approved', 'In progress', 'On hold']);
  });

  it('counts the merit list or the names on the vacancy sheet, whichever is more', () => {
    const merit = { ...fullySelected(), id: 'c1', bucket_id: 'b1' } as Candidate;
    const [withApp] = requisitionFigures([req({})], [{ id: 'b1', requisition_id: 'r' } as CvBucket], [merit]);
    expect(withApp).toMatchObject({ filled: 1, left: 1 });
    expect(withApp.cvs).toHaveLength(1);
    const [fromSheet] = requisitionFigures([req({ selected_names: '1. A\n2. B' })], [], []);
    expect(fromSheet).toMatchObject({ filled: 2, left: 0 });
    expect(selectedNames(req({ selected_names: '1. Md. A\n 2. B \n' }))).toEqual(['Md. A', 'B']);
  });
});

describe('corrections and joining remarks', () => {
  it('offers only the steps that hold a recorded result', () => {
    expect(correctableSteps(fresh())).toEqual([]);
    expect(correctableSteps(fresh({ screening_status: 'shortlisted', call_status: 'reject' }))).toEqual(['call']);
    const decided = fresh({
      screening_status: 'shortlisted', call_status: 'confirm', message_status: 'message_done', primary_status: 'selected',
      secondary_status: 'selected', selection_category: 'merit', final_decision: 'confirmed',
    });
    expect(correctableSteps(decided)).toEqual(['call', 'primary_schedule', 'primary', 'final_schedule', 'final', 'decision']);
    expect(correctableSteps(fresh({ screening_status: 'shortlisted', call_status: 'confirm', message_status: 'message_done', primary_status: 'scheduled' }))).toEqual(['call', 'primary_schedule']);
  });

  it('sends only the changed fields of the step, never anything else', () => {
    const c = fresh({ call_date: '2026-11-02', call_time: '10:00', call_note: 'ok', decision_date: '2026-11-13' });
    expect(correctionChanges('call', c, { ...c, call_date: '2026-11-01', decision_date: '2020-01-01', call_status: 'reject' })).toEqual({ call_date: '2026-11-01' });
    expect(correctionChanges('call', c, { ...c })).toEqual({});
    for (const fields of Object.values(EDIT_STEP_FIELDS)) {
      expect(fields.some((field) => String(field).endsWith('_status') || field === 'final_decision' || field === 'selection_category')).toBe(false);
    }
  });

  it('keeps the joining remarks with the joining call, and leaves them alone when not given', () => {
    expect(recordJoiningCall({ callDate: '2026-11-20', callTime: '11:00', confirmedDate: '2026-12-03', confirmedTime: '10:00', remarks: '  Brings release letter ' }))
      .toMatchObject({ joining_remarks: 'Brings release letter', joining_status: 'accepted' });
    expect(recordJoiningCall({ callDate: '2026-11-20', callTime: '11:00', confirmedDate: null, confirmedTime: '' })).not.toHaveProperty('joining_remarks');
  });
});
