// Recordes pessoais (PR). Espelha a função SQL public.compute_pr (0002_triggers.sql).

export type PrKind = 'weight' | 'e1rm' | 'reps';

export interface SetLike {
  id?: string;
  reps: number;
  weight_kg: number;
  logged_at: string;
  deleted_at?: string | null;
}

/** 1RM estimado (Epley): peso × (1 + min(reps,12)/30); se reps ≤ 1, o próprio peso. */
export function e1rm(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + Math.min(reps, 12) / 30);
}

/**
 * Tipos de PR que `set` bate em relação ao histórico do MESMO usuário e exercício.
 * Considera só séries anteriores (logged_at menor), não excluídas e com id diferente.
 * O primeiro registro da história nunca é PR. Empate não é PR.
 */
export function computePrKinds(set: SetLike, history: SetLike[]): PrKind[] {
  const prev = history.filter(
    (h) => !h.deleted_at && h.id !== set.id && h.logged_at < set.logged_at,
  );
  if (prev.length === 0) return [];
  const kinds: PrKind[] = [];
  if (set.weight_kg > 0) {
    const prevW = Math.max(...prev.map((h) => h.weight_kg));
    const prevE1 = Math.max(...prev.map((h) => e1rm(h.weight_kg, h.reps)));
    if (set.weight_kg > prevW) kinds.push('weight');
    if (e1rm(set.weight_kg, set.reps) > prevE1 + 1e-9) kinds.push('e1rm');
  } else {
    const bw = prev.filter((h) => h.weight_kg === 0).map((h) => h.reps);
    const prevReps = bw.length ? Math.max(...bw) : 0;
    if (set.reps > prevReps) kinds.push('reps');
  }
  return kinds;
}

export const PR_LABEL: Record<PrKind, string> = { weight: 'carga', e1rm: '1RM', reps: 'reps' };

export interface Records {
  maxWeight: { value: number; date: string } | null;
  bestE1rm: { value: number; date: string } | null;
  bestSetVolume: { value: number; date: string } | null;
  maxReps: { value: number; date: string } | null;
}

/** "Seus recordes" para um exercício. `date` = logged_at. */
export function personalRecords(sets: SetLike[]): Records {
  const r: Records = { maxWeight: null, bestE1rm: null, bestSetVolume: null, maxReps: null };
  for (const s of sets) {
    if (s.deleted_at) continue;
    const e = e1rm(s.weight_kg, s.reps), v = s.weight_kg * s.reps;
    if (s.weight_kg > 0 && (!r.maxWeight || s.weight_kg > r.maxWeight.value)) r.maxWeight = { value: s.weight_kg, date: s.logged_at };
    if (s.weight_kg > 0 && (!r.bestE1rm || e > r.bestE1rm.value)) r.bestE1rm = { value: e, date: s.logged_at };
    if (v > 0 && (!r.bestSetVolume || v > r.bestSetVolume.value)) r.bestSetVolume = { value: v, date: s.logged_at };
    if (s.weight_kg === 0 && (!r.maxReps || s.reps > r.maxReps.value)) r.maxReps = { value: s.reps, date: s.logged_at };
  }
  return r;
}
