// Agregações para os gráficos de Progresso (puras).
import { e1rm } from './pr';
import { addDays, startOfWeek } from './dates';
import type { SessionExercise, SetLog, WorkoutSession } from './types';

export type Period = '30' | '90' | '365' | 'all';

export function periodStart(period: Period, today: string): string {
  return period === 'all' ? '0000-01-01' : addDays(today, -Number(period) + 1);
}

export interface Point { date: string; value: number }

/** Maior carga e melhor 1RM estimado por sessão, para um exercício. */
export function loadSeries(sets: SetLog[], sessionDate: Map<string, string>, exerciseId: string, from: string) {
  const bySession = new Map<string, SetLog[]>();
  for (const s of sets) if (s.exercise_id === exerciseId) bySession.set(s.session_id, [...(bySession.get(s.session_id) ?? []), s]);
  const maxW: Point[] = [], best1rm: Point[] = [], volume: Point[] = [];
  for (const [sid, list] of bySession) {
    const date = sessionDate.get(sid);
    if (!date || date < from) continue;
    maxW.push({ date, value: Math.max(...list.map((s) => Number(s.weight_kg))) });
    best1rm.push({ date, value: Math.round(Math.max(...list.map((s) => e1rm(Number(s.weight_kg), s.reps))) * 10) / 10 });
    volume.push({ date, value: list.reduce((a, s) => a + s.reps * Number(s.weight_kg), 0) });
  }
  const sort = (l: Point[]) => l.sort((a, b) => a.date.localeCompare(b.date));
  return { maxW: sort(maxW), best1rm: sort(best1rm), volume: sort(volume) };
}

/** Volume total (Σ reps × kg) por sessão. */
export function sessionVolumes(sets: SetLog[], sessions: WorkoutSession[], from: string): Point[] {
  const vol = new Map<string, number>();
  for (const s of sets) vol.set(s.session_id, (vol.get(s.session_id) ?? 0) + s.reps * Number(s.weight_kg));
  return sessions.filter((s) => s.session_date >= from && s.status !== 'skipped' && vol.has(s.id))
    .map((s) => ({ date: s.session_date, value: Math.round(vol.get(s.id)! * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Treinos concluídos por semana (segunda como início). Inclui semanas com zero. */
export function weeklyFrequency(sessions: WorkoutSession[], from: string, today: string): Point[] {
  const finished = sessions.filter((s) => s.status === 'finished');
  const firstDate = from === '0000-01-01' ? finished.map((s) => s.session_date).sort()[0] ?? today : from;
  const counts = new Map<string, number>();
  for (const s of finished) {
    if (s.session_date < firstDate) continue;
    const w = startOfWeek(s.session_date);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const out: Point[] = [];
  for (let w = startOfWeek(firstDate); w <= today; w = addDays(w, 7)) out.push({ date: w, value: counts.get(w) ?? 0 });
  return out;
}

/** Duração (min) dos treinos finalizados. */
export function durations(sessions: WorkoutSession[], from: string): Point[] {
  return sessions.filter((s) => s.status === 'finished' && s.duration_seconds !== null && s.session_date >= from)
    .map((s) => ({ date: s.session_date, value: Math.round((s.duration_seconds ?? 0) / 60) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Séries e volume por tipo de exercício. */
export function byType(sets: SetLog[], exerciseType: (exerciseId: string) => string | null, sessionDate: Map<string, string>, from: string) {
  const out = new Map<string, { sets: number; volume: number }>();
  for (const s of sets) {
    const d = sessionDate.get(s.session_id);
    if (!d || d < from) continue;
    const t = exerciseType(s.exercise_id) ?? 'none';
    const cur = out.get(t) ?? { sets: 0, volume: 0 };
    cur.sets += 1; cur.volume += s.reps * Number(s.weight_kg);
    out.set(t, cur);
  }
  return out;
}

/** Exercícios com registros no período (para o seletor), mais frequentes primeiro. */
export function exercisesWithData(sets: SetLog[], ses: SessionExercise[], sessionDate: Map<string, string>, from: string) {
  const names = new Map(ses.map((s) => [s.exercise_id, s.exercise_name_snapshot]));
  const count = new Map<string, number>();
  for (const s of sets) {
    const d = sessionDate.get(s.session_id);
    if (d && d >= from) count.set(s.exercise_id, (count.get(s.exercise_id) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => ({ id, name: names.get(id) ?? 'Exercício' }));
}

/** Média móvel simples por janela de dias (para o peso). */
export function movingAverage(points: Point[], days = 7): Point[] {
  return points.map((p) => {
    const from = addDays(p.date, -(days - 1));
    const win = points.filter((q) => q.date >= from && q.date <= p.date);
    return { date: p.date, value: Math.round((win.reduce((a, q) => a + q.value, 0) / win.length) * 100) / 100 };
  });
}
