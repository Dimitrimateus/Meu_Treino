// Fuso/horário com Intl (mesma lógica de src/lib/dates.ts).
export function zoned(at: Date, tz: string) {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)) p[part.type] = part.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { date, weekday: wd === 0 ? 7 : wd, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Janela do lembrete: [agendado − antecedência, agendado). Nunca depois do horário. */
export function inReminderWindow(nowMin: number, scheduledMin: number, leadMin: number): boolean {
  return nowMin >= scheduledMin - leadMin && nowMin < scheduledMin;
}

export function leadText(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}
