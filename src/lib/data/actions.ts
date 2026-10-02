// Mutações locais (local-first): gravam no Dexie e enfileiram no outbox na MESMA transação.
import { db, newId, nowIso } from '../db';
import { enqueue } from '../sync/outbox';
import { requestSync } from '../sync/engine';
import { computePrKinds } from '../pr';
import { durationSeconds, isoWeekday } from '../dates';
import type {
  BodyWeightLog, ProgressPhoto, PushTable, RoutineExercise, SessionEvent, SessionEventKind, SessionExercise, SetLog, WorkoutSession,
} from '../types';

const SESSION_TABLES = () => [db.workoutSessions, db.sessionExercises, db.setLogs, db.sessionEvents, db.outbox, db.routineDays, db.routineExercises, db.exercises];

async function put<T extends { id: string }>(table: PushTable, row: T, op: 'upsert' | 'delete' = 'upsert') {
  const t = {
    workout_sessions: db.workoutSessions, session_exercises: db.sessionExercises, set_logs: db.setLogs,
    session_events: db.sessionEvents, body_weight_logs: db.bodyWeightLogs, progress_photos: db.progressPhotos,
  }[table] as unknown as { put: (r: T) => Promise<unknown> };
  await t.put(row);
  await enqueue(table, row as unknown as Record<string, unknown>, op);
}

async function logEvent(s: WorkoutSession, kind: SessionEventKind, seId: string | null = null, at = nowIso()) {
  const ev: SessionEvent = { id: newId(), session_id: s.id, user_id: s.user_id, session_exercise_id: seId, kind, occurred_at: at, created_at: at };
  await put('session_events', ev);
}

export async function getSessionByDate(userId: string, date: string) {
  const list = await db.workoutSessions.where('[user_id+session_date]').equals([userId, date]).toArray();
  return list.find((s) => !s.deleted_at) ?? null;
}

async function activeRoutineExercises(routineDayId: string): Promise<RoutineExercise[]> {
  return (await db.routineExercises.where('routine_day_id').equals(routineDayId).toArray())
    .filter((e) => !e.deleted_at).sort((a, b) => a.position - b.position);
}

async function snapshotExercise(s: WorkoutSession, re: RoutineExercise, position: number): Promise<SessionExercise> {
  const ex = await db.exercises.get(re.exercise_id);
  const se: SessionExercise = {
    id: newId(), session_id: s.id, user_id: s.user_id, routine_exercise_id: re.id, exercise_id: re.exercise_id,
    exercise_name_snapshot: ex?.name ?? 'Exercício', position,
    target_sets: re.target_sets, target_reps: re.target_reps, target_weight_kg: re.target_weight_kg, rest_seconds: re.rest_seconds,
    completed_at: null, created_at: nowIso(),
  };
  await put('session_exercises', se);
  return se;
}

/**
 * Garante a sessão do dia (criada no primeiro uso: 1ª série ou 1º check).
 * started_at = agora + evento session_started + snapshot dos exercícios do treino.
 */
export async function ensureSession(userId: string, date: string): Promise<WorkoutSession> {
  const result = await db.transaction('rw', SESSION_TABLES(), async () => {
    const now = nowIso();
    let s = await getSessionByDate(userId, date);
    const day = await db.routineDays.where('[user_id+weekday]').equals([userId, isoWeekday(date)]).first();
    if (s && s.status !== 'skipped' && s.started_at) return s;
    if (!s) {
      s = {
        id: newId(), user_id: userId, routine_day_id: day?.id ?? null, session_date: date,
        title_snapshot: day && !day.is_rest ? day.title : null, status: 'in_progress', started_at: now,
        finished_at: null, duration_seconds: null, skip_reason: null, created_at: now,
      };
      await put('workout_sessions', s);
    } else {
      s = { ...s, status: 'in_progress', skip_reason: null, started_at: s.started_at ?? now };
      await put('workout_sessions', s);
    }
    await logEvent(s, 'session_started', null, now);
    const existing = await db.sessionExercises.where('session_id').equals(s.id).count();
    if (existing === 0 && day && !day.is_rest) {
      const res = await activeRoutineExercises(day.id);
      for (let i = 0; i < res.length; i++) await snapshotExercise(s, res[i], i);
    }
    return s;
  });
  requestSync();
  return result;
}

/** Exercício da sessão correspondente a um exercício do treino (cria a sessão se preciso). */
export async function ensureSessionExercise(userId: string, date: string, routineExerciseId: string): Promise<SessionExercise | null> {
  const s = await ensureSession(userId, date);
  const list = await db.sessionExercises.where('session_id').equals(s.id).toArray();
  const found = list.find((se) => se.routine_exercise_id === routineExerciseId && !se.deleted_at);
  if (found) return found;
  const re = await db.routineExercises.get(routineExerciseId);
  if (!re) return null;
  const se = await db.transaction('rw', SESSION_TABLES(), () => snapshotExercise(s, re, list.length));
  requestSync();
  return se;
}

