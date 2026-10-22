import { ShieldAlert } from 'lucide-react';
import { Card } from '../../ui/kit';

/** Shown wherever the module gives health guidance. */
export function NotMedical({ small }: { small?: boolean }) {
  if (small) return <div className="tiny muted">Not medical advice. A clinician's restrictions always win.</div>;
  return (
    <Card tone="gold" tint>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <ShieldAlert size={18} color="var(--gold)" style={{ flex: 'none', marginTop: 2 }} />
        <div className="small">Not medical advice. The app never diagnoses. Restrictions from your doctor or physio always override its rules, and red flags mean seek medical care.</div>
      </div>
    </Card>
  );
}
