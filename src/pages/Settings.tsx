import { Check, KeyRound, RotateCcw, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Card, Confirm, errorText, PageHeader, Select, StatusBadge, TABLE, Tabs, TD, TextArea, TextInput, TH, THEAD, useToast } from '../components/ui';
import { backend } from '../lib/backend';
import { aiHeaders } from '../lib/cv';
import { DEFAULT_DOCUMENT_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES } from '../lib/defaults';
import { useFileUrls, useStore } from '../lib/store';
import { DESK_LABELS } from '../lib/team';
import type { Desk, DocumentTemplate, MessageTemplate, Profile, Role } from '../types';

type Tab = 'company' | 'messages' | 'documents' | 'ai' | 'team';

const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);

function CompanyTab() {
  const { settings, saveSettings, isAdmin } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    ...settings,
    companiesText: settings.companies.join('\n'),
    departmentsText: settings.departments.join('\n'),
    mediaText: settings.media.join('\n'),
    maxFilesText: String(settings.upload_max_files),
    batchSizeText: String(settings.upload_batch_size),
    batchPauseText: String(settings.upload_batch_pause),
  });
  const [busy, setBusy] = useState(false);
  const sealInput = useRef<HTMLInputElement>(null);
  const urls = useFileUrls([settings.seal_path]);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { companiesText, departmentsText, mediaText, maxFilesText, batchSizeText, batchPauseText, id: _id, updated_at: _updated, seal_path: _seal, ...rest } = form;
      // Kept within what the database accepts, so a typo cannot block saving the rest.
      const whole = (text: string, min: number, max: number, fallback: number) => {
        const number = Math.round(Number(text));
        return text.trim() !== '' && Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
      };
      await saveSettings({
        ...rest,
        companies: lines(companiesText),
        departments: lines(departmentsText),
        media: lines(mediaText),
        upload_max_files: whole(maxFilesText, 1, 5000, 1000),
        upload_batch_size: whole(batchSizeText, 1, 1000, 50),
        upload_batch_pause: whole(batchPauseText, 0, 600, 10),
      });
      toast('Company settings saved.');
    } catch (error) {
      toast(errorText(error), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function uploadSeal(file: File | undefined) {
    if (!file) return;
    try {
      const path = `company/seal-${crypto.randomUUID()}.${file.name.split('.').pop()?.toLowerCase() ?? 'png'}`;
      await backend.upload(path, file, file.type || 'image/png');
      await saveSettings({ seal_path: path });
      toast('Seal saved.');
    } catch (error) {
      toast(errorText(error), 'bad');
    }
  }

  const disabled = !isAdmin;
  const text = (key: keyof typeof form, label: string, hint?: string) => (
    <TextInput label={label} hint={hint} disabled={disabled} value={String(form[key] ?? '')} onChange={(e) => set({ [key]: e.target.value } as Partial<typeof form>)} />
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      {!isAdmin && <p className="text-sm text-ink-muted">Only an admin can change these settings.</p>}
      <Card title="Company">
        <div className="grid gap-3 sm:grid-cols-2">
          {text('group_name', 'Group name')}
          {text('default_company', 'Default company', 'Used when a CV bucket has no company of its own.')}
          {text('corporate_address', 'Corporate office address')}
          {text('interview_address', 'Interview venue')}
          {text('interview_landmark', 'Venue landmark')}
          {text('hr_signature', 'Message signature')}
        </div>
      </Card>
      <Card title="Who signs the offer letter">
        <div className="grid gap-3 sm:grid-cols-3">
          {text('signatory_name', 'Name')}
          {text('signatory_designation', 'Designation')}
          {text('signatory_mobile', 'Mobile')}
          {text('signatory_phone', 'Phone')}
          {text('signatory_ext', 'Extension')}
          {text('signatory_fax', 'Fax')}
          {text('signatory_email', 'Email')}
        </div>
        <div className="mt-4 flex items-center gap-4 border-t border-line pt-4">
          <div className="flex size-20 items-center justify-center rounded-lg border border-dashed border-line-strong text-center text-[11px] text-ink-muted">
            {settings.seal_path && urls[settings.seal_path] ? <img src={urls[settings.seal_path]} alt="Company seal" className="size-full object-contain" /> : 'No seal'}
          </div>
          <div>
            <p className="text-sm font-medium">Company seal (optional)</p>
            <p className="mb-2 text-xs text-ink-muted">Printed beside the signature on the offer letter. Use a clean scan of the real seal.</p>
            <Button size="sm" icon={Upload} disabled={disabled} onClick={() => sealInput.current?.click()}>Upload seal</Button>
            <input ref={sealInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void uploadSeal(e.target.files?.[0])} />
          </div>
        </div>
      </Card>
      <Card title="Lists">
        <div className="grid gap-3 sm:grid-cols-3">
          <TextArea label="Companies (one per line)" rows={6} disabled={disabled} value={form.companiesText} onChange={(e) => set({ companiesText: e.target.value })} />
          <TextArea label="Departments (one per line)" rows={6} disabled={disabled} value={form.departmentsText} onChange={(e) => set({ departmentsText: e.target.value })} />
          <TextArea label="Job posting media (one per line)" rows={6} disabled={disabled} value={form.mediaText} onChange={(e) => set({ mediaText: e.target.value })} />
        </div>
      </Card>
      <Card title="CV uploads">
        <p className="mb-3 text-xs text-ink-muted">
          Each file can be up to 15 MB. A large upload is read in batches, with a break between them, so the computer stays responsive
          and the AI service is not flooded. Shown to everyone in the upload window.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextInput label="Most files in one upload" type="number" min={1} max={5000} disabled={disabled} value={form.maxFilesText} onChange={(e) => set({ maxFilesText: e.target.value })} />
          <TextInput label="Files per batch" type="number" min={1} max={1000} disabled={disabled} value={form.batchSizeText} onChange={(e) => set({ batchSizeText: e.target.value })} />
          <TextInput label="Break between batches (seconds)" hint="0 for no break" type="number" min={0} max={600} disabled={disabled} value={form.batchPauseText} onChange={(e) => set({ batchPauseText: e.target.value })} />
        </div>
      </Card>
      {isAdmin && <Button type="submit" variant="primary" icon={Check} loading={busy}>Save company settings</Button>}
    </form>
  );
}

const MESSAGE_PLACEHOLDERS = '{{name}} {{designation}} {{date}} {{day}} {{date_short}} {{day_short}} {{time}} {{interview_address}} {{interview_landmark}} {{hr_signature}} {{company}} {{review_link}}';

function MessagesTab() {
  const { messageTemplates, saveMessageTemplate, canWrite } = useStore();
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Words in double braces fill in automatically: <code className="text-xs">{MESSAGE_PLACEHOLDERS}</code>
      </p>
      {messageTemplates.map((template) => (
        <TemplateEditor
          key={template.key}
          title={template.name}
          body={template.body}
          defaultBody={DEFAULT_MESSAGE_TEMPLATES.find((t) => t.key === template.key)?.body}
          rows={4}
          disabled={!canWrite}
          onSave={(body) => saveMessageTemplate({ ...template, body } as MessageTemplate)}
        />
      ))}
    </div>
  );
}

