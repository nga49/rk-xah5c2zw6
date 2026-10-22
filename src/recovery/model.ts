// Injury, recovery and wellness module: record shapes. Generic anatomy and movement words only.
// Everything personal is typed in on the phone and stored on-device and in the private backup.
import type { ISODate, LiftKey } from '../plan/types';

/** Same base shape as the original records: string id, last write time, soft delete. */
export interface ModRec {
  id: string;
  updatedAt: number;
  deleted?: boolean;
}

export const REGIONS = [
  'neck', 'shoulder', 'upper-arm', 'elbow', 'forearm', 'wrist-hand', 'chest', 'upper-back', 'lower-back', 'abdomen',
  'hip', 'groin', 'glute', 'quad', 'hamstring', 'adductor', 'knee', 'calf', 'shin', 'ankle-foot', 'other',
] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_LABEL: Record<Region, string> = {
  neck: 'Neck', shoulder: 'Shoulder', 'upper-arm': 'Upper arm', elbow: 'Elbow', forearm: 'Forearm', 'wrist-hand': 'Wrist or hand',
  chest: 'Chest', 'upper-back': 'Upper back', 'lower-back': 'Lower back', abdomen: 'Abdomen', hip: 'Hip', groin: 'Groin', glute: 'Glute',
  quad: 'Quad', hamstring: 'Hamstring', adductor: 'Adductor', knee: 'Knee', calf: 'Calf', shin: 'Shin', 'ankle-foot': 'Ankle or foot', other: 'Other',
};

/** Regions on a leg: used for leg-day labels, walking and travel prompts. */
export const LOWER_LIMB: Region[] = ['hip', 'groin', 'glute', 'quad', 'hamstring', 'adductor', 'knee', 'calf', 'shin', 'ankle-foot'];

export type Side = 'left' | 'right' | 'both' | 'midline';
export const SIDES: Side[] = ['left', 'right', 'both', 'midline'];

export type InjuryType = 'muscle' | 'tendon' | 'ligament' | 'joint' | 'nerve' | 'bone' | 'post-surgery' | 'unknown';
export const INJURY_TYPES: InjuryType[] = ['muscle', 'tendon', 'ligament', 'joint', 'nerve', 'bone', 'post-surgery', 'unknown'];
export const TYPE_LABEL: Record<InjuryType, string> = {
  muscle: 'Muscle strain or tear', tendon: 'Tendon', ligament: 'Ligament or sprain', joint: 'Joint', nerve: 'Nerve', bone: 'Bone', 'post-surgery': 'After surgery', unknown: 'Unknown',
};

export type InjuryStatus = 'acute' | 'rehab' | 'return' | 'cleared' | 'relapsed';
export const STATUS_LABEL: Record<InjuryStatus, string> = { acute: 'Acute', rehab: 'Rehab', return: 'Return to training', cleared: 'Cleared', relapsed: 'Relapsed' };

/** Recovery phases (brief, Phase 3). Symptoms drive them; days are only minimum floors. */
export type Phase = 'protect' | 'load' | 'build' | 'return';
export const PHASES: Phase[] = ['protect', 'load', 'build', 'return'];
export const PHASE_WORD: Record<Phase, string> = { protect: 'Protect', load: 'Load', build: 'Build', return: 'Return' };

/** Movement demands an exercise can make. Clinician restrictions block these. */
export const MOVEMENTS = [
  'squat', 'hinge', 'lunge', 'knee-extension', 'knee-flexion', 'hip-flexion', 'hip-extension', 'hip-adduction', 'calf-raise',
  'horizontal-press', 'vertical-press', 'overhead', 'horizontal-pull', 'vertical-pull', 'shrug', 'carry', 'grip',
  'elbow-flexion', 'elbow-extension', 'spinal-load', 'spinal-flexion', 'neck', 'impact', 'running', 'loaded-walking',
] as const;
export type Movement = (typeof MOVEMENTS)[number];
export const MOVEMENT_LABEL: Record<Movement, string> = {
  squat: 'Squat', hinge: 'Hinge', lunge: 'Lunge or split squat', 'knee-extension': 'Knee extension', 'knee-flexion': 'Knee flexion', 'hip-flexion': 'Hip flexion',
  'hip-extension': 'Hip extension', 'hip-adduction': 'Hip adduction', 'calf-raise': 'Calf raise', 'horizontal-press': 'Horizontal press', 'vertical-press': 'Vertical press',
  overhead: 'Overhead', 'horizontal-pull': 'Horizontal pull', 'vertical-pull': 'Vertical pull', shrug: 'Shrug', carry: 'Carry', grip: 'Heavy grip',
  'elbow-flexion': 'Elbow flexion', 'elbow-extension': 'Elbow extension', 'spinal-load': 'Load on the spine', 'spinal-flexion': 'Loaded spinal flexion', neck: 'Neck work',
  impact: 'Impact or jumping', running: 'Running', 'loaded-walking': 'Loaded walking',
};

