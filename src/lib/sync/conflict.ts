// Sessão criada em dois aparelhos no mesmo dia (23505 em workout_sessions_day_uq):
// busca a sessão do servidor, reatribui os filhos locais ao id existente e reenvia.
import { db } from '../db';
import type { OutboxItem, SessionExercise, WorkoutSession } from '../types';
import { durationSeconds } from '../dates';
import type { Remote } from './remote';

function minIso(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b ?? null;
  if (!b) return a;
  return a < b ? a : b;
}

export async function resolveSessionConflict(item: OutboxItem, remote: Remote): Promise<boolean> {
  const local = await db.workoutSessions.get(item.row_id);
  if (!local) return false;
  const found = await remote.findSessionByDate(local.user_id, local.session_date);
  if (found.error || !found.data) return false;
  const server = found.data as unknown as WorkoutSession;
  if (server.id === local.id) return false;

  const remoteSE = ((await remote.fetchSessionExercises(server.id)).data ?? []) as unknown as SessionExercise[];
  const oldId = local.id, newId = server.id;

  await db.transaction('rw', [db.workoutSessions, db.sessionExercises, db.setLogs, db.sessionEvents, db.outbox], async () => {
    // sessão mesclada: menor started_at; status local prevalece (é a ação mais recente do usuário)
    const startedAt = minIso(local.started_at, server.started_at);
    const finishedAt = local.finished_at ?? server.finished_at ?? null;
    const status = local.status === 'finished' || server.status === 'finished' ? 'finished' : local.status;
    const merged: WorkoutSession = {
      ...server, ...local, id: newId, started_at: startedAt, status,
      finished_at: status === 'finished' ? finishedAt : null,
      duration_seconds: status === 'finished' ? durationSeconds(startedAt, finishedAt) : null,
    };
    await db.workoutSessions.delete(oldId);
    await db.workoutSessions.put(merged);

    // exercícios da sessão: se o servidor já tem o mesmo exercício, usa o dele
    const localSE = await db.sessionExercises.where('session_id').equals(oldId).toArray();
    const seMap = new Map<string, string>(); // id local → id servidor
    for (const se of localSE) {
      const match = remoteSE.find((r) => !r.deleted_at && (
        (se.routine_exercise_id && r.routine_exercise_id === se.routine_exercise_id) ||
        (!se.routine_exercise_id && r.exercise_id === se.exercise_id)));
      if (match) {
        seMap.set(se.id, match.id);
        await db.sessionExercises.delete(se.id);
        await db.sessionExercises.put({ ...match, completed_at: se.completed_at ?? match.completed_at });
      } else {
        await db.sessionExercises.update(se.id, { session_id: newId });
      }
    }
    const remapSE = (id: string | null | undefined) => (id && seMap.get(id)) || id || null;

    await db.setLogs.where('session_id').equals(oldId).modify((s) => {
      s.session_id = newId;
      s.session_exercise_id = remapSE(s.session_exercise_id)!;
    });
    await db.sessionEvents.where('session_id').equals(oldId).modify((e) => {
      e.session_id = newId;
      e.session_exercise_id = remapSE(e.session_exercise_id);
    });

    // reescreve a fila
    const items = await db.outbox.toArray();
    for (const it of items) {
      const row = { ...it.row };
      let changed = false;
      if (it.table === 'workout_sessions' && it.row_id === oldId) {
        await db.outbox.update(it.seq!, { row_id: newId, row: { ...row, id: newId }, status: 'pending', nextAttemptAt: 0 });
        continue;
      }
      if (row.session_id === oldId) { row.session_id = newId; changed = true; }
      if (typeof row.session_exercise_id === 'string' && seMap.has(row.session_exercise_id)) {
        row.session_exercise_id = seMap.get(row.session_exercise_id); changed = true;
      }
      if (it.table === 'session_exercises' && seMap.has(it.row_id)) {
        // o exercício já existe no servidor: atualiza o dele
        const target = seMap.get(it.row_id)!;
        await db.outbox.update(it.seq!, { row_id: target, row: { ...row, id: target, session_id: newId } });
        continue;
      }
      if (changed) await db.outbox.update(it.seq!, { row });
    }
  });
  return true;
}
