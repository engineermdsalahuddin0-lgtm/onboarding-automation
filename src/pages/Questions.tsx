import { AlertTriangle, ArrowLeft, Check, FileQuestion, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HelpTip } from '../components/Guide';
import { Button, Confirm, Dialog, EmptyState, errorText, IconButton, PageHeader, Select, Spinner, StatusBadge, Tabs, TextArea, TextInput, useToast } from '../components/ui';
import { backend } from '../lib/backend';
import { classNames, dateMedium } from '../lib/format';
import { useStore } from '../lib/store';
import type { Difficulty, Question, QuestionKind } from '../types';

export const KIND_LABELS: Record<QuestionKind, string> = { written: 'Written', mcq: 'MCQ', interview: 'Interview' };
const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const ROUND_LABELS: Record<Question['round'], string> = { any: 'Any round', primary: 'Primary interview', final: 'Final interview' };
const LETTERS = 'abcdefgh';

type KindTab = QuestionKind | 'all';

const unique = (values: string[]) => [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

export function QuestionsPage() {
  const { questions, settings, buckets, canWrite, removeQuestion } = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const kind = (params.get('kind') as KindTab | null) ?? 'all';
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState(params.get('designation') ?? '');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Partial<Question> | null>(null);
  const [removing, setRemoving] = useState<Question | null>(null);
  const [paper, setPaper] = useState(false);

  const setKind = (value: KindTab) => setParams((current) => {
    if (value === 'all') current.delete('kind');
    else current.set('kind', value);
    return current;
  });

  const designations = unique([...buckets.map((b) => b.designation), ...questions.map((q) => q.designation)]);
  const topics = unique(questions.map((q) => q.topic));
  const departments = unique([...settings.departments, ...questions.map((q) => q.department)]);

  // A question for any department or post also suits the one chosen.
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return questions.filter((q) =>
      (kind === 'all' || q.kind === kind) &&
      (showRetired || q.is_active) &&
      (!department || !q.department || q.department === department) &&
      (!designation || !q.designation || q.designation === designation) &&
      (!topic || q.topic === topic) &&
      (!difficulty || q.difficulty === difficulty) &&
      (!text || [q.question, q.answer, q.topic, ...q.options].some((value) => value.toLowerCase().includes(text))));
  }, [questions, kind, showRetired, department, designation, topic, difficulty, query]);

  const counts = { all: 0, written: 0, mcq: 0, interview: 0 } as Record<KindTab, number>;
  for (const q of questions.filter((item) => showRetired || item.is_active)) {
    counts.all += 1;
    counts[q.kind] += 1;
  }
  const chosenQuestions = questions.filter((q) => chosen.has(q.id));
  const allShownChosen = visible.length > 0 && visible.every((q) => chosen.has(q.id));
  const toggle = (id: string) => setChosen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const filtered = Boolean(query || department || designation || topic || difficulty);

  return (
    <>
      <PageHeader
        title="Question library"
        titleActions={<HelpTip label="About the question library">Keep the questions for written tests, MCQ tests and interviews in one place. Tick the ones you want and press Make question paper to print a paper, with or without the answer key.</HelpTip>}
        description="Written test, MCQ and interview questions, by department and post. Pick some to print a question paper."
        actions={
          <>
            <Button data-tour="questions-paper" icon={Printer} disabled={chosen.size === 0} onClick={() => setPaper(true)}>
              Make question paper{chosen.size > 0 ? ` (${chosen.size})` : ''}
            </Button>
            {canWrite && (
              <Button data-tour="questions-add" variant="primary" icon={Plus} onClick={() => setEditing({ kind: kind === 'all' ? 'mcq' : kind, department, designation })}>
                Add question
              </Button>
            )}
          </>
        }
      />

      <div data-tour="questions-kinds">
        <Tabs<KindTab>
          label="Kind of question"
          value={kind}
          onChange={setKind}
          items={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'written', label: 'Written', count: counts.written },
            { value: 'mcq', label: 'MCQ', count: counts.mcq },
            { value: 'interview', label: 'Interview', count: counts.interview },
          ]}
        />
      </div>

      <div data-tour="questions-filters" className="mt-3 flex flex-wrap items-end gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-ink-muted" aria-hidden />
          <input type="search" aria-label="Search questions" placeholder="Search the questions and answers" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-2 pl-8 text-sm placeholder:text-ink-muted" />
        </div>
        <Select aria-label="Department" className="w-44" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d}>{d}</option>)}
        </Select>
        <Select aria-label="Post" className="w-52" value={designation} onChange={(e) => setDesignation(e.target.value)}>
          <option value="">All posts</option>
          {designations.map((d) => <option key={d}>{d}</option>)}
        </Select>
        <Select aria-label="Topic" className="w-40" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">All topics</option>
          {topics.map((t) => <option key={t}>{t}</option>)}
        </Select>
        <Select aria-label="Difficulty" className="w-36" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">Any difficulty</option>
          {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <label className="flex h-9 items-center gap-1.5 text-xs">
          <input type="checkbox" className="size-4 accent-brand-600" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
          Show retired questions
        </label>
        {filtered && <Button size="sm" variant="ghost" icon={X} onClick={() => { setQuery(''); setDepartment(''); setDesignation(''); setTopic(''); setDifficulty(''); }}>Clear filters</Button>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <label className="flex items-center gap-1.5 font-medium text-ink-soft">
          <input
            type="checkbox"
            className="size-4 accent-brand-600"
            checked={allShownChosen}
            disabled={visible.length === 0}
            onChange={() => setChosen((current) => {
              const next = new Set(current);
              for (const q of visible) {
                if (allShownChosen) next.delete(q.id);
                else next.add(q.id);
              }
              return next;
            })}
          />
          Pick all {visible.length} shown
        </label>
        {designation && <span>Posts left blank suit every post, so they show too.</span>}
        {chosen.size > 0 && (
          <span className="ml-auto">
            {chosen.size} picked · {chosenQuestions.reduce((sum, q) => sum + Number(q.marks), 0)} marks{' '}
            <button type="button" className="underline" onClick={() => setChosen(new Set())}>Clear</button>
          </span>
        )}
      </div>

      <ul className="mt-2 space-y-2">
        {visible.length === 0 && (
          <li className="rounded-xl border border-line bg-surface">
            <EmptyState icon={FileQuestion} title={questions.length === 0 ? 'No questions yet' : 'No question matches'}>
              {questions.length === 0 ? 'Add the first one with Add question.' : 'Try fewer filters.'}
            </EmptyState>
          </li>
        )}
        {visible.map((q) => (
          <li key={q.id} className={classNames('flex gap-3 rounded-xl border bg-surface px-4 py-3', chosen.has(q.id) ? 'border-brand-600 ring-1 ring-brand-600' : 'border-line', !q.is_active && 'opacity-60')}>
            <input type="checkbox" aria-label={`Pick: ${q.question}`} className="mt-1 size-4 shrink-0 accent-brand-600" checked={chosen.has(q.id)} onChange={() => toggle(q.id)} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-xs">
                <StatusBadge tone={q.kind === 'mcq' ? 'info' : q.kind === 'written' ? 'progress' : 'good'}>{KIND_LABELS[q.kind]}</StatusBadge>
                {q.topic && <span className="rounded-full bg-hover px-2 py-0.5">{q.topic}</span>}
                <span className="text-ink-muted">{[q.department || 'Any department', q.designation || 'any post', DIFFICULTY_LABELS[q.difficulty], `${Number(q.marks)} mark${Number(q.marks) === 1 ? '' : 's'}`, q.kind === 'interview' ? ROUND_LABELS[q.round] : ''].filter(Boolean).join(' · ')}</span>
                {!q.is_active && <span className="font-medium text-ink-soft">Retired</span>}
              </p>
              <p className="mt-1 text-sm font-medium whitespace-pre-wrap">{q.question}</p>
              {q.kind === 'mcq' && (
                <ol className="mt-1 grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
                  {q.options.map((option, index) => (
                    <li key={index} className={classNames('flex gap-1.5', index === q.correct_option && 'font-medium text-brand-800')}>
                      <span className="text-ink-muted">{LETTERS[index]})</span> {option}
                      {index === q.correct_option && <Check className="mt-0.5 size-3.5 shrink-0" aria-label="Right answer" />}
                    </li>
                  ))}
                </ol>
              )}
              {q.kind !== 'mcq' && q.answer && (
                <details className="mt-1 text-sm text-ink-soft">
                  <summary className="cursor-pointer text-xs font-medium">{q.kind === 'interview' ? 'What a good answer covers' : 'Model answer'}</summary>
                  <p className="mt-1 whitespace-pre-wrap">{q.answer}</p>
                </details>
              )}
              <p className="mt-1 text-[11px] text-ink-muted">Added by {q.created_by_name || 'someone'} on {dateMedium(q.created_at)}</p>
            </div>
            {canWrite && (
              <div className="flex shrink-0 items-start gap-0.5">
                <IconButton label="Edit question" icon={Pencil} onClick={() => setEditing(q)} />
                <IconButton label="Delete question" icon={Trash2} onClick={() => setRemoving(q)} />
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing && <QuestionDialog initial={editing} departments={departments} designations={designations} topics={topics} onClose={() => setEditing(null)} />}
      {paper && <PaperDialog questions={chosenQuestions} designation={designation} onClose={() => setPaper(false)} />}
      {removing && (
        <Confirm
          danger
          title="Delete this question?"
          body={<>It is removed from the library for everyone. To keep it but stop using it, edit it and untick <strong>In use</strong> instead.</>}
          confirmLabel="Delete question"
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await removeQuestion(removing.id);
              setChosen((current) => {
                const next = new Set(current);
                next.delete(removing.id);
                return next;
              });
              toast('Question deleted.');
            } catch (error) {
              toast(errorText(error), 'bad');
            }
            setRemoving(null);
          }}
        />
      )}
    </>
  );
}

