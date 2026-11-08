import { AlertTriangle, CheckCircle2, FileUp, Info, Loader2, Sparkles, Timer, Trash2, Wand2, XCircle } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { backend } from '../lib/backend';
import { aiHeaders, expandUploads, extensionOf, MIME_BY_EXTENSION, parseCvFile, type ParseMode, type ParsedFile } from '../lib/cv';
import { classNames } from '../lib/format';
import { normalizePhone } from '../lib/pipeline';
import { useStore } from '../lib/store';
import type { Candidate } from '../types';
import { useGuide } from './Guide';
import { Button, Dialog, errorText, IconButton, Select, TextInput, useToast } from './ui';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const IMPORT_BATCH = 20;

type RowStatus = 'queued' | 'reading' | 'ready' | 'failed' | 'importing' | 'imported';

interface QueueRow {
  id: string;
  file: File;
  status: RowStatus;
  error?: string;
  result?: ParsedFile;
  full_name: string;
  phone: string;
  email: string;
  photoUrl?: string;
  skip: boolean;
}

interface Props {
  onClose: () => void;
  bucketId?: string;
}

const NEW_BUCKET = '__new__';

interface DuplicateInfo {
  sameBucket?: Candidate;
  other?: Candidate;
  inBatch: boolean;
}

const NO_DUPLICATE: DuplicateInfo = { inBatch: false };

/** The same matching rule as findDuplicate: a full mobile number, or an email. */
function personKeys(person: { phone: string; email: string }): string[] {
  const keys: string[] = [];
  const phone = normalizePhone(person.phone);
  const email = (person.email ?? '').trim().toLowerCase();
  if (phone.length >= 10) keys.push(`p:${phone}`);
  if (email) keys.push(`e:${email}`);
  return keys;
}

