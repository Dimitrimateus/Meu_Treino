import { formatKg, formatNumber } from '../numbers';
import { formatRest } from '../dates';

/** "3 × 8–12 · 20 kg · descanso 90 s" */
export function targetLabel(t: { target_sets: number | null; target_reps: string | null; target_weight_kg: number | null; rest_seconds: number | null }) {
  const parts: string[] = [];
  if (t.target_sets) parts.push(`${t.target_sets} × ${(t.target_reps ?? '—').replace('-', '–')}`);
  if (t.target_weight_kg !== null && t.target_weight_kg !== undefined) parts.push(formatKg(Number(t.target_weight_kg)));
  if (t.rest_seconds) parts.push(`descanso ${formatRest(t.rest_seconds)}`);
  return parts.join(' · ');
}

/** "12 × 20 kg" */
export function setLabel(s: { reps: number; weight_kg: number }) {
  return Number(s.weight_kg) > 0 ? `${s.reps} × ${formatNumber(Number(s.weight_kg))} kg` : `${s.reps} reps`;
}

export function volumeOf(sets: { reps: number; weight_kg: number }[]) {
  return sets.reduce((acc, s) => acc + s.reps * Number(s.weight_kg), 0);
}
