import Dexie, { type Table } from 'dexie';
import type {
  BodyWeightLog, Exercise, ExerciseMedia, ExerciseType, OutboxItem, Profile, ProgressPhoto, RoutineDay,
  RoutineExercise, SessionEvent, SessionExercise, SetLog, SyncCursor, WorkoutSession, SyncedTable,
} from './types';

export class AppDB extends Dexie {
  profile!: Table<Profile, string>;
  exerciseTypes!: Table<ExerciseType, string>;
  exercises!: Table<Exercise, string>;
  exerciseMedia!: Table<ExerciseMedia, string>;
  routineDays!: Table<RoutineDay, string>;
  routineExercises!: Table<RoutineExercise, string>;
  workoutSessions!: Table<WorkoutSession, string>;
  sessionExercises!: Table<SessionExercise, string>;
  setLogs!: Table<SetLog, string>;
  sessionEvents!: Table<SessionEvent, string>;
  bodyWeightLogs!: Table<BodyWeightLog, string>;
  progressPhotos!: Table<ProgressPhoto, string>;
  outbox!: Table<OutboxItem, number>;
  syncState!: Table<SyncCursor, string>;

  constructor(name = 'treinos') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      exerciseTypes: 'id',
      exercises: 'id, type_id',
      exerciseMedia: 'id, exercise_id',
      routineDays: 'id, user_id, [user_id+weekday]',
      routineExercises: 'id, routine_day_id, user_id',
      workoutSessions: 'id, user_id, session_date, [user_id+session_date]',
      sessionExercises: 'id, session_id, exercise_id',
      setLogs: 'id, session_id, session_exercise_id, exercise_id, [user_id+exercise_id], logged_at',
      sessionEvents: 'id, session_id',
      bodyWeightLogs: 'id, user_id, measured_on, [user_id+measured_on]',
      progressPhotos: 'id, user_id, taken_on, body_weight_log_id',
      outbox: '++seq, table, row_id, status',
      syncState: 'table',
    });
  }
}

export let db = new AppDB();

/** Só para testes: troca o banco. */
export function setDb(next: AppDB) { db = next; }

export const LOCAL_TABLE: Record<SyncedTable, keyof AppDB> = {
  exercise_types: 'exerciseTypes',
  exercises: 'exercises',
  exercise_media: 'exerciseMedia',
  routine_days: 'routineDays',
  routine_exercises: 'routineExercises',
  workout_sessions: 'workoutSessions',
  session_exercises: 'sessionExercises',
  set_logs: 'setLogs',
  session_events: 'sessionEvents',
  body_weight_logs: 'bodyWeightLogs',
  progress_photos: 'progressPhotos',
};

export function localTable(t: SyncedTable): Table<Record<string, unknown>, string> {
  return db[LOCAL_TABLE[t]] as unknown as Table<Record<string, unknown>, string>;
}

/** Apaga todos os dados locais (ao sair ou trocar de conta). */
export async function clearLocalData() {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
}

/** Pede ao navegador para não limpar o IndexedDB (importante no iOS). */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* sem suporte */ }
}

export const newId = (): string => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();
