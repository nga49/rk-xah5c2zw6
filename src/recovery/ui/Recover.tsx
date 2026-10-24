import { useEffect, useRef } from 'react';
import type { ScreenProps } from '../../App';
import { Fold, Runes } from '../../ui/kit';
import { SlotBoundary } from './Boundary';
import { GoalPanel, ProgramImpact } from './Goal';
import { InjuryForm } from './InjuryForm';
import { InjuryCheckinSheet, InjuryList } from './Injuries';
import { LogWizard } from './LogWizard';
import { NotMedical } from './NotMedical';
import { WellnessSection, WellnessSheet } from './Wellness';
import { PreventionSection } from './Prevention';
import { RetestSection } from './Retest';
import { GymsTripsSection } from './GymsTrips';
import { MindBodySection } from './MindBody';

function HowItWorks({ open }: { open: boolean }) {
  return (
    <Fold title={<span className="label">How it works</span>} open={open}>
      <ol className="small steps-list">
        <li><b>Log it once</b>, the day it happens: "Log injury" on Today. About a minute.</li>
        <li><b>Check in each morning</b>: 30 seconds, from the button on Today.</li>
        <li><b>Train what Today shows.</b> Exercises that load the injury are paused or swapped; the rest of the plan carries on and spare sets go to your yoke.</li>
        <li><b>Move up when ready.</b> When your check-ins allow, the app offers the next phase and you confirm. A bad day steps back on its own.</li>
        <li><b>After a clinician visit</b>, tap Edit on the injury to add the diagnosis, restrictions or physio exercises. They always win over the app.</li>
      </ol>
    </Fold>
  );
}

/** The module's own screen at #/recover. Sub-routes: injury/<id|new|full>, checkin/<id>, wellness, fatigue, goal. */
export function Recover({ data, view, route }: ScreenProps) {
  const goalRef = useRef<HTMLDivElement>(null);
  const wellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (route[1] === 'goal') goalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (route[1] === 'fatigue') wellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [route]);
  if (route[1] === 'injury') {
    return (
      <SlotBoundary label="Injury form">
        {route[2] === 'new' ? <LogWizard data={data} date={view.date} /> : <InjuryForm key={route[2]} data={data} date={view.date} id={route[2] === 'full' ? undefined : route[2]} />}
      </SlotBoundary>
    );
  }
  const anyCheckins = (data.recovery?.checkins.length ?? 0) > 0;
  return (
    <div className="stack">
      <NotMedical small />
      <HowItWorks open={!anyCheckins} />
      <SlotBoundary label="Injuries">
        <InjuryList data={data} date={view.date} />
      </SlotBoundary>
      <SlotBoundary label="Program impact">
        <ProgramImpact data={data} date={view.date} />
      </SlotBoundary>
      <div ref={wellRef}>
        <SlotBoundary label="Wellness">
          <WellnessSection data={data} date={view.date} />
        </SlotBoundary>
      </div>
      <div ref={goalRef}>
        <Fold title={<span className="label">More tools · goal details, retest, body map, travel, nutrition</span>} open={route[1] === 'goal'}>
          <div className="stack">
            <SlotBoundary label="Goal Guardian">
              <GoalPanel data={data} date={view.date} />
            </SlotBoundary>
            <SlotBoundary label="Retest">
              <RetestSection data={data} date={view.date} />
            </SlotBoundary>
            <SlotBoundary label="Mind and body">
              <MindBodySection data={data} date={view.date} />
            </SlotBoundary>
            <SlotBoundary label="Prevention">
              <PreventionSection data={data} date={view.date} />
            </SlotBoundary>
            <SlotBoundary label="Gyms and travel">
              <GymsTripsSection data={data} date={view.date} />
            </SlotBoundary>
          </div>
        </Fold>
      </div>
      <a className="btn block ghost" href="#/today">Back to Today</a>
      <Runes />
      <InjuryCheckinSheet data={data} date={view.date} injuryId={route[1] === 'checkin' ? route[2] : undefined} />
      <WellnessSheet data={data} date={view.date} open={route[1] === 'wellness'} />
    </div>
  );
}
