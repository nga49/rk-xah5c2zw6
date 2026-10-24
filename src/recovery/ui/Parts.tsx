import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { Data } from '../../engine/model';
import type { ISODate } from '../../plan/types';
import { toast } from '../../state/hooks';
import type { AreaRule } from '../constraints';
import { markSeen, untickFlags } from '../flags';
import { FLAG_LABEL, PHASE_WORD } from '../model';
import { FLAG_TIER, TIER_ADVICE } from '../phases';
import { PHASE_STEPS } from '../plain';

/** Protect › Load › Build › Return, the current step highlighted. */
export function PhaseTrack({ area }: { area: AreaRule }) {
  const at = PHASE_STEPS.indexOf(area.view.confirmed);
  return (
    <div className="phase-track" role="list" aria-label={`Phase: ${PHASE_WORD[area.view.confirmed]}`}>
      {PHASE_STEPS.map((p, i) => (
        <span key={p} role="listitem" className={i < at ? 'done' : i === at ? (area.level === 'stop' ? 'now stop' : 'now') : ''} aria-current={i === at ? 'step' : undefined}>
          {PHASE_WORD[p]}
          {i < PHASE_STEPS.length - 1 && <ChevronRight size={12} aria-hidden="true" />}
        </span>
      ))}
    </div>
  );
}

/** An open warning sign, said plainly, with the two ways out. */
export function FlagBox({ area, date, data }: { area: AreaRule; date: ISODate; data: Data }) {
  const flags = area.view.flags;
  if (!flags.length) return null;
  const order = ['emergency', 'urgent-stop', 'urgent-area', 'soon-area'] as const;
  const tier = flags.map((f) => FLAG_TIER[f]).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  const stopsAll = tier === 'emergency' || tier === 'urgent-stop';
  return (
    <div className="flag-box">
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <AlertTriangle size={18} style={{ color: 'var(--ember)', flexShrink: 0, marginTop: 2 }} />
        <div className="grow small">
          <b>Warning sign: {flags.map((f) => FLAG_LABEL[f]).join('; ')}.</b>
          <div style={{ marginTop: 4 }}>{TIER_ADVICE[tier]}</div>
          <div className="muted" style={{ marginTop: 4 }}>{stopsAll ? 'All training is paused until then.' : `Exercises that load the ${area.name.toLowerCase()} stop until then. The rest of your training carries on.`}</div>
        </div>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn grow" onClick={() => void markSeen(area.injury, date).then(() => toast('Noted: you have been seen'))}>I have been seen</button>
        {!flags.includes('pain-worse-over-days') && <button className="btn grow" onClick={() => void untickFlags(area.injury, date, data).then(() => toast('Tick removed'))}>Ticked by mistake</button>}
      </div>
    </div>
  );
}
