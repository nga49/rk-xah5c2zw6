import type { Tone } from './types';

// ---------------------------------------------------------------- mobility (6.7)

export interface Drill {
  name: string;
  dose: string;
}

export const MOBILITY_DAILY: { title: string; minutes: number; drills: Drill[] } = {
  title: 'Daily mobility',
  minutes: 10,
  drills: [
    { name: 'Cat-cow', dose: '× 8' },
    { name: '90/90 hip switches', dose: '× 8 per side' },
    { name: 'Half-kneeling hip flexor stretch', dose: '45 s per side' },
    { name: 'Thoracic open book', dose: '× 8 per side' },
    { name: 'Knee-to-wall ankle rocks', dose: '× 10 per side' },
    { name: 'Dead bug', dose: '× 8 per side' },
    { name: 'Glute bridge', dose: '× 12' },
  ],
};

export const BACK_RESET: { title: string; minutes: number; drills: Drill[]; warning: string } = {
  title: 'Back reset',
  minutes: 20,
  drills: [
    { name: 'Easy walk', dose: '10 min first' },
    { name: 'Bird dog', dose: '3 × 6 per side, 5 s hold' },
    { name: 'Side plank', dose: '3 × 20 s per side, knees down if needed' },
    { name: 'Curl-up', dose: '3 × 8' },
    { name: 'Cat-cow', dose: '× 10' },
    { name: 'Hip flexor stretch', dose: '45 s per side' },
  ],
  warning: 'Stop anything that sends pain down the leg.',
};

// ---------------------------------------------------------------- travel (6.7b)

export interface SimpleExercise {
  name: string;
  sets: number;
  reps: string;
  rest_s: number;
  muscles: string[];
  perSide?: boolean;
}

export const TRAVEL_SESSION: SimpleExercise[] = [
  { name: 'Push-up', sets: 4, reps: 'max - 2', rest_s: 60, muscles: ['Chest'] },
  { name: 'Pike Push-up', sets: 3, reps: '10', rest_s: 60, muscles: ['Front delts'] },
  { name: 'Backpack or Band Row', sets: 4, reps: '12', rest_s: 60, muscles: ['Back'] },
  { name: 'Rear-foot-elevated Split Squat', sets: 3, reps: '12', rest_s: 60, muscles: ['Quads', 'Glutes'], perSide: true },
  { name: 'Single-leg Romanian Deadlift', sets: 3, reps: '10', rest_s: 60, muscles: ['Hamstrings'], perSide: true },
  { name: 'Side Plank', sets: 3, reps: '30 s', rest_s: 60, muscles: ['Core'], perSide: true },
];
export const TRAVEL_NOTE = 'Hotel session, about 40 min. Rest 60 s. RIR 2. Finish with a 20 min walk.';
export const TRAVEL_WEDNESDAY: SimpleExercise[] = [
  { name: 'Side Plank', sets: 3, reps: '30 s', rest_s: 45, muscles: ['Core'], perSide: true },
  { name: 'Dead Bug', sets: 3, reps: '8', rest_s: 45, muscles: ['Core'], perSide: true },
  { name: 'Bird Dog', sets: 3, reps: '6', rest_s: 45, muscles: ['Core'], perSide: true },
];

// ---------------------------------------------------------------- standards (6.8)

export type StandardKey = 'ohp' | 'pullup3' | 'farmer' | 'bench' | 'squat' | 'neck' | 'waistHeight' | 'zone2';

export interface StandardDef {
  key: StandardKey;
  name: string;
  unit: string;
  start: string;
  y1: string;
  y2: string;
  goal: string;
  /** Numeric targets for progress bars, where they exist. Relative ones are resolved at runtime. */
  targets?: { y1: number; y2: number; goal: number };
  lowerIsBetter?: boolean;
  /** Logged on the Standards form, rather than computed from other logs. */
  logged?: boolean;
}

