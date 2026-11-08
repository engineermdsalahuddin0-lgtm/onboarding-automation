import { Bell, BellRing, CheckCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { classNames, dateTime } from '../lib/format';
import { useStore } from '../lib/store';
import { COMPLETES_PROCESS, notificationLink, notificationText } from '../lib/team';
import type { AppNotification } from '../types';
import { Button, useToast } from './ui';

const TONE_DOT: Record<'info' | 'good' | 'bad', string> = {
  info: 'bg-brand-600',
  good: 'bg-emerald-600',
  bad: 'bg-red-700',
};

const desktopAlertsSupported = typeof window !== 'undefined' && 'Notification' in window;

/** Pops a new update up as a toast, and as a desktop alert when the tab is in the background and alerts are on. */
function useArrivals(notifications: AppNotification[], ready: boolean) {
  const toast = useToast();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!ready) return;
    // A merged line ("3 new CVs") comes back with the same id and a newer time: that is news too.
    const key = (n: AppNotification) => `${n.id}:${n.created_at}`;
    // The first list after sign-in is history, not news.
    if (seen.current === null) {
      seen.current = new Set(notifications.map(key));
      return;
    }
    const fresh = notifications.filter((n) => !n.read_at && !seen.current!.has(key(n)));
    for (const n of notifications) seen.current.add(key(n));
    for (const n of fresh.slice(0, 3)) {
      const { title, detail } = notificationText(n);
      toast(`${title}${detail ? ` · ${detail}` : ''}`);
      if (desktopAlertsSupported && Notification.permission === 'granted' && document.hidden) {
        new Notification(title, { body: detail, tag: n.id });
      }
    }
  }, [notifications, ready, toast]);
}

export function NotificationBell() {
  const { notifications, markNotificationsRead, dataReady } = useStore();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(desktopAlertsSupported ? Notification.permission : 'denied');
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const unread = notifications.filter((n) => !n.read_at).length;
  useArrivals(notifications, dataReady);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function follow(n: AppNotification) {
    void markNotificationsRead([n.id]);
    setOpen(false);
    const link = notificationLink(n);
    if (link.candidate) {
      setParams((current) => {
        current.set('candidate', link.candidate!);
        return current;
      });
    } else if (link.pathname) {
      navigate(link.pathname);
    }
  }

  return (
    <div ref={box} className="relative" onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}>
      <button
        type="button"
        aria-label={unread ? `Updates, ${unread} unread` : 'Updates'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="relative flex size-9 items-center justify-center rounded-lg text-ink-soft hover:bg-hover hover:text-ink"
      >
        {unread ? <BellRing className="size-[18px]" aria-hidden /> : <Bell className="size-[18px]" aria-hidden />}
        {unread > 0 && (
          <span className="tabular absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-700 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Updates" className="absolute right-0 z-40 mt-1 flex max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <p className="text-sm font-semibold">Updates{unread ? ` · ${unread} unread` : ''}</p>
            {unread > 0 && <Button size="sm" variant="ghost" icon={CheckCheck} onClick={() => void markNotificationsRead()}>Mark all read</Button>}
          </div>
          <ul className="flex-1 overflow-y-auto">
            {notifications.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">No updates yet. New CVs, handovers and finished steps appear here.</li>}
            {notifications.map((n) => {
              const { title, detail, tone } = notificationText(n);
              return (
                <li key={n.id} className="border-b border-line last:border-0">
                  <button type="button" onClick={() => follow(n)} className={classNames('flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-hover', !n.read_at && 'bg-brand-50/60')}>
                    <span className={classNames('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : TONE_DOT[tone])} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={classNames('block text-sm', !n.read_at && 'font-semibold')}>{title}</span>
                      {detail && <span className="block truncate text-xs text-ink-soft" title={detail}>{detail}</span>}
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-muted">
                        {dateTime(n.created_at)}
                        {COMPLETES_PROCESS.includes(n.event) && <span className="rounded bg-emerald-100 px-1.5 font-medium text-emerald-900">Process complete</span>}
                        {!n.read_at && <span className="sr-only">Unread</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {desktopAlertsSupported && permission !== 'granted' && (
            <div className="border-t border-line px-3 py-2 text-xs text-ink-soft">
              {permission === 'denied'
                ? 'Desktop alerts are blocked for this site in the browser settings.'
                : <button type="button" className="font-medium underline" onClick={() => void Notification.requestPermission().then(setPermission)}>Turn on desktop alerts</button>}
              {permission !== 'denied' && ' to hear about updates while this tab is in the background.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
