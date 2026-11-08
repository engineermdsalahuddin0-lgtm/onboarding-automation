import {
  Activity,
  ClipboardList,
  FileQuestion,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  MessageSquareHeart,
  Search,
  Settings,
  Upload,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useMatch, useSearchParams } from 'react-router-dom';
import tabLogo from '../assets/images/bitopi_group_logo_for_tab.jpg';
import fullLogo from '../assets/images/Bitopi_Logo_Final.png';
import { backend } from '../lib/backend';
import { classNames } from '../lib/format';
import { normalizePhone, stageOf } from '../lib/pipeline';
import { useStore } from '../lib/store';
import { BulkUploadDialog } from './BulkUpload';
import { CandidateCard } from './CandidateCard';
import { GuideProvider, HelpButton } from './Guide';
import { NotificationBell } from './Notifications';
import { PresenceProvider } from '../lib/presence';
import { Avatar, Button, IconButton, StatusBadge } from './ui';

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/requisitions', label: 'Requisitions', icon: ClipboardList },
  { to: '/buckets', label: 'CV Buckets', icon: FolderOpen },
  { to: '/selected', label: 'Selected', icon: UserCheck },
  { to: '/reviews', label: 'Candidate Reviews', icon: MessageSquareHeart },
  { to: '/questions', label: 'Question library', icon: FileQuestion },
  { to: '/activity', label: 'Team activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Going to a page moves focus into it, so a keyboard user's choice closes the panel instead of leaving it over the content.
const focusMain = () => document.getElementById('main-content')?.focus({ preventScroll: true });

function Sidebar() {
  return (
    // The rail keeps its width in the layout; the wider panel floats over the page on hover or keyboard focus.
    // z-index goes on the sticky rail: it forms the stacking context the panel has to rise out of to clear the header.
    // focus-visible, not focus-within: a mouse click leaves focus on the link and would hold the panel open over the page.
    <div className="no-print sticky top-0 z-30 h-dvh w-16 shrink-0">
      <nav
        aria-label="Main"
        data-tour="nav"
        className="group absolute inset-y-0 left-0 flex w-16 flex-col overflow-x-hidden overflow-y-auto border-r border-line bg-surface transition-[width] duration-150 hover:w-56 hover:shadow-lg has-focus-visible:w-56 has-focus-visible:shadow-lg"
      >
        <Link to="/" onClick={focusMain} className="flex h-14 shrink-0 items-center gap-3 px-3.5" aria-label="Bitopi Group, go to dashboard">
          <img src={tabLogo} alt="" className="size-9 shrink-0 rounded-md object-contain" />
          <span className="truncate text-sm font-semibold whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-has-focus-visible:opacity-100">
            Onboarding Suite
          </span>
        </Link>
        <ul className="flex flex-1 flex-col gap-1 px-2.5 pt-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={focusMain}
                className={({ isActive }) =>
                  classNames(
                    'flex h-10 items-center gap-3 rounded-lg px-3 text-sm whitespace-nowrap transition-colors',
                    isActive ? 'bg-brand-50 font-semibold text-brand-900' : 'text-ink-soft hover:bg-hover hover:text-ink',
                  )
                }
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                <span className="opacity-0 transition-opacity group-hover:opacity-100 group-has-focus-visible:opacity-100">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <img src={fullLogo} alt="Bitopi Group, 50 Years and Beyond" className="mx-3 mb-3 hidden w-44 shrink-0 group-hover:block group-has-focus-visible:block [@media(max-height:520px)]:!hidden" />
      </nav>
    </div>
  );
}

function GlobalSearch() {
  const { candidates, buckets } = useStore();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [, setParams] = useSearchParams();

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const results = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (text.length < 2) return [];
    const digits = normalizePhone(text);
    return candidates
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(text) ||
          c.email.toLowerCase().includes(text) ||
          (digits.length >= 4 && normalizePhone(c.phone).includes(digits)),
      )
      .slice(0, 8);
  }, [query, candidates]);

  return (
    <div ref={box} data-tour="search" className="relative w-full max-w-md" onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}>
      <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-muted" aria-hidden />
      <input
        type="search"
        aria-label="Search candidates by name, mobile or email"
        placeholder="Search candidates by name, mobile or email"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="h-9 w-full rounded-lg border border-line bg-canvas pr-3 pl-9 text-sm placeholder:text-ink-muted"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {results.length === 0 && <p className="px-3 py-3 text-sm text-ink-muted">No candidate found.</p>}
          {results.map((c) => {
            const stage = stageOf(c);
            const bucket = buckets.find((b) => b.id === c.bucket_id);
            return (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-hover"
                onClick={() => {
                  setOpen(false);
                  setQuery('');
                  setParams((current) => {
                    current.set('candidate', c.id);
                    return current;
                  });
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.full_name}</span>
                  <span className="block truncate text-xs text-ink-muted">{bucket?.designation} · {c.phone}</span>
                </span>
                <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user } = useStore();
  if (!user) return null;
  return (
    <PresenceProvider userId={user.id}>
      <GuideProvider>
        <Shell />
      </GuideProvider>
    </PresenceProvider>
  );
}

function Shell() {
  const { user, canScreen } = useStore();
  const [uploading, setUploading] = useState(false);
  const [params, setParams] = useSearchParams();
  // A bucket page has its own Upload button, which already knows the bucket.
  const onBucketPage = useMatch('/buckets/:id') !== null;
  const openCandidate = params.get('candidate');

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {backend.mode === 'demo' && (
          <p className="no-print bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-950">
            Demo mode: sample data
          </p>
        )}
        <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-line bg-surface px-5">
          <GlobalSearch />
          <div className="flex items-center gap-2">
            {canScreen && !onBucketPage && (
              <Button data-tour="upload" variant="primary" icon={Upload} aria-label="Upload CVs" onClick={() => setUploading(true)}>
                <span className="hidden sm:inline">Upload CVs</span>
              </Button>
            )}
            <HelpButton />
            <span data-tour="bell" className="inline-flex"><NotificationBell /></span>
            <span className="ml-2 hidden text-right sm:block">
              <span className="block max-w-48 truncate text-xs font-medium">{user?.full_name || user?.email}</span>
              <span className="block max-w-48 truncate text-[11px] text-ink-muted">{user?.job_title || <span className="capitalize">{user?.role}</span>}</span>
            </span>
            <Avatar name={user?.full_name || user?.email || '?'} size={32} />
            <IconButton label="Sign out" icon={LogOut} onClick={() => void backend.signOut()} />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6 outline-none">
          <Outlet />
        </main>
      </div>
      {uploading && <BulkUploadDialog onClose={() => setUploading(false)} />}
      {openCandidate && (
        <CandidateCard
          key={openCandidate}
          candidateId={openCandidate}
          onClose={() => setParams((current) => {
            current.delete('candidate');
            return current;
          })}
        />
      )}
    </div>
  );
}
