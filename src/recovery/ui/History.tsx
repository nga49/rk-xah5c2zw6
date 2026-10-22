import type { Data } from '../../engine/model';
import { formatMedium } from '../../engine/dates';
import type { ISODate } from '../../plan/types';
import { LineChart, type Series } from '../../ui/charts';
import { Card } from '../../ui/kit';
import { PHASE_WORD, STATUS_LABEL } from '../model';
import { checkinsFor, eventsFor, type InjuryEvent } from '../state';

function eventText(e: InjuryEvent): string {
  const who = e.by === 'clinician' ? 'clinician' : e.by === 'engine' ? 'app' : 'you';
  if (e.event === 'phase' && e.phase) return `${PHASE_WORD[e.phase]} phase (${who})`;
  if (e.event === 'status' && e.status) return `Status: ${STATUS_LABEL[e.status]} (${who})`;
  if (e.event === 'assessed') return `Assessed (${who})`;
  if (e.event === 'cleared') return `Cleared (${who})`;
  if (e.event === 'restriction') return `Restriction (${who})`;
  return e.event;
}

/** Phase history from the event log, and the check-in pain trend on a fixed 0 to 10 scale. */
export function InjuryHistory({ data, date, injuryId }: { data: Data; date: ISODate; injuryId: string }) {
  const events = eventsFor(injuryId, data, date);
  const checks = checkinsFor(injuryId, data, date);
  const line = (name: string, tone: Series['tone'], pick: (c: (typeof checks)[number]) => number | undefined, dashed?: boolean): Series => ({
    name, tone, dashed, dots: true,
    points: checks.filter((c) => pick(c) != null).map((c) => ({ x: c.date, y: pick(c) as number })),
  });
  const series = [line('Rest', 'frost', (c) => c.painRest), line('Walking', 'moss', (c) => c.painWalk), line('Session', 'ember', (c) => c.painSession), line('Morning', 'gold', (c) => c.painMorning, true)].filter((s) => s.points.length);
  return (
    <Card>
      <div className="label">History</div>
      <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
        {events.map((e) => (
          <li key={e.id}><span className="muted">{formatMedium(e.date)}</span> · {eventText(e)}{e.note ? `: ${e.note}` : ''}</li>
        ))}
        {!events.length && <li className="muted">Protect phase from the start date (default).</li>}
      </ol>
      <div className="label" style={{ marginTop: 12 }}>Pain trend</div>
      {series.length ? (
        <LineChart series={series} yDomain={[0, 10]} refY={{ y: 3, label: 'Pain rule 3/10', tone: 'gold' }} format={(v) => String(v)} unit="/10" />
      ) : (
        <div className="small muted" style={{ marginTop: 6 }}>Daily check-ins draw the trend here.</div>
      )}
    </Card>
  );
}
