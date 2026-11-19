import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { FlowBox, FlowKind, FlowStep } from '../lib/bucketFlow';
import { classNames } from '../lib/format';
import { HoverTooltip } from './ui';

const HIDDEN_KEY = 'bucket-flow-hidden';
const NAMES_SHOWN = 10;

const PILL: Record<Exclude<FlowKind, 'start' | 'pass'>, { box: string; tick: string }> = {
  rejected: { box: 'border-orange-200 bg-orange-100 text-orange-950', tick: 'bg-orange-400' },
  hold: { box: 'border-amber-200 bg-amber-100 text-amber-950', tick: 'bg-amber-500' },
  todo: { box: 'border-line bg-hover text-ink-soft', tick: 'bg-line-strong' },
};

/** The first names in a box, with what matters about each, for the hover card. */
function BoxDetails({ box }: { box: FlowBox }) {
  const more = box.people.length - NAMES_SHOWN;
  return (
    <div className="w-64">
      <h3 className="font-semibold text-ink">{box.label} · {box.people.length}</h3>
      <p className="mt-0.5 text-ink-soft">{box.summary}</p>
      {box.people.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-line pt-2">
          {box.people.slice(0, NAMES_SHOWN).map((c) => (
            <li key={c.id} className="flex justify-between gap-3">
              <span className="truncate font-medium text-ink">{c.full_name}</span>
              <span className="shrink-0 truncate text-ink-muted">{box.detail(c)}</span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="mt-1.5 font-medium text-brand-700">+{more} more · click to show everyone in the list</p>}
    </div>
  );
}

function Box({ box, selected, onSelect, branch }: { box: FlowBox; selected: boolean; onSelect: (id: string) => void; branch?: boolean }) {
  const look = branch ? PILL[box.kind as keyof typeof PILL] : null;
  return (
    // The branch lines start behind the green box's lower half; the box sits above them so all of it takes the pointer.
    <HoverTooltip details={<BoxDetails box={box} />} className={branch ? 'flex min-w-0 flex-1 items-center' : 'relative z-[1]'}>
      {({ tooltipId }) => (
        <>
          {look && <span className={classNames('h-0.5 w-[13px] shrink-0', look.tick)} aria-hidden />}
          <button
            type="button"
            aria-pressed={selected}
            aria-describedby={tooltipId}
            onClick={() => onSelect(box.id)}
            className={classNames(
              branch
                ? classNames('flex h-[26px] min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 text-left text-xs', look?.box)
                : classNames('flex h-[60px] w-full flex-col items-start justify-center rounded-lg px-3 text-left text-white', box.kind === 'start' ? 'bg-ink' : 'bg-brand-700'),
              selected && 'ring-2 ring-ink ring-offset-1',
            )}
          >
            {branch ? (
              <>
                <b className="tabular text-[13px]">{box.people.length}</b>
                <span className="truncate">{box.label}</span>
              </>
            ) : (
              <>
                <span className="tabular text-[22px] leading-[26px] font-bold">{box.people.length}</span>
                <span className="max-w-full truncate text-[11.5px] leading-[14px]">{box.label}</span>
              </>
            )}
          </button>
        </>
      )}
    </HoverTooltip>
  );
}

/**
 * One card at the top of a bucket: the map of how its candidates moved, step by step, and the tabs along its
 * bottom edge. The map can be hidden; that choice is remembered on this computer.
 */
export function BucketFlowCard({ steps, selected, onSelect, tabs }: {
  steps: FlowStep[];
  selected: string | null;
  onSelect: (id: string) => void;
  tabs: ReactNode;
}) {
  const [hidden, setHidden] = useState(() => localStorage.getItem(HIDDEN_KEY) === '1');
  const toggle = () => setHidden((current) => {
    localStorage.setItem(HIDDEN_KEY, current ? '0' : '1');
    return !current;
  });

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2.5">
        <h2 className="text-[13px] font-bold">How this bucket moved</h2>
        <div className="flex items-center gap-3">
          {!hidden && <span className="hidden text-xs text-ink-muted sm:inline">Point at a box to see who. Click it to show them below.</span>}
          <button
            type="button"
            aria-expanded={!hidden}
            onClick={toggle}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-medium text-ink-soft hover:bg-hover"
          >
            {hidden ? 'Show map' : 'Hide map'}
            {hidden ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronUp className="size-3.5" aria-hidden />}
          </button>
        </div>
      </div>

      {!hidden && (
        <div className="flex flex-wrap gap-x-7 gap-y-3.5 px-3.5 pt-0.5 pb-4">
          {steps.map((step, index) => (
            <div key={step.node.id} className="relative flex w-[150px] flex-col gap-1.5">
              <div className="h-4 text-[10.5px] leading-4 font-bold tracking-wider whitespace-nowrap text-ink-muted uppercase">{step.title}</div>
              {index > 0 && (
                <svg aria-hidden width="24" height="10" viewBox="0 0 24 10" className="absolute top-[47px] -left-[26px] overflow-visible">
                  <path d="M 0 5 L 19 5" stroke="var(--color-brand-600)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M 17 1 L 23 5 L 17 9 Z" fill="var(--color-brand-600)" />
                </svg>
              )}
              <Box box={step.node} selected={selected === step.node.id} onSelect={onSelect} />
              {step.branches.length > 0 && (
                <div className="-mt-9 -ml-[15px] flex flex-col gap-1.5 border-l-2 border-line-strong pt-[42px]">
                  {step.branches.map((branch) => (
                    <Box key={branch.id} box={branch} branch selected={selected === branch.id} onSelect={onSelect} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tabs}
    </section>
  );
}
