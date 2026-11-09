// What "open" means for a requisition, and its figures, in one place: the dashboard and the Requisitions page
// use these same rules, so their numbers always agree.
import type { Candidate, CvBucket, Requisition } from '../types';
import { daysBetween, todayIso } from './format';
import { fillsVacancy } from './pipeline';

/** Still to be filled: anything not Filled or Cancelled, On hold included. The Requisitions page's "Still open". */
export const isOpenRequisition = (r: Pick<Requisition, 'status'>) => r.status !== 'Filled' && r.status !== 'Cancelled';

/** From the approved requisition (or the requisition date) to the offer letter; still counting while open. */
export function daysToFill(r: Requisition): { days: number; open: boolean } | null {
  const from = r.approved_on ?? r.requisition_date;
  if (!from) return null;
  const open = !r.offer_date && isOpenRequisition(r);
  if (!r.offer_date && !open) return null;
  return { days: Math.max(0, daysBetween(from, r.offer_date ?? todayIso())), open };
}

/** How long it has been open: from the requisition date, or from when it was entered in the app. */
export const daysOpen = (r: Requisition) => Math.max(0, daysBetween(r.approved_on ?? r.requisition_date ?? r.created_at, todayIso()));

/** The names in "Name of Selected Candidates", without the "1." numbering. */
export const selectedNames = (r: Pick<Requisition, 'selected_names'>) =>
  (r.selected_names ?? '').split('\n').map((name) => name.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean);

/** Newest requisition first; synced rows keep the sheet's own order within a day. */
export const byNewest = (a: Requisition, b: Requisition) =>
  (b.requisition_date ?? b.created_at).localeCompare(a.requisition_date ?? a.created_at) || (Number(b.sheet_data?.sl ?? 0) - Number(a.sheet_data?.sl ?? 0));

export interface RequisitionFigures {
  r: Requisition;
  /** CVs in the buckets made for it. */
  cvs: Candidate[];
  /** On the merit list and not declined, or named as selected on the vacancy sheet: whichever is more. */
  filled: number;
  left: number;
}

export function requisitionFigures(requisitions: Requisition[], buckets: CvBucket[], candidates: Candidate[]): RequisitionFigures[] {
  const bucketsOf = new Map<string, Set<string>>();
  for (const b of buckets) if (b.requisition_id) bucketsOf.set(b.requisition_id, (bucketsOf.get(b.requisition_id) ?? new Set()).add(b.id));
  return requisitions.map((r) => {
    const ids = bucketsOf.get(r.id);
    const cvs = ids ? candidates.filter((c) => ids.has(c.bucket_id)) : [];
    const filled = Math.max(cvs.filter(fillsVacancy).length, selectedNames(r).length);
    return { r, cvs, filled, left: Math.max(0, r.vacancies - filled) };
  });
}
