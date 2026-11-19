import { Eraser, PenLine } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button } from './ui';

const WIDTH = 600;
const HEIGHT = 200;

/**
 * Sign with a finger, pen or mouse. Gives a PNG data URL, or '' when cleared. With a saved signature it is
 * shown first, and "Sign again" opens the pad.
 */
export function SignaturePad({ value, onChange, label = 'Signature', saved }: {
  value: string;
  onChange: (signature: string) => void;
  label?: string;
  /** Shown instead of the pad until the person chooses to sign again. */
  saved?: string;
}) {
  const [drawing, setDrawing] = useState(!saved && !value);
  if (!drawing) {
    const shown = value || saved || '';
    return (
      <div>
        <p className="mb-1 text-xs font-medium text-ink-soft">{label}</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-20 w-60 items-center justify-center rounded-lg border border-line bg-white">
            {shown ? <img src={shown} alt={label} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-ink-muted">Not signed</span>}
          </div>
          <Button size="sm" icon={PenLine} onClick={() => setDrawing(true)}>Sign again</Button>
        </div>
      </div>
    );
  }
  return <Pad label={label} onChange={onChange} />;
}

function Pad({ label, onChange }: { label: string; onChange: (signature: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0b2a6f';
  }, []);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * WIDTH, y: ((event.clientY - box.top) / box.height) * HEIGHT };
  };

  function start(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    last.current = point(event);
    const context = canvas.current!.getContext('2d')!;
    context.beginPath();
    context.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    context.fillStyle = '#0b2a6f';
    context.fill();
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!last.current) return;
    const next = point(event);
    const context = canvas.current!.getContext('2d')!;
    context.beginPath();
    context.moveTo(last.current.x, last.current.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    last.current = next;
  }

  function end() {
    if (!last.current) return;
    last.current = null;
    setEmpty(false);
    onChange(canvas.current!.toDataURL('image/png'));
  }

  function clear() {
    canvas.current!.getContext('2d')!.clearRect(0, 0, WIDTH, HEIGHT);
    setEmpty(true);
    onChange('');
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-soft">{label}</p>
      <div className="relative w-full max-w-md">
        <canvas
          ref={canvas}
          width={WIDTH}
          height={HEIGHT}
          aria-label={`${label}: sign here with a finger, pen or mouse`}
          className="block aspect-[3/1] w-full touch-none rounded-lg border border-dashed border-line-strong bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-muted">Sign here</span>}
      </div>
      <Button size="sm" variant="ghost" icon={Eraser} className="mt-1" disabled={empty} onClick={clear}>Clear</Button>
    </div>
  );
}
