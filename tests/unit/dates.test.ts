import { describe, expect, it } from 'vitest';
import {
  addDays, dateForWeekday, durationSeconds, formatDuration, isoWeekday, localDate, localMinutes, startOfWeek, weekDates,
} from '../../src/lib/dates';

describe('fuso America/Recife (UTC−3)', () => {
  it('perto da meia-noite UTC ainda é o dia anterior', () => {
    const at = new Date('2026-10-02T01:30:00Z'); // 22:30 de 01/10 em Recife
    expect(localDate(at, 'America/Recife')).toBe('2026-10-01');
    expect(localDate(at, 'UTC')).toBe('2026-10-02');
    expect(localMinutes(at, 'America/Recife')).toBe(22 * 60 + 30);
  });
  it('depois das 03:00 UTC vira o dia seguinte', () => {
    expect(localDate(new Date('2026-10-02T03:00:00Z'), 'America/Recife')).toBe('2026-10-02');
  });
  it('dia ISO', () => {
    expect(isoWeekday('2026-09-28')).toBe(1); // segunda
    expect(isoWeekday('2026-10-04')).toBe(7); // domingo
    // domingo 23:30 em Recife = segunda 02:30 UTC
    const at = new Date('2026-10-05T02:30:00Z');
    expect(isoWeekday(localDate(at, 'America/Recife'))).toBe(7);
    expect(isoWeekday(localDate(at, 'UTC'))).toBe(1);
  });
});

describe('semana', () => {
  it('começa na segunda', () => {
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28');
    expect(weekDates('2026-10-01')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ]);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dateForWeekday(5, 'America/Recife', new Date('2026-10-01T12:00:00Z'))).toBe('2026-10-02');
  });
});

describe('duração', () => {
  it('finished_at − started_at', () => {
    expect(durationSeconds('2026-10-01T18:00:00Z', '2026-10-01T19:05:30Z')).toBe(3930);
    expect(durationSeconds('2026-10-01T18:00:00Z', null)).toBeNull();
    expect(durationSeconds('2026-10-01T18:00:00Z', '2026-10-01T17:00:00Z')).toBe(0);
    expect(formatDuration(3930)).toBe('1h 06min');
    expect(formatDuration(300)).toBe('5 min');
  });
});
