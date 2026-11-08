import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { backend, type PresenceEntry } from './backend';

// Who is online and what they have open, shared between everyone signed in. Each tab says which page it is on
// and which candidate card it has open; nothing else leaves the browser.

export interface OnlinePerson {
  user_id: string;
  /** Everything this person has open, one entry per tab, the most recent first. */
  tabs: PresenceEntry[];
}

const PresenceContext = createContext<OnlinePerson[]>([]);

export const usePresence = () => useContext(PresenceContext);

export function PresenceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [entries, setEntries] = useState<PresenceEntry[]>([]);
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const candidateId = params.get('candidate');
  const tab = useRef(crypto.randomUUID()).current;
  const link = useRef<ReturnType<typeof backend.presence> | null>(null);

  useEffect(() => {
    const connection = backend.presence(setEntries);
    link.current = connection;
    return () => {
      connection.stop();
      link.current = null;
    };
  }, []);

  useEffect(() => {
    link.current?.update({ tab, user_id: userId, path: pathname, candidate_id: candidateId, since: new Date().toISOString() });
  }, [tab, userId, pathname, candidateId]);

  const people = useMemo(() => {
    const byUser = new Map<string, PresenceEntry[]>();
    for (const entry of entries) byUser.set(entry.user_id, [...(byUser.get(entry.user_id) ?? []), entry]);
    return [...byUser].map(([user_id, tabs]) => ({ user_id, tabs: tabs.sort((a, b) => b.since.localeCompare(a.since)) }));
  }, [entries]);

  return <PresenceContext.Provider value={people}>{children}</PresenceContext.Provider>;
}

const PAGE_NAMES: [RegExp, string][] = [
  [/^\/$/, 'Dashboard'],
  [/^\/requisitions/, 'Requisitions'],
  [/^\/buckets\/.+/, 'a CV bucket'],
  [/^\/buckets/, 'CV Buckets'],
  [/^\/selected/, 'Selected'],
  [/^\/reviews/, 'Candidate Reviews'],
  [/^\/questions/, 'Question library'],
  [/^\/activity/, 'Team activity'],
  [/^\/settings/, 'Settings'],
];

export function pageName(path: string): string {
  return PAGE_NAMES.find(([pattern]) => pattern.test(path))?.[1] ?? 'the app';
}
