import { useEffect, useId, useState, type ReactNode } from 'react';
import { Bed, Check, ChevronRight, Dumbbell, Feather, Flame, Gauge, Info, Moon, Plane, Shield, X } from 'lucide-react';
import type { SessionType } from '../engine/model';
import { sessionTone } from '../engine/readiness';
import { RUNES } from '../plan/content';
import type { Tone } from '../plan/types';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

export function Card({ tone, toned, tint, className, children, ...rest }: { tone?: Tone; toned?: boolean; tint?: boolean; className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('card', tone && `t-${tone}`, toned && 'toned', tint && 'tint', className)} {...rest}>
      {children}
    </div>
  );
}

export function Chip({ tone, solid, plain, children, title }: { tone?: Tone; solid?: boolean; plain?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={cx('chip', tone && `t-${tone}`, solid && 'solid', plain && 'plain')} title={title}>
      {children}
    </span>
  );
}

export function Runes() {
  return (
    <div className="runes" aria-hidden="true">
      {RUNES}
    </div>
  );
}

/** Embers drifting up behind the welcome and lock screens. Pure decoration, hidden with reduced motion. */
export function Embers({ n = 16 }: { n?: number }) {
  let seed = 29;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const list = Array.from({ length: n }, () => ({ x: r() * 100, s: 2 + r() * 3.5, d: 7 + r() * 7, w: -r() * 14, drift: (r() - 0.5) * 120 }));
  return (
    <div className="embers" aria-hidden="true">
      {list.map((e, i) => (
        <i key={i} style={{ '--x': `${e.x}%`, '--s': `${e.s}px`, '--d': `${e.d}s`, '--w': `${e.w}s`, '--drift': `${e.drift}px` } as React.CSSProperties} />
      ))}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="section-head">
      <h2 className="h2">
        <span className="sigil" aria-hidden="true">
          <span className="rune">ᛟ</span>
        </span>
        {children}
      </h2>
      <span className="rule" aria-hidden="true" />
      {right}
    </div>
  );
}

const TYPE_ICON: Record<SessionType, typeof Flame> = {
  Full: Flame,
  Moderate: Gauge,
  Light: Feather,
  'Spine-sparing': Shield,
  'Knee-sparing': Shield,
  'Upper only': Dumbbell,
  Recovery: Bed,
  Travel: Plane,
  Rest: Moon,
};
const TONE_WORD: Record<string, string> = { moss: 'Green', gold: 'Amber', ember: 'Red', ash: 'Rest', frost: 'Blue' };

export function TypeIcon({ type, size = 22 }: { type: SessionType; size?: number }) {
  const I = TYPE_ICON[type];
  return <I size={size} strokeWidth={2.2} aria-hidden="true" />;
}

/** Session type: always icon + word + colour, never colour alone. */
export function TypeBadge({ type, reason, score, children }: { type: SessionType; reason?: string; score?: number | null; children?: ReactNode }) {
  const tone = sessionTone(type);
  return (
    <div className={cx('badge', `t-${tone}`)} role="status">
      <div className="ico">
        <TypeIcon type={type} size={24} />
      </div>
      <div className="grow">
        <div className="label" style={{ color: 'var(--tone)' }}>
          {TONE_WORD[tone]}
          {score != null ? ` · Readiness ${score}` : ''}
        </div>
        <div className="word">{type}</div>
        {reason && <div className="why">{reason}</div>}
      </div>
      {children}
    </div>
  );
}

export function TypeChip({ type }: { type: SessionType }) {
  return (
    <Chip tone={sessionTone(type)}>
      <TypeIcon type={type} size={13} /> {type}
    </Chip>
  );
}

export function Tick({ on, tone, label, onChange, disabled }: { on: boolean; tone?: Tone; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" className={cx('tick-wrap', tone && `t-${tone}`)} role="checkbox" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
      <span className={cx('tick', on && 'on')}>
        {on && <Check size={18} strokeWidth={3} />}
        <span className="spark" />
      </span>
    </button>
  );
}

