import { ArrowLeft, ArrowRight, CircleHelp, Compass, Route, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { FLOW, TOURS, tourForPath, type FlowStep, type TourId, type TourStep } from '../lib/guide';
import { useStore } from '../lib/store';
import { Button, Dialog, HoverTooltip, IconButton, useToast } from './ui';

// ---------------------------------------------------------------------------
// Help tips: a small question mark that explains the thing beside it on hover, focus or tap.
// ---------------------------------------------------------------------------
export function HelpTip({ label, children, side }: { label: string; children: ReactNode; side?: 'below' | 'above' | 'beside' }) {
  return (
    <HoverTooltip className="inline-flex" side={side} details={<div className="text-sm leading-relaxed text-ink-soft">{children}</div>}>
      {({ tooltipId }) => (
        <button
          type="button"
          aria-label={label}
          aria-describedby={tooltipId}
          className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-brand-700"
        >
          <CircleHelp className="size-4" aria-hidden />
        </button>
      )}
    </HoverTooltip>
  );
}

// ---------------------------------------------------------------------------
// Tours
// ---------------------------------------------------------------------------
interface GuideValue {
  /** Starts a tour of the page or of the open card. A welcome line, if given, heads the first step. */
  startTour: (id: TourId, welcome?: string) => void;
  openHelp: () => void;
}

const GuideContext = createContext<GuideValue>({ startTour: () => undefined, openHelp: () => undefined });

export const useGuide = () => useContext(GuideContext);

export function GuideProvider({ children }: { children: ReactNode }) {
  const [tour, setTour] = useState<{ id: TourId; key: number; welcome?: string } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const startTour = useCallback((id: TourId, welcome?: string) => setTour({ id, key: Date.now(), welcome }), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const endTour = useCallback(() => setTour(null), []);
  const value = useMemo(() => ({ startTour, openHelp }), [startTour, openHelp]);
  return (
    <GuideContext.Provider value={value}>
      {children}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} onTour={(id) => { setHelpOpen(false); startTour(id); }} />}
      {tour && <Tour key={tour.key} id={tour.id} welcome={tour.welcome} onClose={endTour} />}
    </GuideContext.Provider>
  );
}

const findTarget = (name: string): HTMLElement | null => {
  // The topmost open window first: a tour of a card points inside the card, not at the page behind it.
  const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
  const scope: ParentNode = dialogs[dialogs.length - 1] ?? document;
  const element = scope.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  return element && element.getClientRects().length > 0 ? element : null;
};

const POPOVER_WIDTH = 340;
const PAD = 6;

const GAP = PAD + 8;

/** Beside a tall target, else below or above it, and always wholly on screen, using the box's real height. */
function popoverStyle(rect: DOMRect | null, height: number): CSSProperties {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const width = Math.min(POPOVER_WIDTH, screenWidth - 24);
  const fit = (top: number) => Math.max(12, Math.min(top, screenHeight - height - 12));
  if (!rect) return { width, left: (screenWidth - width) / 2, top: fit(screenHeight / 3) };
  // The side menu runs the full height: there is no room above or below it.
  if (rect.height > screenHeight / 2) {
    const left = rect.right + GAP + width <= screenWidth - 12 ? rect.right + GAP : Math.max(12, rect.left - GAP - width);
    return { width, left, top: fit(rect.top + 40) };
  }
  const left = Math.max(12, Math.min(rect.left, screenWidth - width - 12));
  if (screenHeight - rect.bottom >= height + GAP + 12) return { width, left, top: rect.bottom + GAP };
  if (rect.top >= height + GAP + 12) return { width, left, top: rect.top - GAP - height };
  return { width, left, top: fit(rect.bottom + GAP) };
}

