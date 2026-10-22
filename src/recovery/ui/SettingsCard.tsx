import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { go, toast } from '../../state/hooks';
import { Card, SectionTitle, Toggle } from '../../ui/kit';
import { saveSettings } from '../actions';
import { readSettings } from '../store';

/** The feature flag. Off gives the original app exactly. */
export function RecoverySettingsCard() {
  const s = useLiveQuery(() => readSettings(), []);
  const on = s?.enabled === true;
  return (
    <section className="section">
      <SectionTitle>Injury and recovery</SectionTitle>
      <Card>
        <Toggle
          on={on}
          onChange={(v) => void saveSettings({ enabled: v }).then(() => toast(v ? 'Recovery module on' : 'Recovery module off: the original plan'))}
          label="Injury and recovery module"
          sub="Goal Guardian, injury log, wellness. Off gives the original plan exactly."
        />
        {on && (
          <>
            <Toggle on={s?.checkinPrompt !== 'off'} onChange={(v) => void saveSettings({ checkinPrompt: v ? 'whileActive' : 'off' })} label="Daily injury check-in prompt" sub="Asked every day while an injury is active." />
            <Toggle on={s?.adaptLabel !== false} onChange={(v) => void saveSettings({ adaptLabel: v })} label="Honest session label" sub="The badge shows the adapted type, for example Upper only." />
            <Toggle on={s?.smartTravel === true} onChange={(v) => void saveSettings({ smartTravel: v })} label="Smart travel" sub="Yoke-first travel kits, trips, return ramp. Off keeps travel mode as it was." />
            <button className="btn block" style={{ marginTop: 8 }} onClick={() => go('recover')}>Open Recover <ChevronRight size={16} /></button>
          </>
        )}
      </Card>
    </section>
  );
}
