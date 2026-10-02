import { bestStreak, currentStreak } from '../streak';
import type { RoutineDay, WorkoutSession } from '../types';

export function streaksFor(days: RoutineDay[] | undefined, sessions: WorkoutSession[] | undefined, today: string) {
  if (!days || !sessions) return { current: 0, best: 0 };
  const plannedWeekdays = days.filter((d) => !d.is_rest).map((d) => d.weekday);
  const map = new Map(sessions.filter((s) => !s.deleted_at).map((s) => [s.session_date, s.status]));
  const input = { plannedWeekdays, sessions: map, today };
  return { current: currentStreak(input), best: bestStreak(input) };
}
