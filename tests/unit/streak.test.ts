import { describe, expect, it } from 'vitest';
import { bestStreak, currentStreak } from '../../src/lib/streak';

// 2026-09-28 é segunda. Plano: seg (1), qua (3), sex (5).
const planned = [1, 3, 5];

describe('streak', () => {
  it('descanso não quebra', () => {
    const sessions = { '2026-09-28': 'finished', '2026-09-30': 'finished', '2026-10-02': 'finished' } as const;
    expect(currentStreak({ plannedWeekdays: planned, sessions, today: '2026-10-04' })).toBe(3);
  });
  it('dia planejado passado sem treino quebra', () => {
    const sessions = { '2026-09-28': 'finished', '2026-10-02': 'finished' } as const; // faltou quarta 30
    expect(currentStreak({ plannedWeekdays: planned, sessions, today: '2026-10-02' })).toBe(1);
    expect(bestStreak({ plannedWeekdays: planned, sessions, today: '2026-10-02' })).toBe(1);
  });
  it('"não treinei" quebra', () => {
    const sessions = { '2026-09-28': 'finished', '2026-09-30': 'skipped', '2026-10-02': 'finished' } as const;
    expect(currentStreak({ plannedWeekdays: planned, sessions, today: '2026-10-02' })).toBe(1);
  });
  it('hoje ainda não quebra', () => {
    const sessions = { '2026-09-28': 'finished', '2026-09-30': 'finished' } as const;
    expect(currentStreak({ plannedWeekdays: planned, sessions, today: '2026-10-02' })).toBe(2);
    const inProgress = { ...sessions, '2026-10-02': 'in_progress' } as const;
    expect(currentStreak({ plannedWeekdays: planned, sessions: inProgress, today: '2026-10-02' })).toBe(2);
  });
  it('treino extra em dia de descanso conta', () => {
    const sessions = { '2026-09-28': 'finished', '2026-09-29': 'finished', '2026-09-30': 'finished' } as const;
    expect(currentStreak({ plannedWeekdays: planned, sessions, today: '2026-09-30' })).toBe(3);
  });
  it('melhor sequência', () => {
    const sessions = {
      '2026-09-21': 'finished', '2026-09-23': 'finished', '2026-09-25': 'finished', '2026-09-28': 'finished',
      '2026-09-30': 'skipped', '2026-10-02': 'finished',
    } as const;
    expect(bestStreak({ plannedWeekdays: planned, sessions, today: '2026-10-02' })).toBe(4);
    expect(currentStreak({ plannedWeekdays: planned, sessions, today: '2026-10-02' })).toBe(1);
  });
  it('sem sessões = 0', () => {
    expect(currentStreak({ plannedWeekdays: planned, sessions: {}, today: '2026-10-02' })).toBe(0);
  });
});
