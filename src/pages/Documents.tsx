import { AlertTriangle, ArrowLeft, Copy, Mail, Printer } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import tabLogo from '../assets/images/bitopi_group_logo_for_tab.jpg';
import { copyText } from '../components/PipelineDialogs';
import { Button, EmptyState, Spinner, useToast } from '../components/ui';
import { DOCUMENT_CHECKLIST } from '../lib/defaults';
import { useFileUrls, useStore } from '../lib/store';
import { candidateVars, FIELD_LABELS, renderTemplate, type TemplateVars } from '../lib/templates';
import type { Candidate, DocumentTemplate, Settings } from '../types';
import { backend } from '../lib/backend';

const BLANK = '\u0000';

/** Renders **bold** and blanks. Everything stays React text, so template or CV contents can never inject markup. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, index) => {
    const bold = part.startsWith('**') && part.endsWith('**');
    const content = bold ? part.slice(2, -2) : part;
    const pieces = content.split(BLANK).map((piece, i) => (
      <Fragment key={i}>
        {i > 0 && <span className="fill-line" />}
        {piece}
      </Fragment>
    ));
    return bold ? <strong key={index}>{pieces}</strong> : <Fragment key={index}>{pieces}</Fragment>;
  });
}

const cell = 'border border-black px-2 py-1 align-top text-left';

function FieldTable({ keys, vars }: { keys: string[]; vars: TemplateVars }) {
  return (
    <table className="my-2 w-full border-collapse text-[10pt]">
      <tbody>
        {keys.map((key) => (
          <tr key={key}>
            <th scope="row" className={`${cell} w-[38%] font-medium`}>{FIELD_LABELS[key] ?? key}</th>
            <td className={cell}>{vars[key] || ' '}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RowsTable({ headers, rows, blankRows = 0 }: { headers: string[]; rows: string[][]; blankRows?: number }) {
  const blanks = Array.from({ length: Math.max(rows.length === 0 ? 2 : 0, blankRows) }, () => headers.map(() => ' '));
  return (
    <table className="my-2 w-full border-collapse text-[10pt]">
      <thead><tr>{headers.map((h) => <th key={h} scope="col" className={`${cell} font-medium`}>{h}</th>)}</tr></thead>
      <tbody>
        {[...rows, ...blanks].map((row, index) => (
          <tr key={index} style={row[0] === ' ' ? { height: '9mm' } : undefined}>
            {row.map((value, i) => <td key={i} className={cell}>{value}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Signatures({ spec }: { spec: string }) {
  const [left, right] = spec.split('|');
  return (
    <div className="keep-together mt-auto flex justify-between gap-10 pt-16">
      {[left, right].filter(Boolean).map((label) => (
        <div key={label} className="flex-1 border-t border-black pt-1 text-[10pt]">{inline(label)}</div>
      ))}
    </div>
  );
}

function Signatory({ vars, seal }: { vars: TemplateVars; seal?: string }) {
  const value = (key: string) => vars[key] || BLANK;
  return (
    <div className="keep-together mt-8">
      <div className="relative h-14">{seal && <img src={seal} alt="Company seal" className="absolute top-0 left-40 h-20 w-20 object-contain" />}</div>
      <p>{inline(value('signatory_name'))}</p>
      <p>{inline(value('signatory_designation'))}</p>
      <p>{inline(`m: ${value('signatory_mobile')} P: ${value('signatory_phone')} Ext: ${value('signatory_ext')}, F: ${value('signatory_fax')}`)}</p>
      <p className="mt-2">{inline(`email: ${value('signatory_email')},`)}</p>
      <p className="mt-2">Corporate Office:</p>
      <p>{inline(value('corporate_address'))}</p>
    </div>
  );
}

function DocumentBody({ template, candidate, vars, photo, seal }: { template: DocumentTemplate; candidate: Candidate; vars: TemplateVars; photo?: string; seal?: string }) {
  const { text } = renderTemplate(template.body, vars, BLANK);
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(<p key={blocks.length} className="mb-3">{paragraph.map((line, i) => <Fragment key={i}>{i > 0 && <br />}{inline(line)}</Fragment>)}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push(<ul key={blocks.length} className="mb-3 list-disc pl-6">{list.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
      list = [];
    }
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const block = /^\[\[([a-z-]+)(?::(.*))?\]\]$/.exec(line);
    if (!block) {
      if (line === '') {
        flushParagraph();
        flushList();
      } else if (line.startsWith('# ')) {
        flushParagraph();
        flushList();
        blocks.push(<h2 key={blocks.length} className="mb-4 text-center text-[13pt] font-bold underline">{line.slice(2)}</h2>);
      } else if (line.startsWith('- ')) {
        flushParagraph();
        list.push(line.slice(2));
      } else {
        flushList();
        paragraph.push(line);
      }
      continue;
    }

    flushParagraph();
    flushList();
    const key = blocks.length;
    switch (block[1]) {
      case 'photo':
        blocks.push(
          <div key={key} className="mb-2 flex justify-end">
            <div className="flex h-[40mm] w-[32mm] items-center justify-center border border-black text-[8pt]">
              {photo ? <img src={photo} alt={`Photo of ${candidate.full_name}`} className="h-full w-full object-cover" /> : 'Passport size photo'}
            </div>
          </div>,
        );
        break;
      case 'fields':
        blocks.push(<FieldTable key={key} keys={(block[2] ?? '').split(',').map((k) => k.trim())} vars={vars} />);
        break;
      case 'education':
        blocks.push(<RowsTable key={key} headers={['Degree', 'Institution', 'Result', 'Year']} rows={candidate.education.map((e) => [e.degree, e.institution, e.result ?? '', e.year ?? ''])} />);
        break;
      case 'experience':
        blocks.push(<RowsTable key={key} headers={['Organization', 'Designation', 'Duration']} rows={candidate.experience.map((e) => [e.company, e.role, e.duration ?? ''])} />);
        break;
      case 'checklist':
        blocks.push(<ul key={key} className="mb-3 list-disc pl-6">{DOCUMENT_CHECKLIST.map((item) => <li key={item}>{item}</li>)}</ul>);
        break;
      case 'blank-table': {
        const [columns, count] = (block[2] ?? '').split(':');
        blocks.push(<RowsTable key={key} headers={columns.split('|')} rows={[]} blankRows={Number(count) || 3} />);
        break;
      }
      case 'signatures':
        blocks.push(<Signatures key={key} spec={block[2] ?? ''} />);
        break;
      case 'signatory':
        blocks.push(<Signatory key={key} vars={vars} seal={seal} />);
        break;
    }
  }
  flushParagraph();
  flushList();
  return <>{blocks}</>;
}

function Letterhead({ settings, company }: { settings: Settings; company: string }) {
  return (
    <header className="mb-6 flex items-center gap-3 border-b border-black pb-2">
      <img src={tabLogo} alt={settings.group_name} className="h-14 w-14 object-contain" />
      <div>
        <p className="text-[13pt] leading-tight font-bold">{settings.group_name}</p>
        <p className="text-[9pt] leading-tight">{company}</p>
        <p className="text-[9pt] leading-tight">{settings.corporate_address}</p>
      </div>
    </header>
  );
}

/** Plain text of the offer letter, for pasting into or opening in an email. */
function plainOffer(template: DocumentTemplate, vars: TemplateVars): string {
  const signatory = [
    vars.signatory_name,
    vars.signatory_designation,
    `m: ${vars.signatory_mobile} P: ${vars.signatory_phone} Ext: ${vars.signatory_ext}, F: ${vars.signatory_fax}`,
    '',
    `email: ${vars.signatory_email},`,
    '',
    'Corporate Office:',
    vars.corporate_address,
  ].join('\n');
  const checklist = DOCUMENT_CHECKLIST.map((item) => `- ${item}`).join('\n');
  return renderTemplate(template.body, vars, '__________')
    .text.replace('[[checklist]]', checklist)
    .replace('[[signatory]]', signatory)
    .replace(/\*\*/g, '');
}

