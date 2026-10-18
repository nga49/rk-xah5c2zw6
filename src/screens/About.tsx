import { EVIDENCE } from '../plan/content';
import { Card, Runes, SectionTitle } from '../ui/kit';

export function About() {
  return (
    <div className="stack">
      <SectionTitle>Why these numbers</SectionTitle>
      <Card>
        <ol className="small" style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {EVIDENCE.map((e) => (
            <li key={e.source}>
              <b>{e.claim}</b> <span className="muted">{e.source}</span>
            </li>
          ))}
        </ol>
      </Card>
      <Card tone="gold" tint>
        <div className="small">A model, not a promise. Every year's DEXA scan resets it. Rates of muscle gain for experienced lifters are coaching estimates, not trial results. The habit seasons are a design built on habit research, not a tested program.</div>
      </Card>
      <Card tone="ember" tint>
        <div className="small">Not medical advice. Your doctor and osteopath cleared heavy lifting: run changes past them.</div>
      </Card>
      <a className="btn block" href="#/mind">Back to Mind</a>
      <Runes />
    </div>
  );
}
