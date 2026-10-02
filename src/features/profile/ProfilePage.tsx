import { useEffect, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import { useMe, translateAuthError } from '../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/db';
import { useRoutine } from '../../lib/data/queries';
import { TIMEZONES, WEEKDAYS, formatClock, formatTime } from '../../lib/dates';
import { applyTheme, getTheme, shouldShowIosInstallGuide, type ThemePref } from '../../lib/pwa';
import { currentPushSubscription, enablePush, pushSupport, supportMessage, unsubscribePush } from '../../lib/push';
import { discardFailed, retryFailed } from '../../lib/sync/outbox';
import { syncNow } from '../../lib/sync/engine';
import { useSyncStatus } from '../../lib/sync/status';
import type { AppNotification, Profile } from '../../lib/types';
import { useOutboxCounts } from '../../components/SyncStatus';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { IosInstallSteps } from './InstallGuide';

export default function ProfilePage() {
  const { profile, signOut } = useMe();
  const loc = useLocation();
  useEffect(() => {
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView();
  }, [loc.hash]);
  if (!profile) return null;
  return (
    <>
      <h1>Perfil</h1>
      <AccountSection profile={profile} />
      <RemindersSection profile={profile} />
      {shouldShowIosInstallGuide() && (
        <>
          <h2 className="section-title">Como instalar no iPhone</h2>
          <div className="card"><IosInstallSteps /></div>
        </>
      )}
      <SyncSection />
      <InboxSection />
      <AppearanceSection />
      <button className="btn secondary block mt" onClick={() => { if (confirm('Sair desta conta? Registros ainda não sincronizados serão perdidos.')) void signOut(); }}>
        <Icon name="logout" /> Sair
      </button>
      <p className="muted tiny center mt">Versão {__APP_VERSION__}</p>
    </>
  );
}

async function updateProfile(id: string, patch: Partial<Profile>) {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(/fetch/i.test(error.message) ? 'Sem conexão. Tente de novo quando estiver online.' : error.message);
  await db.profile.put(data as Profile);
}

function AccountSection({ profile }: { profile: Profile }) {
  const toast = useToast();
  const [name, setName] = useState(profile.name);
  const [tz, setTz] = useState(profile.timezone);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try { await updateProfile(profile.id, { name: name.trim() || profile.name, timezone: tz }); toast.show('Perfil salvo'); }
    catch (err) { toast.show((err as Error).message); }
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { toast.show('A senha precisa ter pelo menos 8 caracteres'); return; }
    if (pw !== pw2) { toast.show('As senhas não conferem'); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) toast.show(translateAuthError(error.message));
    else { setPw(''); setPw2(''); toast.show('Senha alterada'); }
  }
  return (
    <>
      <h2 className="section-title">Conta</h2>
      <form className="card" onSubmit={saveProfile}>
        <label className="field"><span>Nome</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Fuso horário</span>
          <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
            {[...new Set([tz, ...TIMEZONES])].map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
          </select>
        </label>
        <button className="btn block">Salvar</button>
      </form>
      <form className="card" onSubmit={changePassword}>
        <input type="text" autoComplete="username" value={profile.name} hidden readOnly />
        <label className="field"><span>Nova senha</span><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} /></label>
        <label className="field"><span>Repita a nova senha</span><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} /></label>
        <button className="btn secondary block" disabled={!pw}>Trocar senha</button>
      </form>
    </>
  );
}

