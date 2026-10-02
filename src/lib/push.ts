// Web Push: permissão (só por gesto), inscrição e cancelamento.
import { supabase } from './supabase';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Versão do iOS (ex.: 16.4) ou null. */
export function iosVersion(): number | null {
  const m = navigator.userAgent.match(/OS (\d+)_(\d+)/);
  return m ? Number(`${m[1]}.${m[2]}`) : null;
}

export type PushSupport = 'ok' | 'ios-old' | 'ios-not-installed' | 'unsupported' | 'no-key';

export function pushSupport(): PushSupport {
  if (!VAPID || VAPID.includes('<')) return 'no-key';
  if (isIos()) {
    const v = iosVersion();
    if (v !== null && v < 16.4) return 'ios-old';
    if (!isStandalone()) return 'ios-not-installed';
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'ok';
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Deve ser chamado dentro de um clique (iOS exige gesto do usuário). */
export async function enablePush(userId: string): Promise<{ ok: boolean; message: string }> {
  const support = pushSupport();
  if (support !== 'ok') return { ok: false, message: supportMessage(support) };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, message: 'Permissão de notificações negada. Ative nos ajustes do aparelho.' };
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID!) });
  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId, endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth,
    user_agent: navigator.userAgent.slice(0, 250), last_seen_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) return { ok: false, message: 'Não foi possível salvar a inscrição. Verifique a conexão.' };
  return { ok: true, message: 'Lembretes ativados neste aparelho.' };
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager?.getSubscription()) ?? null;
}

export async function unsubscribePush() {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export function supportMessage(s: PushSupport): string {
  switch (s) {
    case 'ios-old': return 'Notificações exigem iOS 16.4 ou mais recente.';
    case 'ios-not-installed': return 'No iPhone, as notificações só funcionam com o app adicionado à Tela de Início (Compartilhar → Adicionar à Tela de Início). Depois abra pelo ícone.';
    case 'unsupported': return 'Este navegador não suporta notificações push.';
    case 'no-key': return 'Notificações ainda não configuradas (chave VAPID ausente).';
    default: return '';
  }
}
