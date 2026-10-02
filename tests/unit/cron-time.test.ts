import { describe, expect, it } from 'vitest';
import { inReminderWindow, leadText, timeToMinutes, zoned } from '../../supabase/functions/_shared/time';

describe('cron-tick: janela do lembrete', () => {
  const sched = timeToMinutes('18:00:00');
  it('envia dentro de [agendado − 60, agendado)', () => {
    expect(inReminderWindow(17 * 60, sched, 60)).toBe(true);
    expect(inReminderWindow(17 * 60 + 59, sched, 60)).toBe(true);
  });
  it('nunca antes da janela nem no/depois do horário', () => {
    expect(inReminderWindow(16 * 60 + 59, sched, 60)).toBe(false);
    expect(inReminderWindow(18 * 60, sched, 60)).toBe(false);
    expect(inReminderWindow(18 * 60 + 5, sched, 60)).toBe(false);
  });
  it('dia e hora no fuso do perfil', () => {
    const z = zoned(new Date('2026-10-05T02:30:00Z'), 'America/Recife'); // dom 23:30
    expect(z).toEqual({ date: '2026-10-04', weekday: 7, minutes: 23 * 60 + 30 });
  });
  it('texto da antecedência', () => {
    expect(leadText(60)).toBe('1h');
    expect(leadText(45)).toBe('45 min');
    expect(leadText(90)).toBe('1h30');
  });
});