/** Registra/atualiza uma série (com PR provisório calculado no cliente). */
export async function saveSet(params: {
  se: SessionExercise; setNumber: number; reps: number; weightKg: number; note?: string | null; id?: string;
}): Promise<SetLog> {
  const { se, setNumber, reps, weightKg } = params;
  const out = await db.transaction('rw', SESSION_TABLES(), async () => {
    const s = (await db.workoutSessions.get(se.session_id))!;
    const prev = params.id ? await db.setLogs.get(params.id) : undefined;
    const now = nowIso();
    const row: SetLog = {
      id: params.id ?? newId(), session_exercise_id: se.id, session_id: se.session_id, user_id: se.user_id, exercise_id: se.exercise_id,
      set_number: setNumber, reps, weight_kg: weightKg, logged_at: prev?.logged_at ?? now,
      is_pr: false, pr_kinds: [], note: params.note ?? prev?.note ?? null, created_at: prev?.created_at ?? now, deleted_at: null,
    };
    const history = await db.setLogs.where('[user_id+exercise_id]').equals([se.user_id, se.exercise_id]).toArray();
    row.pr_kinds = computePrKinds(row, history);
    row.is_pr = row.pr_kinds.length > 0;
    await put('set_logs', row);
    if (!prev) await logEvent(s, 'set_logged', se.id, now);
    if (s.status === 'skipped') await put('workout_sessions', { ...s, status: 'in_progress', skip_reason: null });
    return row;
  });
  requestSync();
  return out;
}

export async function deleteSet(id: string) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const row = await db.setLogs.get(id);
    if (row) await put('set_logs', { ...row, deleted_at: nowIso() }, 'delete');
  });
  requestSync();
}

export async function restoreSet(row: SetLog) {
  await db.transaction('rw', SESSION_TABLES(), async () => { await put('set_logs', { ...row, deleted_at: null }); });
  requestSync();
}

export async function setExerciseCompleted(seId: string, done: boolean) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const se = await db.sessionExercises.get(seId);
    if (!se) return;
    const s = (await db.workoutSessions.get(se.session_id))!;
    const now = nowIso();
    await put('session_exercises', { ...se, completed_at: done ? now : null });
    await logEvent(s, done ? 'exercise_completed' : 'exercise_uncompleted', se.id, now);
  });
  requestSync();
}

/** Finalizar: finished_at = agora, duração = finished_at − started_at. */
export async function finishSession(sessionId: string) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const s = await db.workoutSessions.get(sessionId);
    if (!s) return;
    const now = nowIso();
    const started = s.started_at ?? now;
    await put('workout_sessions', { ...s, status: 'finished', started_at: started, finished_at: now, duration_seconds: durationSeconds(started, now) });
    await logEvent(s, 'session_finished', null, now);
  });
  requestSync();
}

export async function reopenSession(sessionId: string) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const s = await db.workoutSessions.get(sessionId);
    if (!s) return;
    await put('workout_sessions', { ...s, status: 'in_progress', finished_at: null, duration_seconds: null });
    await logEvent(s, 'session_reopened');
  });
  requestSync();
}

/** "Não treinei hoje" (motivo opcional). */
export async function skipDay(userId: string, date: string, reason: string | null) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const now = nowIso();
    let s = await getSessionByDate(userId, date);
    const day = await db.routineDays.where('[user_id+weekday]').equals([userId, isoWeekday(date)]).first();
    if (!s) {
      s = {
        id: newId(), user_id: userId, routine_day_id: day?.id ?? null, session_date: date, title_snapshot: day?.title ?? null,
        status: 'skipped', started_at: null, finished_at: null, duration_seconds: null, skip_reason: reason, created_at: now,
      };
    } else {
      s = { ...s, status: 'skipped', skip_reason: reason, finished_at: null, duration_seconds: null };
    }
    await put('workout_sessions', s);
    await logEvent(s, 'session_skipped', null, now);
  });
  requestSync();
}

/** Desfazer "não treinei": sem registros → remove a sessão; com registros → volta a em andamento. */
export async function undoSkip(sessionId: string) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const s = await db.workoutSessions.get(sessionId);
    if (!s) return;
    const sets = (await db.setLogs.where('session_id').equals(s.id).toArray()).filter((x) => !x.deleted_at);
    if (sets.length === 0 && !s.started_at) await put('workout_sessions', { ...s, deleted_at: nowIso() }, 'delete');
    else await put('workout_sessions', { ...s, status: 'in_progress', skip_reason: null });
  });
  requestSync();
}

export interface RoutineDiff { added: RoutineExercise[]; removed: SessionExercise[]; changed: { se: SessionExercise; re: RoutineExercise }[] }

