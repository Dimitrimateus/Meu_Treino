// Edge Function chamada a cada minuto pelo pg_cron (0004_cron.sql).
// Proteção: deploy com --no-verify-jwt E checagem do header x-cron-secret.
// 1) Lembrete de treino (antecedência configurável, padrão 60 min).
// 2) Aviso "treino atualizado" agrupado (~2 min após a última alteração do admin).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendPushToUser } from '../_shared/push.ts';
import { inReminderWindow, leadText, timeToMinutes, zoned } from '../_shared/time.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const GROUP_DELAY_MS = 2 * 60 * 1000;

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  const secret = req.headers.get('x-cron-secret') ?? '';
  if (!CRON_SECRET || !safeEqual(secret, CRON_SECRET)) return new Response('forbidden', { status: 403 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const now = new Date();
  const result = { reminders: 0, changes: 0 };

  // ---------- 1) LEMBRETES ----------
  const { data: profiles } = await admin.from('profiles').select('id, name, timezone, reminders_enabled, reminder_lead_minutes').eq('reminders_enabled', true);
  for (const p of profiles ?? []) {
    try {
      const tz = p.timezone || 'America/Recife';
      const local = zoned(now, tz);
      const { data: day } = await admin.from('routine_days').select('*').eq('user_id', p.id).eq('weekday', local.weekday).maybeSingle();
      if (!day || day.is_rest || !day.scheduled_time) continue;
      const scheduled = timeToMinutes(day.scheduled_time);
      if (!inReminderWindow(local.minutes, scheduled, p.reminder_lead_minutes)) continue;
      // não lembrar se já treinou / pulou / iniciou
      const { data: session } = await admin.from('workout_sessions').select('id')
        .eq('user_id', p.id).eq('session_date', local.date).is('deleted_at', null).maybeSingle();
      if (session) continue;
      const title = `Treino em ${leadText(Math.max(scheduled - local.minutes, 1))}${day.title ? `: ${day.title}` : ''}`;
      // dedupe: (user_id, 'workout_reminder', data) — conflito = já enviado
      const { data: inserted, error } = await admin.from('notifications').insert({
        user_id: p.id, kind: 'workout_reminder', title, body: `Horário previsto: ${day.scheduled_time.slice(0, 5)}`, url: '/', dedupe_key: local.date,
      }).select('id').maybeSingle();
      if (error || !inserted) continue;
      await sendPushToUser(admin, p.id, { title, body: `Horário previsto: ${day.scheduled_time.slice(0, 5)}`, url: '/', tag: `reminder-${local.date}` });
      await admin.from('notifications').update({ push_sent_at: new Date().toISOString() }).eq('id', inserted.id);
      result.reminders++;
    } catch (e) {
      console.error('lembrete', p.id, (e as Error).message);
    }
  }

  // ---------- 2) TREINO ALTERADO (agrupado) ----------
  const { data: events } = await admin.from('routine_change_events').select('*').is('processed_at', null).order('created_at');
  const byUser = new Map<string, { ids: number[]; last: number; changedBy: string | null }>();
  for (const ev of events ?? []) {
    const cur = byUser.get(ev.user_id) ?? { ids: [], last: 0, changedBy: null };
    cur.ids.push(ev.id);
    cur.last = Math.max(cur.last, new Date(ev.created_at).getTime());
    cur.changedBy = ev.changed_by ?? cur.changedBy;
    byUser.set(ev.user_id, cur);
  }
  for (const [userId, g] of byUser) {
    if (now.getTime() - g.last < GROUP_DELAY_MS) continue; // ainda editando
    try {
      let who = 'admin';
      if (g.changedBy) {
        const { data: a } = await admin.from('profiles').select('name').eq('id', g.changedBy).maybeSingle();
        if (a?.name) who = a.name;
      }
      const title = `Seu treino foi atualizado por ${who}`;
      // marca primeiro (evita envio duplo se duas execuções se sobrepuserem)
      const { data: marked } = await admin.from('routine_change_events').update({ processed_at: new Date().toISOString() })
        .in('id', g.ids).is('processed_at', null).select('id');
      if (!marked || marked.length === 0) continue;
      const { data: n } = await admin.from('notifications').insert({
        user_id: userId, kind: 'routine_changed', title, body: 'Toque para ver a semana.', url: '/',
      }).select('id').single();
      await sendPushToUser(admin, userId, { title, body: 'Toque para ver a semana.', url: '/', tag: 'routine-changed' });
      if (n) await admin.from('notifications').update({ push_sent_at: new Date().toISOString() }).eq('id', n.id);
      result.changes++;
    } catch (e) {
      console.error('alteração', userId, (e as Error).message);
    }
  }

  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
});
