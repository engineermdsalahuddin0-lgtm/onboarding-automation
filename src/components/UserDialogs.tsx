import { Check, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { backend } from '../lib/backend';
import { useStore, type UserChanges } from '../lib/store';
import { DESK_LABELS, personName } from '../lib/team';
import type { Desk, Profile, Role } from '../types';
import { Button, Dialog, errorText, Select, TextInput, useToast } from './ui';

// An admin's tools for user accounts: add anyone (staff or interviewer) with a login, change their details,
// role, desk, login email or password, and delete an account.

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  hr: 'HR',
  viewer: 'Viewer',
  interviewer: 'Interviewer',
  pending: 'Pending (no access)',
};

const ROLE_HELP: Record<Role, string> = {
  admin: 'Everything, including settings, deleting records and managing users.',
  hr: 'Everything except deleting records and changing settings.',
  viewer: 'Can only look.',
  interviewer: 'Signs in only to mark the interviews they are put on.',
  pending: 'Can sign in but sees nothing.',
};

/** The desk matters only to staff who work candidates. */
const hasDesk = (role: Role) => role === 'admin' || role === 'hr';

const MIN_PASSWORD = () => (backend.mode === 'demo' ? 0 : 8);

/** Adds a user, or changes one when `person` is given. */
export function UserDialog({ person, onClose }: { person?: Profile; onClose: () => void }) {
  const { createUser, saveUser, user } = useStore();
  const toast = useToast();
  const editing = Boolean(person);
  const [form, setForm] = useState({
    full_name: person?.full_name ?? '',
    job_title: person?.job_title ?? '',
    department: person?.department ?? '',
    email: person?.email ?? '',
    password: '',
    role: (person?.role ?? 'hr') as Role,
    desk: (person?.desk ?? 'all') as Desk,
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const isMe = person?.id === user?.id;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const details = {
        full_name: form.full_name.trim(), job_title: form.job_title.trim(), department: form.department.trim(),
        role: form.role, desk: form.desk, email: form.email.trim(),
      };
      if (person) {
        const changes: UserChanges = { ...details, ...(form.password ? { password: form.password } : {}) };
        await saveUser(person.id, changes);
        toast(form.password ? `${details.full_name}: saved, with the new password.` : `${details.full_name}: saved.`);
      } else {
        await createUser({ ...details, password: form.password });
        toast(`${details.full_name} can now sign in with ${details.email} and the password you set.`);
      }
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={person ? `Edit ${personName(person)}` : 'Add a user'}
      description={editing
        ? 'Change their details, role, desk or login. Leave the password empty to keep the one they have.'
        : 'They sign in with this email and password. Give them both yourself.'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="user-dialog" variant="primary" icon={editing ? Check : UserPlus} loading={busy}>{editing ? 'Save' : 'Add user'}</Button>
        </>
      }
    >
      <form id="user-dialog" onSubmit={submit} className="space-y-3">
        <TextInput label="Name" required value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Designation" value={form.job_title} onChange={(e) => set({ job_title: e.target.value })} />
          <TextInput label="Department" value={form.department} onChange={(e) => set({ department: e.target.value })} />
          <TextInput label="Email (login ID)" type="email" required autoComplete="off" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          <TextInput
            label={editing ? 'New password' : 'Password'}
            type="text"
            required={!editing}
            minLength={form.password || !editing ? MIN_PASSWORD() : undefined}
            autoComplete="new-password"
            hint={editing ? 'Only to change it. At least 8 characters.' : 'At least 8 characters.'}
            value={form.password}
            onChange={(e) => set({ password: e.target.value })}
          />
          <Select
            label="Role"
            hint={isMe ? 'Your own role: another admin has to change it.' : ROLE_HELP[form.role]}
            disabled={isMe}
            value={form.role}
            onChange={(e) => set({ role: e.target.value as Role })}
          >
            {(Object.keys(ROLE_LABELS) as Role[]).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </Select>
          {hasDesk(form.role) && (
            <Select label="Desk" hint="Which part of the work they do." value={form.desk} onChange={(e) => set({ desk: e.target.value as Desk })}>
              {(Object.keys(DESK_LABELS) as Desk[]).map((desk) => <option key={desk} value={desk}>{DESK_LABELS[desk]}</option>)}
            </Select>
          )}
        </div>
      </form>
    </Dialog>
  );
}

/** Deleting is for good. Removing access keeps the account, so it can be given back. */
export function DeleteUserDialog({ person, onClose }: { person: Profile; onClose: () => void }) {
  const { deleteUser, saveUser, panels, removeFromPanel } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState<'' | 'delete' | 'access'>('');
  const name = personName(person);
  const seats = panels.filter((p) => p.interviewer_id === person.id);

  async function act(kind: 'delete' | 'access') {
    setBusy(kind);
    try {
      if (kind === 'delete') {
        await deleteUser(person.id);
        toast(`${name}'s account is deleted.`);
      } else {
        for (const seat of seats) await removeFromPanel(seat.id);
        await saveUser(person.id, { role: 'pending' });
        toast(`${name} can no longer see anything. Their account is kept.`);
      }
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy('');
    }
  }

  return (
    <Dialog
      title={`Delete ${name}?`}
      description={person.email ?? undefined}
      onClose={onClose}
      footer={
        <>
          <Button className="mr-auto" onClick={onClose}>Cancel</Button>
          {person.role !== 'pending' && (
            <Button icon={UserMinus} loading={busy === 'access'} disabled={busy !== ''} onClick={() => void act('access')}>Only remove access</Button>
          )}
          <Button variant="danger" icon={Trash2} loading={busy === 'delete'} disabled={busy !== ''} onClick={() => void act('delete')}>Delete for good</Button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-ink-soft">
        <p><strong className="text-ink">Delete for good</strong>: the login is removed and cannot be brought back. They can no longer sign in.</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>What they did stays on record under their name: candidate history, interview forms, correction requests.</li>
          {seats.length > 0 && <li>They are taken off {seats.length} interview panel{seats.length === 1 ? '' : 's'}.</li>}
          {hasDesk(person.role) && <li>Candidates handed to them stay with the others they were handed to, or go to the whole process team.</li>}
        </ul>
        {person.role !== 'pending' && (
          <p><strong className="text-ink">Only remove access</strong>: the account stays as Pending and sees nothing. You can give a role back later.</p>
        )}
      </div>
    </Dialog>
  );
}
