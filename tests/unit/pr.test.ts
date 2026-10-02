import { describe, expect, it } from 'vitest';
import { computePrKinds, e1rm, personalRecords } from '../../src/lib/pr';

const s = (id: string, reps: number, w: number, t: string) => ({ id, reps, weight_kg: w, logged_at: `2026-10-0${t}T18:00:00Z` });

describe('e1rm (Epley)', () => {
  it('fórmula', () => {
    expect(e1rm(100, 10)).toBeCloseTo(133.333, 2);
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 0)).toBe(100);
    expect(e1rm(100, 20)).toBeCloseTo(140, 5); // reps limitadas a 12
  });
});

describe('computePrKinds', () => {
  const hist = [s('a', 10, 20, '1')];
  it('primeiro registro não é PR', () => {
    expect(computePrKinds(s('x', 10, 50, '1'), [])).toEqual([]);
  });
  it('PR de carga (e 1RM)', () => {
    expect(computePrKinds(s('b', 10, 22.5, '2'), hist)).toEqual(['weight', 'e1rm']);
  });
  it('PR só de 1RM (mesma carga, mais reps)', () => {
    expect(computePrKinds(s('b', 12, 20, '2'), hist)).toEqual(['e1rm']);
  });
  it('empate não é PR', () => {
    expect(computePrKinds(s('b', 10, 20, '2'), hist)).toEqual([]);
  });
  it('PR de reps com peso 0', () => {
    const bw = [s('a', 15, 0, '1')];
    expect(computePrKinds(s('b', 16, 0, '2'), bw)).toEqual(['reps']);
    expect(computePrKinds(s('b', 15, 0, '2'), bw)).toEqual([]);
  });
  it('ignora séries posteriores, excluídas e a própria', () => {
    const h = [s('a', 10, 20, '1'), s('z', 10, 99, '3'), { ...s('d', 10, 98, '1'), deleted_at: 'x' }];
    expect(computePrKinds(s('b', 10, 25, '2'), h)).toEqual(['weight', 'e1rm']);
    expect(computePrKinds(s('a', 10, 20, '1'), [s('a', 10, 20, '1')])).toEqual([]);
  });
});

describe('personalRecords', () => {
  it('maior carga, 1RM e volume', () => {
    const r = personalRecords([s('a', 10, 20, '1'), s('b', 5, 25, '2'), s('c', 15, 0, '3')]);
    expect(r.maxWeight?.value).toBe(25);
    expect(r.bestE1rm?.value).toBeCloseTo(29.1667, 3);
    expect(r.bestSetVolume?.value).toBe(200);
    expect(r.maxReps?.value).toBe(15);
  });
});
