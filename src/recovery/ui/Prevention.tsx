import { Activity } from 'lucide-react';
import type { Data } from '../../engine/model';
import type { ISODate } from '../../plan/types';
import { Card, SectionTitle } from '../../ui/kit';
import { beforeText, loadSpikes, patterns, warmupLine } from '../prevention';
import { BodyMap } from './BodyMap';

function LoadCheck({ data, date }: { data: Data; date: ISODate }) {
  const spikes = loadSpikes(date, data);
  const warm = warmupLine(date, data);
  return (
    <Card>
      <div className="row" style={{ gap: 8 }}><Activity size={16} style={{ color: 'var(--gold)' }} /><span className="label">Load check</span></div>
      {spikes.length ? (
        <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>{spikes.map((s) => <li key={s.what}>{s.text}</li>)}</ul>
      ) : (
        <div className="small muted" style={{ marginTop: 6 }}>No big week-to-week jumps in sets or lift loads.</div>
      )}
      {warm && <div className="small" style={{ marginTop: 6 }}>{warm}</div>}
      <div className="tiny muted" style={{ marginTop: 8 }}>Prompts to review, not injury predictions: research on training-load ratios is debated.</div>
    </Card>
  );
}

function Patterns({ data }: { data: Data }) {
  const p = patterns(data);
  if (!p.before.length) return null;
  return (
    <Card>
      <div className="label">Injury patterns</div>
      {p.recurring.length > 0 && <div className="small" style={{ marginTop: 6 }}>Recurring: {p.recurring.map((r) => `${r.label} (${r.count})`).join(', ')}.</div>}
      <div className="small muted" style={{ marginTop: 6 }}>The week before each injury:</div>
      <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{p.before.slice(0, 6).map((b) => <li key={b.injury.id}>{beforeText(b)}</li>)}</ul>
      <div className="tiny muted" style={{ marginTop: 8 }}>Patterns, not causes. Many things play a part.</div>
    </Card>
  );
}

/** Recover screen: body map, load jumps, warm-ups and injury patterns. Prompts and patterns, never conclusions. */
export function PreventionSection({ data, date }: { data: Data; date: ISODate }) {
  return (
    <section className="section" aria-label="Prevention">
      <SectionTitle>Prevention</SectionTitle>
      <BodyMap data={data} date={date} />
      <LoadCheck data={data} date={date} />
      <Patterns data={data} />
    </section>
  );
}
