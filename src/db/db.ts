import Dexie, { type Table } from 'dexie';
import type {
  BodyLog,
  CardioLog,
  DayRecord,
  Dismissal,
  KcalAdjust,
  MaxLog,
  Photo,
  PlanEvent,
  Profile,
  Review,
  SeasonScore,
  StandardLog,
  WorkingWeight,
} from '../engine/model';
import type { Injury, InjuryCheckin, LocalPhoto, RecoveryRecord, WellnessCheckin } from '../recovery/model';

export interface DeviceRow {
  key: string;
  value: unknown;
}

/** Tables that are backed up, in a fixed order. `device` is never backed up. */
export const DATA_TABLES = [
  'profile', 'days', 'cardio', 'maxes', 'body', 'standards', 'weights', 'reviews', 'seasonScores', 'kcalAdjust', 'plan', 'dismissed', 'photos',
  // Recovery module (version 2): backed up like every other table.
  'injuries', 'injuryCheckins', 'wellnessCheckins', 'recoveryRecords',
] as const;
export type DataTable = (typeof DATA_TABLES)[number];

export interface Rows {
  profile: Profile;
  days: DayRecord;
  cardio: CardioLog;
  maxes: MaxLog;
  body: BodyLog;
  standards: StandardLog;
  weights: WorkingWeight;
  reviews: Review;
  seasonScores: SeasonScore;
  kcalAdjust: KcalAdjust;
  plan: PlanEvent;
  dismissed: Dismissal;
  photos: Photo;
  injuries: Injury;
  injuryCheckins: InjuryCheckin;
  wellnessCheckins: WellnessCheckin;
  recoveryRecords: RecoveryRecord;
}

export class RagnarokDB extends Dexie {
  profile!: Table<Profile, string>;
  days!: Table<DayRecord, string>;
  cardio!: Table<CardioLog, string>;
  maxes!: Table<MaxLog, string>;
  body!: Table<BodyLog, string>;
  standards!: Table<StandardLog, string>;
  weights!: Table<WorkingWeight, string>;
  reviews!: Table<Review, string>;
  seasonScores!: Table<SeasonScore, string>;
  kcalAdjust!: Table<KcalAdjust, string>;
  plan!: Table<PlanEvent, string>;
  dismissed!: Table<Dismissal, string>;
  photos!: Table<Photo, string>;
  device!: Table<DeviceRow, string>;
  injuries!: Table<Injury, string>;
  injuryCheckins!: Table<InjuryCheckin, string>;
  wellnessCheckins!: Table<WellnessCheckin, string>;
  recoveryRecords!: Table<RecoveryRecord, string>;
  /** Progress photos kept on this phone only: never backed up or exported. */
  localPhotos!: Table<LocalPhoto, string>;

  constructor(name = 'ragnarok') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      days: 'id',
      cardio: 'id, date',
      maxes: 'id, date, lift',
      body: 'id, date',
      standards: 'id, date',
      weights: 'id, date, exercise',
      reviews: 'id',
      seasonScores: 'id',
      kcalAdjust: 'id',
      plan: 'id',
      dismissed: 'id',
      photos: 'id, date',
      device: 'key',
    });
    // Recovery module: new stores only. Version 1 above stays exactly as it shipped.
    this.version(2).stores({
      injuries: 'id, start',
      injuryCheckins: 'id, date, injuryId',
      wellnessCheckins: 'id, date',
      recoveryRecords: 'id, kind, date',
      localPhotos: 'id, date',
    });
  }

  table_<K extends DataTable>(name: K): Table<Rows[K], string> {
    return this.table(name) as Table<Rows[K], string>;
  }
}

export let db = new RagnarokDB();

/** Tests use a fresh database per "device". */
export function useDatabase(next: RagnarokDB): void {
  db = next;
}
