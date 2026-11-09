import { Building2, Check, GitBranch, Layers, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DEFAULT_ORG_STRUCTURE, departmentsToOutline, outlineToDepartments } from '../lib/org';
import { useStore } from '../lib/store';
import type { OrgDepartment, OrgUnit } from '../types';
import { Button, Card, Confirm, errorText, TextArea, TextInput, useToast } from './ui';
import { classNames } from '../lib/format';

/** The departments of one unit as numbered cards: 1. Department, 1.1 Section, 1.1.1 Subsection. */
function StructurePreview({ departments }: { departments: OrgDepartment[] }) {
  if (departments.length === 0) return <p className="py-6 text-center text-sm text-ink-muted">No departments yet. Type them on the left.</p>;
  return (
    <div className="columns-1 gap-3 md:columns-2 xl:columns-3">
      {departments.map((d, di) => (
        <section key={`${d.name}-${di}`} className="mb-3 break-inside-avoid rounded-xl border border-line bg-surface">
          <header className="flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="tabular text-xs text-ink-muted">{di + 1}.</span>
            <Building2 className="size-4 text-brand-700" aria-hidden />
            <h4 className="min-w-0 flex-1 truncate text-sm font-semibold">{d.name}</h4>
            {d.code && <span className="tabular rounded bg-canvas px-1.5 text-[11px] text-ink-soft">{d.code}</span>}
          </header>
          {d.sections.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink-muted italic">No sections</p>
          ) : (
            <ul className="px-3 py-2 text-sm">
              {d.sections.map((s, si) => (
                <li key={`${s.name}-${si}`} className="py-0.5">
                  <span className="flex items-center gap-2">
                    <span className="tabular w-8 text-xs text-ink-muted">{di + 1}.{si + 1}</span>
                    <Layers className="size-3.5 text-sky-700" aria-hidden />
                    {s.name}
                  </span>
                  {s.subsections.length > 0 && (
                    <ul className="ml-6">
                      {s.subsections.map((sub, ui) => (
                        <li key={`${sub}-${ui}`} className="flex items-center gap-2 py-0.5 text-ink-soft">
                          <span className="tabular w-10 text-xs text-ink-muted">{di + 1}.{si + 1}.{ui + 1}</span>
                          <GitBranch className="size-3.5 text-amber-700" aria-hidden />
                          {sub}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * Settings > Units and departments. Each unit's departments are typed as an indented outline, so a whole
 * structure can be pasted or changed in one go, with the cards beside it showing how it reads.
 */
export function OrgStructureEditor() {
  const { settings, saveSettings, isAdmin, requisitions, buckets } = useStore();
  const toast = useToast();
  const saved = settings.org_structure ?? [];
  const [units, setUnits] = useState<OrgUnit[]>(() => structuredClone(saved));
  const [outlines, setOutlines] = useState<Record<string, string>>(() => Object.fromEntries(saved.map((u) => [u.code, departmentsToOutline(u.departments)])));
  const [selected, setSelected] = useState(saved[0]?.code ?? '');
  const [newCode, setNewCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'defaults' | { remove: string } | null>(null);

  const current = units.find((u) => u.code === selected);
  const outline = outlines[selected] ?? '';
  const departments = useMemo(() => outlineToDepartments(outline), [outline]);
  const finalUnits = units.map((u) => ({ ...u, departments: outlineToDepartments(outlines[u.code] ?? '') }));
  const dirty = JSON.stringify(finalUnits) !== JSON.stringify(saved);
  const inUse = (code: string) => requisitions.filter((r) => r.unit === code).length + buckets.filter((b) => b.unit === code).length;

  function load(structure: OrgUnit[]) {
    setUnits(structuredClone(structure));
    setOutlines(Object.fromEntries(structure.map((u) => [u.code, departmentsToOutline(u.departments)])));
    setSelected(structure[0]?.code ?? '');
  }

  function addUnit() {
    const code = newCode.trim().toUpperCase();
    if (!code) return;
    if (units.some((u) => u.code === code)) {
      setSelected(code);
      setNewCode('');
      return;
    }
    setUnits((list) => [...list, { code, name: code, departments: [] }]);
    setOutlines((map) => ({ ...map, [code]: '' }));
    setSelected(code);
    setNewCode('');
  }

  async function save() {
    setBusy(true);
    try {
      await saveSettings({ org_structure: finalUnits });
      toast('Units and departments saved.');
    } catch (error) {
      toast(errorText(error), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-ink-soft">
        Each unit's departments, sections and subsections. Requisitions and CV buckets choose from these, one level after the other, and
        syncing the vacancy status sheet adds any name it uses that is not here yet.
      </p>
      {!isAdmin && <p className="text-sm text-ink-muted">Only an admin can change these.</p>}

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Units">
        {units.map((u) => (
          <button
            key={u.code}
            type="button"
            role="tab"
            aria-selected={u.code === selected}
            onClick={() => setSelected(u.code)}
            className={classNames('rounded-lg border px-3 py-1.5 text-sm font-medium', u.code === selected ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line-strong hover:bg-hover')}
          >
            {u.code}
            <span className="tabular ml-1.5 text-xs font-normal text-ink-muted">{outlineToDepartments(outlines[u.code] ?? '').length}</span>
          </button>
        ))}
        {isAdmin && (
          <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); addUnit(); }}>
            <input aria-label="New unit code" placeholder="New unit, e.g. MGL" value={newCode} onChange={(e) => setNewCode(e.target.value)} maxLength={12} className="h-8 w-36 rounded-lg border border-line-strong bg-surface px-2 text-sm" />
            <Button size="sm" type="submit" icon={Plus} disabled={!newCode.trim()}>Add unit</Button>
          </form>
        )}
        {isAdmin && units.length === 0 && (
          <Button size="sm" variant="primary" icon={RotateCcw} onClick={() => load(DEFAULT_ORG_STRUCTURE)}>Load the starting structure</Button>
        )}
      </div>

      {current ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(18rem,26rem)_1fr]">
          <Card title={`${current.code}: departments`}>
            <div className="space-y-3">
              <TextInput
                label="Full name of the unit"
                hint="Shown beside the code, e.g. in the unit lists."
                disabled={!isAdmin}
                value={current.name}
                onChange={(e) => setUnits((list) => list.map((u) => (u.code === current.code ? { ...u, name: e.target.value } : u)))}
              />
              <TextArea
                label="Departments, sections and subsections"
                hint="One per line. A department starts at the left, with its code in [brackets] if it has one. Indent its sections by two spaces, and their subsections by four."
                rows={22}
                spellCheck={false}
                disabled={!isAdmin}
                value={outline}
                onChange={(e) => setOutlines((map) => ({ ...map, [current.code]: e.target.value }))}
                className="font-mono text-xs! leading-relaxed"
              />
              {isAdmin && (
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirm({ remove: current.code })}>Remove {current.code}</Button>
              )}
            </div>
          </Card>
          <Card title={`How ${current.code} reads`}>
            <StructurePreview departments={departments} />
          </Card>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">
          No units yet. {isAdmin ? 'Add one above, or load the starting structure.' : ''}
        </p>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={Check} loading={busy} disabled={!dirty} onClick={() => void save()}>Save units and departments</Button>
          {dirty && <span className="text-xs font-medium text-amber-900">Not saved yet.</span>}
          {units.length > 0 && <Button variant="ghost" icon={RotateCcw} className="ml-auto" onClick={() => setConfirm('defaults')}>Back to the starting structure</Button>}
        </div>
      )}

      {confirm === 'defaults' && (
        <Confirm
          title="Replace every unit with the starting structure?"
          body="RHL as in the company's chart; CHO, TAL and BGL as named in the July 2026 vacancy sheet; MGL empty. What you typed here is replaced once you save."
          confirmLabel="Replace"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            load(DEFAULT_ORG_STRUCTURE);
            setConfirm(null);
          }}
        />
      )}
      {confirm && confirm !== 'defaults' && (
        <Confirm
          danger
          title={`Remove ${confirm.remove}?`}
          body={inUse(confirm.remove) > 0
            ? `${inUse(confirm.remove)} requisitions and buckets name this unit. They keep the name; it just stops being offered. Saved once you press Save.`
            : 'It stops being offered for new requisitions and buckets once you save.'}
          confirmLabel="Remove"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const code = confirm.remove;
            setUnits((list) => list.filter((u) => u.code !== code));
            setSelected(units.find((u) => u.code !== code)?.code ?? '');
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
