import { useMemo, useRef, useState } from 'react';
import { diffDays, formatShort, addDays } from '../engine/dates';
import type { Band, Pt } from '../engine/stats';
import type { ISODate, Tone } from '../plan/types';

export interface Series {
  name: string;
  tone: Tone;
  points: Pt[];
  dashed?: boolean;
  dots?: boolean;
  /** Draw only dots, no line. */
  scatter?: boolean;
}

const W = 340;
const M = { l: 34, r: 8, t: 10, b: 20 };
const TONE: Record<Tone, string> = { frost: '#84C6E8', ember: '#E35A35', gold: '#D6AC52', moss: '#93B98D', ash: '#969089' };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

export function LineChart({ series, bands = [], refY, height = 170, unit = '', from, to, format = (v: number) => String(v) }: {
  series: Series[];
  bands?: Band[];
  refY?: { y: number; label: string; tone?: Tone };
  height?: number;
  unit?: string;
  from?: ISODate;
  to?: ISODate;
  format?: (v: number) => string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<ISODate | null>(null);
  const all = series.flatMap((s) => s.points);
  const dom = useMemo(() => {
    if (!all.length && !(from && to)) return null;
    const xs = all.map((p) => p.x).sort();
    const x0 = from ?? xs[0];
    const x1 = to ?? xs[xs.length - 1];
    const ys = all.map((p) => p.y).concat(refY ? [refY.y] : []);
    let y0 = Math.min(...ys);
    let y1 = Math.max(...ys);
    if (!Number.isFinite(y0)) { y0 = 0; y1 = 1; }
    const pad = (y1 - y0) * 0.12 || Math.max(1, Math.abs(y1) * 0.05);
    return { x0, x1, span: Math.max(1, diffDays(x1, x0)), y0: y0 - pad, y1: y1 + pad };
  }, [all, from, to, refY]);
  if (!dom) return <div className="muted small center" style={{ padding: 20 }}>No data yet.</div>;
  const H = height;
  const px = (x: ISODate) => M.l + ((W - M.l - M.r) * diffDays(x, dom.x0)) / dom.span;
  const py = (y: number) => M.t + (H - M.t - M.b) * (1 - (y - dom.y0) / (dom.y1 - dom.y0));
  const ticks = niceTicks(dom.y0, dom.y1);

  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const d = Math.round(((x - M.l) / (W - M.l - M.r)) * dom.span);
    setHover(addDays(dom.x0, Math.max(0, Math.min(dom.span, d))));
  };
  const nearest = (s: Series, x: ISODate) => {
    let best: Pt | null = null;
    let dist = Infinity;
    for (const p of s.points) {
      const dd = Math.abs(diffDays(p.x, x));
      if (dd < dist) { dist = dd; best = p; }
    }
    return best && dist <= Math.max(3, dom.span / 40) ? best : null;
  };

  return (
    <div>
      <svg
        ref={ref}
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={series.map((s) => s.name).join(', ')}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => e.buttons && pick(e.clientX)}
      >
        {bands.map((b, i) => (
          <rect key={i} x={px(b.x0)} y={M.t} width={Math.max(1, px(b.x1) - px(b.x0))} height={H - M.t - M.b} fill={TONE[b.tone]} opacity={0.09} />
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={M.l} x2={W - M.r} y1={py(t)} y2={py(t)} />
            <text x={M.l - 4} y={py(t) + 3} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {refY && (
          <g>
            <line x1={M.l} x2={W - M.r} y1={py(refY.y)} y2={py(refY.y)} stroke={TONE[refY.tone ?? 'gold']} strokeDasharray="4 3" strokeWidth={1.2} />
            <text x={W - M.r} y={py(refY.y) - 3} textAnchor="end" style={{ fill: TONE[refY.tone ?? 'gold'] }}>{refY.label}</text>
          </g>
        )}
        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => (a.x < b.x ? -1 : 1));
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
          return (
            <g key={s.name}>
              {!s.scatter && pts.length > 1 && <path d={d} fill="none" stroke={TONE[s.tone]} strokeWidth={s.dashed ? 1.4 : 2.2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />}
              {(s.dots || s.scatter || pts.length === 1) &&
                pts.map((p) => <circle key={p.x + p.y} cx={px(p.x)} cy={py(p.y)} r={p.tag === 'hard' ? 3.6 : 3} fill={p.tag === 'hard' ? TONE.gold : p.tag === 'benchmark' || p.tag === 'assumed' ? '#0D1013' : TONE[s.tone]} stroke={TONE[s.tone]} strokeWidth={1.4} />)}
            </g>
          );
        })}
        <text x={M.l} y={H - 5}>{formatShort(dom.x0)}</text>
        <text x={W - M.r} y={H - 5} textAnchor="end">{formatShort(dom.x1)}</text>
        {hover && <line x1={px(hover)} x2={px(hover)} y1={M.t} y2={H - M.b} stroke="#EFE6D4" strokeOpacity={0.4} />}
      </svg>
      <div className="chart-tip" aria-live="polite">
        {hover ? (
          <>
            <b>{formatShort(hover)}</b>{' '}
            {series.map((s) => {
              const p = nearest(s, hover);
              return p ? (
                <span key={s.name} style={{ color: TONE[s.tone], marginLeft: 8 }}>
                  {s.name} {format(p.y)}{unit}{p.tag ? ` · ${p.tag}` : ''}
                </span>
              ) : null;
            })}
          </>
        ) : (
          <span className="muted tiny">Tap the chart for values.</span>
        )}
      </div>
      <div className="legend">
        {series.map((s) => (
          <span key={s.name} className={`t-${s.tone}`}>
            <i style={s.dashed ? { background: 'transparent', borderTop: '2px dashed var(--tone)', height: 0 } : undefined} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BarChart({ bars, refY, height = 140, unit = '' }: { bars: { label: string; y: number; tone: Tone }[]; refY?: { y: number; label: string }; height?: number; unit?: string }) {
  const [sel, setSel] = useState<number | null>(null);
  if (!bars.length) return <div className="muted small center" style={{ padding: 20 }}>No data yet.</div>;
  const H = height;
  const max = Math.max(...bars.map((b) => b.y), refY?.y ?? 0) * 1.1 || 1;
  const bw = (W - M.l - M.r) / bars.length;
  const py = (y: number) => M.t + (H - M.t - M.b) * (1 - y / max);
  const ticks = niceTicks(0, max, 3);
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={M.l} x2={W - M.r} y1={py(t)} y2={py(t)} />
            <text x={M.l - 4} y={py(t) + 3} textAnchor="end">{t >= 1000 ? `${t / 1000}k` : t}</text>
          </g>
        ))}
        {bars.map((b, i) => (
          <rect key={i} x={M.l + i * bw + bw * 0.15} y={py(b.y)} width={bw * 0.7} height={Math.max(0, H - M.b - py(b.y))} rx={2} fill={TONE[b.tone]} opacity={sel == null || sel === i ? 0.9 : 0.4} onPointerDown={() => setSel(i)} />
        ))}
        {refY && <line x1={M.l} x2={W - M.r} y1={py(refY.y)} y2={py(refY.y)} stroke={TONE.gold} strokeDasharray="4 3" />}
        <text x={M.l} y={H - 5}>{bars[0].label}</text>
        <text x={W - M.r} y={H - 5} textAnchor="end">{bars[bars.length - 1].label}</text>
      </svg>
      <div className="chart-tip">{sel != null ? <><b>{bars[sel].label}</b> {bars[sel].y.toLocaleString('en-US')}{unit}</> : <span className="muted tiny">Tap a bar for its value.{refY ? ` Line: ${refY.label}.` : ''}</span>}</div>
    </div>
  );
}