function DocumentsTab() {
  const { documentTemplates, saveDocumentTemplate, canWrite } = useStore();
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        These print in the joining pack. <strong>**bold**</strong>, "# " for a heading and "- " for a bullet are understood, along with blocks on their own line
        such as <code className="text-xs">[[photo]]</code>, <code className="text-xs">[[education]]</code>, <code className="text-xs">[[signatures:Left|Right]]</code>.
      </p>
      {documentTemplates.map((template) => (
        <TemplateEditor
          key={template.key}
          title={template.title}
          body={template.body}
          defaultBody={DEFAULT_DOCUMENT_TEMPLATES.find((t) => t.key === template.key)?.body}
          rows={12}
          disabled={!canWrite}
          onSave={(body) => saveDocumentTemplate({ ...template, body } as DocumentTemplate)}
          extra={
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                className="size-4 accent-brand-600"
                checked={template.is_active}
                disabled={!canWrite}
                onChange={(e) => void saveDocumentTemplate({ ...template, is_active: e.target.checked })}
              />
              In the joining pack
            </label>
          }
        />
      ))}
    </div>
  );
}

function TemplateEditor({ title, body, defaultBody, rows, disabled, onSave, extra }: { title: string; body: string; defaultBody?: string; rows: number; disabled: boolean; onSave: (body: string) => Promise<void>; extra?: React.ReactNode }) {
  const toast = useToast();
  const [value, setValue] = useState(body);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = value !== body;

  async function save(next: string) {
    setBusy(true);
    try {
      await onSave(next);
      toast(`${title} saved.`);
    } catch (error) {
      toast(errorText(error), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={title} action={extra}>
      <TextArea aria-label={title} rows={rows} disabled={disabled} value={value} onChange={(e) => setValue(e.target.value)} className="font-mono text-xs! leading-relaxed" />
      {!disabled && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="primary" disabled={!dirty} loading={busy} onClick={() => void save(value)}>Save</Button>
          {defaultBody !== undefined && value !== defaultBody && <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setConfirmReset(true)}>Back to default wording</Button>}
        </div>
      )}
      {confirmReset && (
        <Confirm
          title={`Reset ${title}?`}
          body="Your edited wording will be replaced by the default."
          confirmLabel="Reset"
          onCancel={() => setConfirmReset(false)}
          onConfirm={async () => {
            setValue(defaultBody!);
            await save(defaultBody!);
            setConfirmReset(false);
          }}
        />
      )}
    </Card>
  );
}