export type FunctionalTest = 'straight-leg-raise' | 'full-weight-bearing' | 'pain-free-walk' | 'full-knee-extension' | 'full-range';
export const FUNCTIONAL_TESTS: FunctionalTest[] = ['straight-leg-raise', 'full-weight-bearing', 'pain-free-walk', 'full-knee-extension', 'full-range'];
export const TEST_LABEL: Record<FunctionalTest, string> = {
  'straight-leg-raise': 'Straight leg raise', 'full-weight-bearing': 'Full weight bearing', 'pain-free-walk': 'Pain-free walk', 'full-knee-extension': 'Knee fully straightens', 'full-range': 'Full range of motion',
};

/** Red flags (brief, Phase 3; science check topic 11). The app routes to care; it never diagnoses. */
export const RED_FLAGS = [
  'chest-or-breath', 'tight-limb-worsening-rest-pain', 'swelling-growing-fast', 'limb-swelling-warmth', 'cannot-bear-weight',
  'cannot-straighten-or-slr', 'pop-with-loss-of-function', 'pain-worse-over-days', 'numbness-spreading', 'new-on-existing',
] as const;
export type RedFlag = (typeof RED_FLAGS)[number];
export const FLAG_LABEL: Record<RedFlag, string> = {
  'chest-or-breath': 'Chest pain, breathlessness or coughing blood',
  'tight-limb-worsening-rest-pain': 'Severe pain getting worse at rest, limb very tight or hard',
  'swelling-growing-fast': 'Swelling or bruising growing fast',
  'limb-swelling-warmth': 'Calf or limb swelling, warmth or redness with throbbing pain',
  'cannot-bear-weight': 'Cannot bear weight',
  'cannot-straighten-or-slr': 'Cannot straighten the knee or do a straight leg raise',
  'pop-with-loss-of-function': 'A pop with sudden loss of function',
  'pain-worse-over-days': 'Pain getting worse over days',
  'numbness-spreading': 'Numbness, tingling or weakness spreading',
  'new-on-existing': 'A new injury on top of an existing one',
};

export type Felt = 'snap' | 'pop' | 'gradual' | 'other';

export interface Injury extends ModRec {
  /** The only required fields (brief, Phase 1). */
  region: Region;
  side: Side;
  start: ISODate;
  /** 'longTerm' is a standing limit: never phases, only adds blocked movements. */
  kind?: 'episode' | 'longTerm';
  /** Long-term limits restrict only what the module adds, unless this is set. */
  applyToPlan?: boolean;
  location?: string;
  type?: InjuryType;
  grade?: 1 | 2 | 3;
  diagnosis?: 'suspected' | 'confirmed';
  mechanism?: { exercise?: string; kg?: number; rep?: number; felt?: Felt; text?: string };
  imaging?: string;
  /** Clinician input: always wins over the app's rules. */
  restrictions?: { text?: string; blocked?: Movement[]; until?: ISODate };
  atLog?: {
    painRest?: number;
    painWalk?: number;
    painLoad?: number;
    swelling?: boolean;
    bruising?: boolean;
    lump?: boolean;
    rom?: 'full' | 'reduced' | 'very-reduced';
    tests?: Partial<Record<FunctionalTest, boolean>>;
    flags?: RedFlag[];
  };
  status?: InjuryStatus;
  /** Editable estimate. Never unlocks anything. */
  expectedReturn?: ISODate;
  /** Opt-in: train the other limb when safe. */
  trainOtherSide?: boolean;
  relapseOf?: string;
  notes?: string;
}

/** One per injury per day: id `ic:${injuryId}:${date}`. */
export interface InjuryCheckin extends ModRec {
  injuryId: string;
  date: ISODate;
  painRest?: number;
  painWalk?: number;
  painSession?: number;
  painMorning?: number;
  stiffMorning?: number;
  swelling?: boolean;
  confidence?: 1 | 2 | 3 | 4 | 5;
  tests?: Partial<Record<FunctionalTest, boolean>>;
  flags?: RedFlag[];
  notes?: string;
}

export const WELLNESS_SIGNS = ['eyeTwitch', 'jittery', 'irritable', 'lowMotivation', 'poorFocus', 'restlessSleep'] as const;
export type WellnessSign = (typeof WELLNESS_SIGNS)[number];
export const SIGN_LABEL: Record<WellnessSign, string> = {
  eyeTwitch: 'Eye twitching', jittery: 'Jittery', irritable: 'Irritable', lowMotivation: 'Low motivation', poorFocus: 'Poor focus', restlessSleep: 'Restless sleep',
};

/** One per day: id `wc:${date}`. Resting HR and HRV come from the existing check-in. */
export interface WellnessCheckin extends ModRec {
  date: ISODate;
  signs?: Partial<Record<WellnessSign, boolean>>;
  /** How many days the signs have been going on, as told (e.g. eye twitching for several days). */
  signDays?: number;
  soreness?: number;
  appetite?: 1 | 2 | 3 | 4 | 5;
  mood?: 1 | 2 | 3 | 4 | 5;
  stress?: 1 | 2 | 3 | 4 | 5;
  caffeineMg?: number;
  lastCaffeine?: string;
  alcoholUnits?: number;
  overtrained?: boolean;
  notes?: string;
}