/** Points at one thing at a time, with a short explanation. Esc or Close ends it; arrow keys move. */
function Tour({ id, welcome, onClose }: { id: TourId; welcome?: string; onClose: () => void }) {
  const toast = useToast();
  const { title, steps: all } = TOURS[id];
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [height, setHeight] = useState(220);
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<Element>(document.body);

  // The box grows with its text, so its height is measured after each change before it is placed.
  useLayoutEffect(() => {
    const measured = box.current?.offsetHeight;
    if (measured && measured !== height) setHeight(measured);
  });

  // A page that just opened may still be drawing: wait a moment for what the tour points at.
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const look = () => {
      const found = all.filter((step) => findTarget(step.target));
      // A card opening over a page: wait for the card, not the page behind it.
      const waitingForCard = id === 'card' && !document.querySelector('dialog[open] [data-tour="card-next"]');
      if ((found.length > 0 && !waitingForCard) || tries > 20) {
        if (found.length === 0) {
          toast('There is nothing on this screen for that tour yet.', 'bad');
          onClose();
          return;
        }
        const dialogs = document.querySelectorAll('dialog[open]');
        host.current = dialogs[dialogs.length - 1] ?? document.body;
        setSteps(found);
        return;
      }
      tries += 1;
      timer = setTimeout(look, 150);
    };
    timer = setTimeout(look, 50);
    return () => clearTimeout(timer);
  }, [all, id, onClose, toast]);

  const step = steps?.[index];

  useLayoutEffect(() => {
    if (!step) return;
    const element = findTarget(step.target);
    if (!element) {
      setRect(null);
      return;
    }
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(element.getBoundingClientRect()));
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    box.current?.querySelector<HTMLButtonElement>('[data-tour-next]')?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  useEffect(() => {
    if (!steps) return;
    const onKey = (event: KeyboardEvent) => {
      // Esc ends the tour without also closing the card underneath it.
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, steps.length - 1));
      else if (event.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [steps, onClose]);

  if (!steps || !step) return null;
  const last = index === steps.length - 1;

  return createPortal(
    <div className="no-print fixed inset-0 z-[70]" onClick={(event) => event.target === event.currentTarget && onClose()}>
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl ring-2 ring-brand-500 transition-all duration-200"
          style={{
            left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgb(15 23 42 / 0.45)',
          }}
        />
      )}
      <div
        ref={box}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-body"
        className="fixed rounded-xl border border-line bg-surface p-4 text-ink shadow-2xl"
        style={popoverStyle(rect, height)}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-brand-700 uppercase">{title} · {index + 1} of {steps.length}</p>
            <h2 id="tour-step-title" className="mt-0.5 text-sm font-semibold">{step.title}</h2>
          </div>
          <IconButton label="Close the tour" icon={X} onClick={onClose} />
        </div>
        {welcome && index === 0 && <p className="mt-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm text-brand-900">{welcome}</p>}
        <p id="tour-step-body" className="mt-1.5 text-sm leading-relaxed text-ink-soft">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="flex gap-1" aria-hidden>
            {steps.map((s, i) => <span key={s.target} className={i === index ? 'size-1.5 rounded-full bg-brand-600' : 'size-1.5 rounded-full bg-line-strong'} />)}
          </span>
          <span className="flex gap-2">
            {!last && <Button size="sm" variant="ghost" onClick={onClose}>Skip tour</Button>}
            {index > 0 && <Button size="sm" icon={ArrowLeft} onClick={() => setIndex(index - 1)}>Back</Button>}
            <Button data-tour-next size="sm" variant="primary" onClick={() => (last ? onClose() : setIndex(index + 1))}>
              {last ? 'Done' : <>Next <ArrowRight className="size-3.5" aria-hidden /></>}
            </Button>
          </span>
        </div>
      </div>
    </div>,
    host.current,
  );
}

// ---------------------------------------------------------------------------
// Help window: a tour of this page, and the whole hiring flow
// ---------------------------------------------------------------------------
function HelpDialog({ onClose, onTour }: { onClose: () => void; onTour: (id: TourId) => void }) {
  const { candidates, settings, canScreen } = useStore();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const here = tourForPath(pathname);

  // A step done on a candidate's card opens a real candidate at that step as the example. The tour waits for
  // the page to draw, so it can start straight away.
  const showMe = (step: FlowStep) => {
    onClose();
    const example = step.example ? candidates.find(step.example) : undefined;
    if (step.tour === 'card' && example) {
      navigate(`/buckets/${example.bucket_id}?candidate=${example.id}`);
      onTour('card');
      return;
    }
    navigate(step.to);
    onTour(step.tour === 'card' ? tourForPath(step.to) : step.tour);
  };

  return (
    <Dialog title="Help" description="A tour of this page, or the whole hiring flow from vacancy to joining day." onClose={onClose} width="max-w-2xl">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={Compass} onClick={() => { onClose(); onTour(here); }}>Show me around: {TOURS[here].title}</Button>
      </div>

      <h3 className="mt-5 flex items-center gap-1.5 text-sm font-semibold"><Route className="size-4" aria-hidden /> The hiring flow, step by step</h3>
      <ol className="mt-2 space-y-2">
        {FLOW.map((step, index) => (
          <li key={step.title} className="flex gap-3 rounded-xl border border-line px-3 py-2.5">
            <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-900">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-sm text-ink-soft">{step.body}</p>
              <p className="mt-0.5 text-xs text-ink-muted">Where: {step.where}</p>
            </div>
            <Button size="sm" className="self-center" onClick={() => showMe(step)}>Show me</Button>
          </li>
        ))}
      </ol>

      {canScreen && (
        <p className="mt-4 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-soft">
          CV upload limits: up to 15 MB per file, {settings.upload_max_files} files per upload. Large uploads are read {settings.upload_batch_size} files at a time
          {settings.upload_batch_pause > 0 ? `, with a ${settings.upload_batch_pause}-second break between batches` : ''}. An admin can change this under Settings &gt; Company.
        </p>
      )}
    </Dialog>
  );
}

/** The ? button in the header. */
export function HelpButton() {
  const { openHelp } = useGuide();
  return (
    <span data-tour="help">
      <IconButton label="Help and guided tour" icon={CircleHelp} onClick={openHelp} />
    </span>
  );
}

const WELCOME_KEY = 'guide-welcome-done:';

/**
 * The first time a person reaches the dashboard, the tour starts by itself. Skip, Close, Esc or a click outside
 * ends it, and it does not start again on this computer; the ? at the top brings it back any time.
 */
export function WelcomeGuide() {
  const { user } = useStore();
  const { startTour } = useGuide();
  const userId = user?.id;
  const name = (user?.full_name || '').split(' ')[0];

  useEffect(() => {
    if (!userId) return;
    const key = `${WELCOME_KEY}${userId}`;
    if (localStorage.getItem(key) === '1') return;
    // Marked when it starts, not before: a page that redraws at once must not use up the first visit.
    const timer = setTimeout(() => {
      localStorage.setItem(key, '1');
      startTour('dashboard', `Welcome${name ? `, ${name}` : ''}! A one-minute tour of the app. Press Skip tour to close it; the ? at the top brings it back any time.`);
    }, 500);
    return () => clearTimeout(timer);
  }, [userId, name, startTour]);

  return null;
}
