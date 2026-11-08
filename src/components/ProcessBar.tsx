import { Check, Lock, X } from 'lucide-react';
import { classNames } from '../lib/format';
import { isLocked, processSteps, type ProcessStep, type StepState } from '../lib/pipeline';
import type { Candidate } from '../types';

const DOT: Record<StepState, string> = {
  done: 'bg-brand-600 text-white',
  current: 'bg-surface text-brand-700 ring-2 ring-brand-600',
  stopped: 'bg-red-700 text-white',
  upcoming: 'bg-hover text-ink-muted',
};

const STATE_WORDS: Record<StepState, string> = { done: 'done', current: 'now here', stopped: 'stopped here', upcoming: 'not yet' };

function Dot({ step, index }: { step: ProcessStep; index: number }) {
  return (
    <span className={classNames('relative flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', DOT[step.state])}>
      {step.state === 'done' ? <Check className="size-4" aria-hidden /> : step.state === 'stopped' ? <X className="size-4" aria-hidden /> : index + 1}
    </span>
  );
}

/** The whole process for one candidate, first step to last, with where they stand now. */
export function ProcessBar({ candidate }: { candidate: Candidate }) {
  const steps = processSteps(candidate);
  return (
    <ol aria-label="Process" className="grid auto-cols-[minmax(6.5rem,1fr)] grid-flow-col overflow-x-auto pt-0.5 pb-1">
      {steps.map((step, index) => (
        <li key={step.key} aria-current={step.state === 'current' ? 'step' : undefined} className="relative px-1 text-center">
          {index > 0 && (
            <span className={classNames('absolute top-[0.875rem] right-1/2 h-0.5 w-full -translate-y-1/2', step.state === 'upcoming' ? 'bg-line' : step.state === 'stopped' ? 'bg-red-700' : 'bg-brand-600')} aria-hidden />
          )}
          <span className="relative z-1 flex justify-center"><Dot step={step} index={index} /></span>
          <span className={classNames('mt-1.5 block text-xs leading-tight', step.state === 'current' || step.state === 'stopped' ? 'font-semibold text-ink' : step.state === 'done' ? 'text-ink' : 'text-ink-muted')}>
            {step.label}
            <span className="sr-only"> ({STATE_WORDS[step.state]})</span>
          </span>
          {step.detail && <span className={classNames('tabular mt-0.5 block text-[11px] leading-tight', step.state === 'stopped' ? 'text-red-800' : 'text-ink-muted')}>{step.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

const SEGMENT: Record<StepState, string> = {
  done: 'bg-brand-600',
  current: 'bg-brand-300',
  stopped: 'bg-red-700',
  upcoming: 'bg-line',
};

/** The same process squeezed into one table cell. */
export function ProcessMini({ candidate }: { candidate: Candidate }) {
  const steps = processSteps(candidate);
  const done = steps.filter((step) => step.state === 'done').length;
  const stand = steps.find((step) => step.state === 'current' || step.state === 'stopped');
  const label = stand
    ? `Step ${steps.indexOf(stand) + 1} of ${steps.length}: ${stand.label}${stand.state === 'stopped' ? ', stopped' : ''}`
    : `All ${steps.length} steps done`;
  return (
    <span className="flex items-center gap-1.5" role="img" aria-label={label} title={label}>
      <span className="flex w-24 gap-0.5" aria-hidden>
        {steps.map((step) => <span key={step.key} className={classNames('h-1.5 flex-1 rounded-full', SEGMENT[step.state])} />)}
      </span>
      {isLocked(candidate) ? <Lock className="size-3 text-ink-muted" aria-hidden /> : <span className="tabular text-[11px] text-ink-muted" aria-hidden>{done}/{steps.length}</span>}
    </span>
  );
}
