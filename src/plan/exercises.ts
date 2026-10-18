export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'weighted' | 'bodyweight' | 'sled' | 'none';

/** Exercises the brief names, so rounding and "next weight" are right without guessing. */
const EXPLICIT: Record<string, Equipment> = {
  'Push-up': 'bodyweight',
  'Pike Push-up': 'bodyweight',
  'Inverted Row': 'bodyweight',
  'Hanging Leg Raise': 'bodyweight',
  "Captain's Chair Knee Raise": 'bodyweight',
  'Reverse Crunch': 'bodyweight',
  'Side Plank with Reach Under': 'bodyweight',
  'Side Plank': 'bodyweight',
  'Kneeling Ab Wheel': 'bodyweight',
  'Body Saw': 'bodyweight',
  'Dead Bug': 'bodyweight',
  'Bird Dog': 'bodyweight',
  'Band Pull-apart': 'none',
  'Backpack or Band Row': 'none',
  'Rear-foot-elevated Split Squat': 'dumbbell',
  'Single-leg Romanian Deadlift': 'dumbbell',
  'Weighted Dip': 'weighted',
  'Weighted Pull-up': 'weighted',
  'Weighted Chin-up': 'weighted',
  'Weighted Neutral Pull-up': 'weighted',
  'Paused Assisted Pull-up': 'machine',
  '45° Back Extension': 'weighted',
  'Weighted Dead Bug': 'weighted',
  'Assisted Nordic Curl': 'bodyweight',
  'Weighted Leg Curl': 'machine',
  'Seated Leg Curl': 'machine',
  'Lying Leg Curl': 'machine',
  'Leg Curl': 'machine',
  'Leg Press': 'machine',
  'Hack Squat': 'machine',
  'Belt Squat': 'machine',
  'Weighted Standing Calf Raise': 'machine',
  'Weighted Seated Calf Raise': 'machine',
  'Sled Push': 'sled',
  "Farmer's Carry": 'dumbbell',
  'Suitcase Carry': 'dumbbell',
  'Single-arm Overhead Carry': 'dumbbell',
  'Front-rack Kettlebell Carry': 'dumbbell',
  'Arnold Press': 'dumbbell',
  'Zottman Curl': 'dumbbell',
  'Spider Curl': 'dumbbell',
  'Seal Row': 'barbell',
  'Meadows Row': 'barbell',
  'Chest-supported T-bar Row': 'barbell',
  'Landmine Anti-rotation': 'barbell',
  'Low-incline Smith Press': 'machine',
  'Machine Incline Press': 'machine',
  'Plate Pinch Hold': 'weighted',
  'Wrist Roller': 'weighted',
  'Wrist Curl + Reverse Wrist Curl': 'dumbbell',
  'Neck Flexion + Extension': 'weighted',
  'Prone Incline Y-Raise': 'dumbbell',
  'Lying Y-Raise': 'dumbbell',
  'Pallof Press': 'cable',
  'Half-kneeling Cable Lift': 'cable',
  'Thruster, Renegade Row, Lateral Raise, Goblet Squat': 'dumbbell',
  'Trap-bar Shrug': 'barbell',
  'Seated Dumbbell Shrug': 'dumbbell',
};

export function equipmentFor(name: string): Equipment {
  if (EXPLICIT[name]) return EXPLICIT[name];
  if (/dumbbell|\bDB\b/i.test(name)) return 'dumbbell';
  if (/cable|pull-down|pushdown|face pull|rope/i.test(name)) return 'cable';
  if (/machine|smith/i.test(name)) return 'machine';
  if (/barbell|ez-bar|bench press|squat|deadlift|shrug|press/i.test(name)) return 'barbell';
  return 'none';
}

/** Whether the exercise takes a weight field at all. */
export const takesLoad = (eq: Equipment) => eq !== 'none' && eq !== 'bodyweight';
