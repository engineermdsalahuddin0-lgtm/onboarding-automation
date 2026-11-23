import { AlertTriangle, Copy, Download, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import fullLogo from '../assets/images/Bitopi_Logo_Final.png';
import { downloadApplyPoster, printApplyPoster, qrMatrix, qrPath, type PosterDetails } from '../lib/applyPoster';
import { Button, Dialog, errorText, useToast } from './ui';

/** The application form's QR code, drawn as one SVG path with the white border scanners need. */
export function QrCode({ text, className }: { text: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const matrix = qrMatrix(text);
    return { size: matrix.size, path: qrPath(matrix) };
  }, [text]);
  const quiet = 4;
  return (
    <svg viewBox={`${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`} className={className} shapeRendering="crispEdges" aria-hidden>
      <rect x={-quiet} y={-quiet} width={size + quiet * 2} height={size + quiet * 2} fill="#fff" />
      <path d={path} fill="#1a1a1a" />
    </svg>
  );
}

/** The A4 sheet as it will print: logo, position, "Please scan and fill the form", the code and the link. */
export function ApplyQrDialog({ details, accepting, onCopy, onClose }: { details: PosterDetails; accepting: boolean; onCopy: () => void; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<'download' | 'print' | null>(null);

  async function run(kind: 'download' | 'print') {
    setBusy(kind);
    try {
      await (kind === 'download' ? downloadApplyPoster(details) : printApplyPoster(details));
    } catch (error) {
      toast(errorText(error), 'bad');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      title="Application form QR code"
      description="Print it on A4 and give it to candidates. They scan it with their phone and fill the form."
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          <Button icon={Copy} onClick={onCopy}>Copy link</Button>
          <Button icon={Printer} loading={busy === 'print'} disabled={busy !== null} onClick={() => void run('print')}>Print</Button>
          <Button variant="primary" icon={Download} loading={busy === 'download'} disabled={busy !== null} onClick={() => void run('download')}>Download A4 PDF</Button>
        </>
      }
    >
      {!accepting && (
        <p role="status" className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          This bucket is not taking applications now, so the form will tell candidates it is closed.
        </p>
      )}
      {/* A small copy of the printed sheet. */}
      <div className="mx-auto flex aspect-[210/297] max-w-[19rem] flex-col items-center rounded-md border-2 border-brand-700 bg-white px-5 py-4 text-center text-[#1a1a1a] shadow-sm">
        <img src={fullLogo} alt="Bitopi Group, 50 Years and Beyond" className="h-14 object-contain" />
        <p className="mt-2 text-[10px] text-ink-soft">We are hiring</p>
        <p className="line-clamp-2 text-base leading-tight font-bold text-balance">{details.designation}</p>
        {details.place && <p className="text-[10px] text-ink-soft">{details.place}</p>}
        <p className="mt-2 text-sm font-bold text-brand-700">Please scan and fill the form</p>
        <QrCode text={details.link} className="mt-1.5 w-36 rounded border border-ink" />
        <p className="mt-2 text-[9px] leading-snug">Open the camera on your phone and point it at the code.</p>
        <p className="mt-auto text-[8px] text-ink-soft">Or type this address in your browser:</p>
        <p className="text-[9px] font-semibold break-all">{details.link}</p>
      </div>
    </Dialog>
  );
}
