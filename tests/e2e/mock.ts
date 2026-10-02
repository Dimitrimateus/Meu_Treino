import type { Page, Route } from '@playwright/test';

export const USER_ID = '11111111-1111-4111-8111-111111111111';
const TYPE_ID = '22222222-2222-4222-8222-222222222222';
const EX_ID = '33333333-3333-4333-8333-333333333333';
const RE_ID = '44444444-4444-4444-8444-444444444444';

function b64url(o: object) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }

export function todayWeekday(tz = 'America/Recife') {
  const d = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date());
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(d) + 1;
}

export interface Mock { writes: { table: string; method: string; body: unknown }[] }

export async function mockSupabase(page: Page, opts: { role?: 'admin' | 'user' } = {}): Promise<Mock> {
  const now = new Date().toISOString();
  const wd = todayWeekday();
  const days = Array.from({ length: 7 }, (_, i) => ({
    id: `55555555-5555-4555-8555-00000000000${i + 1}`, user_id: USER_ID, weekday: i + 1,
    is_rest: i + 1 !== wd, title: i + 1 === wd ? 'Peito e Tríceps' : null, scheduled_time: i + 1 === wd ? '18:00:00' : null,
    created_at: now, updated_at: now,
  }));
  const data: Record<string, unknown[]> = {
    profiles: [{ id: USER_ID, name: 'Bia', role: opts.role ?? 'user', timezone: 'America/Recife', reminders_enabled: true, reminder_lead_minutes: 60, created_at: now, updated_at: now }],
    exercise_types: [{ id: TYPE_ID, name: 'Peito', color: '#2563EB', created_at: now, updated_at: now, deleted_at: null }],
    exercises: [{ id: EX_ID, name: 'Supino reto', type_id: TYPE_ID, description: 'Deite no banco e empurre a barra.', created_at: now, updated_at: now, deleted_at: null }],
    exercise_media: [],
    routine_days: days,
    routine_exercises: [{
      id: RE_ID, routine_day_id: days[wd - 1].id, user_id: USER_ID, exercise_id: EX_ID, position: 0, target_sets: 3,
      target_reps: '8-12', target_weight_kg: 20, rest_seconds: 90, notes: null, created_at: now, updated_at: now, deleted_at: null,
    }],
  };
  const mock: Mock = { writes: [] };
  const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: USER_ID, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', email: 'bia@x.com' })}.sig`;
  const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'bia@x.com', app_metadata: {}, user_metadata: { name: 'Bia' }, created_at: now };

  await page.route('http://supabase.test/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (path.startsWith('/auth/v1/token')) {
      const body = req.postDataJSON() as { password?: string };
      if (body?.password !== 'senha-certa') return json({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' }, 400);
      return json({ access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user });
    }
    if (path.startsWith('/auth/v1/user')) return json(user);
    if (path.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204 });
    if (path.startsWith('/rest/v1/')) {
      const table = path.slice('/rest/v1/'.length);
      if (req.method() === 'GET') {
        const rows = (data[table] ?? []) as Record<string, unknown>[];
        const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
        if (wantsObject) return rows.length ? json(rows[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406);
        return json(rows);
      }
      const body = req.postDataJSON();
      mock.writes.push({ table, method: req.method(), body });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]', headers: { 'access-control-allow-origin': '*' } });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  return mock;
}