export function Ring({ value, size = 40, stroke = 4, tone = 'moss', label }: { value: number; size?: number; stroke?: number; tone?: Tone; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cx('ring', `t-${tone}`)} style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tone)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} />
      </svg>
      {label != null && <div className="val">{label}</div>}
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, tone, label, wrap }: { value: T | undefined; options: { value: T; label: ReactNode; aria?: string }[]; onChange: (v: T) => void; tone?: Tone; label: string; wrap?: boolean }) {
  return (
    <div className={cx('seg', tone && `t-${tone}`, wrap && 'wrap')} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={value === o.value} aria-label={o.aria} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label, tone }: { on: boolean; onChange: (v: boolean) => void; label: string; tone?: Tone }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={cx('switch', tone && `t-${tone}`)} onClick={() => onChange(!on)} />;
}

export function Toggle({ on, onChange, label, sub, tone }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string; tone?: Tone }) {
  return (
    <div className="toggle">
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {sub && <div className="tiny muted">{sub}</div>}
      </div>
      <Switch on={on} onChange={onChange} label={label} tone={tone} />
    </div>
  );
}

/** A labelled input. Use `group` around buttons: a <label> would name only the first button. */
export function Field({ label, children, group }: { label: string; children: ReactNode; group?: boolean }) {
  if (group)
    return (
      <div className="field">
        <span aria-hidden="true">{label}</span>
        {children}
      </div>
    );
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Number field that keeps what you type and reports a number (or undefined when empty). */
export function NumInput({ value, onChange, unit, step = 'any', placeholder, label, className, min, max }: { value: number | undefined; onChange: (v: number | undefined) => void; unit?: string; step?: string; placeholder?: string; label?: string; className?: string; min?: number; max?: number }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    const parsed = text === '' ? undefined : Number(text.replace(',', '.'));
    if (parsed !== value) setText(value == null ? '' : String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = (
    <input
      className={cx('input', className)}
      inputMode="decimal"
      type="text"
      step={step}
      min={min}
      max={max}
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.,]/g, '');
        setText(t);
        const n = t === '' ? undefined : Number(t.replace(',', '.'));
        if (n === undefined || Number.isFinite(n)) onChange(n);
      }}
    />
  );
  return unit ? (
    <div className="unit-input">
      {input}
      <span className="unit">{unit}</span>
    </div>
  ) : (
    input
  );
}

export function Sheet({ open, title, onClose, children }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="sheet-head">
          <h2 className="h2" id={id}>
            {title}
          </h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** "Why?": the inputs and the rule behind a number, in one or two short lines. */
export function Why({ lines, label = 'Why?' }: { lines: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!lines.length) return null;
  return (
    <div>
      <button type="button" className="link-btn row" aria-expanded={open} onClick={() => setOpen(!open)} style={{ gap: 4 }}>
        <Info size={15} /> {label}
      </button>
      {open && (
        <div className="why-pop">
          <ul>
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Fold({ title, children, open, right }: { title: ReactNode; children: ReactNode; open?: boolean; right?: ReactNode }) {
  return (
    <details className="fold" open={open}>
      <summary>
        <div className="grow">{title}</div>
        {right}
        <ChevronRight className="chev" size={20} />
      </summary>
      {children}
    </details>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="muted small center" style={{ padding: '14px 0' }}>{children}</div>;
}

/** kg | lb switch. Stored values stay in kg; only what is shown and typed changes. */
export function UnitToggle({ unit, onChange, compact }: { unit: 'kg' | 'lb'; onChange: (u: 'kg' | 'lb') => void; compact?: boolean }) {
  return (
    <div className={cx('unit-toggle', compact && 'compact')} role="group" aria-label="Weight unit">
      {(['kg', 'lb'] as const).map((u) => (
        <button key={u} type="button" aria-pressed={unit === u} aria-label={u === 'kg' ? 'Kilograms' : 'Pounds'} onClick={() => unit !== u && onChange(u)}>
          {u}
        </button>
      ))}
    </div>
  );
}
