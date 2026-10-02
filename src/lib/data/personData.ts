// Dados de uma pessoa para Progresso/Peso/Fotos/Resumo.
// Próprios: Dexie (local-first, ao vivo). De outra pessoa (admin): leitura online direta do Supabase.
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { supabase } from '../supabase';
import type { BodyWeightLog, ProgressPhoto, RoutineDay, SessionEvent, SessionExercise, SetLog, WorkoutSession } from '../types';

export interface PersonData {
  sessions: WorkoutSession[];
  sessionExercises: SessionExercise[];
  sets: SetLog[];
  weights: BodyWeightLog[];
  photos: ProgressPhoto[];
  routineDays: RoutineDay[];
}

const alive = <T extends { deleted_at?: string | null }>(l: T[]) => l.filter((x) => !x.deleted_at);
const num = <T extends Record<string, unknown>>(rows: T[], keys: string[]) =>
  rows.map((r) => { const o: Record<string, unknown> = { ...r }; for (const k of keys) if (typeof o[k] === 'string') o[k] = Number(o[k]); return o as T; });

async function fetchAll<T>(table: string, userId: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', userId).is('deleted_at', null).range(from, from + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function usePersonData(userId: string, isSelf: boolean): { data: PersonData | undefined; error: string | null } {
  const local = useLiveQuery(async () => {
    if (!isSelf) return undefined;
    const [sessions, sessionExercises, sets, weights, photos, routineDays] = await Promise.all([
      db.workoutSessions.where('user_id').equals(userId).toArray(),
      db.sessionExercises.toArray(),
      db.setLogs.toArray(),
      db.bodyWeightLogs.where('user_id').equals(userId).toArray(),
      db.progressPhotos.where('user_id').equals(userId).toArray(),
      db.routineDays.where('user_id').equals(userId).toArray(),
    ]);
    return {
      sessions: alive(sessions), sessionExercises: alive(sessionExercises).filter((x) => x.user_id === userId),
      sets: alive(sets).filter((x) => x.user_id === userId), weights: alive(weights), photos: alive(photos), routineDays,
    } satisfies PersonData;
  }, [userId, isSelf]);

  const [remote, setRemote] = useState<PersonData | undefined>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (isSelf) return;
    let ok = true;
    setRemote(undefined); setError(null);
    (async () => {
      try {
        const [sessions, sessionExercises, sets, weights, photos, rd] = await Promise.all([
          fetchAll<WorkoutSession>('workout_sessions', userId),
          fetchAll<SessionExercise>('session_exercises', userId),
          fetchAll<SetLog>('set_logs', userId),
          fetchAll<BodyWeightLog>('body_weight_logs', userId),
          fetchAll<ProgressPhoto>('progress_photos', userId),
          supabase.from('routine_days').select('*').eq('user_id', userId),
        ]);
        if (!ok) return;
        setRemote({
          sessions, sessionExercises: num(sessionExercises as never[], ['target_weight_kg']) as SessionExercise[],
          sets: num(sets as never[], ['weight_kg']) as SetLog[], weights: num(weights as never[], ['weight_kg']) as BodyWeightLog[],
          photos, routineDays: (rd.data ?? []) as RoutineDay[],
        });
      } catch (e) {
        if (ok) setError(/fetch/i.test((e as Error).message) ? 'Sem conexão: dados de outra pessoa exigem internet.' : (e as Error).message);
      }
    })();
    return () => { ok = false; };
  }, [userId, isSelf]);

  return { data: isSelf ? local : remote, error: isSelf ? null : error };
}

export interface SessionDetail { session: WorkoutSession; exercises: SessionExercise[]; sets: SetLog[]; events: SessionEvent[] }

export function useSessionDetail(id: string): { data: SessionDetail | null | undefined; error: string | null } {
  const local = useLiveQuery(async () => {
    const s = await db.workoutSessions.get(id);
    if (!s || s.deleted_at) return null;
    const [exercises, sets, events] = await Promise.all([
      db.sessionExercises.where('session_id').equals(id).toArray(),
      db.setLogs.where('session_id').equals(id).toArray(),
      db.sessionEvents.where('session_id').equals(id).toArray(),
    ]);
    return { session: s, exercises: alive(exercises).sort((a, b) => a.position - b.position), sets: alive(sets), events: alive(events) };
  }, [id]);
  const [remote, setRemote] = useState<SessionDetail | null | undefined>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (local !== null) return; // existe localmente (ou ainda carregando)
    let ok = true;
    (async () => {
      const s = await supabase.from('workout_sessions').select('*').eq('id', id).maybeSingle();
      if (!ok) return;
      if (s.error) { setError(s.error.message); return; }
      if (!s.data) { setRemote(null); return; }
      const [e, l, ev] = await Promise.all([
        supabase.from('session_exercises').select('*').eq('session_id', id).is('deleted_at', null).order('position'),
        supabase.from('set_logs').select('*').eq('session_id', id).is('deleted_at', null),
        supabase.from('session_events').select('*').eq('session_id', id).is('deleted_at', null),
      ]);
      if (!ok) return;
      setRemote({
        session: s.data as WorkoutSession, exercises: (e.data ?? []) as SessionExercise[],
        sets: num((l.data ?? []) as never[], ['weight_kg']) as SetLog[], events: (ev.data ?? []) as SessionEvent[],
      });
    })();
    return () => { ok = false; };
  }, [id, local]);
  return { data: local ?? remote, error };
}
