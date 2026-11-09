import { FileSpreadsheet, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { placeText } from '../lib/org';
import { useStore } from '../lib/store';
import { parseVacancySheet, readVacancyWorkbook, type VacancyImport } from '../lib/vacancySheet';
import type { RequisitionStatus } from '../types';
import { Button, Dialog, errorText, StatusBadge, TABLE, TD, TH, THEAD, useToast } from './ui';
import type { Tone } from '../lib/pipeline';

const STATUS_TONE: Record<RequisitionStatus, Tone> = {
  'Pending approval': 'warning',
  Approved: 'info',
  'In progress': 'progress',
  Filled: 'good',
  'On hold': 'neutral',
  Cancelled: 'bad',
};

/**
 * Syncs the company's vacancy status sheet into Requisitions. Each row is matched on its SL, so the sheet can
 * be synced again every month: changed rows are updated, new rows added, and nothing is added twice.
 */
export function VacancyImportDialog({ onClose }: { onClose: () => void }) {
  const { requisitions, settings, isAdmin, syncRequisitions, saveSettings } = useStore();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<VacancyImport | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const existing = useMemo(
    () => new Map(requisitions.filter((r) => r.sheet_key).map((r) => [r.sheet_key!, r.created_at])),
    [requisitions],
  );

  async function read(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError('');
    setReading(true);
    try {
      const { sheetName, rows } = await readVacancyWorkbook(await file.arrayBuffer());
      const parsed = parseVacancySheet(sheetName, rows, settings.org_structure ?? [], { existing });
      if (parsed.missingColumns.length > 0) setError(`These columns were not found: ${parsed.missingColumns.join(', ')}. Check that the heading row is the same as in the vacancy status sheet.`);
      else if (parsed.rows.length === 0) setError('No rows with a unit and a position were found in this sheet.');
      setResult(parsed);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setReading(false);
    }
  }

  async function sync() {
    if (!result) return;
    setBusy(true);
    try {
      const saved = await syncRequisitions(result.rows.map((row) => row.requisition));
      let structureNote = '';
      if (result.added.length > 0) {
        if (isAdmin) {
          await saveSettings({ org_structure: result.structure });
          structureNote = ` ${result.added.length} new unit, department or section names added under Settings.`;
        } else {
          structureNote = ' An admin can add the new department and section names under Settings.';
        }
      }
      toast(`${saved} requisition${saved === 1 ? '' : 's'} synced from ${result.sheetName}.${structureNote}`);
      onClose();
    } catch (failure) {
      toast(errorText(failure), 'bad');
      setBusy(false);
    }
  }

  const rows = result?.rows ?? [];
  const fresh = rows.filter((row) => !existing.has(row.requisition.sheet_key!)).length;
  const withNotes = rows.filter((row) => row.notes.length > 0);
  const byStatus = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.requisition.status] = (counts[row.requisition.status] ?? 0) + 1;
    return counts;
  }, {});
  const ready = rows.length > 0 && !error;

  return (
    <Dialog
      title="Sync the vacancy status sheet"
      description="Reads the VACANCY sheet of your Excel file into Requisitions. Rows are matched on their SL, so syncing the same sheet again updates them instead of adding them twice."
      onClose={onClose}
      width="max-w-4xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Upload} loading={busy} disabled={!ready} onClick={() => void sync()}>
            {ready ? `Sync ${rows.length} row${rows.length === 1 ? '' : 's'}` : 'Sync'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={FileSpreadsheet} loading={reading} onClick={() => input.current?.click()}>{fileName ? 'Choose another file' : 'Choose the Excel file'}</Button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            tabIndex={-1}
            aria-label="Vacancy status sheet"
            onChange={(e) => {
              void read(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {fileName && <span className="text-ink-soft">{fileName}</span>}
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-900">{error}</p>}

        {result && rows.length > 0 && (
          <>
            <p>
              <strong>{rows.length}</strong> rows read from <strong>{result.sheetName}</strong>: {fresh} new, {rows.length - fresh} already here and updated.
              {result.blankRows > 0 && ` ${result.blankRows} numbered rows with no unit or position were skipped.`}
            </p>
            <p className="flex flex-wrap gap-1.5">
              {Object.entries(byStatus).map(([status, count]) => (
                <StatusBadge key={status} tone={STATUS_TONE[status as RequisitionStatus] ?? 'neutral'}>{status}: {count}</StatusBadge>
              ))}
            </p>
            <p className="text-xs text-ink-muted">
              Status comes from the sheet's Current Status: Done is Filled, On Process is In progress, Hold is On hold. A row with no status is
              In progress when it names a selected candidate, otherwise Approved. FO (handled by the factory) is kept as written.
            </p>

            {result.added.length > 0 && (
              <details className="rounded-lg border border-line px-3 py-2">
                <summary className="cursor-pointer font-medium">
                  {result.added.length} unit, department or section name{result.added.length === 1 ? '' : 's'} not yet under Settings
                  {isAdmin ? ', added when you sync' : ''}
                </summary>
                {!isAdmin && <p className="mt-1 text-xs text-ink-soft">Only an admin can change Settings. The requisitions are still saved with these names.</p>}
                <ul className="mt-1 list-disc pl-5 text-xs text-ink-soft">{result.added.map((name) => <li key={name}>{name}</li>)}</ul>
              </details>
            )}

            {withNotes.length > 0 && (
              <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                <summary className="cursor-pointer font-medium">{withNotes.length} row{withNotes.length === 1 ? '' : 's'} worth a look</summary>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {withNotes.map((row) => <li key={row.sl}><strong>SL {row.sl}</strong>: {row.notes.join(' ')}</li>)}
                </ul>
              </details>
            )}

            <div className="max-h-72 overflow-auto rounded-lg border border-line">
              <table className={TABLE}>
                <thead className={`${THEAD} sticky top-0`}>
                  <tr>
                    <th scope="col" className={TH}>SL</th>
                    <th scope="col" className={TH}>Position</th>
                    <th scope="col" className={TH}>Where</th>
                    <th scope="col" className={TH}>Requisition</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={TH}>Selected</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ sl, requisition: r }) => (
                    <tr key={sl}>
                      <td className={`${TD} tabular`}>{sl}{!existing.has(r.sheet_key!) && <span className="ml-1 rounded bg-brand-100 px-1 text-[10px] text-brand-800">new</span>}</td>
                      <td className={TD}>{r.designation}<span className="block text-xs text-ink-muted">{r.vacancy_type}{r.vacancies > 1 ? ` · ${r.vacancies} posts` : ''}</span></td>
                      <td className={`${TD} text-xs`}>{placeText(r)}</td>
                      <td className={`${TD} tabular text-xs whitespace-nowrap`}>{r.requisition_date ?? '-'}</td>
                      <td className={TD}><StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge></td>
                      <td className={`${TD} max-w-56 truncate text-xs`} title={r.selected_names}>{r.selected_names.replace(/\n/g, ', ') || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
