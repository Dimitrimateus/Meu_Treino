// Tipos das linhas do banco (espelham supabase/migrations/0001_schema.sql).

export type Role = 'admin' | 'user';
export type SessionStatus = 'in_progress' | 'finished' | 'skipped';

interface Timestamps { created_at?: string; updated_at?: string }
interface SoftDelete { deleted_at?: string | null }

export interface Profile extends Timestamps {
  id: string;
  name: string;
  role: Role;
  timezone: string;
  reminders_enabled: boolean;
  reminder_lead_minutes: number;
}

export interface ExerciseType extends Timestamps, SoftDelete { id: string; name: string; color: string }

export interface Exercise extends Timestamps, SoftDelete {
  id: string; name: string; type_id: string | null; description: string | null;
}

export interface ExerciseMedia extends Timestamps, SoftDelete {
  id: string; exercise_id: string; storage_path: string; kind: 'image' | 'gif'; position: number;
}

export interface RoutineDay extends Timestamps {
  id: string; user_id: string; weekday: number; is_rest: boolean; title: string | null; scheduled_time: string | null;
}

export interface RoutineExercise extends Timestamps, SoftDelete {
  id: string; routine_day_id: string; user_id: string; exercise_id: string; position: number;
  target_sets: number; target_reps: string | null; target_weight_kg: number | null; rest_seconds: number | null; notes: string | null;
}

export interface WorkoutSession extends Timestamps, SoftDelete {
  id: string; user_id: string; routine_day_id: string | null; session_date: string; title_snapshot: string | null;
  status: SessionStatus; started_at: string | null; finished_at: string | null; duration_seconds: number | null; skip_reason: string | null;
}

export interface SessionExercise extends Timestamps, SoftDelete {
  id: string; session_id: string; user_id: string; routine_exercise_id: string | null; exercise_id: string;
  exercise_name_snapshot: string; position: number;
  target_sets: number | null; target_reps: string | null; target_weight_kg: number | null; rest_seconds: number | null;
  completed_at: string | null;
}

export interface SetLog extends Timestamps, SoftDelete {
  id: string; session_exercise_id: string; session_id: string; user_id: string; exercise_id: string;
  set_number: number; reps: number; weight_kg: number; logged_at: string; is_pr: boolean; pr_kinds: string[]; note: string | null;
}

export type SessionEventKind =
  | 'session_started' | 'set_logged' | 'exercise_completed' | 'exercise_uncompleted'
  | 'session_finished' | 'session_reopened' | 'session_skipped';

export interface SessionEvent extends Timestamps, SoftDelete {
  id: string; session_id: string; user_id: string; session_exercise_id: string | null; kind: SessionEventKind; occurred_at: string;
}

export interface BodyWeightLog extends Timestamps, SoftDelete {
  id: string; user_id: string; measured_on: string; weight_kg: number; note: string | null;
}

export interface ProgressPhoto extends Timestamps, SoftDelete {
  id: string; user_id: string; body_weight_log_id: string; taken_on: string; storage_path: string; note: string | null;
  /** somente local: arquivo enquanto não sobe para o Storage */
  _blob?: Blob;
  _uploaded?: boolean;
}

export interface AppNotification {
  id: string; user_id: string; kind: 'workout_reminder' | 'routine_changed'; title: string; body: string | null;
  url: string | null; created_at: string; read_at: string | null; push_sent_at: string | null;
}

export type SyncedTable =
  | 'exercise_types' | 'exercises' | 'exercise_media' | 'routine_days' | 'routine_exercises'
  | 'workout_sessions' | 'session_exercises' | 'set_logs' | 'session_events' | 'body_weight_logs' | 'progress_photos';

export type PushTable = 'workout_sessions' | 'session_exercises' | 'set_logs' | 'session_events' | 'body_weight_logs' | 'progress_photos';

export interface OutboxItem {
  seq?: number;
  table: PushTable;
  op: 'upsert' | 'delete';
  row_id: string;
  row: Record<string, unknown>;
  tries: number;
  status: 'pending' | 'failed';
  lastError?: string | null;
  nextAttemptAt: number;
  createdAt: number;
}

export interface SyncCursor { table: string; cursor: string | null; lastSyncAt?: number }
