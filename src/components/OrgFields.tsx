import { departmentOptions, sectionOptions, subsectionOptions } from '../lib/org';
import { useStore } from '../lib/store';
import { Select } from './ui';

export interface OrgPlace {
  unit: string;
  department: string;
  section: string;
  subsection: string;
}

/**
 * Unit, then department, section and subsection, each offering only what sits under the choice before it.
 * Changing a level clears the levels under it that no longer fit.
 */
export function OrgFields({ value, onChange, requireDepartment = false, requireUnit = false }: {
  value: OrgPlace;
  onChange: (value: OrgPlace) => void;
  requireDepartment?: boolean;
  /** For a new recruitment: a unit has to be chosen, and only the company's own list is offered. */
  requireUnit?: boolean;
}) {
  const { settings } = useStore();
  const structure = settings.org_structure ?? [];
  const units = [...new Set([...structure.map((u) => u.code), value.unit].filter(Boolean))];
  const departments = departmentOptions(settings, value.unit, value.department);
  const sections = sectionOptions(structure, value.unit, value.department, value.section);
  const subsections = subsectionOptions(structure, value.unit, value.department, value.section, value.subsection);

  const setUnit = (unit: string) => {
    const fits = departmentOptions(settings, unit).includes(value.department);
    onChange({ unit, department: fits ? value.department : '', section: fits ? value.section : '', subsection: fits ? value.subsection : '' });
  };
  const setDepartment = (department: string) => onChange({ ...value, department, section: '', subsection: '' });
  const setSection = (section: string) => onChange({ ...value, section, subsection: '' });

  return (
    <>
      <Select label="Unit" required={requireUnit} value={value.unit} onChange={(e) => setUnit(e.target.value)} hint={units.length === 0 ? 'Add units under Settings > Units and departments.' : undefined}>
        <option value="">{requireUnit ? 'Choose…' : 'Any unit'}</option>
        {units.map((code) => {
          const name = structure.find((u) => u.code === code)?.name;
          return <option key={code} value={code}>{name && name !== code ? `${code} · ${name}` : code}</option>;
        })}
      </Select>
      <Select label="Department" required={requireDepartment} value={value.department} onChange={(e) => setDepartment(e.target.value)}>
        <option value="">Choose…</option>
        {departments.map((d) => <option key={d}>{d}</option>)}
      </Select>
      <Select label="Section" value={value.section} disabled={sections.length === 0} onChange={(e) => setSection(e.target.value)}>
        <option value="">{sections.length === 0 ? 'No sections' : 'Any section'}</option>
        {sections.map((s) => <option key={s}>{s}</option>)}
      </Select>
      <Select label="Subsection" value={value.subsection} disabled={subsections.length === 0} onChange={(e) => onChange({ ...value, subsection: e.target.value })}>
        <option value="">{subsections.length === 0 ? 'No subsections' : 'Any subsection'}</option>
        {subsections.map((s) => <option key={s}>{s}</option>)}
      </Select>
    </>
  );
}
