// Exercise tags: what each movement demands of the body. Generic biomechanics only, never a person's
// condition. Keyed by the exact exercise names the plan serves (names are the identity of logged history).
//
// How the tags were set (coaching judgement, not a published table; review before relying on them):
// - primary muscles are the plan's own labels for that exercise, so set counts follow the plan's rules;
// - regions take meaningful load; regions2 take some load, a stretch, a brace or pad pressure;
// - heavy standing work loads the legs (they brace the weight), light standing work does not;
// - hip flexion work (leg raises, dead bugs) lists the quad, because one quad muscle crosses the hip;
// - circuits and supersets are tagged at their worst part;
// - an exercise that is not in this table is treated as loading everything (see tagsFor).
import type { GymKit, Movement, Region } from './model';

export type TagMuscle = 'Traps' | 'Side delts' | 'Rear delts' | 'Neck' | 'Back' | 'Front delts' | 'Chest' | 'Biceps' | 'Triceps' | 'Forearms' | 'Core' | 'Quads' | 'Glutes' | 'Hamstrings' | 'Calves';
export type Level = 'none' | 'low' | 'moderate' | 'high';
export type Depth = 'none' | 'shallow' | 'mid' | 'deep';
/** Equipment needed (all of it). 'bodyweight' means nothing beyond the floor and a wall or chair. */
export type Kit = GymKit | 'bodyweight';

export interface ExerciseTags {
  /** Muscle labels, in the plan's own words, so set counts match its rules. */
  primary: TagMuscle[];
  secondary: TagMuscle[];
  /** Body regions that take load (primary) or some load (secondary). */
  regions: Region[];
  regions2: Region[];
  /** Movement demands, for clinician-blocked movements. */
  moves: Movement[];
  spinalLoad: Level;
  kneeFlexion: Depth;
  impact: Level;
  unilateral: boolean;
  /** Seated, lying or chest-supported: no standing or bracing demand on the legs. */
  supported: boolean;
  kit: Kit[];
  /** Easier versions of the same movement, easiest last. Never harder (tested). */
  regressions?: string[];
  /** Different exercises for the same muscles. */
  alternatives?: string[];
}

export const LEVELS: Level[] = ['none', 'low', 'moderate', 'high'];
export const DEPTHS: Depth[] = ['none', 'shallow', 'mid', 'deep'];

/** Overrides for any field, applied last. */
type Opts = Partial<ExerciseTags>;
function t(primary: TagMuscle[], secondary: TagMuscle[], regions: Region[], regions2: Region[], moves: Movement[], o: Opts = {}): ExerciseTags {
  return { primary, secondary, regions, regions2, moves, spinalLoad: 'none', kneeFlexion: 'none', impact: 'none', unilateral: false, supported: false, kit: ['bodyweight'], ...o };
}

/** Legs bracing a heavy standing load. */
const BRACE: Region[] = ['hip', 'quad', 'knee', 'calf', 'ankle-foot'];
/** Every lower-limb region, for squats, lunges and carries. */
const LEGS: Region[] = ['hip', 'glute', 'quad', 'hamstring', 'adductor', 'knee', 'calf', 'ankle-foot'];

const squat = (o: Opts = {}) =>
  t(['Quads'], ['Glutes', 'Hamstrings', 'Core'], ['quad', 'glute', 'knee', 'hip', 'adductor', 'lower-back'], ['hamstring', 'calf', 'ankle-foot', 'groin', 'upper-back', 'shoulder', 'abdomen'], ['squat', 'knee-extension', 'hip-extension', 'spinal-load'], { spinalLoad: 'high', kneeFlexion: 'deep', kit: ['barbell', 'rack'], ...o });
const benchLike = (primary: TagMuscle[], secondary: TagMuscle[], kit: Kit[], o: Opts = {}) =>
  t(primary, secondary, ['chest', 'shoulder', 'elbow', 'upper-arm'], ['wrist-hand', 'upper-back'], ['horizontal-press', 'elbow-extension'], { spinalLoad: 'low', supported: true, kit, ...o });
const seatedPress = (kit: Kit[], o: Opts = {}) =>
  t(['Front delts'], ['Side delts', 'Triceps'], ['shoulder', 'elbow', 'upper-arm'], ['upper-back', 'lower-back', 'wrist-hand'], ['vertical-press', 'overhead', 'elbow-extension'], { spinalLoad: 'low', supported: true, kit, ...o });