export const STANDARDS: StandardDef[] = [
  { key: 'ohp', name: 'Overhead press, est. 1RM', unit: 'kg', start: 'benchmark', y1: '72.5 kg', y2: '77.5 kg', goal: '80 kg+', targets: { y1: 72.5, y2: 77.5, goal: 80 } },
  { key: 'pullup3', name: 'Weighted pull-up, 3 reps', unit: 'kg added', start: 'test in M2', y1: '+20 kg', y2: '+30 kg', goal: '+40 kg', targets: { y1: 20, y2: 30, goal: 40 } },
  { key: 'farmer', name: 'Farmer carry, 40 m', unit: 'kg per hand', start: 'log in M1', y1: '2 × 40 kg', y2: '2 × 45 kg', goal: '2 × 50 kg', targets: { y1: 40, y2: 45, goal: 50 }, logged: true },
  { key: 'bench', name: 'Bench press, est. 1RM', unit: 'kg', start: 'verify in M2', y1: '+2.5%', y2: '+5%', goal: '+7.5% over the verified max' },
  { key: 'squat', name: 'Back squat', unit: '', start: 'top sets ≤ 85%', y1: '3RM verified', y2: '+5%', goal: 'strong and pain-free' },
  { key: 'neck', name: 'Neck, 15 reps each way', unit: 'kg added', start: 'very light', y1: '+5 kg', y2: '+10 kg', goal: '+15 kg', targets: { y1: 5, y2: 10, goal: 15 }, logged: true },
  { key: 'waistHeight', name: 'Waist ÷ height', unit: '', start: 'measure in M1', y1: 'under 0.50', y2: 'under 0.50', goal: 'under 0.50', targets: { y1: 0.5, y2: 0.5, goal: 0.5 }, lowerIsBetter: true },
  { key: 'zone2', name: 'Zone 2, easy', unit: 'min', start: '30 min', y1: '35 min', y2: '40 min', goal: '45 min', targets: { y1: 35, y2: 40, goal: 45 }, logged: true },
];

// ---------------------------------------------------------------- reference cards (6.9)

export const ARC: { stage: string; tone: Tone; lines: string[] }[] = [
  { stage: 'Closed', tone: 'ash', lines: ['Grieves alone', 'Hides who he is'] },
  { stage: 'Honest', tone: 'frost', lines: ['Tells the truth', 'Owns his past'] },
  { stage: 'Trusting', tone: 'gold', lines: ['Lets others choose', 'Mercy before force'] },
  { stage: 'Leading', tone: 'moss', lines: ['Rebuilds', 'Accepts being looked up to'] },
];

export const PILLARS: { name: string; tone: Tone; rule: string; reps: string[] }[] = [
  { name: 'Control', tone: 'frost', rule: 'Feel it, then choose', reps: ['3 slow breaths before answering anything that stings', 'One-sentence answers', 'One uncomfortable task done calmly'] },
  { name: 'Body', tone: 'ember', rule: 'Built to last, not to peak', reps: ['Heavy but never to failure', 'Carry something heavy weekly', 'Daily walk'] },
  { name: 'Bonds', tone: 'gold', rule: 'Do not carry it alone', reps: ['One true thing you would rather hide', 'Ask before you advise', 'Name your Mimir: a friend, mentor or therapist'] },
  { name: 'Build', tone: 'moss', rule: 'Be remembered for what you built', reps: ['One unasked act of service', 'Teach by doing it beside them', 'What would I do if I were not afraid?'] },
];

export const SWAPS: [string, string][] = [
  ['Carrying grief alone', 'Saying it to someone trusted'],
  ['Hiding the past', 'Telling the truth early'],
  ['Controlling loved ones', 'Trusting them to choose'],
  ['Rage as reflex', 'Rage as an aimed tool'],
  ['Force first', 'Force last'],
  ['Bowing to fate', 'Acting on what you can choose'],
];

export const NEVER_CHANGES = ['Few words', 'Patience', 'Calm under threat', 'Trains every day', 'Endures discomfort', 'Keeps his word', 'Protects his own', 'Finishes what he starts', 'Respects craft'];

export const VOICE = {
  how: ['Slow', 'Quiet', 'Short sentences', 'Long pauses', 'Falling intonation', 'Lets silence sit'],
  drill: ['Hum "mm-hmm", then speak from that spot', 'Read aloud 2 min at half speed', 'Record 60 s and listen'],
  notes: ['Never push below the comfortable range.', 'Pitch is mostly anatomy; delivery is trainable.'],
};

export const PRESENCE = {
  stance: ['Ribs over hips', 'Shoulders low', 'Head level', 'Hands still'],
  walk: ['Half a beat slower', 'Eyes on the horizon', 'Stop fully before speaking'],
  people: ['Listen to the end', 'Pause 2 s', 'Steady eye contact', 'Kneel to their level to teach', 'Keep the real smile'],
};

// ---------------------------------------------------------------- practice ladder (Mind)

