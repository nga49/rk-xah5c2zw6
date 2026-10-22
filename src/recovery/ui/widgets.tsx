// Small form pieces for the module, built from the existing kit so they look native.
import type { ReactNode } from 'react';
import { Field, Seg } from '../../ui/kit';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** 0 to 10, coloured like the existing pain scales: 5+ red, 3+ amber, else green. */
export function PainSeg({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number) => void }) {
  const v = value ?? 0;
  return (
    <Field group label={`${label}${value != null ? ` · ${value}` : ''}`}>
      <Seg label={`${label}, 0 to 10`} tone={v >= 5 ? 'ember' : v >= 3 ? 'gold' : 'moss'} wrap value={value} onChange={onChange} options={range(0, 10).map((n) => ({ value: n, label: n }))} />
    </Field>
  );
}

export function Scale5({ label, value, onChange, tone = 'frost' }: { label: string; value: number | undefined; onChange: (v: 1 | 2 | 3 | 4 | 5) => void; tone?: 'frost' | 'moss' | 'gold' }) {
  return (
    <Field group label={label}>
      <Seg label={`${label}, 1 to 5`} tone={tone} value={value} onChange={(v) => onChange(v as 1 | 2 | 3 | 4 | 5)} options={range(1, 5).map((n) => ({ value: n, label: n }))} />
    </Field>
  );
}

/** Yes, no or not tried, for a functional test. */
export function TriTest({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  const cur = value === true ? 'yes' : value === false ? 'no' : 'na';
  return (
    <div className="stack tight">
      <span className="small" style={{ fontWeight: 600 }}>{label}</span>
      <Seg label={label} tone={value === false ? 'ember' : 'moss'} value={cur} onChange={(v) => onChange(v === 'yes' ? true : v === 'no' ? false : undefined)} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'na', label: 'Not tried' }]} />
    </div>
  );
}

/** Multi-select as 44 px toggle buttons (chips are too small to tap). */
export function Picks<T extends string>({ label, options, value, onChange, tone }: { label: string; options: { value: T; label: ReactNode }[]; value: T[]; onChange: (v: T[]) => void; tone?: 'ember' | 'gold' | 'frost' }) {
  return (
    <div className={`picks${tone ? ` t-${tone}` : ''}`} role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function DateInput({ label, value, onChange, max }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; max?: string }) {
  return (
    <Field label={label}>
      <input className="input" type="date" value={value ?? ''} max={max} onChange={(e) => onChange(e.target.value || undefined)} />
    </Field>
  );
}
