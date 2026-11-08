import { LogIn } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import fullLogo from '../assets/images/Bitopi_Logo_Final.png';
import { Avatar, Button, errorText, TextInput } from '../components/ui';
import { backend } from '../lib/backend';
import { DESK_LABELS } from '../lib/team';
import type { Profile } from '../types';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-5">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7">
        <img src={fullLogo} alt="Bitopi Group, 50 Years and Beyond" className="mx-auto mb-5 w-52" />
        {children}
      </div>
    </main>
  );
}

/** Demo mode has no passwords: one button per sample account. Each browser tab can be someone else. */
function DemoAccounts() {
  const [people, setPeople] = useState<Profile[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void backend.list<Profile>('profiles', { order: { column: 'created_at' } }).then(setPeople);
  }, []);
  return (
    <>
      <ul className="space-y-2" aria-label="Demo accounts">
        {people.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => void backend.signIn(person.email ?? '', '').catch((failure) => setError(errorText(failure)))}
              className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:border-brand-600 hover:bg-brand-50"
            >
              <Avatar name={person.full_name || '?'} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{person.full_name}</span>
                <span className="block text-xs text-ink-soft">{person.job_title}</span>
                <span className="block text-xs text-ink-muted">{DESK_LABELS[person.desk]}</span>
              </span>
              <LogIn className="size-4 text-ink-muted" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
      <p className="mt-4 text-center text-xs text-ink-muted">Open a second tab to be someone else at the same time.</p>
    </>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isDemo = backend.mode === 'demo';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await backend.signIn(email, password);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1 className="text-center text-lg font-semibold">Recruitment Management Suite</h1>
      <p className="mt-1 mb-5 text-center text-sm text-ink-soft">
        {isDemo ? 'Demo mode: choose who you are. No password needed.' : 'Sign in with your HR account.'}
      </p>
      {isDemo ? (
        <DemoAccounts />
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <TextInput label="Email" type="email" name="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextInput label="Password" type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
          <Button type="submit" variant="primary" icon={LogIn} loading={busy} className="w-full">Sign in</Button>
        </form>
      )}
    </Shell>
  );
}

export function AccessPending() {
  return (
    <Shell>
      <h1 className="text-center text-lg font-semibold">Waiting for approval</h1>
      <p className="mt-2 mb-5 text-center text-sm text-ink-soft">
        Your account is ready, but an admin needs to give it access under Settings &gt; Team.
      </p>
      <Button className="w-full" onClick={() => void backend.signOut()}>Sign out</Button>
    </Shell>
  );
}

export function SetupRequired() {
  return (
    <Shell>
      <h1 className="text-center text-lg font-semibold">Database not connected</h1>
      <p className="mt-2 text-center text-sm text-ink-soft">
        Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env, then build again. The README has the steps.
      </p>
    </Shell>
  );
}