function QuestionDialog({ initial, departments, designations, topics, onClose }: {
  initial: Partial<Question>; departments: string[]; designations: string[]; topics: string[]; onClose: () => void;
}) {
  const { saveQuestion } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    kind: initial.kind ?? 'mcq',
    question: initial.question ?? '',
    options: initial.options?.length ? [...initial.options] : ['', '', '', ''],
    correct_option: initial.correct_option ?? null,
    answer: initial.answer ?? '',
    marks: String(initial.marks ?? 1),
    difficulty: initial.difficulty ?? 'medium',
    department: initial.department ?? '',
    designation: initial.designation ?? '',
    topic: initial.topic ?? '',
    round: initial.round ?? 'any',
    is_active: initial.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const isMcq = form.kind === 'mcq';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const options = form.options.map((o) => o.trim());
    if (isMcq) {
      const filled = options.filter(Boolean);
      if (filled.length < 2) return setError('An MCQ needs at least two choices.');
      if (form.correct_option === null || !options[form.correct_option]) return setError('Choose the right answer.');
    }
    // Empty choices are dropped, so the right answer is counted again among those kept.
    const kept = isMcq ? options.filter(Boolean) : [];
    const correct = isMcq ? kept.indexOf(options[form.correct_option!]) : null;
    setBusy(true);
    try {
      await saveQuestion({
        ...(initial.id ? { id: initial.id } : {}),
        kind: form.kind,
        question: form.question.trim(),
        options: kept,
        correct_option: correct,
        answer: isMcq ? '' : form.answer.trim(),
        marks: Math.max(0, Number(form.marks) || 0),
        difficulty: form.difficulty,
        department: form.department,
        designation: form.designation.trim(),
        topic: form.topic.trim(),
        round: form.kind === 'interview' ? form.round : 'any',
        is_active: form.is_active,
      });
      toast(initial.id ? 'Question saved.' : 'Question added to the library.');
      onClose();
    } catch (problem) {
      setError(errorText(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={initial.id ? 'Edit question' : 'Add a question'}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="question-form" variant="primary" icon={Check} loading={busy}>{initial.id ? 'Save question' : 'Add question'}</Button>
        </>
      }
    >
      <form id="question-form" onSubmit={submit} className="space-y-3">
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-ink-soft">Kind</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(KIND_LABELS) as QuestionKind[]).map((value) => (
              <label key={value} className={classNames('flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm', form.kind === value ? 'border-brand-600 bg-brand-50' : 'border-line')}>
                <input type="radio" name="question-kind" className="accent-brand-600" checked={form.kind === value} onChange={() => set({ kind: value })} />
                {KIND_LABELS[value]}
              </label>
            ))}
          </div>
        </fieldset>
        <TextArea label="Question" required rows={3} value={form.question} onChange={(e) => set({ question: e.target.value })} />
        {isMcq ? (
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-ink-soft">Choices: pick the right one</legend>
            <ol className="space-y-1.5">
              {form.options.map((option, index) => (
                <li key={index} className="flex items-center gap-2">
                  <input type="radio" name="question-correct" aria-label={`Choice ${LETTERS[index]} is right`} className="size-4 accent-brand-600" checked={form.correct_option === index} onChange={() => set({ correct_option: index })} />
                  <span className="w-4 text-sm text-ink-muted">{LETTERS[index]})</span>
                  <input aria-label={`Choice ${LETTERS[index]}`} value={option} onChange={(e) => set({ options: form.options.map((o, i) => (i === index ? e.target.value : o)) })} className="h-9 flex-1 rounded-lg border border-line-strong px-3 text-sm" />
                  {form.options.length > 2 && (
                    <IconButton label={`Remove choice ${LETTERS[index]}`} icon={X} onClick={() => set({
                      options: form.options.filter((_, i) => i !== index),
                      correct_option: form.correct_option === index ? null : form.correct_option !== null && form.correct_option > index ? form.correct_option - 1 : form.correct_option,
                    })} />
                  )}
                </li>
              ))}
            </ol>
            {form.options.length < 8 && <Button size="sm" variant="ghost" icon={Plus} className="mt-1" onClick={() => set({ options: [...form.options, ''] })}>Add a choice</Button>}
          </fieldset>
        ) : (
          <TextArea
            label={form.kind === 'interview' ? 'What a good answer covers (for the panel)' : 'Model answer (for the examiner)'}
            rows={3}
            value={form.answer}
            onChange={(e) => set({ answer: e.target.value })}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <TextInput label="Marks" type="number" min={0} step={0.5} value={form.marks} onChange={(e) => set({ marks: e.target.value })} />
          <Select label="Difficulty" value={form.difficulty} onChange={(e) => set({ difficulty: e.target.value as Difficulty })}>
            {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          {form.kind === 'interview' && (
            <Select label="Round" value={form.round} onChange={(e) => set({ round: e.target.value as Question['round'] })}>
              {Object.entries(ROUND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          )}
          <Select label="Department" hint="Blank: any department" value={form.department} onChange={(e) => set({ department: e.target.value })}>
            <option value="">Any department</option>
            {departments.map((d) => <option key={d}>{d}</option>)}
          </Select>
          <TextInput label="Post" hint="Blank: any post" list="question-posts" value={form.designation} onChange={(e) => set({ designation: e.target.value })} />
          <TextInput label="Topic" hint="E.g. Excel, Labour law" list="question-topics" value={form.topic} onChange={(e) => set({ topic: e.target.value })} />
          <datalist id="question-posts">{designations.map((d) => <option key={d} value={d} />)}</datalist>
          <datalist id="question-topics">{topics.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="size-4 accent-brand-600" checked={form.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
          In use (untick to retire it without deleting)
        </label>
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      </form>
    </Dialog>
  );
}

function PaperDialog({ questions, designation, onClose }: { questions: Question[]; designation: string; onClose: () => void }) {
  const mostly = questions.every((q) => q.kind === 'interview') ? 'Interview questions' : questions.every((q) => q.kind === 'mcq') ? 'MCQ test' : 'Written test';
  const [title, setTitle] = useState(`${mostly}${designation ? `: ${designation}` : ''}`);
  const [minutes, setMinutes] = useState('30');
  const [key, setKey] = useState<'none' | 'separate' | 'inline'>('separate');
  const marks = questions.reduce((sum, q) => sum + Number(q.marks), 0);
  const link = `/questions/paper?${new URLSearchParams({ ids: questions.map((q) => q.id).join(','), title, minutes, key }).toString()}`;
  return (
    <Dialog
      title="Make a question paper"
      description={`${questions.length} question${questions.length === 1 ? '' : 's'}, ${marks} marks in total.`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Link to={link} onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
            <Printer className="size-4" aria-hidden /> Open printable paper
          </Link>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <TextInput label="Title on the paper" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextInput label="Time (minutes)" type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </div>
      <fieldset className="mt-3">
        <legend className="mb-1 text-xs font-medium text-ink-soft">Answers</legend>
        {([
          ['separate', 'Answer key on a separate page, for the examiner'],
          ['none', 'No answers: for the candidate only'],
          ['inline', 'Answers under each question: for the interview panel'],
        ] as const).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 py-0.5 text-sm">
            <input type="radio" name="paper-key" className="accent-brand-600" checked={key === value} onChange={() => setKey(value)} />
            {label}
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}

/** A printable question paper, opened from the library. */
export function QuestionPaperPage() {
  const { questions, settings, dataReady } = useStore();
  const [params] = useSearchParams();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean);
  const title = params.get('title') || 'Question paper';
  const minutes = Number(params.get('minutes')) || 0;
  const key = params.get('key') ?? 'separate';
  const chosen = ids.map((id) => questions.find((q) => q.id === id)).filter((q): q is Question => Boolean(q));
  // MCQ first, then written, then interview: the usual order of a printed paper.
  const sections = (['mcq', 'written', 'interview'] as QuestionKind[])
    .map((kind) => ({ kind, items: chosen.filter((q) => q.kind === kind) }))
    .filter((section) => section.items.length > 0);
  const marks = chosen.reduce((sum, q) => sum + Number(q.marks), 0);

  useEffect(() => {
    document.title = title;
    return () => {
      document.title = 'Bitopi Group · Onboarding Suite';
    };
  }, [title]);

  if (!dataReady) return <Spinner />;
  if (chosen.length === 0) {
    return <EmptyState icon={AlertTriangle} title="No questions to print" action={<Link className="text-sm underline" to="/questions">Back to the question library</Link>}>The questions may have been deleted.</EmptyState>;
  }

  let number = 0;
  const numbered = sections.map((section) => ({ ...section, items: section.items.map((q) => ({ q, n: ++number })) }));
  const showInline = key === 'inline';

  return (
    <div className="min-h-dvh bg-hover">
      {backend.mode === 'demo' && <p className="no-print bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-950">Demo mode: sample data</p>}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-surface px-5 py-3">
        <Link to="/questions" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Question library</Link>
        <h1 className="text-sm font-semibold">{title}</h1>
        <span className="text-xs text-ink-muted">{chosen.length} questions · {marks} marks</span>
        <Button className="ml-auto" variant="primary" icon={Printer} onClick={() => window.print()}>Print</Button>
      </div>
      <div className="print-root flex flex-col items-center gap-6 overflow-x-auto p-6">
        <article className="paper shadow-md" aria-label={title}>
          <header className="border-b border-black pb-2 text-center">
            <p className="text-lg font-bold">{settings.group_name}</p>
            <p className="font-semibold">{title}</p>
            <p className="mt-1 flex justify-between text-sm">
              <span>Full marks: {marks}</span>
              {minutes > 0 && <span>Time: {minutes} minutes</span>}
            </p>
          </header>
          {key !== 'inline' && (
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <p>Name: <span className="fill-line w-56" /></p>
              <p>Date: <span className="fill-line" /></p>
              <p>Mobile: <span className="fill-line" /></p>
              <p>Post applied for: <span className="fill-line" /></p>
            </div>
          )}
          {numbered.map((section, part) => (
            <section key={section.kind} className="mt-4">
              <h2 className="mb-2 border-b border-black/30 text-sm font-bold tracking-wide uppercase">
                Part {'ABC'[part]}: {section.kind === 'mcq' ? 'Multiple choice (tick one answer)' : section.kind === 'written' ? 'Written' : 'Interview'}
              </h2>
              <ol className="space-y-3">
                {section.items.map(({ q, n }) => (
                  <li key={q.id} className="keep-together">
                    <p className="flex gap-2">
                      <span className="font-semibold">{n}.</span>
                      <span className="flex-1 whitespace-pre-wrap">{q.question}</span>
                      <span className="shrink-0 text-sm">[{Number(q.marks)}]</span>
                    </p>
                    {q.kind === 'mcq' && (
                      <ol className="mt-1 grid grid-cols-2 gap-x-6 pl-6 text-sm">
                        {q.options.map((option, index) => (
                          <li key={index} className={showInline && index === q.correct_option ? 'font-bold' : ''}>
                            ☐ {LETTERS[index]}) {option}{showInline && index === q.correct_option ? ' ✓' : ''}
                          </li>
                        ))}
                      </ol>
                    )}
                    {q.kind === 'written' && !showInline && <div className="mt-1 ml-6 space-y-5 pt-3" aria-hidden>{Array.from({ length: Math.min(8, Math.max(3, Math.round(Number(q.marks) / 2))) }, (_, i) => <div key={i} className="border-b border-black/40" />)}</div>}
                    {q.kind === 'interview' && !showInline && <p className="mt-1 pl-6 text-sm">Score: ____ / {Number(q.marks)} &nbsp; Notes: <span className="fill-line w-72" /></p>}
                    {showInline && q.kind !== 'mcq' && q.answer && <p className="mt-1 pl-6 text-sm italic">Good answer: {q.answer}</p>}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </article>
        {key === 'separate' && (
          <article className="paper shadow-md" aria-label="Answer key">
            <header className="border-b border-black pb-2 text-center">
              <p className="text-lg font-bold">{settings.group_name}</p>
              <p className="font-semibold">Answer key: {title}</p>
              <p className="text-sm">For the examiner only</p>
            </header>
            <ol className="mt-3 space-y-2 text-sm">
              {numbered.flatMap((section) => section.items).map(({ q, n }) => (
                <li key={q.id} className="keep-together flex gap-2">
                  <span className="font-semibold">{n}.</span>
                  <span className="flex-1">
                    {q.kind === 'mcq'
                      ? <>{LETTERS[q.correct_option ?? 0]}) {q.options[q.correct_option ?? 0]}</>
                      : q.answer || <span className="italic">No model answer recorded.</span>}
                  </span>
                  <span className="shrink-0">[{Number(q.marks)}]</span>
                </li>
              ))}
            </ol>
          </article>
        )}
      </div>
    </div>
  );
}
