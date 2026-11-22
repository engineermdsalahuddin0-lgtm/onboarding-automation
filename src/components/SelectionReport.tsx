import { CheckCircle2, Download, Eye, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { dateDmy } from '../lib/format';
import { postTitle, selectionReport, type SelectionReport } from '../lib/selectionReport';
import { downloadSelectionReport, OFFICE_ADDRESS, OFFICE_NAME, printSelectionReport } from '../lib/selectionReportPdf';
import { useStore } from '../lib/store';
import type { CvBucket } from '../types';
import { Button, Dialog, errorText, useToast } from './ui';

// The final interview list: everyone HRD and the team both marked Employ at the primary interview, as the
// paper list HR prints for the final interview board (Team HOD, GM, CHRO). It is offered where the work
// happens: on the bucket as soon as someone is on it, and when the final interview is being scheduled.

export const FINAL_LIST = 'Final interview list';

function useFinalList(bucket: CvBucket | undefined): SelectionReport | null {
  const { candidates, panels, team, assessments } = useStore();
  return useMemo(
    () => (bucket ? selectionReport(bucket, candidates, { panels, team, assessments }) : null),
    [bucket, candidates, panels, team, assessments],
  );
}

/** Download and Print, for the banner, the schedule dialog and the list dialog alike. */
function FinalListButtons({ bucket, report, size = 'sm', primary = false }: { bucket: CvBucket; report: SelectionReport; size?: 'sm' | 'md'; primary?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<'' | 'download' | 'print'>('');
  const none = report.rows.length === 0;

  async function output(kind: 'download' | 'print') {
    setBusy(kind);
    try {
      await (kind === 'download' ? downloadSelectionReport(bucket, report) : printSelectionReport(bucket, report));
    } catch (error) {
      toast(`The PDF could not be made: ${errorText(error)}`, 'bad');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <Button size={size} variant={primary ? 'primary' : 'secondary'} icon={Download} disabled={none || busy !== ''} loading={busy === 'download'} onClick={() => void output('download')}>
        Download {FINAL_LIST.toLowerCase()}
      </Button>
      <Button size={size} icon={Printer} disabled={none || busy !== ''} loading={busy === 'print'} onClick={() => void output('print')}>Print</Button>
    </>
  );
}

const waitingText = (report: SelectionReport) =>
  report.waiting.length === 0 ? '' : `${report.waiting.length} more ${report.waiting.length === 1 ? 'is' : 'are'} waiting for primary marks.`;

/** On the bucket page, once at least one candidate is ready for the final interview. */
export function FinalListBanner({ bucket, onOpen }: { bucket: CvBucket; onOpen: () => void }) {
  const report = useFinalList(bucket);
  if (!report || report.rows.length === 0) return null;
  const count = report.rows.length;
  return (
    <section className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-950">
      <CheckCircle2 className="size-5 shrink-0 text-emerald-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {count} candidate{count === 1 ? '' : 's'} passed the primary interview: Employ from both HRD and the team.
        </p>
        <p className="text-xs text-emerald-900">
          Download the {FINAL_LIST.toLowerCase()} and take it to the final interview board (Team HOD, GM, CHRO). {waitingText(report)}
        </p>
      </div>
      <span className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" icon={Eye} onClick={onOpen}>See who</Button>
        <FinalListButtons bucket={bucket} report={report} primary />
      </span>
    </section>
  );
}

/** In the final interview schedule dialog: the list goes to the board on that day. */
export function FinalListNote({ bucketId }: { bucketId: string }) {
  const { buckets } = useStore();
  const bucket = buckets.find((b) => b.id === bucketId);
  const report = useFinalList(bucket);
  if (!bucket || !report || report.rows.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
      <p className="min-w-0 flex-1">
        <strong>For the board:</strong> print the {FINAL_LIST.toLowerCase()} ({report.rows.length} candidate{report.rows.length === 1 ? '' : 's'}) for the Team HOD, GM and CHRO to mark on the day.
      </p>
      <span className="flex gap-1.5"><FinalListButtons bucket={bucket} report={report} /></span>
    </div>
  );
}

/** The list as it will print, with who is not on it yet and why. */
export function SelectionReportDialog({ bucket, onClose }: { bucket: CvBucket; onClose: () => void }) {
  const report = useFinalList(bucket)!;
  const none = report.rows.length === 0;
  return (
    <Dialog
      title={FINAL_LIST}
      description="Everyone whom HRD and the team both marked Employ at the primary interview. The Team HOD, GM, CHRO and Final Decision boxes stay empty for the final interview board to fill in."
      onClose={onClose}
      width="max-w-4xl"
      footer={
        <>
          <Button className="mr-auto" onClick={onClose}>Close</Button>
          <FinalListButtons bucket={bucket} report={report} size="md" primary />
        </>
      }
    >
      <div className="mb-3 text-center text-sm">
        <p className="font-semibold">{OFFICE_NAME}</p>
        <p className="text-xs text-ink-soft">{OFFICE_ADDRESS}</p>
        <p className="mt-1 font-medium">List of the candidates for - {postTitle(bucket)}</p>
        <p className="tabular text-xs text-ink-soft">Date: {report.date ? dateDmy(report.date) : 'not set'}</p>
      </div>

      {none ? (
        <p className="rounded-xl border border-line bg-canvas px-3 py-4 text-center text-sm text-ink-muted">
          Nobody yet. A candidate is listed once every primary interviewer has marked them, with Employ from both HRD and the team.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-xs text-ink-soft">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Sl</th>
                <th className="px-2 py-1.5 text-left font-medium">Name</th>
                <th className="px-2 py-1.5 text-left font-medium">Present position</th>
                <th className="px-2 py-1.5 text-left font-medium">Present org.</th>
                <th className="px-2 py-1.5 text-left font-medium">HRD</th>
                <th className="px-2 py-1.5 text-left font-medium">Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.rows.map((row, index) => (
                <tr key={row.candidate.id}>
                  <td className="tabular px-2 py-1.5 text-ink-muted">{index + 1}</td>
                  <td className="px-2 py-1.5 font-medium">{row.candidate.full_name}</td>
                  <td className="px-2 py-1.5">{row.candidate.current_designation}</td>
                  <td className="px-2 py-1.5">{row.candidate.current_company}</td>
                  <td className="px-2 py-1.5 text-emerald-800">{row.hrd}</td>
                  <td className="px-2 py-1.5 text-emerald-800">{row.team}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.waiting.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-xs font-semibold text-ink-soft">Not on the list yet ({report.waiting.length})</h3>
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {report.waiting.map(({ candidate, reasons }) => (
              <li key={candidate.id} className="flex flex-wrap gap-x-3 px-3 py-1.5">
                <span className="font-medium">{candidate.full_name}</span>
                <span className="text-ink-muted">{reasons.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
