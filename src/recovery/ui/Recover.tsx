import { useEffect, useRef } from 'react';
import type { ScreenProps } from '../../App';
import { Runes } from '../../ui/kit';
import { SlotBoundary } from './Boundary';
import { GoalPanel } from './Goal';
import { InjuryForm } from './InjuryForm';
import { InjuryCheckinSheet, InjuryList } from './Injuries';
import { NotMedical } from './NotMedical';
import { WellnessSection, WellnessSheet } from './Wellness';
import { PreventionSection } from './Prevention';
import { RetestSection } from './Retest';
import { GymsTripsSection } from './GymsTrips';

/** The module's own screen at #/recover (no extra tab). Sub-routes: injury/<id|new>, checkin/<id>, wellness, fatigue, goal. */
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
        <InjuryForm key={route[2]} data={data} date={view.date} id={route[2] === 'new' ? undefined : route[2]} />
      </SlotBoundary>
    );
  }
  return (
    <div className="stack">
      <NotMedical />
      <SlotBoundary label="Injuries">
        <InjuryList data={data} date={view.date} />
      </SlotBoundary>
      <SlotBoundary label="Retest">
        <RetestSection data={data} date={view.date} />
      </SlotBoundary>
      <div ref={wellRef}>
        <SlotBoundary label="Wellness">
          <WellnessSection data={data} date={view.date} />
        </SlotBoundary>
      </div>
      <div ref={goalRef}>
        <SlotBoundary label="Goal Guardian">
          <GoalPanel data={data} date={view.date} />
        </SlotBoundary>
      </div>
      <SlotBoundary label="Prevention">
        <PreventionSection data={data} date={view.date} />
      </SlotBoundary>
      <SlotBoundary label="Gyms and travel">
        <GymsTripsSection data={data} date={view.date} />
      </SlotBoundary>
      <a className="btn block ghost" href="#/today">Back to Today</a>
      <Runes />
      <InjuryCheckinSheet data={data} date={view.date} injuryId={route[1] === 'checkin' ? route[2] : undefined} />
      <WellnessSheet data={data} date={view.date} open={route[1] === 'wellness'} />
    </div>
  );
}