const pullUp = (o: Opts = {}) =>
  t(['Back'], ['Biceps', 'Rear delts', 'Forearms', 'Core'], ['upper-back', 'shoulder', 'elbow', 'upper-arm'], ['forearm', 'wrist-hand', 'abdomen'], ['vertical-pull', 'overhead', 'elbow-flexion', 'grip'], { spinalLoad: 'low', kit: ['pullup-bar'], regressions: ['Paused Assisted Pull-up', 'Neutral-grip Lat Pull-down'], ...o });
const pullDown = (o: Opts = {}) =>
  t(['Back'], ['Biceps', 'Rear delts'], ['upper-back', 'shoulder', 'elbow'], ['upper-arm', 'forearm'], ['vertical-pull', 'overhead', 'elbow-flexion'], { supported: true, kit: ['cable'], ...o });
const supportedRow = (kit: Kit[], o: Opts = {}) =>
  t(['Back'], ['Rear delts', 'Biceps'], ['upper-back', 'shoulder', 'elbow'], ['forearm', 'chest'], ['horizontal-pull', 'elbow-flexion'], { supported: true, kit, ...o });
const curl = (kit: Kit[], o: Opts = {}) =>
  t(['Biceps'], ['Forearms'], ['elbow', 'upper-arm'], ['forearm', 'wrist-hand', 'shoulder'], ['elbow-flexion'], { kit, ...o });
const hammer = (kit: Kit[], o: Opts = {}) =>
  t(['Biceps', 'Forearms'], [], ['elbow', 'upper-arm', 'forearm'], ['wrist-hand'], ['elbow-flexion'], { kit, ...o });
const pushdown = (kit: Kit[], o: Opts = {}) =>
  t(['Triceps'], [], ['elbow', 'upper-arm'], ['shoulder', 'wrist-hand'], ['elbow-extension'], { kit, ...o });
const overheadExt = (kit: Kit[]) =>
  t(['Triceps'], [], ['elbow', 'upper-arm'], ['shoulder'], ['elbow-extension', 'overhead'], { kit, regressions: ['Rope Pushdown'] });
const rearDelt = (kit: Kit[], o: Opts = {}) =>
  t(['Rear delts'], ['Traps'], ['shoulder', 'upper-back'], ['elbow'], ['horizontal-pull'], { kit, ...o });
const yRaise = (kit: Kit[], o: Opts = {}) =>
  t(['Rear delts'], ['Traps', 'Side delts'], ['shoulder', 'upper-back'], ['elbow'], ['overhead'], { kit, ...o });
const lateral = (kit: Kit[], o: Opts = {}) =>
  t(['Side delts'], ['Traps'], ['shoulder'], ['upper-back', 'elbow', 'neck'], [], { kit, ...o });
const shrugHeavy = (kit: Kit[]) =>
  t(['Traps'], ['Forearms'], ['upper-back', 'neck', 'shoulder'], ['lower-back', 'forearm', 'wrist-hand', ...BRACE], ['shrug', 'grip', 'spinal-load'], { spinalLoad: 'moderate', kit, regressions: ['Seated Dumbbell Shrug'] });
const carry = (primary: TagMuscle[], secondary: TagMuscle[], extra: Region[], moves: Movement[], o: Opts = {}) =>
  t(primary, secondary, ['forearm', 'wrist-hand', 'lower-back', 'abdomen', ...LEGS.filter((r) => r !== 'adductor' && r !== 'hamstring'), ...extra], ['shoulder', 'neck', 'upper-back', 'hamstring', 'adductor', 'groin'].filter((r) => !extra.includes(r as Region)) as Region[], ['carry', 'grip', 'loaded-walking', 'spinal-load', ...moves], { spinalLoad: 'moderate', impact: 'low', kneeFlexion: 'shallow', kit: ['dumbbells'], ...o });
const legCurl = (kit: Kit[], o: Opts = {}) =>
  t(['Hamstrings'], ['Calves'], ['hamstring', 'knee'], ['calf', 'glute', 'quad'], ['knee-flexion'], { kneeFlexion: 'deep', kit, ...o });
