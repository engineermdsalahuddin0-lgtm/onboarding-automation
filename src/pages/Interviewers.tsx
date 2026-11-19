import { CalendarPlus, Copy, Pencil, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AssignInterviewDialog, EditInterviewerDialog, NewInterviewerDialog, type InterviewerPrefill } from '../components/InterviewerDialogs';
import { copyText } from '../components/PipelineDialogs';
import { Avatar, Button, Confirm, EmptyState, errorText, IconButton, PageHeader, StatusBadge, TABLE, Tabs, TD, TH, THEAD, useToast } from '../components/ui';
import { guestLinkUrl, isFilled, STAGE_SHORT, todayBd } from '../lib/assessment';
import { dateDmy } from '../lib/format';
import { useStore } from '../lib/store';
import { personName } from '../lib/team';
import type { Profile } from '../types';

type Tab = 'interviewers' | 'guests' | 'links';

/**
 * Everything about interviewers in one place: their accounts, which interviews they sit on, their forms,
 * the guests who marked through a link, and the guest links themselves.
 */
export function InterviewersPage() {
  const { team, panels, assessments, guestLinks, buckets, isAdmin, canWrite, removeFromPanel, removeGuestLink, updateProfile } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('interviewers');
  const [modal, setModal] = useState<
    | { kind: 'add'; initial?: InterviewerPrefill }
    | { kind: 'edit' | 'assign' | 'remove'; person: Profile }
    | null
  >(null);
  const today = todayBd();

  // Interviewer accounts, and staff who also sit on a panel.
  const people = useMemo(
    () => team
      .filter((p) => p.role === 'interviewer' || ((p.role === 'admin' || p.role === 'hr') && panels.some((m) => m.interviewer_id === p.id)))
      .sort((a, b) => Number(b.role === 'interviewer') - Number(a.role === 'interviewer') || personName(a).localeCompare(personName(b))),
    [team, panels],
  );
  const guests = useMemo(() => {
    const byName = new Map<string, { name: string; designation: string; department: string; forms: number; last: string }>();
    for (const a of assessments.filter((x) => x.marks_by === 'guest' && x.interviewer_name)) {
      const key = a.interviewer_name.toLowerCase();
      const seen = byName.get(key);
      byName.set(key, {
        name: a.interviewer_name,
        designation: seen?.designation || a.interviewer_designation,
        department: seen?.department || a.interviewer_department,
        forms: (seen?.forms ?? 0) + (isFilled(a) ? 1 : 0),
        last: seen && seen.last > a.updated_at ? seen.last : a.updated_at,
      });
    }
    return [...byName.values()].sort((a, b) => b.last.localeCompare(a.last));
  }, [assessments]);
  const bucketName = (id: string) => buckets.find((b) => b.id === id)?.designation ?? 'Removed position';
  const hasAccount = (name: string) => team.some((p) => personName(p).toLowerCase() === name.toLowerCase());

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      toast(done);
    } catch (error) {
      toast(errorText(error), 'bad');
    }
  }

  return (
    <>
      <PageHeader
        title="Interviewers"
        description="Interviewer accounts, the interviews they sit on and the forms they mark. Interviewers sign in and see only their own interviews."
        actions={isAdmin
          ? <Button variant="primary" icon={UserPlus} onClick={() => setModal({ kind: 'add' })}>Add interviewer</Button>
          : <span className="text-xs text-ink-muted">Only an admin adds interviewer accounts.</span>}
      />
      <Tabs<Tab>
        label="Interviewer sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'interviewers', label: 'Interviewers', count: people.length },
          { value: 'guests', label: 'Guest interviewers', count: guests.length },
          { value: 'links', label: 'Guest links', count: guestLinks.filter((l) => l.valid_on >= today).length },
        ]}
      />

      <div className="mt-4">
        {tab === 'interviewers' && (people.length === 0 ? (
          <EmptyState icon={Users} title="No interviewer yet" action={isAdmin ? <Button variant="primary" icon={UserPlus} onClick={() => setModal({ kind: 'add' })}>Add interviewer</Button> : undefined}>
            Add an interviewer account, then assign them to a position's primary or final interview.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th scope="col" className={TH}>Interviewer</th>
                  <th scope="col" className={TH}>Login</th>
                  <th scope="col" className={TH}>Signature</th>
                  <th scope="col" className={TH}>Interviews</th>
                  <th scope="col" className={`${TH} text-right`}>Forms</th>
                  <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const mine = panels.filter((p) => p.interviewer_id === person.id);
                  const forms = assessments.filter((a) => a.interviewer_id === person.id && isFilled(a)).length;
                  return (
                    <tr key={person.id}>
                      <td className={TD}>
                        <div className="flex min-w-52 items-center gap-2.5">
                          <Avatar name={personName(person)} size={32} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{personName(person)}</span>
                            <span className="block truncate text-xs text-ink-muted">{[person.job_title, person.department].filter(Boolean).join(', ') || '—'}</span>
                          </span>
                          {person.role !== 'interviewer' && <StatusBadge tone="info">{person.role === 'admin' ? 'Admin' : 'HR'}</StatusBadge>}
                        </div>
                      </td>
                      <td className={`${TD} text-xs`}>{person.email}</td>
                      <td className={TD}>
                        {person.signature
                          ? <img src={person.signature} alt={`Signature of ${personName(person)}`} className="h-8 rounded border border-line bg-white" />
                          : <StatusBadge tone="neutral">Not saved</StatusBadge>}
                      </td>
                      <td className={TD}>
                        <div className="flex min-w-56 flex-wrap gap-1">
                          {mine.length === 0 && <span className="text-xs text-ink-muted">None yet</span>}
                          {mine.map((m) => (
                            <span key={m.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas py-0.5 pr-1 pl-2.5 text-xs">
                              {bucketName(m.bucket_id)} · {STAGE_SHORT[m.stage]}
                              {canWrite && (
                                <button
                                  type="button"
                                  aria-label={`Take ${personName(person)} off ${bucketName(m.bucket_id)} ${STAGE_SHORT[m.stage]}`}
                                  className="rounded-full p-0.5 text-ink-muted hover:bg-hover hover:text-ink"
                                  onClick={() => void run(() => removeFromPanel(m.id), 'Taken off that interview.')}
                                >
                                  <X className="size-3" aria-hidden />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className={`${TD} tabular text-right`}>{forms}</td>
                      <td className={TD}>
                        <div className="flex justify-end gap-1">
                          {canWrite && <Button size="sm" icon={CalendarPlus} onClick={() => setModal({ kind: 'assign', person })}>Assign</Button>}
                          {isAdmin && <IconButton label={`Edit ${personName(person)}`} icon={Pencil} onClick={() => setModal({ kind: 'edit', person })} />}
                          {isAdmin && person.role === 'interviewer' && (
                            <IconButton label={`Remove ${personName(person)}'s access`} icon={UserMinus} onClick={() => setModal({ kind: 'remove', person })} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {tab === 'guests' && (guests.length === 0 ? (
          <EmptyState icon={Users} title="No guest interviewer yet">
            Guests mark through a link made on a CV bucket's Interview panel, or on the Guest links tab.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th scope="col" className={TH}>Guest</th>
                  <th scope="col" className={`${TH} text-right`}>Forms</th>
                  <th scope="col" className={TH}>Last marked</th>
                  <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.name}>
                    <td className={TD}>
                      <span className="block font-medium">{g.name}</span>
                      <span className="block text-xs text-ink-muted">{[g.designation, g.department].filter(Boolean).join(', ')}</span>
                    </td>
                    <td className={`${TD} tabular text-right`}>{g.forms}</td>
                    <td className={TD}>{dateDmy(g.last)}</td>
                    <td className={`${TD} text-right`}>
                      {hasAccount(g.name)
                        ? <StatusBadge tone="good">Has an account</StatusBadge>
                        : isAdmin && (
                          <Button size="sm" icon={UserPlus} onClick={() => setModal({ kind: 'add', initial: { full_name: g.name, job_title: g.designation, department: g.department } })}>
                            Make an account
                          </Button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {tab === 'links' && (guestLinks.length === 0 ? (
          <EmptyState icon={Users} title="No guest link yet">
            Open a CV bucket and press the Interview panel button to make a link for a guest interviewer.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th scope="col" className={TH}>Position</th>
                  <th scope="col" className={TH}>Interview</th>
                  <th scope="col" className={TH}>Day</th>
                  <th scope="col" className={TH}>Made by</th>
                  <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {guestLinks.map((link) => {
                  const state = link.valid_on === today ? { text: 'Today', tone: 'good' as const } : link.valid_on > today ? { text: 'Upcoming', tone: 'info' as const } : { text: 'Expired', tone: 'neutral' as const };
                  return (
                    <tr key={link.id}>
                      <td className={TD}>{bucketName(link.bucket_id)}</td>
                      <td className={TD}>{STAGE_SHORT[link.stage]}</td>
                      <td className={TD}><span className="tabular">{dateDmy(link.valid_on)}</span> <StatusBadge tone={state.tone}>{state.text}</StatusBadge></td>
                      <td className={TD}>{link.created_by_name || 'HR'}</td>
                      <td className={TD}>
                        <div className="flex justify-end gap-1">
                          {link.valid_on >= today && (
                            <Button size="sm" icon={Copy} onClick={() => void copyText(guestLinkUrl(link.token)).then(() => toast('Guest link copied.'))}>Copy link</Button>
                          )}
                          {canWrite && <IconButton label="Delete this link" icon={Trash2} onClick={() => void run(() => removeGuestLink(link.id), 'Link deleted. It no longer works.')} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {modal?.kind === 'add' && <NewInterviewerDialog initial={modal.initial} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <EditInterviewerDialog person={modal.person} onClose={() => setModal(null)} />}
      {modal?.kind === 'assign' && <AssignInterviewDialog person={modal.person} onClose={() => setModal(null)} />}
      {modal?.kind === 'remove' && (
        <Confirm
          title={`Remove ${personName(modal.person)}'s access?`}
          body="They can no longer sign in to mark interviews, and are taken off every panel. The forms they already marked stay. You can give access back under Settings > Team."
          confirmLabel="Remove access"
          danger
          onCancel={() => setModal(null)}
          onConfirm={async () => {
            const person = modal.person;
            await run(async () => {
              for (const m of panels.filter((p) => p.interviewer_id === person.id)) await removeFromPanel(m.id);
              await updateProfile(person.id, { role: 'pending' });
            }, `${personName(person)} can no longer sign in to mark interviews.`);
            setModal(null);
          }}
        />
      )}
    </>
  );
}