/** Diferença entre o snapshot da sessão e o treino atual (para "Aplicar mudanças?"). */
export async function routineDiff(sessionId: string): Promise<RoutineDiff | null> {
  const s = await db.workoutSessions.get(sessionId);
  if (!s || !s.routine_day_id || s.status !== 'in_progress') return null;
  const res = await activeRoutineExercises(s.routine_day_id);
  const ses = (await db.sessionExercises.where('session_id').equals(s.id).toArray()).filter((x) => !x.deleted_at);
  const added = res.filter((re) => !ses.some((se) => se.routine_exercise_id === re.id));
  const removed = ses.filter((se) => se.routine_exercise_id && !res.some((re) => re.id === se.routine_exercise_id));
  const changed = ses.flatMap((se) => {
    const re = res.find((r) => r.id === se.routine_exercise_id);
    if (!re) return [];
    const differs = re.target_sets !== se.target_sets || (re.target_reps ?? null) !== (se.target_reps ?? null)
      || Number(re.target_weight_kg ?? -1) !== Number(se.target_weight_kg ?? -1) || (re.rest_seconds ?? null) !== (se.rest_seconds ?? null)
      || re.position !== se.position;
    return differs ? [{ se, re }] : [];
  });
  if (!added.length && !removed.length && !changed.length) return null;
  return { added, removed, changed };
}

/** Reconcilia: adiciona novos, remove os retirados (sem apagar séries registradas), atualiza metas. */
export async function applyRoutineChanges(sessionId: string) {
  const diff = await routineDiff(sessionId);
  if (!diff) return;
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const s = (await db.workoutSessions.get(sessionId))!;
    for (const re of diff.added) await snapshotExercise(s, re, re.position);
    for (const se of diff.removed) {
      const sets = (await db.setLogs.where('session_exercise_id').equals(se.id).toArray()).filter((x) => !x.deleted_at);
      if (sets.length === 0) await put('session_exercises', { ...se, deleted_at: nowIso() }, 'delete');
      else await put('session_exercises', { ...se, routine_exercise_id: null }); // mantém o que já foi feito
    }
    for (const { se, re } of diff.changed) {
      await put('session_exercises', {
        ...se, position: re.position, target_sets: re.target_sets, target_reps: re.target_reps,
        target_weight_kg: re.target_weight_kg, rest_seconds: re.rest_seconds,
      });
    }
  });
  requestSync();
}

// ============ PESO E FOTOS ============

export async function saveBodyWeight(userId: string, date: string, weightKg: number, note: string | null = null): Promise<BodyWeightLog> {
  const out = await db.transaction('rw', [db.bodyWeightLogs, db.outbox], async () => {
    const existing = (await db.bodyWeightLogs.where('[user_id+measured_on]').equals([userId, date]).toArray()).find((w) => !w.deleted_at);
    const row: BodyWeightLog = existing
      ? { ...existing, weight_kg: weightKg, note: note ?? existing.note }
      : { id: newId(), user_id: userId, measured_on: date, weight_kg: weightKg, note, created_at: nowIso() };
    await put('body_weight_logs', row);
    return row;
  });
  requestSync();
  return out;
}

export async function deleteBodyWeight(id: string): Promise<string | null> {
  const photos = (await db.progressPhotos.where('body_weight_log_id').equals(id).toArray()).filter((p) => !p.deleted_at);
  if (photos.length) return 'Este peso tem fotos vinculadas. Exclua as fotos primeiro.';
  await db.transaction('rw', [db.bodyWeightLogs, db.outbox], async () => {
    const row = await db.bodyWeightLogs.get(id);
    if (row) await put('body_weight_logs', { ...row, deleted_at: nowIso() }, 'delete');
  });
  requestSync();
  return null;
}

/** Foto exige peso: grava/atualiza o peso do dia e vincula a foto a ele. */
export async function addProgressPhoto(userId: string, date: string, weightKg: number, blob: Blob, note: string | null) {
  const w = await saveBodyWeight(userId, date, weightKg);
  await db.transaction('rw', [db.progressPhotos, db.outbox], async () => {
    const id = newId();
    const row: ProgressPhoto = {
      id, user_id: userId, body_weight_log_id: w.id, taken_on: date, storage_path: `${userId}/${id}.jpg`, note,
      created_at: nowIso(), _blob: blob, _uploaded: false,
    };
    await put('progress_photos', row);
  });
  requestSync();
}

export async function deleteProgressPhoto(id: string) {
  await db.transaction('rw', [db.progressPhotos, db.outbox], async () => {
    const row = await db.progressPhotos.get(id);
    if (!row) return;
    await put('progress_photos', { ...row, deleted_at: nowIso(), _blob: undefined }, 'delete');
  });
  requestSync();
}