export const LADDER: { name: string; tone: Tone; years: string[] }[] = [
  { name: 'Breath', tone: 'frost', years: ['5 min cyclic sighing', '5 min, before hard talks too', 'On demand, 1 min', 'On demand, 1 min'] },
  { name: 'Meditation', tone: 'frost', years: ['10 min from season 4', '20 min', '30 min', '30 to 45 min'] },
  { name: 'Sleep', tone: 'ember', years: ['Fixed wake time from S2', '7.5 h minimum', '7.5 to 9 h', '7.5 to 9 h'] },
  { name: 'Voice', tone: 'gold', years: ['5 min drill from S3', 'Record 60 s monthly', 'Teach out loud weekly', 'Speak to a room'] },
  { name: 'Presence', tone: 'moss', years: ['20 s walk video monthly', 'Coaching video, sound off', 'Same, every block', 'Same, every block'] },
];

export const YEAR_THEMES: Record<number, string> = { 1: 'Master yourself', 2: 'Trust others', 3: 'Lead', 4: 'Valhalla' };

// ---------------------------------------------------------------- evidence (6.10)

export const EVIDENCE: { claim: string; source: string }[] = [
  { claim: 'Contest prep: lose 0.5 to 1% of bodyweight a week; protein 2.3 to 3.1 g per kg of lean mass.', source: 'Helms, Aragon, Fitschen 2014' },
  { claim: 'Slower weight loss kept more lean mass.', source: 'Garthe et al. 2011' },
  { claim: 'Off-season: a small surplus; advanced lifters stay conservative.', source: 'Iraki et al. 2019' },
  { claim: 'Protein benefits plateau around 1.6 g/kg, upper range 2.2.', source: 'Morton et al. 2018' },
  { claim: 'More weekly sets, more growth.', source: 'Schoenfeld, Ogborn, Krieger 2017' },
  { claim: 'Volume and frequency dose-response.', source: 'Pelland et al. 2024 (preprint)' },
  { claim: 'Training closer to failure helps size, not strength.', source: 'Robinson et al. 2024' },
  { claim: 'Heavier loads trend to more strength.', source: 'Schoenfeld et al. 2016' },
  { claim: 'A 1-week deload did not hurt growth.', source: 'Coleman et al. 2024' },
  { claim: 'Cardio does not blunt hypertrophy.', source: 'Schumann et al. 2021' },
  { claim: 'One night without sleep cut muscle protein synthesis 18%.', source: 'Lamon et al. 2021' },
  { claim: 'Waist-to-height ratio screens risk better than BMI.', source: 'Ashwell et al. 2012' },
  { claim: 'Habits took a median of 66 days to form (range 18 to 254).', source: 'Lally et al. 2010' },
  { claim: '"When X, I do Y" plans raised follow-through (d = 0.65).', source: 'Gollwitzer and Sheeran 2006' },
  { claim: '5 min of daily cyclic sighing improved mood.', source: 'Balban et al. 2023' },
  { claim: 'A mindfulness course was comparable to escitalopram for anxiety disorders.', source: 'Hoge et al. 2023' },
  { claim: 'No single correct posture.', source: 'Slater et al. 2019' },
];

// ---------------------------------------------------------------- Ask Claude (3.6)

export const ASK_INSTRUCTION =
  'Act as an evidence-based strength coach and calm mentor. Short answers, lists over paragraphs, no em dashes. Respect these safety rules. Say when you are unsure. Not medical advice.';

export const QUICK_PROMPTS = ['My back is tight', 'Hotel today', 'I missed 3 days', 'Am I on track?', "Explain today's session"];

/** The user's training rules (brief, section 0). Plan rules, not health data. */
export const DEFAULT_RULES =
  'Every muscle at least twice a week and 10+ sets a week (neck 8). No set to failure on spine-loaded lifts. Hamstrings on leg days. Named sessions, rotating accessories. No session time cap.';

export const SUNDAY_QUESTIONS = ['What did I carry?', 'Where did I react?', 'What did I build?'];

export const RUNES = 'ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ᚷ ᚹ ᚺ ᚾ ᛁ ᛃ ᛇ ᛈ ᛉ ᛊ ᛏ ᛒ ᛖ ᛗ ᛚ ᛜ ᛞ ᛟ';
/** "Ragnarok" spelled in Elder Futhark: raido, ansuz, gebo, naudiz, ansuz, raido, othala, kaunan. */
export const RUNE_NAME = 'ᚱᚨᚷᚾᚨᚱᛟᚲ';
/** The Delphic maxim, carved at the temple of Apollo. */
export const MAXIM = { greek: 'ΓΝΩΘΙ ΣΕΑΥΤΟΝ', english: 'Know thyself' };