export function BulkUploadDialog({ onClose, bucketId }: Props) {
  const { buckets, postings, candidates, settings, requisitions, addCandidates, saveBucket } = useStore();
  const toast = useToast();
  const navigate = useNavigate();

  const openBuckets = buckets.filter((b) => b.status !== 'Archived');
  const [target, setTarget] = useState(bucketId ?? openBuckets[0]?.id ?? NEW_BUCKET);
  const [newDesignation, setNewDesignation] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [source, setSource] = useState(settings.media[0] ?? 'Direct upload');
  const [postingId, setPostingId] = useState('');
  const [mode, setMode] = useState<ParseMode>('rules');
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [problemIds, setProblemIds] = useState<Set<string> | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const running = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // A large upload is read in batches with a short break between them, so the browser stays responsive and the
  // AI service is not flooded. Only files before `allowed` in the list may start; a break moves it on.
  const maxFiles = Math.max(1, settings.upload_max_files || 1000);
  const batchSize = Math.max(1, settings.upload_batch_size || 50);
  const pauseSeconds = Math.max(0, settings.upload_batch_pause ?? 10);
  const allowed = useRef(batchSize);
  const breakTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [breakUntil, setBreakUntil] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const heldRef = useRef(held);
  heldRef.current = held;
  const [, setTick] = useState(0);
  const { startTour } = useGuide();

  useEffect(() => () => clearTimeout(breakTimer.current), []);
  useEffect(() => {
    if (breakUntil === null) return;
    const timer = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [breakUntil]);

  const bucket = buckets.find((b) => b.id === target);
  const bucketPostings = postings.filter((p) => p.requisition_id === bucket?.requisition_id);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/ai/status', { headers: await aiHeaders() });
        const status = response.ok ? await response.json() : { configured: false };
        if (!cancelled) setAiReady(Boolean(status.configured));
      } catch {
        if (!cancelled) setAiReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => rowsRef.current.forEach((row) => row.photoUrl && URL.revokeObjectURL(row.photoUrl)), []);

  const patchRow = useCallback((id: string, patch: Partial<QueueRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);
  const patchRows = useCallback((ids: string[], patch: Partial<QueueRow>) => {
    const wanted = new Set(ids);
    setRows((current) => current.map((row) => (wanted.has(row.id) ? { ...row, ...patch } : row)));
  }, []);
  const removeRow = useCallback((id: string) => {
    setRows((current) => {
      rowsRef.current = current.filter((r) => r.id !== id);
      return rowsRef.current;
    });
  }, []);

  /** Starts the next batch now: the files after the first one still waiting, up to the batch size. */
  function nextBatch() {
    clearTimeout(breakTimer.current);
    breakTimer.current = undefined;
    setBreakUntil(null);
    const first = rowsRef.current.findIndex((row) => row.status === 'queued');
    if (first === -1) return;
    allowed.current = first + batchSize;
    pump();
  }

  /** At the end of a batch with more files waiting: take the break, then go on. */
  function endOfBatch() {
    if (running.current > 0 || breakTimer.current || heldRef.current) return;
    const first = rowsRef.current.findIndex((row) => row.status === 'queued');
    if (first === -1 || first < allowed.current) return;
    if (pauseSeconds === 0) {
      nextBatch();
      return;
    }
    setBreakUntil(Date.now() + pauseSeconds * 1000);
    breakTimer.current = setTimeout(nextBatch, pauseSeconds * 1000);
  }

  // Reads files a few at a time so a large batch never freezes the page or floods the AI service.
  function pump() {
    const limit = modeRef.current === 'ai' ? 2 : 3;
    while (running.current < limit) {
      const next = breakTimer.current ? undefined : rowsRef.current.find((row, index) => row.status === 'queued' && index < allowed.current);
      if (!next) {
        endOfBatch();
        return;
      }
      running.current += 1;
      rowsRef.current = rowsRef.current.map((row) => (row.id === next.id ? { ...row, status: 'reading' } : row));
      patchRow(next.id, { status: 'reading' });
      void parseCvFile(next.file, modeRef.current)
        .then((result) => {
          patchRow(next.id, {
            status: 'ready',
            result,
            full_name: result.parsed.full_name,
            phone: result.parsed.phone,
            email: result.parsed.email,
            photoUrl: result.photo ? URL.createObjectURL(result.photo) : undefined,
          });
        })
        .catch((error) => patchRow(next.id, { status: 'failed', error: errorText(error) }))
        .finally(() => {
          running.current -= 1;
          // Let React commit the row state before picking the next file.
          setTimeout(pump, 0);
        });
    }
  }

  async function addFiles(files: File[]) {
    setNotice('');
    const { accepted, skipped } = await expandUploads(files);
    const tooBig = accepted.filter((file) => file.size > MAX_FILE_BYTES);
    const fitting = accepted.filter((file) => file.size <= MAX_FILE_BYTES);
    // One upload takes at most maxFiles; the rest can follow in the next upload.
    const room = Math.max(0, maxFiles - rowsRef.current.length);
    const usable = fitting.slice(0, room);
    const overLimit = fitting.length - usable.length;
    const queued: QueueRow[] = usable.map((file) => ({
      id: crypto.randomUUID(), file, status: 'queued', full_name: '', phone: '', email: '', skip: false,
    }));
    rowsRef.current = [...rowsRef.current, ...queued];
    setRows(rowsRef.current);
    const notes: string[] = [];
    if (skipped.length > 0) notes.push(`Skipped ${skipped.length} unsupported file(s): ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}`);
    if (tooBig.length > 0) notes.push(`Skipped ${tooBig.length} file(s) over 15 MB: ${tooBig.slice(0, 3).map((f) => f.name).join(', ')}`);
    if (overLimit > 0) notes.push(`Left out ${overLimit} file(s): one upload takes up to ${maxFiles} files. Upload the rest after this one is imported.`);
    setNotice(notes.join(' '));
    pump();
  }

  const totalBatches = Math.ceil(rows.length / batchSize);
  const firstWaiting = rows.findIndex((row) => row.status === 'queued');
  const currentBatch = Math.min(totalBatches, Math.ceil(Math.min(allowed.current, rows.length) / batchSize));
  const secondsLeft = breakUntil === null ? 0 : Math.max(0, Math.ceil((breakUntil - Date.now()) / 1000));
  const waitingForGo = held && breakUntil === null && firstWaiting !== -1 && firstWaiting >= allowed.current && running.current === 0;

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void addFiles([...event.dataTransfer.files]);
  }

  // Existing people indexed once by mobile and email, so checking a batch of 1000 CVs stays instant.
  const known = useMemo(() => {
    const here = new Map<string, Candidate>();
    const elsewhere = new Map<string, Candidate>();
    for (const c of candidates) {
      const index = c.bucket_id === target ? here : elsewhere;
      for (const key of personKeys(c)) if (!index.has(key)) index.set(key, c);
    }
    return { here, elsewhere };
  }, [candidates, target]);

  // One pass in upload order: a person seen in an earlier file of this batch is a repeat.
  const duplicates = useMemo(() => {
    const info = new Map<string, DuplicateInfo>();
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.status !== 'ready') continue;
      const keys = personKeys(row);
      info.set(row.id, {
        sameBucket: keys.map((key) => known.here.get(key)).find(Boolean),
        other: keys.map((key) => known.elsewhere.get(key)).find(Boolean),
        inBatch: keys.some((key) => seen.has(key)),
      });
      if (!row.skip) for (const key of keys) seen.add(key);
    }
    return info;
  }, [rows, known]);
  const duplicateInfo = (row: QueueRow): DuplicateInfo => duplicates.get(row.id) ?? NO_DUPLICATE;

  const usableRows = rows.filter((row) => row.status === 'ready' && !row.skip && !duplicateInfo(row).sameBucket && !duplicateInfo(row).inBatch);
  // A file without a name waits in the list for one; it does not hold back the rest of a big batch.
  const readyRows = usableRows.filter((row) => row.full_name.trim());
  const missingNames = usableRows.filter((row) => !row.full_name.trim());
  const stillReading = rows.some((row) => row.status === 'queued' || row.status === 'reading');

  // In a big batch, the few files that need a hand must be easy to find without scrolling past the rest.
  const isProblem = (row: QueueRow) =>
    row.status === 'failed' || (row.status === 'ready' && !row.skip && (!row.full_name.trim() || Boolean(duplicateInfo(row).sameBucket) || duplicateInfo(row).inBatch));
  const counts = {
    done: rows.filter((row) => row.status !== 'queued' && row.status !== 'reading').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    duplicates: rows.filter((row) => row.status === 'ready' && (duplicateInfo(row).sameBucket || duplicateInfo(row).inBatch)).length,
    problems: rows.filter(isProblem).length,
  };
  // The list is fixed when the filter is turned on, so a row does not vanish while its name is typed in.
  const shownRows = problemIds ? rows.filter((row) => problemIds.has(row.id)) : rows;
  const problemsOnly = problemIds !== null;
  const setProblemsOnly = (on: boolean) => setProblemIds(on ? new Set(rows.filter(isProblem).map((row) => row.id)) : null);
  const needsNewBucket = target === NEW_BUCKET && !newDesignation.trim();

  async function importAll() {
    setImporting(true);
    try {
      let destination = bucket;
      if (target === NEW_BUCKET) {
        destination = await saveBucket({
          designation: newDesignation.trim(),
          department: newDepartment.trim(),
          company: settings.default_company,
        });
      }
      if (!destination) throw new Error('Choose a CV bucket first.');

      let imported = 0;
      let failed = 0;
      const fail = (row: QueueRow, error: unknown) => {
        patchRow(row.id, { status: 'failed', error: errorText(error) });
        failed += 1;
      };

      // Stores the CV file and photo, and returns the candidate record that points at them.
      const prepare = async (row: QueueRow): Promise<Partial<Candidate>> => {
        const { parsed, method, photo } = row.result!;
        const extension = extensionOf(row.file.name);
        const key = crypto.randomUUID();
        const cvPath = `cvs/${destination!.id}/${key}.${extension}`;
        await backend.upload(cvPath, row.file, MIME_BY_EXTENSION[extension] ?? 'application/octet-stream');
        let photoPath: string | null = null;
        if (photo) {
          photoPath = `photos/${destination!.id}/${key}.jpg`;
          await backend.upload(photoPath, photo, 'image/jpeg');
        }
        const { warnings, ...fields } = parsed;
        return {
          ...fields,
          full_name: row.full_name.trim(),
          phone: row.phone.trim(),
          email: row.email.trim().toLowerCase(),
          bucket_id: destination!.id,
          job_posting_id: postingId || null,
          source,
          parse_method: method,
          parse_warnings: warnings,
          cv_path: cvPath,
          cv_file_name: row.file.name,
          photo_path: photoPath,
        };
      };

      // Files go up three at a time; the records are saved in groups. One insert per CV made a
      // 1000-CV import take ten minutes, as every insert also redrew the bucket table behind.
      const queue = [...readyRows];
      for (let start = 0; start < queue.length; start += IMPORT_BATCH) {
        const batch = queue.slice(start, start + IMPORT_BATCH);
        patchRows(batch.map((row) => row.id), { status: 'importing' });
        const prepared: { row: QueueRow; record: Partial<Candidate> }[] = [];
        const pending = [...batch];
        const upload = async () => {
          for (let row = pending.shift(); row; row = pending.shift()) {
            try {
              prepared.push({ row, record: await prepare(row) });
            } catch (error) {
              fail(row, error);
            }
          }
        };
        await Promise.all([upload(), upload(), upload()]);
        if (prepared.length === 0) continue;
        try {
          await addCandidates(prepared.map((item) => item.record));
          patchRows(prepared.map((item) => item.row.id), { status: 'imported' });
          imported += prepared.length;
        } catch {
          // One refused record fails the whole insert: try each on its own to find which.
          for (const { row, record } of prepared) {
            try {
              await addCandidates([record]);
              patchRow(row.id, { status: 'imported' });
              imported += 1;
            } catch (error) {
              fail(row, error);
            }
          }
        }
      }

      const waiting = missingNames.length;
      if (failed > 0) {
        toast(`${imported} imported, ${failed} failed. The failed rows show why.`, 'bad');
      } else if (waiting > 0) {
        // The nameless ones stay here, and only they are shown, so they can be finished off.
        toast(`${imported} CV${imported === 1 ? '' : 's'} added to ${destination.designation}. ${waiting} still need a name.`);
        setProblemIds(new Set(missingNames.map((row) => row.id)));
      } else {
        toast(`${imported} CV${imported === 1 ? '' : 's'} added to ${destination.designation}.`);
        onClose();
        navigate(`/buckets/${destination.id}`);
      }
    } catch (error) {
      toast(errorText(error), 'bad');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      title="Upload CVs"
      description="PDF, Word, scanned images or a ZIP of them. Each CV's text, details and photo are read automatically."
      onClose={onClose}
      width="max-w-5xl"
      footer={
        <>
          <span className="mr-auto text-xs text-ink-muted" aria-live="polite">
            {rows.length > 0 && (importing
              ? `Saving ${rows.filter((r) => r.status === 'imported').length} of ${rows.filter((r) => r.status === 'imported' || r.status === 'importing').length + readyRows.length}…`
              : stillReading
                ? breakUntil !== null
                  ? `${counts.done} of ${rows.length} read. Break before batch ${currentBatch + 1}: ${secondsLeft}s`
                  : waitingForGo
                    ? `${counts.done} of ${rows.length} read. Paused`
                    : `Reading ${Math.min(counts.done + 1, rows.length)} of ${rows.length}${totalBatches > 1 ? ` · batch ${currentBatch} of ${totalBatches}` : ''}…`
                : `${readyRows.length} ready to import${missingNames.length > 0 ? `. ${missingNames.length} without a name will wait here` : ''}`)}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={importing}
            disabled={readyRows.length === 0 || stillReading || needsNewBucket}
            onClick={() => void importAll()}
          >
            Import {readyRows.length > 0 ? readyRows.length : ''} CV{readyRows.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div data-tour="upload-bucket" className="grid gap-3 sm:grid-cols-3">
        <Select label="CV bucket" value={target} onChange={(e) => { setTarget(e.target.value); setPostingId(''); }}>
          {openBuckets.map((b) => (
            <option key={b.id} value={b.id}>{b.designation}{b.department ? ` · ${b.department}` : ''}</option>
          ))}
          <option value={NEW_BUCKET}>+ Create a new bucket</option>
        </Select>
        <Select label="Source (where these CVs came from)" value={source} onChange={(e) => setSource(e.target.value)}>
          {[...new Set([...settings.media, 'Direct upload'])].map((media) => <option key={media}>{media}</option>)}
        </Select>
        <Select
          label="Job posting (optional)"
          value={postingId}
          disabled={bucketPostings.length === 0}
          onChange={(e) => {
            setPostingId(e.target.value);
            const media = bucketPostings.find((p) => p.id === e.target.value)?.media;
            if (media) setSource(media);
          }}
        >
          <option value="">{bucketPostings.length === 0 ? 'No postings for this bucket' : 'Not linked'}</option>
          {bucketPostings.map((p) => <option key={p.id} value={p.id}>{p.media} · {p.posted_on}</option>)}
        </Select>
        {target === NEW_BUCKET && (
          <>
            <TextInput label="Designation" required value={newDesignation} onChange={(e) => setNewDesignation(e.target.value)} list="designation-options" />
            <datalist id="designation-options">
              {[...new Set(requisitions.map((r) => r.designation))].map((d) => <option key={d} value={d} />)}
            </datalist>
            <Select label="Department" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)}>
              <option value="">Choose…</option>
              {settings.departments.map((d) => <option key={d}>{d}</option>)}
            </Select>
          </>
        )}
      </div>

      <fieldset data-tour="upload-mode" className="mt-4">
        <legend className="mb-1 text-xs font-medium text-ink-soft">How should the CVs be read?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <ModeOption
            checked={mode === 'rules'}
            onSelect={() => setMode('rules')}
            icon={Wand2}
            title="Without AI"
            body="Free and private; the CV never leaves this computer. Works best on standard CV layouts such as BDJobs."
          />
          <ModeOption
            checked={mode === 'ai'}
            disabled={aiReady === false}
            onSelect={() => setMode('ai')}
            icon={Sparkles}
            title="With AI (Gemini)"
            body={aiReady === false
              ? 'Needs an API key: add one under Settings > AI.'
              : 'Best on unusual layouts and scans. Each CV is sent to Google for reading, using your API key.'}
          />
        </div>
      </fieldset>

      <section data-tour="upload-limits" aria-label="Upload limits" className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-1.5 rounded-xl bg-canvas px-3.5 py-2.5 text-xs text-ink-soft">
        <p className="flex items-center gap-1.5 font-semibold text-ink"><Info className="size-3.5" aria-hidden /> Limits</p>
        <p><strong className="text-ink">15 MB</strong> per file (PDF, Word, image)</p>
        <p><strong className="text-ink">{maxFiles}</strong> files per upload; a ZIP counts each CV inside it</p>
        <p>
          Read in batches of <strong className="text-ink">{batchSize}</strong>
          {pauseSeconds > 0 ? <>, with a <strong className="text-ink">{pauseSeconds}-second</strong> break between batches</> : ''}
        </p>
        <p>Scanned PDFs: the first 5 pages are read without AI</p>
        <Button size="sm" variant="ghost" className="ml-auto -my-1" onClick={() => startTour('upload')}>How it works</Button>
      </section>

      <label
        data-tour="upload-drop"
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={classNames(
          'mt-4 flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors',
          dragging ? 'border-brand-600 bg-brand-50' : 'border-line-strong hover:bg-canvas',
        )}
      >
        <FileUp className="size-6 text-ink-muted" aria-hidden />
        <span className="text-sm font-medium">Drop CV files here, or click to choose</span>
        <span className="text-xs text-ink-muted">PDF, DOCX, DOC, JPG, PNG, TXT or ZIP. Up to 15 MB each, {maxFiles} files at a time.</span>
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp,.zip"
          className="sr-only"
          onChange={(event) => {
            void addFiles([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
      </label>
      {notice && <p className="mt-2 text-xs text-amber-900">{notice}</p>}

      {totalBatches > 1 && stillReading && (
        <div role="status" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand-300 bg-brand-50 px-3.5 py-2 text-sm">
          <Timer className="size-4 shrink-0 text-brand-700" aria-hidden />
          {breakUntil !== null ? (
            <>
              <span className="flex-1">Batch {currentBatch} of {totalBatches} done. Next batch starts in <strong className="tabular">{secondsLeft}s</strong>.</span>
              <Button size="sm" variant="primary" onClick={nextBatch}>Start now</Button>
              <Button size="sm" onClick={() => {
                clearTimeout(breakTimer.current);
                breakTimer.current = undefined;
                setBreakUntil(null);
                setHeld(true);
              }}>Wait</Button>
            </>
          ) : waitingForGo ? (
            <>
              <span className="flex-1">Paused after batch {currentBatch} of {totalBatches}. {rows.length - counts.done} files waiting.</span>
              <Button size="sm" variant="primary" onClick={() => { setHeld(false); nextBatch(); }}>Continue</Button>
            </>
          ) : (
            <>
              <span className="flex-1">Reading batch {currentBatch} of {totalBatches} ({batchSize} files each){held ? '. Will pause after this batch.' : '.'}</span>
              {currentBatch < totalBatches && <Button size="sm" onClick={() => setHeld(!held)}>{held ? 'Keep going' : 'Pause after this batch'}</Button>}
            </>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
            <span className="tabular">{rows.length} file{rows.length === 1 ? '' : 's'} · {counts.done} read · {readyRows.length} ready</span>
            {counts.failed > 0 && <span className="tabular text-red-800">{counts.failed} could not be read</span>}
            {counts.duplicates > 0 && <span className="tabular text-red-800">{counts.duplicates} already here</span>}
            {missingNames.length > 0 && <span className="tabular text-red-800">{missingNames.length} need a name</span>}
            {(counts.problems > 0 || problemsOnly) && (
              <label className="ml-auto flex items-center gap-1.5 font-medium">
                <input type="checkbox" className="size-4 accent-brand-600" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} />
                Show only files that need a look ({counts.problems})
              </label>
            )}
          </div>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {shownRows.map((row) => (
              <QueueItem
                key={row.id}
                row={row}
                dup={duplicateInfo(row)}
                otherPosition={duplicateInfo(row).other ? buckets.find((b) => b.id === duplicateInfo(row).other!.bucket_id)?.designation : undefined}
                onPatch={patchRow}
                onRemove={removeRow}
              />
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}

interface QueueItemProps {
  row: QueueRow;
  dup: DuplicateInfo;
  otherPosition?: string;
  onPatch: (id: string, patch: Partial<QueueRow>) => void;
  onRemove: (id: string) => void;
}

/** One file in the upload list. Memoised: in a batch of 1000, a file finishing re-draws only its own row. */
const QueueItem = memo(
  function QueueItem({ row, dup, otherPosition, onPatch, onRemove }: QueueItemProps) {
    const warnings = row.result?.parsed.warnings ?? [];
    const blocked = dup.sameBucket || dup.inBatch;
    return (
      // Rows scrolled out of view are not laid out or painted: a 1000-file list stays quick to type in.
      <li className={classNames('flex flex-wrap items-center gap-3 px-3 py-2.5 [content-visibility:auto] [contain-intrinsic-size:auto_68px]', (row.skip || blocked) && 'opacity-60')}>
        {row.photoUrl ? (
          <img src={row.photoUrl} alt={`Photo found in ${row.file.name}`} className="size-11 rounded-lg border border-line object-cover" />
        ) : (
          <span className="flex size-11 items-center justify-center rounded-lg bg-hover text-[10px] text-ink-muted">No photo</span>
        )}
        <div className="min-w-44 flex-1">
          <p className="truncate text-xs text-ink-muted" title={row.file.name}>{row.file.name}</p>
          {row.status === 'reading' && <p className="flex items-center gap-1 text-sm text-ink-soft"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Reading…</p>}
          {row.status === 'queued' && <p className="text-sm text-ink-muted">Waiting…</p>}
          {row.status === 'failed' && <p className="flex items-center gap-1 text-sm text-red-800"><XCircle className="size-3.5 shrink-0" aria-hidden /> {row.error}</p>}
          {row.status === 'imported' && <p className="flex items-center gap-1 text-sm text-brand-700"><CheckCircle2 className="size-3.5" aria-hidden /> Imported</p>}
          {row.status === 'importing' && <p className="flex items-center gap-1 text-sm text-ink-soft"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…</p>}
          {row.status === 'ready' && (
            <div className="mt-1 grid gap-1.5 sm:grid-cols-3">
              <input aria-label={`Name in ${row.file.name}`} placeholder="Name (required)" value={row.full_name} onChange={(e) => onPatch(row.id, { full_name: e.target.value })} className={classNames('rounded-md border px-2 py-1 text-sm', row.full_name.trim() ? 'border-line' : 'border-red-400')} />
              <input aria-label={`Mobile in ${row.file.name}`} placeholder="Mobile" value={row.phone} onChange={(e) => onPatch(row.id, { phone: e.target.value })} className="tabular rounded-md border border-line px-2 py-1 text-sm" />
              <input aria-label={`Email in ${row.file.name}`} placeholder="Email" value={row.email} onChange={(e) => onPatch(row.id, { email: e.target.value })} className="rounded-md border border-line px-2 py-1 text-sm" />
            </div>
          )}
          {dup.sameBucket && <p className="mt-1 text-xs text-red-800">Already in this bucket as {dup.sameBucket.full_name}. It will not be imported.</p>}
          {!dup.sameBucket && dup.inBatch && <p className="mt-1 text-xs text-red-800">Same person as an earlier file in this upload. It will not be imported.</p>}
          {!dup.sameBucket && otherPosition && <p className="mt-1 text-xs text-amber-900">Also applied for another position: {otherPosition}.</p>}
          {warnings.length > 0 && (
            <details className="mt-1 text-xs text-amber-900">
              <summary className="flex items-center gap-1"><AlertTriangle className="size-3" aria-hidden /> {warnings.length} thing{warnings.length > 1 ? 's' : ''} to check</summary>
              <ul className="mt-1 list-disc pl-5">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </details>
          )}
        </div>
        {row.status !== 'imported' && row.status !== 'importing' && (
          <IconButton label={`Remove ${row.file.name}`} icon={Trash2} onClick={() => onRemove(row.id)} />
        )}
      </li>
    );
  },
  (before, after) =>
    before.row === after.row &&
    before.otherPosition === after.otherPosition &&
    before.dup.sameBucket === after.dup.sameBucket &&
    before.dup.inBatch === after.dup.inBatch &&
    before.onPatch === after.onPatch &&
    before.onRemove === after.onRemove,
);

function ModeOption({ checked, disabled, onSelect, icon: Icon, title, body }: { checked: boolean; disabled?: boolean; onSelect: () => void; icon: typeof Wand2; title: string; body: string }) {
  return (
    <label className={classNames('flex cursor-pointer gap-2.5 rounded-xl border p-3 transition-colors', checked ? 'border-brand-600 bg-brand-50' : 'border-line hover:bg-canvas', disabled && 'cursor-not-allowed opacity-70')}>
      <input type="radio" name="parse-mode" checked={checked} disabled={disabled} onChange={onSelect} className="mt-0.5 accent-brand-600" />
      <span>
        <span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="size-4" aria-hidden /> {title}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{body}</span>
      </span>
    </label>
  );
}
