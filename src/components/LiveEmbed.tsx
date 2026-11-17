import { Loader2, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { classNames } from '../lib/format';

// Shows another site's page in an iframe and reloads it on a timer without flicker. Each reload
// happens in a second, hidden iframe. Once that one has loaded and had time to draw its data, it
// fades in over the old one, and only then is the old one removed. If a reload fails or stalls,
// the old page stays on screen.
//
// It can stay mounted while hidden (visible = false), so the page is already loaded and up to date
// when someone opens it. While shown, a reload would send the reader back to the top, so it waits
// while the pointer is over the embed or the reader is clicking inside it.

const SETTLE_MS = 3000; // pages like Microsoft Forms draw their data a moment after the load event
const FADE_MS = 300;
const STALL_MS = 45_000;

type Frame = { id: number; shown: boolean };

export function LiveEmbed({ src, title, visible = true, refreshMs = 60_000, className }: {
  src: string;
  title: string;
  /** False keeps it loaded and refreshing off screen. */
  visible?: boolean;
  refreshMs?: number;
  className?: string;
}) {
  const [frames, setFrames] = useState<Frame[]>([{ id: 0, shown: false }]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [hovering, setHovering] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const nextId = useRef(1);
  const lastLoad = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const timers = useRef(new Set<number>());
  const framesRef = useRef(frames);
  useEffect(() => { framesRef.current = frames; }, [frames]);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => { timers.current.delete(t); fn(); }, ms);
    timers.current.add(t);
  }, []);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  const reloading = frames.length > 1 || !frames[0].shown;

  const reload = useCallback(() => {
    setFrames((current) => {
      if (current.length > 1) return current; // one reload at a time
      const id = nextId.current++;
      later(() => setFrames((now) => (now.some((f) => f.id === id && !f.shown) && now.length > 1 ? now.filter((f) => f.id !== id) : now)), STALL_MS);
      return [...current, { id, shown: false }];
    });
  }, [later]);

  const onLoad = (id: number) => {
    // The first time there is nothing underneath to keep on screen, so show the page at once.
    const settle = framesRef.current.some((f) => f.shown) ? SETTLE_MS : 0;
    later(() => {
      if (!framesRef.current.some((f) => f.id === id)) return; // dropped after stalling
      setFrames((now) => now.map((f) => (f.id === id ? { ...f, shown: true } : f)));
      lastLoad.current = Date.now();
      setUpdatedAt(new Date());
      later(() => setFrames((now) => now.filter((f) => f.id >= id)), FADE_MS);
    }, settle);
  };

  // Leaving the page can skip the mouseleave event; a stale "hovering" would block every reload.
  useEffect(() => { if (!visible) setHovering(false); }, [visible]);

  // The timer checks every few seconds whether a reload is due and nothing is in the way.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (lastLoad.current === 0 || Date.now() - lastLoad.current < refreshMs) return;
      if (visible) {
        const iframeFocused = document.activeElement instanceof HTMLIFrameElement && wrapper.current?.contains(document.activeElement);
        if (hovering || iframeFocused) return;
      }
      reload();
    };
    const timer = window.setInterval(tick, 5000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [visible, hovering, refreshMs, reload]);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null && document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  useEffect(() => {
    if (!visible && document.fullscreenElement === root.current) void document.exitFullscreen();
  }, [visible]);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen().catch(() => {});
  };

  const firstLoad = !frames.some((f) => f.shown);

  return (
    <div
      ref={root}
      inert={!visible}
      aria-hidden={!visible || undefined}
      className={classNames(
        // Hidden off screen rather than with display: none, so the page keeps its size and draws normally.
        !visible && 'pointer-events-none invisible fixed top-0 -left-[200vw] w-[1280px]',
        fullscreen && 'flex flex-col bg-canvas p-4',
        visible && className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5" aria-live="polite">
          {reloading && !firstLoad ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <span className="size-2 rounded-full bg-brand-600" aria-hidden />}
          {firstLoad ? 'Loading responses…' : `Updates every ${Math.round(refreshMs / 1000)} seconds · Last updated ${updatedAt?.toLocaleTimeString()}`}
        </span>
        <span className="flex items-center gap-3">
          <button type="button" onClick={reload} disabled={reloading} className="inline-flex items-center gap-1 font-medium text-ink-soft hover:text-ink disabled:opacity-50">
            <RefreshCw className="size-3.5" aria-hidden /> Refresh now
          </button>
          <button type="button" onClick={toggleFullscreen} className="inline-flex items-center gap-1 font-medium text-ink-soft hover:text-ink">
            {fullscreen ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
        </span>
      </div>
      <div
        ref={wrapper}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={classNames(
          'relative overflow-hidden rounded-xl border border-line bg-white',
          fullscreen ? 'min-h-0 flex-1' : 'h-[calc(100dvh-12rem)] min-h-[560px]',
        )}
      >
        {firstLoad && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Loading responses…
          </div>
        )}
        {frames.map((frame) => (
          <iframe
            key={frame.id}
            src={src}
            title={title}
            onLoad={() => onLoad(frame.id)}
            aria-hidden={!frame.shown || undefined}
            tabIndex={frame.shown ? undefined : -1}
            referrerPolicy="no-referrer"
            className={classNames(
              'absolute inset-0 size-full border-0 transition-opacity',
              frame.shown ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            style={{ transitionDuration: `${FADE_MS}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
