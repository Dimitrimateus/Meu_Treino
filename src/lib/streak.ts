// Sequência (streak) de treinos. Regras (PROJETO.md 8.6):
// - dia treinado = sessão 'finished';
// - dias de descanso não quebram;
// - dia planejado PASSADO sem sessão finalizada quebra; "não treinei" (skipped) quebra;
// - hoje ainda não quebra (exceto se marcado "não treinei").
import { addDays } from './dates';

export type SessionStatus = 'in_progress' | 'finished' | 'skipped';

export interface StreakInput {
  /** dias ISO (1..7) com treino planejado */
  plannedWeekdays: Set<number> | number[];
  /** status da sessão por data 'YYYY-MM-DD' */
  sessions: Map<string, SessionStatus> | Record<string, SessionStatus>;
  today: string;
}

function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

function norm(input: StreakInput) {
  const planned = input.plannedWeekdays instanceof Set ? input.plannedWeekdays : new Set(input.plannedWeekdays);
  const sessions = input.sessions instanceof Map ? input.sessions : new Map(Object.entries(input.sessions));
  const dates = [...sessions.keys()].sort();
  return { planned, sessions, first: dates[0] as string | undefined };
}

type Step = 'count' | 'neutral' | 'break';
function step(date: string, today: string, planned: Set<number>, sessions: Map<string, SessionStatus>): Step {
  const st = sessions.get(date);
  if (st === 'finished') return 'count';
  if (st === 'skipped') return 'break';
  if (!planned.has(weekdayOf(date))) return 'neutral';
  if (date >= today) return 'neutral';
  return 'break';
}

/** Sequência atual (contando para trás a partir de hoje). */
export function currentStreak(input: StreakInput): number {
  const { planned, sessions, first } = norm(input);
  if (!first) return 0;
  let n = 0;
  for (let d = input.today; d >= first; d = addDays(d, -1)) {
    const s = step(d, input.today, planned, sessions);
    if (s === 'break') break;
    if (s === 'count') n++;
  }
  return n;
}

/** Maior sequência da história. */
export function bestStreak(input: StreakInput): number {
  const { planned, sessions, first } = norm(input);
  if (!first) return 0;
  let best = 0, n = 0;
  for (let d = first; d <= input.today; d = addDays(d, 1)) {
    const s = step(d, input.today, planned, sessions);
    if (s === 'break') n = 0;
    else if (s === 'count') { n++; best = Math.max(best, n); }
  }
  return best;
}
