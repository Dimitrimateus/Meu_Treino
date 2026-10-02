// Envio de Web Push (VAPID) a partir das Edge Functions.
// Falhas 404/410 → a inscrição expirou: apagar.
import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
let configured = false;

export interface PushMessage { title: string; body?: string; url?: string; tag?: string }

export async function sendPushToUser(admin: SupabaseClient, userId: string, msg: PushMessage): Promise<{ sent: number; removed: number }> {
  if (!PUBLIC || !PRIVATE) return { sent: 0, removed: 0 };
  if (!configured) { webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE); configured = true; }
  const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', userId);
  let sent = 0, removed = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(msg),
        { TTL: 60 * 60, urgency: 'high' },
      );
      sent++;
      await admin.from('push_subscriptions').update({ last_seen_at: new Date().toISOString() }).eq('id', s.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', s.id);
        removed++;
      } else {
        console.error('push falhou', status, (e as Error).message);
      }
    }
  }
  return { sent, removed };
}
