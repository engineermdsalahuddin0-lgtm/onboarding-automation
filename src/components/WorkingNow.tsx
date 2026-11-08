import { Circle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { classNames, timeAgo } from '../lib/format';
import { stageOf } from '../lib/pipeline';
import { pageName, usePresence } from '../lib/presence';
import { useStore } from '../lib/store';
import { DESK_LABELS, personName } from '../lib/team';
import { Avatar } from './ui';

/** Who is online right now, and which candidate or page each of them has open. */
export function WorkingNow({ compact = false }: { compact?: boolean }) {
  const { team, candidates, user } = useStore();
  const online = usePresence();
  const [, setParams] = useSearchParams();
  const openCandidate = (id: string) => setParams((current) => {
    current.set('candidate', id);
    return current;
  });
  const people = team
    .filter((p) => p.role !== 'pending')
    .map((person) => ({ person, here: online.find((o) => o.user_id === person.id) }))
    .sort((a, b) => Number(Boolean(b.here)) - Number(Boolean(a.here)));

  return (
    <ul className={classNames('grid gap-2', compact ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3')} aria-label="Who is working now">
      {people.map(({ person, here }) => {
        // The tab with a candidate open says the most; otherwise the most recent one.
        const tab = here?.tabs.find((t) => t.candidate_id) ?? here?.tabs[0];
        const candidate = tab?.candidate_id ? candidates.find((c) => c.id === tab.candidate_id) : undefined;
        return (
          <li key={person.id} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
            <span className="relative shrink-0">
              <Avatar name={personName(person)} size={32} />
              <Circle className={classNames('absolute -right-0.5 -bottom-0.5 size-3 stroke-surface stroke-[3]', here ? 'fill-brand-600' : 'fill-line-strong')} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block truncate font-medium">{personName(person)}{person.id === user?.id ? ' (you)' : ''}</span>
              <span className="block truncate text-xs text-ink-muted">{person.job_title || DESK_LABELS[person.desk]}</span>
              {!here && <span className="mt-0.5 block text-xs text-ink-muted">Offline</span>}
              {here && candidate && (
                <span className="mt-0.5 block text-xs text-ink-soft">
                  Working on{' '}
                  <button type="button" className="font-medium text-ink underline" onClick={() => openCandidate(candidate.id)}>{candidate.full_name}</button>
                  {' · '}{stageOf(candidate).label} · opened {timeAgo(tab?.since)}
                </span>
              )}
              {here && !candidate && tab && (
                <span className="mt-0.5 block text-xs text-ink-soft">Online · on {pageName(tab.path)}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