function leadLabel(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} h${r ? ` ${r} min` : ''}`;
}

function RemindersSection({ profile }: { profile: Profile }) {
  const toast = useToast();
  const routine = useRoutine(profile.id);
  const support = pushSupport();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [lead, setLead] = useState(profile.reminder_lead_minutes);
  useEffect(() => { void currentPushSubscription().then((s) => setSubscribed(Boolean(s))); }, []);

  async function enable() {
    setBusy(true);
    try {
      const r = await enablePush(profile.id);
      toast.show(r.message);
      if (r.ok) { setSubscribed(true); if (!profile.reminders_enabled) await updateProfile(profile.id, { reminders_enabled: true }); }
    } catch (e) { toast.show((e as Error).message); } finally { setBusy(false); }
  }

  async function setTime(weekday: number, value: string) {
    const { error } = await supabase.rpc('set_my_schedule', { p_weekday: weekday, p_time: value || null });
    if (error) { toast.show(/fetch/i.test(error.message) ? 'Sem conexão.' : error.message); return; }
    toast.show('Horário salvo');
    void syncNow();
  }

  return (
    <>
      <h2 className="section-title">Lembretes</h2>
      <div className="card">
        <p className="small">Receba um aviso antes do treino e quando seu treino for atualizado.</p>
        {support !== 'ok' ? (
          <p className="banner warn small">{supportMessage(support)}</p>
        ) : subscribed ? (
          <div className="row between">
            <span className="badge success"><Icon name="bell" size={14} />Ativados neste aparelho</span>
            <button className="btn ghost sm" onClick={async () => { await unsubscribePush(); setSubscribed(false); toast.show('Lembretes desativados neste aparelho'); }}>Desativar</button>
          </div>
        ) : (
          <button className="btn block" onClick={enable} disabled={busy}><Icon name="bell" /> Ativar lembretes</button>
        )}
        <label className="checkbox mt">
          <input type="checkbox" checked={profile.reminders_enabled}
            onChange={async (e) => { try { await updateProfile(profile.id, { reminders_enabled: e.target.checked }); } catch (err) { toast.show((err as Error).message); } }} />
          Lembrete antes do treino
        </label>
        <label className="field"><span>Antecedência (minutos)</span>
          <select className="input" value={lead} onChange={async (e) => {
            const v = Number(e.target.value); setLead(v);
            try { await updateProfile(profile.id, { reminder_lead_minutes: v }); toast.show('Antecedência salva'); } catch (err) { toast.show((err as Error).message); }
          }}>
            {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{leadLabel(m)}</option>)}
          </select>
        </label>
        <p className="muted tiny">O aviso chega aproximadamente nesse horário (o iPhone pode atrasar um pouco).</p>
        <div className="label mt">Horário do treino por dia</div>
        <ul className="list">
          {routine?.days.filter((d) => !d.is_rest).map((d) => (
            <li key={d.weekday} className="row between">
              <span>{WEEKDAYS[d.weekday - 1]}{d.title && <span className="muted small"> · {d.title}</span>}</span>
              <input className="input" style={{ width: 120 }} type="time" aria-label={`Horário de ${WEEKDAYS[d.weekday - 1]}`}
                defaultValue={formatClock(d.scheduled_time)} onBlur={(e) => { if (e.target.value !== formatClock(d.scheduled_time)) void setTime(d.weekday, e.target.value); }} />
            </li>
          ))}
          {routine && routine.days.every((d) => d.is_rest) && <li className="muted small">Nenhum dia de treino na semana.</li>}
        </ul>
      </div>
    </>
  );
}

function SyncSection() {
  const s = useSyncStatus();
  const { pending, failed } = useOutboxCounts();
  const failedItems = useLiveQuery(() => db.outbox.where('status').equals('failed').toArray(), [], []);
  const TABLE_LABEL: Record<string, string> = {
    workout_sessions: 'Treino', session_exercises: 'Exercício do treino', set_logs: 'Série', session_events: 'Log',
    body_weight_logs: 'Peso', progress_photos: 'Foto',
  };
  return (
    <>
      <h2 className="section-title" id="sync">Sincronização</h2>
      <div className="card">
        <div className="stats">
          <div className="stat"><strong>{s.online ? 'Online' : 'Offline'}</strong><span>conexão</span></div>
          <div className="stat"><strong>{pending}</strong><span>pendentes</span></div>
          <div className="stat"><strong>{failed}</strong><span>com erro</span></div>
        </div>
        <p className="muted small mt">Última sincronização: {s.lastSyncAt ? `${new Date(s.lastSyncAt).toLocaleDateString('pt-BR')} ${formatTime(new Date(s.lastSyncAt).toISOString())}` : 'nunca'}</p>
        {s.lastError && <p className="error-text small">Último erro: {s.lastError}</p>}
        <button className="btn secondary block" onClick={() => void syncNow()} disabled={s.syncing || !s.online}>
          <Icon name="refresh" /> {s.syncing ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
        {failedItems.length > 0 && (
          <>
            <div className="label mt">Itens com erro</div>
            <ul className="list">
              {failedItems.map((it) => (
                <li key={it.seq}>
                  <div className="small"><strong>{TABLE_LABEL[it.table] ?? it.table}</strong> · {new Date(it.createdAt).toLocaleString('pt-BR')}</div>
                  <div className="tiny muted">{it.lastError}</div>
                  <div className="row mt">
                    <button className="btn sm secondary" onClick={async () => { await retryFailed(it.seq); void syncNow({ pull: false }); }}>Tentar de novo</button>
                    <button className="btn sm ghost" style={{ color: 'var(--danger)' }} onClick={() => { if (confirm('Descartar esta alteração? Ela não será enviada.')) void discardFailed(it.seq!); }}>Descartar</button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

function InboxSection() {
  const { userId } = useMe();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  useEffect(() => {
    supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setItems((data ?? []) as AppNotification[]));
  }, [userId]);
  const unread = items?.filter((n) => !n.read_at) ?? [];
  return (
    <>
      <h2 className="section-title">Notificações</h2>
      <div className="card">
        {items === null ? <p className="muted small">Carregando…</p> : items.length === 0 ? <p className="muted small mb0">Nenhuma notificação ainda.</p> : (
          <>
            <ul className="list">
              {items.map((n) => (
                <li key={n.id}>
                  <div className="row between"><strong className="small">{!n.read_at && <span className="badge primary">nova</span>} {n.title}</strong>
                    <span className="tiny muted">{new Date(n.created_at).toLocaleDateString('pt-BR')} {formatTime(n.created_at)}</span></div>
                  {n.body && <div className="small muted">{n.body}</div>}
                </li>
              ))}
            </ul>
            {unread.length > 0 && (
              <button className="btn ghost sm" onClick={async () => {
                const now = new Date().toISOString();
                await supabase.from('notifications').update({ read_at: now }).in('id', unread.map((n) => n.id));
                setItems((l) => l!.map((n) => ({ ...n, read_at: n.read_at ?? now })));
              }}>Marcar todas como lidas</button>
            )}
          </>
        )}
      </div>
    </>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState<ThemePref>(getTheme());
  return (
    <>
      <h2 className="section-title">Aparência</h2>
      <div className="tabs" role="radiogroup" aria-label="Tema">
        {([['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']] as const).map(([v, l]) => (
          <button key={v} role="radio" aria-checked={theme === v} aria-selected={theme === v} onClick={() => { setTheme(v); applyTheme(v); }}>{l}</button>
        ))}
      </div>
    </>
  );
}
