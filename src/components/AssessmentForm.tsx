import { useState, type FormEvent, type ReactNode } from 'react';
import { AREAS, emptyInput, FULL_SCORE, MAX_REMARKS, RATING_SCALE, scaleLabel, scoreOf, STAGE_LABEL, type FormHeader } from '../lib/assessment';
import { classNames, dateDmy } from '../lib/format';
import type { AssessmentInput, Recommendation } from '../types';
import { TextArea, TextInput } from './ui';

export type { FormHeader };

export function FormHeaderView({ header }: { header: FormHeader }) {
  const rows: [string, string][] = [
    ['Unit / Factory', header.unit || header.company],
    ["Candidate's name", header.candidateName],
    ['Position', header.designation],
    ['Department', header.department],
    ['Section', header.section],
    ['Sub-section', header.subsection],
    ["Interviewer's name", header.interviewerName],
    ['Interviewer position', header.interviewerDesignation],
    ['Interviewer department', header.interviewerDepartment],
    ['Date of interview', header.date ? dateDmy(header.date) : ''],
    ['Interview', STAGE_LABEL[header.stage]],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl border border-line bg-canvas p-3 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <dt className="w-40 shrink-0 text-ink-muted">{label}</dt>
          <dd className="min-w-0 font-medium break-words">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The live score, worked out from the marks as they are given. */
export function ScoreLine({ ratings }: { ratings: (number | null)[] }) {
  const score = scoreOf(ratings);
  const empty = AREAS.length - score.rated;
  return (
    <div className="rounded-xl border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-900" aria-live="polite">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span>Obtained <strong className="tabular text-base">{score.obtained}</strong>/{FULL_SCORE}</span>
        <span>Average <strong className="tabular">{score.average.toFixed(1)}</strong></span>
        <span><strong className="tabular">{score.percent}</strong>%</span>
        {score.rated > 0 && <span className="font-semibold">{scaleLabel(score.average)}</span>}
      </div>
      {score.rated > 0 && empty > 0 && (
        <p className="mt-0.5 text-xs text-amber-900">{empty} area{empty === 1 ? '' : 's'} not marked: counted as 0.</p>
      )}
    </div>
  );
}

/**
 * The Interview Assessment Form. The interviewer gives a mark for each area, optional strengths and
 * weaknesses, a comment and a recommendation; the score works itself out. The signature part comes from
 * the page using it, because an interviewer, a guest and HR each sign differently.
 */
export function AssessmentForm({ id, header, initial, readOnly = false, onSubmit, signature }: {
  id: string;
  header: FormHeader;
  initial?: AssessmentInput;
  /** Shows the marks without letting them change, e.g. for HR looking at an interviewer's own form. */
  readOnly?: boolean;
  onSubmit: (input: AssessmentInput) => void;
  signature?: ReactNode;
}) {
  const [input, setInput] = useState<AssessmentInput>(() => {
    const start = initial ?? emptyInput();
    return { ...start, ratings: AREAS.map((_, index) => start.ratings[index] ?? null) };
  });
  const [showRemarks, setShowRemarks] = useState(() => (initial?.strengths.length ?? 0) + (initial?.weaknesses.length ?? 0) > 0);
  const set = (patch: Partial<AssessmentInput>) => setInput((current) => ({ ...current, ...patch }));

  function rate(index: number, value: number) {
    if (readOnly) return;
    const ratings = [...input.ratings];
    // Tapping the chosen mark again takes it back.
    ratings[index] = ratings[index] === value ? null : value;
    set({ ratings });
  }

  function setRemark(list: 'strengths' | 'weaknesses', index: number, value: string) {
    const items = Array.from({ length: MAX_REMARKS }, (_, i) => input[list][i] ?? '');
    items[index] = value;
    set({ [list]: items } as Partial<AssessmentInput>);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      ...input,
      strengths: input.strengths.map((s) => s.trim()).filter(Boolean),
      weaknesses: input.weaknesses.map((s) => s.trim()).filter(Boolean),
      comment: input.comment.trim(),
    });
  }

  return (
    <form id={id} onSubmit={submit} className="space-y-4">
      <FormHeaderView header={header} />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Interview assessment of the candidate</legend>
        <p className="mb-2 text-xs text-ink-muted">5 Outstanding · 4 Excellent · 3 Good · 2 Average · 1 Poor. Tap a mark again to take it back.</p>
        <ol className="space-y-2">
          {AREAS.map((area, index) => (
            <li key={area.title} className="rounded-xl border border-line p-3">
              <div className="mb-2">
                <p className="text-sm font-medium">{index + 1}. {area.title}</p>
                <p className="text-xs text-ink-muted">{area.hint}</p>
              </div>
              <div role="radiogroup" aria-label={`${index + 1}. ${area.title}`} className="grid grid-cols-5 gap-1.5">
                {RATING_SCALE.map((point) => {
                  const chosen = input.ratings[index] === point.value;
                  return (
                    <button
                      key={point.value}
                      type="button"
                      role="radio"
                      aria-checked={chosen}
                      disabled={readOnly}
                      onClick={() => rate(index, point.value)}
                      className={classNames(
                        'flex flex-col items-center rounded-lg border px-1 py-1.5 text-center transition-colors',
                        chosen ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong bg-surface text-ink-soft',
                        !readOnly && !chosen && 'hover:border-brand-600 hover:bg-brand-50',
                      )}
                    >
                      <span className="tabular text-base leading-none font-semibold">{point.value}</span>
                      <span className="mt-0.5 text-[10px] leading-tight sm:text-[11px]">{point.label}</span>
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      </fieldset>

      <ScoreLine ratings={input.ratings} />

      <div>
        {!showRemarks ? (
          <button type="button" className="text-sm font-medium text-brand-700 underline" onClick={() => setShowRemarks(true)} disabled={readOnly}>
            Add strengths and weaknesses (optional)
          </button>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {(['strengths', 'weaknesses'] as const).map((list) => (
              <fieldset key={list} className="space-y-1.5">
                <legend className="mb-1 text-sm font-semibold">{list === 'strengths' ? 'Major strengths' : 'Major weaknesses'}</legend>
                {Array.from({ length: MAX_REMARKS }, (_, i) => (
                  <TextInput
                    key={i}
                    aria-label={`${list === 'strengths' ? 'Strength' : 'Weakness'} ${i + 1}`}
                    placeholder={`${list === 'strengths' ? 'Strength' : 'Weakness'} ${i + 1}`}
                    maxLength={300}
                    disabled={readOnly}
                    value={input[list][i] ?? ''}
                    onChange={(e) => setRemark(list, i, e.target.value)}
                  />
                ))}
              </fieldset>
            ))}
          </div>
        )}
      </div>

      <TextArea
        label="Interviewer's comment"
        rows={3}
        maxLength={2000}
        disabled={readOnly}
        placeholder={scaleLabel(scoreOf(input.ratings).average) || 'Your overall view of the candidate'}
        value={input.comment}
        onChange={(e) => set({ comment: e.target.value })}
      />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Interviewer's recommendation</legend>
        <div role="radiogroup" aria-label="Interviewer's recommendation" className="flex flex-wrap gap-2">
          {([['employ', 'Employ'], ['turn_down', 'Turn Down']] as [Recommendation, string][]).map(([value, label]) => {
            const chosen = input.recommendation === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={chosen}
                disabled={readOnly}
                onClick={() => set({ recommendation: chosen ? '' : value })}
                className={classNames(
                  'min-w-32 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                  chosen
                    ? value === 'employ' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-red-700 bg-red-700 text-white'
                    : 'border-line-strong bg-surface text-ink-soft hover:bg-hover',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {signature}
    </form>
  );
}