export interface RxItem {
  name: string;
  sets: number;
  reps?: string;
  holdS?: number;
  perSide?: boolean;
  /** Days of the week it is done, 0 = Monday. Empty means every day. */
  days?: number[];
  note?: string;
}

export interface WarmupSet {
  kg: number;
  reps: number;
  done?: boolean;
}

export type GymKit = 'barbell' | 'rack' | 'bench' | 'dumbbells' | 'cable' | 'machines' | 'pullup-bar' | 'bands' | 'trap-bar' | 'sled' | 'dip-bars' | 'back-extension';
export const GYM_KIT: GymKit[] = ['barbell', 'rack', 'bench', 'dumbbells', 'cable', 'machines', 'pullup-bar', 'bands', 'trap-bar', 'sled', 'dip-bars', 'back-extension'];
export const KIT_LABEL: Record<GymKit, string> = {
  barbell: 'Barbell', rack: 'Rack', bench: 'Bench', dumbbells: 'Dumbbells', cable: 'Cable', machines: 'Machines', 'pullup-bar': 'Pull-up bar', bands: 'Bands',
  'trap-bar': 'Trap bar', sled: 'Sled', 'dip-bars': 'Dip bars', 'back-extension': 'Back extension bench',
};

/** Everything else, one store, one kind per record. Readers ignore kinds they do not know. */
export type RecoveryRecord =
  | (ModRec & { kind: 'settings'; enabled: boolean; checkinPrompt?: 'whileActive' | 'off'; adaptLabel?: boolean; smartTravel?: boolean; activeGymId?: string | null })
  | (ModRec & { kind: 'goal'; weightKg?: [number, number]; bodyFatPct?: [number, number] })
  | (ModRec & { kind: 'injuryEvent'; injuryId: string; date: ISODate; event: 'phase' | 'status' | 'assessed' | 'cleared' | 'restriction'; phase?: Phase; status?: InjuryStatus; by: 'owner' | 'clinician' | 'engine'; phaseCap?: Phase; clearedLoading?: boolean; basis?: string[]; note?: string })
  | (ModRec & { kind: 'measure'; date: ISODate; neckCm?: number; shouldersCm?: number; chestCm?: number; armCm?: number })
  | (ModRec & { kind: 'recoveryBlock'; date: ISODate; until: ISODate; level: 'moderate' | 'light'; reason: string; sourceId?: string })
  | (ModRec & { kind: 'nutrition'; date: ISODate; mode: 'cut' | 'maintenance' | 'surplus'; reason: string; kcalAdjustId?: string })
  | (ModRec & { kind: 'protein'; date: ISODate; grams: number })
  | (ModRec & { kind: 'rx'; injuryId: string; date: ISODate; items: RxItem[]; restrictions?: string; blocked?: Movement[]; until?: ISODate; by?: string })
  | (ModRec & { kind: 'painPoint'; date: ISODate; region: Region; side: Side; pain: number; note?: string; injuryId?: string })
  | (ModRec & { kind: 'warmup'; date: ISODate; exercise: string; workKg: number; sets: WarmupSet[] })
  | (ModRec & { kind: 'mindset'; date: ISODate; frustration: number; motivation: number; confidence: number; note?: string })
  | (ModRec & { kind: 'gym'; name: string; kit: GymKit[]; dumbbellMaxKg?: number })
  | (ModRec & { kind: 'trip'; date: ISODate; until: ISODate; kit: 'bodyweight' | 'bands' | 'hotel' | 'full'; flightHours?: number; zones?: number; direction?: 'east' | 'west'; shortSessions?: boolean; note?: string })
  | (ModRec & { kind: 'retest'; date: ISODate; lift: LiftKey; kg: number; reps: number; rir: number });

export type RecordKind = RecoveryRecord['kind'];
export type RecordOf<K extends RecordKind> = Extract<RecoveryRecord, { kind: K }>;
export type SettingsRecord = RecordOf<'settings'>;

/** A progress photo kept on this phone only: never backed up or exported. */
export interface LocalPhoto extends ModRec {
  date: ISODate;
  view: 'front' | 'side' | 'back' | 'other';
  dataUrl: string;
  bytes: number;
}

/** What the engine and screens read when the module is on. */
export interface RecoveryData {
  settings: SettingsRecord;
  injuries: Injury[];
  checkins: InjuryCheckin[];
  wellness: WellnessCheckin[];
  records: RecoveryRecord[];
  /** Rows that could not be read cleanly (shown on the Recover screen). */
  issues: string[];
}

export const SETTINGS_ID = 'settings';
export const isLowerLimb = (r: Region) => LOWER_LIMB.includes(r);
