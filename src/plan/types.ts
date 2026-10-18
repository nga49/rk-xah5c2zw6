export type ISODate = string; // YYYY-MM-DD, a local calendar date

export type Phase = 'cut' | 'hold' | 'build' | 'mini' | 'review' | 'maint';
export type Tpl = 'S' | 'H';
export type Tone = 'frost' | 'ember' | 'gold' | 'moss' | 'ash';

export interface Block {
  code: string;
  name: string;
  year: number;
  start: ISODate;
  end: ISODate;
  weeks: number;
  tpl: Tpl;
  phase: Phase;
  test: boolean;
  w0: number;
  w1: number;
  bf: number;
  lean: number;
  kcal: number;
  p: number;
  f: number;
  c: number;
}

export interface TemplateExercise {
  name: string;
  sets: number;
  reps: number | string | null;
  rest_s: number;
  muscles: string[];
  work_s?: number;
  load_note?: string;
  note?: string;
  finisher?: boolean;
  rest_note?: string;
  per_side?: boolean;
}

export type SessionCode = 'BLADES' | 'LEVIATHAN' | 'GUARDIAN' | 'SPARTAN' | 'DRAUPNIR' | 'VALHALLA';

export interface DayTemplate {
  weekday: string;
  code: SessionCode;
  kind: string;
  focus: string;
  exercises: TemplateExercise[];
}

export interface Templates {
  strength: DayTemplate[];
  volume_overrides: DayTemplate[];
}

export interface Season {
  n: number;
  name: string;
  c: Tone;
  pillar: string;
  habit: string;
  when: string;
  measure: string;
  start: ISODate;
  end: ISODate;
  year: number;
  review: boolean;
}

export type LiftKey =
  | 'ohp'
  | 'seated_press'
  | 'bench'
  | 'incline_bench'
  | 'close_grip_bench'
  | 'pullup'
  | 'chinup'
  | 'neutral_pullup'
  | 'squat'
  | 'ssb_squat'
  | 'belt_squat'
  | 'hipthrust'
  | 'shrug';
