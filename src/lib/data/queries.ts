// Leituras locais (Dexie + useLiveQuery) — fonte de dados da UI.
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Exercise, ExerciseMedia, ExerciseType, RoutineDay, RoutineExercise, SessionExercise, SetLog, WorkoutSession } from '../types';

const alive = <T extends { deleted_at?: string | null }>(l: T[]) => l.filter((x) => !x.deleted_at);

export interface Catalog {
  exercises: Map<string, Exercise>;
  types: Map<string, ExerciseType>;
  media: Map<string, ExerciseMedia[]>;
}

export function useCatalog(): Catalog | undefined {
  return useLiveQuery(async () => {
    const [ex, ty, me] = await Promise.all([db.exercises.toArray(), db.exerciseTypes.toArray(), db.exerciseMedia.toArray()]);
    const media = new Map<string, ExerciseMedia[]>();
    for (const m of alive(me).sort((a, b) => a.position - b.position)) {
      media.set(m.exercise_id, [...(media.get(m.exercise_id) ?? []), m]);
    }
    return {
      exercises: new Map(ex.map((e) => [e.id, e])), // inclui excluídos (histórico)
      types: new Map(alive(ty).map((t) => [t.id, t])),
      media,
    };
  }, []);
}

export interface RoutineView { days: RoutineDay[]; exercisesByDay: Map<string, RoutineExercise[]> }

export function useRoutine(userId: string): RoutineView | undefined {
  return useLiveQuery(async () => {
    const days = (await db.routineDays.where('user_id').equals(userId).toArray()).sort((a, b) => a.weekday - b.weekday);
    const exs = alive(await db.routineExercises.where('user_id').equals(userId).toArray()).sort((a, b) => a.position - b.position);
    const exercisesByDay = new Map<string, RoutineExercise[]>();
    for (const e of exs) exercisesByDay.set(e.routine_day_id, [...(exercisesByDay.get(e.routine_day_id) ?? []), e]);
    return { days, exercisesByDay };
  }, [userId]);
}

export interface SessionView { session: WorkoutSession; exercises: SessionExercise[]; sets: SetLog[] }

export async function loadSessionView(session: WorkoutSession): Promise<SessionView> {
  const [exercises, sets] = await Promise.all([
    db.sessionExercises.where('session_id').equals(session.id).toArray(),
    db.setLogs.where('session_id').equals(session.id).toArray(),
  ]);
  return {
    session,
    exercises: alive(exercises).sort((a, b) => a.position - b.position),
    sets: alive(sets).sort((a, b) => a.set_number - b.set_number || a.logged_at.localeCompare(b.logged_at)),
  };
}

/** Sessão (não excluída) de uma data, com exercícios e séries. null = não existe. */
export function useSessionOn(userId: string, date: string): SessionView | null | undefined {
  return useLiveQuery(async () => {
    const s = alive(await db.workoutSessions.where('[user_id+session_date]').equals([userId, date]).toArray())[0];
    return s ? loadSessionView(s) : null;
  }, [userId, date]);
}

/** Sessões de um intervalo de datas. */
export function useSessionsBetween(userId: string, from: string, to: string): WorkoutSession[] | undefined {
  return useLiveQuery(async () =>
    alive(await db.workoutSessions.where('session_date').between(from, to, true, true).toArray()).filter((s) => s.user_id === userId),
  [userId, from, to]);
}

/** Histórico de séries de um exercício (mais recentes primeiro). */
export function useExerciseHistory(userId: string, exerciseId: string | undefined): SetLog[] | undefined {
  return useLiveQuery(async () => {
    if (!exerciseId) return [];
    const sets = alive(await db.setLogs.where('[user_id+exercise_id]').equals([userId, exerciseId]).toArray());
    return sets.sort((a, b) => b.logged_at.localeCompare(a.logged_at));
  }, [userId, exerciseId]);
}

export interface PastSession { sessionId: string; date: string; sets: SetLog[] }

/** Agrupa histórico por sessão (exclui a sessão atual), mais recentes primeiro. */
export async function groupBySession(sets: SetLog[], excludeSessionId?: string): Promise<PastSession[]> {
  const bySession = new Map<string, SetLog[]>();
  for (const s of sets) {
    if (s.session_id === excludeSessionId) continue;
    bySession.set(s.session_id, [...(bySession.get(s.session_id) ?? []), s]);
  }
  const sessions = await db.workoutSessions.bulkGet([...bySession.keys()]);
  const out: PastSession[] = [];
  for (const [sid, list] of bySession) {
    const sess = sessions.find((x) => x?.id === sid);
    out.push({ sessionId: sid, date: sess?.session_date ?? list[0].logged_at.slice(0, 10), sets: list.sort((a, b) => a.set_number - b.set_number) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Pré-preenchimento: mesma série da última sessão; sem histórico, a meta do treino.
 */
export function prefillFor(setNumber: number, last: PastSession | undefined, target: { reps: string | null; weight: number | null }) {
  const fromLast = last?.sets.find((s) => s.set_number === setNumber) ?? last?.sets[last.sets.length - 1];
  if (fromLast) return { reps: fromLast.reps, weight: Number(fromLast.weight_kg) };
  const repsNum = target.reps ? parseInt(target.reps, 10) : NaN;
  return { reps: Number.isFinite(repsNum) ? repsNum : null, weight: target.weight ?? null };
}