const splitSquat = (kit: Kit[]) =>
  t(['Quads', 'Glutes'], ['Hamstrings', 'Core'], ['quad', 'glute', 'knee', 'hip', 'adductor'], ['hamstring', 'calf', 'ankle-foot', 'groin', 'lower-back'], ['lunge', 'knee-extension', 'hip-extension'], { spinalLoad: 'low', kneeFlexion: 'deep', unilateral: true, kit, alternatives: ['Leg Press'] });
const hipThrust = () =>
  t(['Glutes'], ['Hamstrings', 'Quads'], ['glute', 'hip', 'hamstring'], ['quad', 'knee', 'lower-back', 'adductor'], ['hip-extension'], { spinalLoad: 'low', kneeFlexion: 'mid', kit: ['barbell', 'bench'] });

export const EXERCISE_TAGS: Record<string, ExerciseTags> = {
  // ---------------------------------------------------------------- squat slot
  'Barbell Back Squat': squat({ regressions: ['Hack Squat', 'Leg Press'], alternatives: ['Dumbbell Bulgarian Split Squat'] }),
  'Safety-bar Squat': squat({ regressions: ['Hack Squat', 'Leg Press'], alternatives: ['Dumbbell Bulgarian Split Squat'] }),
  'Belt Squat': squat({ spinalLoad: 'low', moves: ['squat', 'knee-extension', 'hip-extension'], regions: ['quad', 'glute', 'knee', 'hip', 'adductor'], regions2: ['hamstring', 'calf', 'ankle-foot', 'groin'], kit: ['machines'], regressions: ['Leg Press'] }),
  'Hack Squat': squat({ spinalLoad: 'moderate', regions2: ['hamstring', 'calf', 'ankle-foot', 'groin', 'upper-back', 'shoulder'], kit: ['machines'], regressions: ['Leg Press'] }),
  'Leg Press': squat({ spinalLoad: 'low', moves: ['squat', 'knee-extension', 'hip-extension'], regions: ['quad', 'glute', 'knee', 'hip', 'adductor'], regions2: ['hamstring', 'calf', 'ankle-foot', 'groin', 'lower-back'], kit: ['machines'] }),
  'Dumbbell Bulgarian Split Squat': splitSquat(['dumbbells', 'bench']),
  'Rear-foot-elevated Split Squat': splitSquat(['bodyweight']),
  'Sled Push': t(['Quads'], ['Glutes', 'Calves', 'Hamstrings'], ['quad', 'glute', 'calf', 'knee', 'hip', 'ankle-foot'], ['hamstring', 'adductor', 'groin', 'shoulder', 'elbow', 'wrist-hand', 'lower-back'], ['loaded-walking', 'knee-extension', 'hip-extension'], { impact: 'low', kneeFlexion: 'mid', kit: ['sled'] }),
  Walk: t([], [], [], ['ankle-foot', 'calf', 'shin'], [], { impact: 'low' }),

  // ---------------------------------------------------------------- hinge and posterior chain
  'Barbell Hip Thrust with Bench': hipThrust(),
  'Barbell Hip Thrust': hipThrust(),
  '45° Back Extension': t(['Hamstrings', 'Glutes'], ['Core'], ['hamstring', 'glute', 'lower-back', 'hip'], ['quad', 'knee'], ['hinge', 'hip-extension'], { spinalLoad: 'low', kit: ['back-extension'] }),
  'Single-leg Romanian Deadlift': t(['Hamstrings'], ['Glutes', 'Core'], ['hamstring', 'glute', 'hip', 'lower-back'], ['quad', 'knee', 'calf', 'ankle-foot'], ['hinge', 'hip-extension'], { spinalLoad: 'low', kneeFlexion: 'shallow', unilateral: true }),
  'Weighted Leg Curl': legCurl(['machines'], { regressions: ['Seated Leg Curl'] }),
  'Seated Leg Curl': legCurl(['machines']),
  'Lying Leg Curl': legCurl(['machines'], { regions2: ['calf', 'glute', 'quad', 'hip'] }),
  'Leg Curl': legCurl(['machines']),
  'Assisted Nordic Curl': legCurl(['bodyweight'], { regions2: ['calf', 'glute', 'quad'], regressions: ['Seated Leg Curl', 'Lying Leg Curl'] }),
  'Weighted Standing Calf Raise': t(['Calves'], [], ['calf', 'ankle-foot'], ['knee', 'quad', 'lower-back', 'shoulder'], ['calf-raise', 'spinal-load'], { spinalLoad: 'moderate', kit: ['machines'], alternatives: ['Weighted Seated Calf Raise'] }),
  'Weighted Seated Calf Raise': t(['Calves'], [], ['calf', 'ankle-foot'], ['knee', 'quad'], ['calf-raise'], { kneeFlexion: 'mid', kit: ['machines'] }),

  // ---------------------------------------------------------------- press slot and shoulders
  'Barbell Overhead Press': t(['Front delts'], ['Side delts', 'Triceps', 'Traps', 'Core'], ['shoulder', 'elbow', 'upper-arm'], ['upper-back', 'lower-back', 'wrist-hand', 'neck', 'abdomen', ...BRACE], ['vertical-press', 'overhead', 'elbow-extension', 'spinal-load'], { spinalLoad: 'moderate', kit: ['barbell', 'rack'], regressions: ['Seated Barbell Press', 'Seated Dumbbell Shoulder Press'] }),
  'Seated Barbell Press': seatedPress(['barbell', 'rack', 'bench'], { regressions: ['Seated Dumbbell Shoulder Press'] }),
  'Seated Dumbbell Shoulder Press': seatedPress(['dumbbells', 'bench']),
  'Seated Dumbbell Press': seatedPress(['dumbbells', 'bench']),
  'Arnold Press': seatedPress(['dumbbells'], { supported: false }),
  'Pike Push-up': t(['Front delts'], ['Triceps', 'Chest'], ['shoulder', 'elbow', 'upper-arm', 'wrist-hand'], ['neck', 'upper-back'], ['vertical-press', 'overhead', 'elbow-extension']),
  'Dumbbell Lateral Raise': lateral(['dumbbells']),
  'One-arm Cable Lateral Raise': lateral(['cable'], { unilateral: true }),
  'Lean-away Dumbbell Lateral Raise': lateral(['dumbbells'], { unilateral: true, regions2: ['upper-back', 'elbow', 'neck', 'wrist-hand'] }),
  'Machine Lateral Raise': lateral(['machines'], { supported: true }),

  // ---------------------------------------------------------------- bench slot and chest
  'Barbell Bench Press': benchLike(['Chest'], ['Front delts', 'Triceps'], ['barbell', 'bench', 'rack'], { regressions: ['Low-incline Smith Press', 'Machine Incline Press'] }),
  'Incline Bench Press 30°': benchLike(['Chest'], ['Front delts', 'Triceps'], ['barbell', 'bench', 'rack'], { regressions: ['Machine Incline Press'] }),
  'Close-grip Bench Press': benchLike(['Chest'], ['Triceps', 'Front delts'], ['barbell', 'bench', 'rack'], { regressions: ['Machine Incline Press'] }),
  'Incline Barbell Bench Press': benchLike(['Chest', 'Front delts'], ['Triceps'], ['barbell', 'bench', 'rack'], { regressions: ['Incline Dumbbell Bench Press', 'Machine Incline Press'] }),
  'Incline Dumbbell Bench Press': benchLike(['Chest', 'Front delts'], ['Triceps'], ['dumbbells', 'bench'], { regressions: ['Machine Incline Press'] }),
  'Low-incline Smith Press': benchLike(['Chest', 'Front delts'], ['Triceps'], ['machines', 'bench'], { regressions: ['Machine Incline Press'] }),
  'Machine Incline Press': benchLike(['Chest', 'Front delts'], ['Triceps'], ['machines']),
  'Push-up': t(['Chest'], ['Front delts', 'Triceps', 'Core'], ['chest', 'shoulder', 'elbow', 'upper-arm', 'wrist-hand'], ['abdomen'], ['horizontal-press', 'elbow-extension']),
  'Weighted Dip': t(['Chest'], ['Triceps', 'Front delts'], ['chest', 'shoulder', 'elbow', 'upper-arm'], ['wrist-hand'], ['vertical-press', 'elbow-extension'], { kit: ['dip-bars'], regressions: ['Push-up'] }),

  // ---------------------------------------------------------------- triceps
  'Cable Overhead Triceps Extension': overheadExt(['cable']),
  'Dumbbell Overhead Triceps Extension': overheadExt(['dumbbells']),
  'Triceps Extension': pushdown(['cable']),
  'Rope Pushdown': pushdown(['cable']),
  'Cable Triceps Pushdown': pushdown(['cable']),
  'Single-arm Cable Pushdown': pushdown(['cable'], { unilateral: true }),
  'Lying EZ-Bar Triceps Extension': pushdown(['barbell', 'bench'], { supported: true, alternatives: ['Cable Triceps Pushdown'] }),
  'Dumbbell Skull Crusher': pushdown(['dumbbells', 'bench'], { supported: true, alternatives: ['Cable Triceps Pushdown'] }),

  // ---------------------------------------------------------------- biceps and forearms
  'Standing EZ-Bar Biceps Curl': curl(['barbell']),
  'Dumbbell Curl': curl(['dumbbells']),
  'Cable Curl': curl(['cable']),
  'Incline Dumbbell Biceps Curl': curl(['dumbbells', 'bench'], { supported: true }),
  'Bayesian Cable Curl': curl(['cable'], { unilateral: true }),
  'Spider Curl': curl(['dumbbells', 'bench'], { supported: true }),
  'Dumbbell Hammer Curl': hammer(['dumbbells']),
  'Cross-body Hammer Curl': hammer(['dumbbells']),
  'Rope Hammer Curl': hammer(['cable']),
  'Reverse EZ-Bar Curl': hammer(['barbell'], { regressions: ['Reverse Cable Curl'] }),
  'Reverse Cable Curl': hammer(['cable']),
  'Zottman Curl': hammer(['dumbbells']),
  'Wrist Curl + Reverse Wrist Curl': t(['Forearms'], [], ['forearm', 'wrist-hand'], ['elbow'], [], { supported: true, kit: ['dumbbells', 'bench'] }),
  'Wrist Roller': t(['Forearms'], [], ['forearm', 'wrist-hand'], ['shoulder', 'elbow'], ['grip'], { kit: ['bodyweight'] }),
  'Plate Pinch Hold': t(['Forearms'], [], ['wrist-hand', 'forearm'], ['elbow'], ['grip'], { kit: ['barbell'] }),

  // ---------------------------------------------------------------- pull slot and back
  'Weighted Pull-up': pullUp(),
  'Weighted Chin-up': pullUp(),
  'Weighted Neutral Pull-up': pullUp(),
  'Paused Assisted Pull-up': pullUp({ kit: ['machines'], regressions: ['Neutral-grip Lat Pull-down'] }),
  'Neutral-grip Lat Pull-down': pullDown(),
  'Wide-grip Lat Pull-down': pullDown(),
  'Single-arm Lat Pull-down': pullDown({ unilateral: true }),
  'Chest Supported Dumbbell Row': supportedRow(['dumbbells', 'bench']),
  'Chest-supported T-bar Row': supportedRow(['barbell']),
  'Seal Row': supportedRow(['barbell', 'bench']),
  'Meadows Row': t(['Back'], ['Rear delts', 'Biceps', 'Forearms'], ['upper-back', 'shoulder', 'elbow'], ['forearm', 'lower-back', 'hip', 'hamstring', 'quad', 'knee'], ['horizontal-pull', 'elbow-flexion', 'hinge', 'grip'], { spinalLoad: 'low', unilateral: true, kit: ['barbell'], regressions: ['Single-arm Cable Row', 'Chest Supported Dumbbell Row'] }),
  'Single-arm Neutral-grip Dumbbell Row': t(['Back'], ['Rear delts', 'Biceps'], ['upper-back', 'shoulder', 'elbow'], ['forearm', 'lower-back', 'knee'], ['horizontal-pull', 'elbow-flexion'], { spinalLoad: 'low', unilateral: true, kit: ['dumbbells', 'bench'], regressions: ['Chest Supported Dumbbell Row'] }),
  'Single-arm Cable Row': t(['Back'], ['Rear delts', 'Biceps'], ['upper-back', 'shoulder', 'elbow'], ['forearm', 'lower-back'], ['horizontal-pull', 'elbow-flexion'], { spinalLoad: 'low', unilateral: true, kit: ['cable'] }),
  'Inverted Row': t(['Back'], ['Biceps', 'Rear delts', 'Core'], ['upper-back', 'shoulder', 'elbow'], ['forearm', 'lower-back', 'glute', 'hamstring'], ['horizontal-pull', 'elbow-flexion'], { kit: ['barbell', 'rack'] }),
  'Backpack or Band Row': t(['Back'], ['Biceps', 'Rear delts'], ['upper-back', 'shoulder', 'elbow'], ['lower-back', 'hamstring', 'hip'], ['horizontal-pull', 'elbow-flexion', 'hinge'], { spinalLoad: 'low' }),

  // ---------------------------------------------------------------- yoke
  'Band Pull-apart': rearDelt(['bands']),
  'Face Pull': rearDelt(['cable']),
  'Reverse Cable Fly': rearDelt(['cable']),
  'Rear Delt Cable Fly': rearDelt(['cable']),
  'Incline Reverse Fly': rearDelt(['dumbbells', 'bench'], { supported: true }),
  'Machine Reverse Fly': rearDelt(['machines'], { supported: true }),
  'Cable Y-Raise': yRaise(['cable']),
  'Prone Incline Y-Raise': yRaise(['dumbbells', 'bench'], { supported: true }),
  'Lying Y-Raise': yRaise(['dumbbells', 'bench'], { supported: true }),
  'Barbell Shrug': { ...shrugHeavy(['barbell', 'rack']), regressions: ['Seated Dumbbell Shrug', 'Cable Shrug'] },
  'Trap-bar Shrug': shrugHeavy(['trap-bar']),
  'Dumbbell Shrug': shrugHeavy(['dumbbells']),
  'Cable Shrug': t(['Traps'], ['Forearms'], ['upper-back', 'neck', 'shoulder'], ['lower-back', 'forearm', 'wrist-hand'], ['shrug', 'grip'], { spinalLoad: 'low', kit: ['cable'], regressions: ['Seated Dumbbell Shrug'] }),
  'Seated Dumbbell Shrug': t(['Traps'], ['Forearms'], ['upper-back', 'neck', 'shoulder'], ['forearm', 'wrist-hand', 'lower-back'], ['shrug', 'grip'], { spinalLoad: 'low', supported: true, kit: ['dumbbells', 'bench'] }),
  'Neck Flexion + Extension': t(['Neck'], [], ['neck'], ['upper-back'], ['neck'], { spinalLoad: 'low', supported: true, kit: ['bench'] }),
  "Farmer's Carry": carry(['Traps', 'Core', 'Forearms'], ['Glutes', 'Quads'], ['upper-back'], ['shrug']),
  'Suitcase Carry': carry(['Core', 'Forearms'], ['Traps'], [], [], { unilateral: true }),
  'Front-rack Kettlebell Carry': carry(['Core', 'Forearms'], ['Traps', 'Front delts'], ['shoulder'], []),
  'Single-arm Overhead Carry': carry(['Core', 'Forearms'], ['Traps', 'Front delts', 'Side delts'], ['shoulder', 'upper-back'], ['overhead'], { unilateral: true }),

  // ---------------------------------------------------------------- smart travel kits (yoke first)
  'Backpack Shrug': t(['Traps'], ['Forearms'], ['upper-back', 'neck', 'shoulder'], ['forearm', 'wrist-hand', 'lower-back'], ['shrug', 'grip'], { spinalLoad: 'low' }),
  'Backpack Lateral Raise': lateral(['bodyweight']),
  'Prone Y-Raise, bodyweight': yRaise(['bodyweight'], { supported: true }),
  'Neck Isometric Holds': t(['Neck'], [], ['neck'], ['upper-back'], ['neck'], { supported: true }),
  'Band Shrug': t(['Traps'], ['Forearms'], ['upper-back', 'neck', 'shoulder'], ['forearm', 'wrist-hand'], ['shrug'], { kit: ['bands'] }),
  'Band Lateral Raise': lateral(['bands']),
  'Band Face Pull': rearDelt(['bands']),

  // ---------------------------------------------------------------- core
  'Hanging Leg Raise': t(['Core'], ['Forearms'], ['abdomen', 'hip'], ['quad', 'groin', 'lower-back', 'shoulder', 'forearm', 'wrist-hand'], ['hip-flexion', 'spinal-flexion', 'overhead', 'grip'], { kit: ['pullup-bar'], regressions: ["Captain's Chair Knee Raise", 'Reverse Crunch'] }),
  "Captain's Chair Knee Raise": t(['Core'], [], ['abdomen', 'hip'], ['quad', 'groin', 'lower-back', 'shoulder', 'elbow'], ['hip-flexion', 'spinal-flexion'], { kit: ['machines'], regressions: ['Reverse Crunch'] }),
  'Reverse Crunch': t(['Core'], [], ['abdomen'], ['hip', 'quad', 'groin', 'lower-back'], ['hip-flexion', 'spinal-flexion'], { supported: true }),
  'Kneeling Ab Wheel': t(['Core'], [], ['abdomen', 'shoulder'], ['lower-back', 'hip', 'knee', 'wrist-hand', 'upper-back'], ['overhead'], { regressions: ['Dead Bug'] }),
  'Body Saw': t(['Core'], [], ['abdomen', 'shoulder'], ['lower-back', 'hip', 'quad', 'elbow'], [], { regressions: ['Dead Bug'] }),
  'Weighted Dead Bug': t(['Core'], [], ['abdomen'], ['hip', 'quad', 'lower-back', 'shoulder'], ['hip-flexion'], { supported: true, regressions: ['Dead Bug'] }),
  'Dead Bug': t(['Core'], [], ['abdomen'], ['hip', 'quad'], ['hip-flexion'], { supported: true }),
  'Bird Dog': t(['Core'], ['Glutes'], ['lower-back', 'abdomen'], ['glute', 'hip', 'hamstring', 'shoulder', 'knee', 'wrist-hand'], ['hip-extension']),
  'Side Plank': t(['Core'], [], ['abdomen'], ['shoulder', 'elbow', 'hip', 'adductor', 'lower-back'], []),
  'Side Plank with Reach Under': t(['Core'], [], ['abdomen'], ['shoulder', 'elbow', 'hip', 'adductor', 'lower-back', 'upper-back'], []),
  'Pallof Press': t(['Core'], [], ['abdomen'], ['shoulder', 'hip', 'lower-back'], [], { kit: ['cable'] }),
  'Half-kneeling Cable Lift': t(['Core'], [], ['abdomen'], ['shoulder', 'hip', 'lower-back', 'knee', 'quad'], [], { kit: ['cable'] }),
  'Landmine Anti-rotation': t(['Core'], [], ['abdomen'], ['shoulder', 'hip', 'lower-back', 'knee', 'wrist-hand'], [], { spinalLoad: 'low', kit: ['barbell'] }),

  // ---------------------------------------------------------------- circuit, tagged at its worst part
  'Thruster, Renegade Row, Lateral Raise, Goblet Squat': t(
    ['Side delts'], ['Quads', 'Glutes', 'Front delts', 'Back', 'Core', 'Triceps'],
    ['quad', 'glute', 'knee', 'hip', 'shoulder', 'lower-back', 'upper-back', 'wrist-hand'],
    ['adductor', 'hamstring', 'calf', 'ankle-foot', 'elbow', 'abdomen', 'forearm', 'neck', 'chest', 'groin'],
    ['squat', 'overhead', 'vertical-press', 'horizontal-pull', 'knee-extension', 'hip-extension', 'elbow-flexion', 'spinal-load'],
    { spinalLoad: 'moderate', kneeFlexion: 'deep', kit: ['dumbbells'] },
  ),
};

/** Tags for a served exercise name. Unknown names return null: callers treat null as the worst case. */
export function tagsFor(name: string): ExerciseTags | null {
  const clean = name.replace(/^3RM test: /, '');
  return EXERCISE_TAGS[clean] ?? null;
}

/** Every region an exercise touches, primary or secondary. Unknown exercises touch every region. */
export function regionsOf(name: string): { all: true } | { all: false; primary: Region[]; any: Region[] } {
  const tg = tagsFor(name);
  if (!tg) return { all: true };
  return { all: false, primary: tg.regions, any: [...tg.regions, ...tg.regions2] };
}