function AiTab() {
  const { isAdmin } = useStore();
  const toast = useToast();
  const [status, setStatus] = useState<{ configured: boolean; last4?: string } | null>(null);
  const [server, setServer] = useState<{ configured: boolean; model?: string; serviceKeyMissing?: boolean } | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshServer() {
    try {
      const response = await fetch('/api/ai/status', { headers: await aiHeaders() });
      setServer(response.ok ? await response.json() : { configured: false });
    } catch {
      setServer({ configured: false });
    }
  }

  useEffect(() => {
    void backend.rpc<{ configured: boolean; last4?: string }>('ai_key_status', {}).then(setStatus);
    void refreshServer();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      setStatus(await backend.rpc('set_ai_key', { p_key: key }));
      setKey('');
      toast(key ? 'API key saved.' : 'API key removed.');
      await refreshServer();
    } catch (error) {
      toast(errorText(error), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card title="AI CV reading (Google Gemini)">
        <p className="text-sm text-ink-soft">
          Optional. Without a key, CVs are still read by the built-in reader on this computer. With a key, you can choose AI when uploading: it
          handles unusual layouts and scans better, and each CV is sent to Google. Get a key at{' '}
          <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>.
        </p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          {server?.configured
            ? <StatusBadge tone="good">AI is ready{server.model ? ` (${server.model})` : ''}</StatusBadge>
            : <StatusBadge tone="neutral">AI is not set up</StatusBadge>}
          {status?.configured && status.last4 && <span className="tabular text-xs text-ink-muted">Key saved, ending in {status.last4}</span>}
        </div>
        {server?.serviceKeyMissing && status?.configured && !server.configured && (
          <p className="mt-2 text-xs text-amber-900">The key is saved, but the server cannot read it yet: set SUPABASE_SERVICE_ROLE_KEY in the server's .env file and restart.</p>
        )}
        {isAdmin ? (
          <form onSubmit={save} className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <TextInput label="Gemini API key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} hint="Stored on the server. It cannot be read back, even by admins. Leave empty and save to remove it." />
            </div>
            <Button type="submit" variant="primary" icon={KeyRound} loading={busy} className="mb-5">Save key</Button>
          </form>
        ) : (
          <p className="mt-3 text-xs text-ink-muted">Only an admin can change the key.</p>
        )}
      </Card>
    </div>
  );
}

function TeamTab() {
  const { user, isAdmin, refreshUser, reload } = useStore();
  const toast = useToast();
  const [people, setPeople] = useState<Profile[]>([]);

  useEffect(() => {
    void backend.list<Profile>('profiles', { order: { column: 'created_at' } }).then(setPeople);
  }, []);

  async function change(person: Profile, patch: Partial<Profile>, done: string) {
    try {
      const [saved] = await backend.update<Profile>('profiles', { id: person.id }, patch);
      if (!saved) throw new Error('Only an admin can change the team.');
      setPeople((current) => current.map((p) => (p.id === person.id ? saved : p)));
      if (person.id === user?.id) await refreshUser();
      // Names and desks show across the app, and decide who gets which notification.
      void reload().catch(() => undefined);
      toast(done);
    } catch (error) {
      toast(errorText(error), 'bad');
    }
  }

  const label = (person: Profile) => person.full_name || person.email || 'this person';
  // Saved when the field is left, and only if it changed.
  const textField = (person: Profile, key: 'full_name' | 'job_title', what: string) => (
    <TextInput
      key={`${person.id}-${key}-${person[key] ?? ''}`}
      aria-label={`${what} of ${label(person)}`}
      disabled={!isAdmin}
      defaultValue={person[key] ?? ''}
      onBlur={(e) => {
        const value = e.target.value.trim();
        if (value !== (person[key] ?? '')) void change(person, { [key]: value }, `${what} saved.`);
      }}
    />
  );

  return (
    <div className="max-w-5xl space-y-3">
      <p className="text-sm text-ink-soft">
        To add someone, create their account in Supabase (Authentication &gt; Users &gt; Add user). They appear here as Pending and see nothing until you choose a role.
        HR can do everything except delete records and change settings; Viewer can only look.
      </p>
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
        <p className="font-medium text-ink">Desk: who does which part of the work</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li><strong>{DESK_LABELS.screening}</strong>: receives and uploads CVs, screens them, and selects CVs to hand over to the process team. Hears about the process team's big decisions: confirmation letters, final rejections and joining outcomes.</li>
          <li><strong>{DESK_LABELS.process}</strong>: the call, interview schedules and results, the decision and joining, for the candidates handed to them. Hears about new CVs, job postings and handovers.</li>
          <li><strong>{DESK_LABELS.all}</strong>: everything, for the team's head, who can do any step but hands the work to the process team. Sees the team's progress on the dashboard and hears about its big decisions.</li>
        </ul>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className={TABLE}>
          <thead className={THEAD}>
            <tr>
              <th scope="col" className={TH}>Name</th>
              <th scope="col" className={TH}>Designation</th>
              <th scope="col" className={TH}>Email</th>
              <th scope="col" className={TH}>Desk</th>
              <th scope="col" className={TH}>Role</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <td className={TD}>
                  <div className="flex min-w-40 items-center gap-1.5">
                    {textField(person, 'full_name', 'Name')}
                    {person.id === user?.id && <span className="shrink-0 text-xs text-ink-muted">(you)</span>}
                  </div>
                </td>
                <td className={TD}><div className="min-w-48">{textField(person, 'job_title', 'Designation')}</div></td>
                <td className={TD}>{person.email}</td>
                <td className={TD}>
                  <div className="w-56">
                    <Select aria-label={`Desk of ${label(person)}`} disabled={!isAdmin} value={person.desk} onChange={(e) => void change(person, { desk: e.target.value as Desk }, `${label(person)}: ${DESK_LABELS[e.target.value as Desk]}.`)}>
                      {(Object.keys(DESK_LABELS) as Desk[]).map((desk) => <option key={desk} value={desk}>{DESK_LABELS[desk]}</option>)}
                    </Select>
                  </div>
                </td>
                <td className={TD}>
                  <div className="w-36">
                    <Select aria-label={`Role of ${label(person)}`} disabled={!isAdmin} value={person.role} onChange={(e) => void change(person, { role: e.target.value as Role }, `${label(person)} is now ${e.target.value}.`)}>
                      <option value="admin">Admin</option>
                      <option value="hr">HR</option>
                      <option value="viewer">Viewer</option>
                      <option value="pending">Pending (no access)</option>
                    </Select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('company');
  return (
    <>
      <PageHeader title="Settings" description="Company details, message wording, joining documents, AI and team access." />
      <Tabs<Tab>
        label="Settings sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'company', label: 'Company' },
          { value: 'messages', label: 'Messages' },
          { value: 'documents', label: 'Joining documents' },
          { value: 'ai', label: 'AI' },
          { value: 'team', label: 'Team' },
        ]}
      />
      <div className="mt-4">
        {tab === 'company' && <CompanyTab />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'documents' && <DocumentsTab />}
        {tab === 'ai' && <AiTab />}
        {tab === 'team' && <TeamTab />}
      </div>
    </>
  );
}
