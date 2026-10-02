// Datas e fuso horário só com Intl (sem bibliotecas). Datas de calendário são
// strings 'YYYY-MM-DD' na data LOCAL do perfil. Dia da semana ISO: 1 = seg … 7 = dom.

export const DEFAULT_TZ = 'America/Recife';

const partsCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    partsCache.set(tz, f);
  }
  return f;
}

export interface ZonedParts { date: string; year: number; month: number; day: number; hour: number; minute: number; second: number }

export function zonedParts(at: Date, tz: string = DEFAULT_TZ): ZonedParts {
  const p: Record<string, string> = {};
  for (const part of dtf(tz).formatToParts(at)) p[part.type] = part.value;
  const year = Number(p.year), month = Number(p.month), day = Number(p.day);
  return {
    date: `${p.year}-${p.month}-${p.day}`, year, month, day,
    hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second),
  };
}

/** Data local 'YYYY-MM-DD' no fuso. */
export function localDate(at: Date = new Date(), tz: string = DEFAULT_TZ): string {
  return zonedParts(at, tz).date;
}

/** Dia ISO (1=seg … 7=dom) de uma data 'YYYY-MM-DD'. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=dom
  return wd === 0 ? 7 : wd;
}

/** Dia ISO de "agora" no fuso. */
export function todayWeekday(tz: string = DEFAULT_TZ, at: Date = new Date()): number {
  return isoWeekday(localDate(at, tz));
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pa[0], pa[1] - 1, pa[2]) - Date.UTC(pb[0], pb[1] - 1, pb[2])) / 86400000);
}

/** Segunda-feira da semana da data. */
export function startOfWeek(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** As 7 datas (seg…dom) da semana que contém `date`. */
export function weekDates(date: string): string[] {
  const mon = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/** Data (no fuso) do dia `weekday` da semana atual. */
export function dateForWeekday(weekday: number, tz: string = DEFAULT_TZ, at: Date = new Date()): string {
  return weekDates(localDate(at, tz))[weekday - 1];
}

/** Minutos desde 00:00 locais. */
export function localMinutes(at: Date, tz: string = DEFAULT_TZ): number {
  const p = zonedParts(at, tz);
  return p.hour * 60 + p.minute;
}

/** "18:30:00" → 1110 */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-10-01" → "01/10" ou "01/10/2026" */
export function formatDateShort(date: string, withYear = false): string {
  const [y, m, d] = date.split('-');
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

/** "2026-10-01" → "qui., 1 de outubro" */
export function formatDateLong(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

/** ISO timestamp → "18:05" no fuso */
export function formatTime(iso: string | null | undefined, tz: string = DEFAULT_TZ): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz, hourCycle: 'h23' }).format(new Date(iso));
}

/** "18:30:00" → "18:30" */
export function formatClock(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '';
}

/** Duração em segundos entre início e fim (nunca negativa). */
export function durationSeconds(startedAt: string | null | undefined, finishedAt: string | null | undefined): number | null {
  if (!startedAt || !finishedAt) return null;
  const s = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  return Number.isFinite(s) ? Math.max(0, s) : null;
}

/** 3900 → "1h 05min"; 300 → "5 min" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60), m = total % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

/** 90 → "90 s"; 150 → "2min30" */
export function formatRest(seconds: number | null | undefined): string {
  if (!seconds) return '';
  if (seconds < 120) return `${seconds} s`;
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return s ? `${m}min${String(s).padStart(2, '0')}` : `${m} min`;
}

export const TIMEZONES = [
  'America/Recife', 'America/Sao_Paulo', 'America/Fortaleza', 'America/Bahia', 'America/Belem',
  'America/Manaus', 'America/Cuiaba', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha',
  'Europe/Lisbon', 'UTC',
];
