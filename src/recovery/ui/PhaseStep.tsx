import { useState } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import type { ISODate } from '../../plan/types';
import { toast } from '../../state/hooks';
import { saveRecord } from '../actions';
import type { AreaRule } from '../constraints';
import { PHASE_WORD } from '../model';

/** Today's effective phase, and the suggested step up with a one-tap confirm. The app never moves up on its own. */
export function PhaseStep({ area, date }: { area: AreaRule; date: ISODate }) {
  const [clinician, setClinician] = useState(false);
  const v = area.view;
  const s = v.suggestion;
  const held = area.level !== 'stop' && area.level !== v.confirmed;
  const confirm = async () => {
    const by = s?.needsClinician ? 'clinician' : 'owner';
    if (!s) return;
    if (s.to === 'cleared') await saveRecord<'injuryEvent'>({ kind: 'injuryEvent', injuryId: area.injury.id, date, event: 'cleared', status: 'cleared', by, basis: s.basis });
    else await saveRecord<'injuryEvent'>({ kind: 'injuryEvent', injuryId: area.injury.id, date, event: 'phase', phase: s.to, by, clearedLoading: s.needsClinician ? true : undefined, basis: s.basis });
    toast(s.to === 'cleared' ? 'Marked as cleared' : `${PHASE_WORD[s.to]} phase from today`);
  };
  return (
    <>
      {held && <div className="small" style={{ color: 'var(--gold)', marginTop: 8 }}>Today: {PHASE_WORD[area.level as keyof typeof PHASE_WORD]}. {v.why.at(-1)}</div>}
      {s && (
        <div className="stack tight" style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 6 }}><ArrowUpCircle size={16} style={{ color: 'var(--moss)' }} /><span className="small" style={{ fontWeight: 700 }}>Ready for {s.to === 'cleared' ? 'full clearance' : PHASE_WORD[s.to]}?</span></div>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{s.basis.map((b) => <li key={b}>{b}</li>)}</ul>
          {s.needsClinician && (
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={clinician} onChange={(e) => setClinician(e.target.checked)} />
              {s.needsClinician}: a clinician gave the go-ahead
            </label>
          )}
          <button className="btn block" disabled={!!s.needsClinician && !clinician} onClick={() => void confirm()}>
            {s.to === 'cleared' ? 'Mark as cleared' : `Move to ${PHASE_WORD[s.to]}`}
          </button>
        </div>
      )}
    </>
  );
}