export function DocumentsPage() {
  const { id } = useParams();
  const { candidates, buckets, settings, documentTemplates, loadingData } = useStore();
  const toast = useToast();
  const candidate = candidates.find((c) => c.id === id);
  const bucket = buckets.find((b) => b.id === candidate?.bucket_id);
  const templates = useMemo(() => documentTemplates.filter((t) => t.is_active), [documentTemplates]);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [withLetterhead, setWithLetterhead] = useState(true);
  const urls = useFileUrls([candidate?.photo_path, settings.seal_path]);

  useEffect(() => {
    if (chosen === null && templates.length > 0) setChosen(new Set(templates.map((t) => t.key)));
  }, [templates, chosen]);

  useEffect(() => {
    if (candidate) document.title = `Joining pack - ${candidate.full_name}`;
    return () => {
      document.title = 'Bitopi Group · Recruitment Management Suite';
    };
  }, [candidate]);

  if (loadingData) return <Spinner />;
  if (!candidate) {
    return <EmptyState icon={AlertTriangle} title="This candidate was not found" action={<Link className="text-sm underline" to="/selected">Back to Selected Candidates</Link>} />;
  }

  // The letter states the joining date, so it only exists once the decision has been made and locked.
  if (candidate.final_decision !== 'confirmed') {
    return (
      <EmptyState icon={AlertTriangle} title={`The letter for ${candidate.full_name} is not ready`} action={<Link className="text-sm underline" to={`/selected?candidate=${candidate.id}`}>Open the candidate's card</Link>}>
        Send the confirmation letter from the candidate's card first: that records the selection and joining dates the letter uses.
      </EmptyState>
    );
  }
  const vars = candidateVars(candidate, bucket, settings);
  const shown = templates.filter((t) => chosen?.has(t.key));
  const missing = new Set(shown.flatMap((t) => renderTemplate(t.body, vars).missing));
  if (shown.some((t) => t.body.includes('[[signatory]]'))) {
    for (const key of ['signatory_name', 'signatory_designation', 'signatory_mobile', 'signatory_email', 'corporate_address']) {
      if (!vars[key]) missing.add(key);
    }
  }
  const missingLabels = [...missing].map((key) => FIELD_LABELS[key] ?? key);
  const offer = templates.find((t) => t.key === 'offer_letter');
  const offerText = offer ? plainOffer(offer, vars) : '';
  const offerSubject = `Offer of employment: ${vars.designation}`;
  const mailto = `mailto:${candidate.email}?subject=${encodeURIComponent(offerSubject)}&body=${encodeURIComponent(offerText)}`;

  return (
    <div className="min-h-dvh bg-hover">
      {backend.mode === 'demo' && <p className="no-print bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-950">Demo mode: sample data</p>}
      <div className="no-print sticky top-0 z-10 border-b border-line bg-surface px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/selected" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Selected</Link>
          <h1 className="text-sm font-semibold">Joining pack: {candidate.full_name}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {offer && chosen?.has('offer_letter') && (
              <>
                <Button icon={Copy} onClick={() => void copyText(offerText).then(() => toast('Letter text copied.'))}>Copy letter</Button>
                {candidate.email && <a href={mailto} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium hover:bg-hover"><Mail className="size-4" aria-hidden /> Email letter</a>}
              </>
            )}
            <Button variant="primary" icon={Printer} disabled={shown.length === 0} onClick={() => window.print()}>Print {shown.length} document{shown.length === 1 ? '' : 's'}</Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {templates.map((t) => (
            <label key={t.key} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                className="size-3.5 accent-brand-600"
                checked={chosen?.has(t.key) ?? false}
                onChange={() => setChosen((current) => {
                  const next = new Set(current);
                  if (next.has(t.key)) next.delete(t.key);
                  else next.add(t.key);
                  return next;
                })}
              />
              {t.title}
            </label>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-xs">
            <input type="checkbox" className="size-3.5 accent-brand-600" checked={withLetterhead} onChange={(e) => setWithLetterhead(e.target.checked)} />
            Print letterhead (off for pre-printed pads)
          </label>
        </div>
        {missingLabels.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              <strong>Not on file:</strong> {missingLabels.join(', ')}. These print as blank lines to fill in by hand, or add them
              in {' '}<Link className="underline" to={`/selected?candidate=${candidate.id}`}>the candidate's card</Link>{' '}and <Link className="underline" to="/settings">Settings</Link> first.
            </span>
          </p>
        )}
      </div>

      <div className="print-root flex flex-col items-center gap-6 overflow-x-auto p-6">
        {shown.map((template) => (
          <article key={template.key} className="paper shadow-md" aria-label={template.title}>
            {withLetterhead && <Letterhead settings={settings} company={vars.company} />}
            <div className="flex flex-1 flex-col">
              <DocumentBody
                template={template}
                candidate={candidate}
                vars={vars}
                photo={candidate.photo_path ? urls[candidate.photo_path] : undefined}
                seal={settings.seal_path ? urls[settings.seal_path] : undefined}
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
