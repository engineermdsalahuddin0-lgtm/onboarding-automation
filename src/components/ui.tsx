import { AlertCircle, CheckCircle2, CircleDashed, Clock, Info, Loader2, Star, X, XCircle, type LucideIcon } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import { classNames, initials } from '../lib/format';
import { recommendations, recommendationSummary, type Tone } from '../lib/pipeline';
import type { Candidate } from '../types';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-line-strong disabled:text-white',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-hover disabled:text-ink-muted',
  ghost: 'text-ink-soft hover:bg-hover hover:text-ink disabled:text-line-strong',
  danger: 'bg-surface text-red-800 border border-red-200 hover:bg-red-50 disabled:text-ink-muted',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: LucideIcon;
  loading?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, children, className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      {...rest}
      disabled={rest.disabled || loading}
      className={classNames(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        BUTTON_STYLES[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({ label, icon: Icon, className, ...rest }: { label: string; icon: LucideIcon } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={classNames('inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-hover hover:text-ink disabled:text-line-strong', className)}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/** A small icon button that names itself on hover or keyboard focus, for a row of actions that should stay quiet. */
export function ActionIcon({ label, icon: Icon, primary, className, ...rest }: { label: string; icon: LucideIcon; primary?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      {...rest}
      className={classNames(
        'group relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:text-line-strong',
        primary ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-line-strong bg-surface text-ink-soft hover:bg-hover hover:text-ink',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      <span aria-hidden className="pointer-events-none absolute top-full left-1/2 z-20 mt-1.5 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    </button>
  );
}

const CONTROL = 'w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-muted disabled:bg-hover disabled:text-ink-muted';

interface FieldShell {
  label?: string;
  hint?: string;
  error?: string;
}

function Field({ label, hint, error, htmlFor, required, children }: FieldShell & { htmlFor: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0">
      {label && (
        <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-ink-soft">
          {label}
          {required && <span className="text-red-800"> *</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-800" role="alert">{error}</p>}
    </div>
  );
}

export function TextInput({ label, hint, error, className, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const id = rest.id ?? generated;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} required={rest.required}>
      <input {...rest} id={id} aria-invalid={error ? true : undefined} className={classNames(CONTROL, 'h-9', className)} />
    </Field>
  );
}

export function TextArea({ label, hint, error, className, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const id = rest.id ?? generated;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} required={rest.required}>
      <textarea {...rest} id={id} className={classNames(CONTROL, 'py-2', className)} />
    </Field>
  );
}

export function Select({ label, hint, error, className, children, ...rest }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId();
  const id = rest.id ?? generated;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} required={rest.required}>
      <select {...rest} id={id} className={classNames(CONTROL, 'h-9', className)}>
        {children}
      </select>
    </Field>
  );
}

const TONES: Record<Tone, { className: string; icon: LucideIcon }> = {
  neutral: { className: 'bg-hover text-ink-soft', icon: CircleDashed },
  info: { className: 'bg-sky-50 text-sky-900', icon: Info },
  progress: { className: 'bg-violet-50 text-violet-900', icon: Clock },
  warning: { className: 'bg-amber-50 text-amber-900', icon: AlertCircle },
  good: { className: 'bg-brand-50 text-brand-900', icon: CheckCircle2 },
  bad: { className: 'bg-red-50 text-red-900', icon: XCircle },
};

/** A status always pairs its colour with an icon and a label, so it never relies on colour alone. */
export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const { className, icon: Icon } = TONES[tone];
  return (
    <span className={classNames('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', className)}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {children}
    </span>
  );
}

/** A day and a time that belong together, such as when a candidate joins. */
export function DateTimeField({ label, date, time, onDate, onTime, min, minTime, max, required, hint }: {
  label: string;
  date: string;
  time: string;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  min?: string;
  minTime?: string;
  max?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-medium text-ink-soft">
        {label}
        {required && <span className="text-red-800"> *</span>}
      </legend>
      <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
        <input type="date" aria-label={`${label}: day`} required={required} min={min} max={max} value={date} onChange={(e) => onDate(e.target.value)} className={classNames(CONTROL, 'h-9')} />
        <input type="time" aria-label={`${label}: time`} required={required} min={minTime} value={time} onChange={(e) => onTime(e.target.value)} className={classNames(CONTROL, 'h-9')} />
      </div>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </fieldset>
  );
}

const THUMB_PX = 14;

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  low: number;
  high: number;
  format: (value: number) => string;
  onChange: (low: number, high: number) => void;
}

/** Two native range inputs on one track: the browser keeps mouse, touch, keyboard and screen reader support. */
export function RangeSlider({ label, min, max, step, low, high, format, onChange }: RangeSliderProps) {
  const labelId = useId();
  const share = (value: number) => (max > min ? (value - min) / (max - min) : 0);
  const narrowed = low > min || high < max;
  return (
    <div role="group" aria-labelledby={labelId} className="w-full min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[11px] leading-[14px]">
        <span id={labelId} className="font-medium text-ink-soft">{label}</span>
        <output className={classNames('tabular whitespace-nowrap', narrowed ? 'font-semibold text-brand-900' : 'text-ink-muted')}>
          {format(low)} - {format(high)}
        </output>
      </div>
      <div className="relative h-[18px]">
        <span className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-line-strong" aria-hidden />
        <span
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-600"
          style={{
            left: `calc(${THUMB_PX / 2}px + ${share(low)} * (100% - ${THUMB_PX}px))`,
            width: `calc(${share(high) - share(low)} * (100% - ${THUMB_PX}px))`,
          }}
          aria-hidden
        />
        <input
          type="range"
          className="range-thumb"
          aria-label={`${label} from`}
          aria-valuetext={format(low)}
          min={min}
          max={max}
          step={step}
          value={low}
          // Both thumbs parked at the top end: the lower one has to stay reachable.
          style={{ zIndex: low >= high && low > min ? 2 : 1 }}
          onChange={(e) => onChange(Math.min(Number(e.target.value), high), high)}
        />
        <input
          type="range"
          className="range-thumb"
          aria-label={`${label} to`}
          aria-valuetext={format(high)}
          min={min}
          max={max}
          step={step}
          value={high}
          style={{ zIndex: 1 }}
          onChange={(e) => onChange(low, Math.max(Number(e.target.value), low))}
        />
      </div>
    </div>
  );
}

/**
 * One star per interviewer who has scored the candidate: full if they recommend the candidate, blank if not.
 * Shows nothing until an interviewer has scored them.
 */
export function RecommendationStars({ candidate }: { candidate: Pick<Candidate, 'primary_panel' | 'secondary_panel'> }) {
  const { recommended, total } = recommendations(candidate);
  if (total === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-px" role="img" aria-label={`Recommended by ${recommended} of ${total} interviewer${total === 1 ? '' : 's'}`} title={recommendationSummary(candidate)}>
      {Array.from({ length: total }, (_, index) => (
        <Star key={index} className={classNames('size-3.5', index < recommended ? 'fill-amber-500 text-amber-500' : 'text-ink-muted')} aria-hidden />
      ))}
    </span>
  );
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const style = { width: size, height: size };
  if (url && !failed) {
    return <img src={url} alt="" style={style} onError={() => setFailed(true)} className="shrink-0 rounded-full border border-line object-cover" />;
  }
  return (
    <span
      style={{ ...style, fontSize: Math.round(size * 0.36) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-hover font-semibold text-ink-soft"
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

interface DialogProps {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  /** Esc and the X only call onClose; the dialog stays until its owner removes it. For unsaved work. */
  holdOpen?: boolean;
}

/** Native <dialog>: the browser handles focus, Esc, the inert page and returning focus on close. */
export function Dialog({ title, description, onClose, children, footer, width = 'max-w-xl', holdOpen = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // A dialog opened inside this one sends its close event here too; only this dialog's own closing counts.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // Held open, Esc only asks to close: the owner decides, for example after "Discard changes?".
      onCancel={(event) => {
        if (holdOpen && event.target === event.currentTarget) {
          event.preventDefault();
          onClose();
        }
      }}
      className={classNames(
        'm-auto max-h-[90dvh] w-full rounded-2xl bg-surface text-ink shadow-2xl',
        width,
      )}
    >
      <div className="flex max-h-[90dvh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-balance">{title}</h2>
            {description && <div className="mt-0.5 text-sm text-ink-soft">{description}</div>}
          </div>
          <IconButton label="Close" icon={X} onClick={() => (holdOpen ? onClose() : ref.current?.close())} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </dialog>
  );
}

export function Confirm({
  title, body, confirmLabel, danger, onConfirm, onCancel,
}: { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      width="max-w-md"
      footer={
        <>
          <Button autoFocus onClick={onCancel}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink-soft">{body}</div>
    </Dialog>
  );
}

interface ToastItem {
  id: number;
  message: string;
  tone: 'good' | 'bad';
}

const ToastContext = createContext<(message: string, tone?: 'good' | 'bad') => void>(() => undefined);

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const layer = useRef<HTMLDivElement>(null);

  // Re-entering the top layer keeps toasts above any dialog opened since the last one.
  useEffect(() => {
    const element = layer.current;
    if (!element || toasts.length === 0) return;
    if (element.matches(':popover-open')) element.hidePopover();
    element.showPopover();
  }, [toasts.length]);

  const push = useCallback((message: string, tone: 'good' | 'bad' = 'good') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    // Errors stay longer: they usually need reading, and sometimes copying.
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), tone === 'bad' ? 9000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div popover="manual" ref={layer} className="no-print pointer-events-none m-0 w-full max-w-sm flex-col gap-2 border-0 bg-transparent p-4 [inset:0_auto_auto_50%] -translate-x-1/2 open:flex" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={classNames(
              'pointer-events-auto flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-sm shadow-lg',
              toast.tone === 'good' ? 'bg-ink text-white' : 'bg-red-800 text-white',
            )}
          >
            {toast.tone === 'good' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}…
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <Icon className="size-8 text-line-strong" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="max-w-md text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, titleActions, description, actions }: { title: string; titleActions?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
          {titleActions && <div className="flex items-center gap-1.5">{titleActions}</div>}
        </div>
        {description && <div className="mt-0.5 text-sm text-ink-soft">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className, tour }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; tour?: string }) {
  return (
    <section data-tour={tour} className={classNames('rounded-xl border border-line bg-surface', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={title ? 'px-4 pt-2 pb-4' : 'p-4'}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint, active, onClick }: { label: string; value: ReactNode; hint?: string; active?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>}
    </>
  );
  const shared = 'flex flex-col justify-start rounded-xl border bg-surface px-3.5 py-3 text-left';
  if (onClick) {
    return (
      <button type="button" aria-pressed={active} onClick={onClick} className={classNames(shared, 'transition-colors hover:border-line-strong', active ? 'border-brand-600 ring-1 ring-brand-600' : 'border-line')}>
        {body}
      </button>
    );
  }
  return <div className={classNames(shared, 'border-line')}>{body}</div>;
}

const TOOLTIP_WIDTH = 304;
const TOOLTIP_ROOM = 300;
const TOOLTIP_GAP = 6;
const SIDEBAR_WIDTH = 64;

type TooltipSide = 'below' | 'above' | 'beside';

// The room around an element depends on screen size and scroll, so it is measured each time.
// The gap is padding on the tooltip itself, so the pointer can travel into it without closing it.
function tooltipPosition(rect: DOMRect, side: TooltipSide): CSSProperties {
  const screenWidth = document.documentElement.clientWidth;
  const screenHeight = window.innerHeight;
  const width = Math.min(TOOLTIP_WIDTH, screenWidth - SIDEBAR_WIDTH - 16);

  if (side === 'beside') {
    const vertical = screenHeight - rect.top < TOOLTIP_ROOM ? { bottom: screenHeight - rect.bottom } : { top: rect.top };
    if (rect.right + width + 8 <= screenWidth) return { width, ...vertical, left: rect.right, paddingLeft: TOOLTIP_GAP };
    if (rect.left - width >= SIDEBAR_WIDTH + 8) return { width, ...vertical, left: rect.left - width, paddingRight: TOOLTIP_GAP };
  }

  const left = Math.max(SIDEBAR_WIDTH + 8, Math.min(rect.left, screenWidth - width - 8));
  const roomBelow = screenHeight - rect.bottom;
  const above = side === 'above' ? rect.top >= TOOLTIP_ROOM || rect.top > roomBelow : roomBelow < TOOLTIP_ROOM && rect.top > TOOLTIP_ROOM;
  return above
    ? { width, left, bottom: screenHeight - rect.top, paddingBottom: TOOLTIP_GAP }
    : { width, left, top: rect.bottom, paddingTop: TOOLTIP_GAP };
}

interface HoverTooltipProps {
  details: ReactNode;
  /** beside: for rows in a list, so the tooltip never sits on the next row the pointer is heading for. */
  side?: TooltipSide;
  /** Makes the wrapper itself focusable and names it. Leave out when the children hold their own link or button. */
  label?: string;
  className?: string;
  children: ReactNode | ((state: { open: boolean; tooltipId: string }) => ReactNode);
}

/** Shows details on hover or keyboard focus. Fixed position, so a scrolling table or card edge cannot clip it. */
export function HoverTooltip({ details, side = 'below', label, className, children }: HoverTooltipProps) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const tooltipId = useId();
  const tooltip = useRef<HTMLDivElement>(null);
  const open = position !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPosition(null);
    };
    // Measured coordinates go stale when the page moves. Scrolling inside the tooltip is fine.
    const onMove = (event: Event) => {
      // A resize comes from the window, which is not a Node.
      if (!(event.target instanceof Node && tooltip.current?.contains(event.target))) setPosition(null);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  return (
    <div
      className={className}
      {...(label ? { role: 'group', 'aria-label': label, 'aria-describedby': tooltipId, tabIndex: 0 } : {})}
      onMouseEnter={(event) => setPosition(tooltipPosition(event.currentTarget.getBoundingClientRect(), side))}
      onMouseLeave={() => setPosition(null)}
      onFocus={(event) => {
        if (event.target.matches(':focus-visible')) setPosition(tooltipPosition(event.currentTarget.getBoundingClientRect(), side));
      }}
      onBlur={() => setPosition(null)}
    >
      {typeof children === 'function' ? children({ open, tooltipId }) : children}
      <div ref={tooltip} id={tooltipId} role="tooltip" hidden={!open} className="fixed z-10 box-border font-normal" style={position ?? undefined}>
        <div className="max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-3 text-left text-xs shadow-lg">{details}</div>
      </div>
    </div>
  );
}

interface InsightTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  to: string;
  linkLabel: string;
  details: ReactNode;
}

/** A stat card that opens a page when clicked and shows the numbers behind it on hover or keyboard focus. */
export function InsightTile({ label, value, hint, to, linkLabel, details }: InsightTileProps) {
  return (
    <HoverTooltip
      details={
        <>
          {details}
          <p className="mt-2 border-t border-line pt-2 text-ink-muted">Click the card to open {linkLabel}.</p>
        </>
      }
    >
      {({ open, tooltipId }) => (
        <Link
          to={to}
          aria-describedby={tooltipId}
          className={classNames(
            'flex h-full flex-col rounded-xl border bg-surface px-3.5 py-3 transition-[border-color,box-shadow]',
            open ? 'border-brand-600 shadow-md' : 'border-line',
          )}
        >
          <span className="flex items-start justify-between gap-2 text-xs font-medium text-ink-muted">
            {label}
            <Info className={classNames('size-3.5 shrink-0 transition-colors', open ? 'text-brand-600' : 'text-line-strong')} aria-hidden />
          </span>
          <span className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</span>
          {hint && <span className="mt-0.5 text-xs text-ink-muted">{hint}</span>}
        </Link>
      )}
    </HoverTooltip>
  );
}

export interface TooltipRow {
  label: string;
  note?: string;
  value: ReactNode;
}

/** A titled list of label and value rows for a tooltip. Long lists are cut off with a count of the rest. */
export function TooltipList({ title, rows, empty, limit = 6 }: { title: string; rows: TooltipRow[]; empty?: string; limit?: number }) {
  const hidden = rows.length - limit;
  return (
    <section className="[&+section]:mt-2.5">
      <h3 className="mb-1 font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-ink-muted">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, limit).map((row, index) => (
            <li key={`${row.label}-${index}`} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-ink">{row.label}</span>
                {row.note && <span className="block text-ink-muted">{row.note}</span>}
              </span>
              <span className="tabular shrink-0 text-right font-semibold text-ink">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && <p className="mt-1 text-ink-muted">and {hidden} more</p>}
    </section>
  );
}

export interface TooltipTableRow {
  label: string;
  values: number[];
}

/** Counts per department (or any group) in a tooltip, with a total row when there is more than one group. */
export function TooltipTable({ title, columns, rows, empty, note }: { title: string; columns: string[]; rows: TooltipTableRow[]; empty: string; note?: string }) {
  const totals = columns.map((_, index) => rows.reduce((sum, row) => sum + row.values[index], 0));
  return (
    <section className="[&+section]:mt-2.5">
      <h3 className="mb-1 font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-ink-muted">{empty}</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-ink-muted">
              <th scope="col" className="pb-1 text-left font-medium">Department</th>
              {columns.map((column) => <th key={column} scope="col" className="pb-1 pl-2 text-right font-medium">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th scope="row" className="py-1 text-left font-normal text-ink">{row.label}</th>
                {row.values.map((value, index) => <td key={columns[index]} className="tabular py-1 pl-2 text-right font-semibold text-ink">{value}</td>)}
              </tr>
            ))}
            {rows.length > 1 && (
              <tr className="border-t-2 border-line-strong">
                <th scope="row" className="py-1 text-left font-semibold text-ink">Total</th>
                {totals.map((value, index) => <td key={columns[index]} className="tabular py-1 pl-2 text-right font-semibold text-ink">{value}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      )}
      {note && <p className="mt-1 text-ink-muted">{note}</p>}
    </section>
  );
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (value: T) => void; label: string; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={classNames(
            '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors',
            value === item.value ? 'border-brand-600 font-semibold text-ink' : 'border-transparent text-ink-soft hover:text-ink',
          )}
        >
          {item.label}
          {item.count !== undefined && <span className="tabular rounded-full bg-hover px-1.5 text-xs text-ink-soft">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SortHeader<K extends string>({ column, label, sort, onSort, className }: { column: K; label: string; sort: { column: K; ascending: boolean }; onSort: (column: K) => void; className?: string }) {
  const active = sort.column === column;
  return (
    <th scope="col" aria-sort={active ? (sort.ascending ? 'ascending' : 'descending') : undefined} className={classNames('px-3 py-2.5 font-medium', className)}>
      <button type="button" onClick={() => onSort(column)} className={classNames('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')}>
        {label}
        <span aria-hidden className={active ? '' : 'invisible'}>{sort.ascending ? '↑' : '↓'}</span>
      </button>
    </th>
  );
}

export const TABLE = 'w-full border-collapse text-sm';
export const TH = 'px-3 py-2.5 text-left font-medium';
export const THEAD = 'bg-canvas text-left text-xs text-ink-soft';
export const TD = 'border-t border-line px-3 py-2.5 align-middle';

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
