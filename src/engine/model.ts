import type { ISODate, LiftKey, SessionCode } from '../plan/types';
import type { StandardKey } from '../plan/content';

export type SessionType = 'Full' | 'Moderate' | 'Light' | 'Spine-sparing' | 'Knee-sparing' | 'Upper only' | 'Recovery' | 'Travel' | 'Rest';
export const SESSION_TYPES: SessionType[] = ['Full', 'Moderate', 'Light', 'Spine-sparing', 'Knee-sparing', 'Upper only', 'Recovery', 'Travel'];

export type HrvStatus = 'balanced' | 'unbalanced' | 'low' | 'none';
export type Feel = 'easy' | 'right' | 'hard';
export type Mark = 'clean' | 'hard';

interface Rec {
  id: string;
  updatedAt: number;
  deleted?: boolean;
}

export interface Profile extends Rec {
  id: 'me';
  name: string;
  heightCm?: number;
  birthYear?: number;
  goal: string;
  injuries: string;
  rules: string;
  startDate: ISODate;
  /** Display and entry unit. Everything is stored in kg. */
  units: 'kg' | 'lb';
  pinHash?: string;
  pinSalt?: string;
  dumbbellStep: number;
  /** Dumbbell step in pounds, when units are lb. */
  dumbbellStepLb?: number;
  safetyBar: boolean;
  beltSquat: boolean;
  calibrationResetAt?: ISODate;
}

export interface Checkin {
  sleepMin: number;
  sleepScore: number;
  bodyBattery?: number;
  hrvStatus?: HrvStatus;
  restingHr?: number;
  energy: number;
  stress: number;
  backPain: number;
  kneePain: number;
  /** Pain down the leg, numbness or weakness. */
  radiating?: boolean;
}

export interface ReadinessSnapshot {
  score: number;
  type: SessionType;
  reasons: string[];
  overridden: boolean;
}

export interface DayRecord extends Rec {
  /** The local date. */
  id: ISODate;
  checkin?: Checkin;
  readiness?: ReadinessSnapshot;
  /** Session type chosen by hand, within what pain rules allow. */
  override?: SessionType | null;
  tasks?: Record<string, boolean>;
  steps?: number;
  mobilityMin?: number;
  /** Sets ticked per exercise key. */
  session?: Record<string, number>;
  sessionDone?: boolean;
  /** Session code actually served (after swaps), stored when the session is finished. */
  sessionCode?: SessionCode | null;
  travelMode?: boolean;
  feedback?: { rpe?: number; lifts?: Partial<Record<LiftKey, Feel>> };
  code?: boolean[];
  notes?: string;
}

export type CardioType = 'easy run' | 'incline walk' | 'rower' | 'bike' | 'swim' | 'walk' | 'other';
export const CARDIO_TYPES: CardioType[] = ['easy run', 'incline walk', 'rower', 'bike', 'swim', 'walk', 'other'];

export interface CardioLog extends Rec {
  date: ISODate;
  type: CardioType;
  minutes: number;
  avgHr?: number;
  feel: 'easy' | 'moderate' | 'hard';
}

export interface MaxLog extends Rec {
  date: ISODate;
  lift: LiftKey;
  /** For weighted pull-up variations: the added load. */
  weightKg: number;
  reps: number;
  /** Bodyweight on the day, for weighted pull-up variations. */
  bodyweightKg?: number;
  /** For pull-up variations this is the e1RM of bodyweight plus added load. */
  e1rm: number;
  source: 'test' | 'benchmark';
}

export type BfSource = 'DEXA' | 'scale' | 'other';

export interface BodyLog extends Rec {
  date: ISODate;
  weightKg?: number;
  bodyFatPct?: number;
  bfSource?: BfSource;
  waistCm?: number;
  photoIds?: string[];
}

export interface StandardLog extends Rec {
  date: ISODate;
  standard: StandardKey;
  value: number;
}

export interface WorkingWeight extends Rec {
  date: ISODate;
  /** Displayed exercise name (after rotation and swaps). */
  exercise: string;
  kg: number;
  mark?: Mark | null;
  lift?: LiftKey;
  reps?: number;
  sets?: number;
  /** Logged automatically when the session was finished without editing. */
  assumed?: boolean;
}

export interface Review extends Rec {
  /** Monday of the week. */
  id: ISODate;
  answers: string[];
  stats: Record<string, string | number>;
  suggestion?: string;
}

export interface SeasonScore extends Rec {
  /** `${seasonIndex}:${habitSeasonN}` */
  seasonIndex: number;
  habitSeason: number;
  habit: string;
  score: number;
}

export interface KcalAdjust extends Rec {
  block: string;
  offsetKcal: number;
  date: ISODate;
  reason: string;
  /** The suggestion that produced it, so it is offered only once. */
  sourceId?: string;
}

export type PlanEvent =
  | (Rec & { kind: 'pause'; date: ISODate; days: number })
  | (Rec & { kind: 'reload'; date: ISODate; until: ISODate })
  | (Rec & { kind: 'swap'; date: ISODate; weekStart: ISODate; map: Record<ISODate, SessionCode | null>; reason: string })
  | (Rec & { kind: 'variant'; date: ISODate; slot: 'press' | 'bench' | 'pull' | 'squat'; lift: LiftKey; fromBlock: string })
  | (Rec & { kind: 'liftOffset'; date: ISODate; lift: LiftKey; kg: number; fromBlock: string });

export interface Dismissal extends Rec {
  date: ISODate;
}

export interface Photo extends Rec {
  date: ISODate;
  view: 'front' | 'side' | 'back' | 'other';
  /** JPEG data URL. Included in the backup only when small. */
  dataUrl: string;
  bytes: number;
}

/** Everything the engine reads. Built from the database on each render. */
export interface Data {
  profile: Profile | null;
  days: Map<ISODate, DayRecord>;
  cardio: CardioLog[];
  maxes: MaxLog[];
  body: BodyLog[];
  standards: StandardLog[];
  weights: WorkingWeight[];
  reviews: Review[];
  seasonScores: SeasonScore[];
  kcalAdjust: KcalAdjust[];
  plan: PlanEvent[];
  dismissed: Set<string>;
}

export function emptyData(): Data {
  return {
    profile: null,
    days: new Map(),
    cardio: [],
    maxes: [],
    body: [],
    standards: [],
    weights: [],
    reviews: [],
    seasonScores: [],
    kcalAdjust: [],
    plan: [],
    dismissed: new Set(),
  };
}

export const live = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);
