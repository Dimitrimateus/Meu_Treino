import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useLiveQuery } from 'dexie-react-hooks';
import { supabase } from '../../lib/supabase';
import { clearLocalData, db, requestPersistentStorage } from '../../lib/db';
import { startSync, stopSync } from '../../lib/sync/engine';
import type { Profile } from '../../lib/types';
import { DEFAULT_TZ } from '../../lib/dates';
import { unsubscribePush } from '../../lib/push';

interface AuthState {
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  isAdmin: boolean;
  tz: string;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);
const LAST_USER = 'treinos-last-user';

export function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'E-mail ainda não confirmado. Peça ao admin para confirmar sua conta.';
  if (m.includes('fetch') || m.includes('network')) return 'Sem conexão. O primeiro acesso precisa de internet.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  if (m.includes('password should be') || m.includes('at least')) return 'A senha precisa ter pelo menos 8 caracteres.';
  return msg;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const userId = session?.user.id ?? null;

  // o resultado carrega o uid consultado: o hook mantém o valor anterior enquanto reconsulta
  const profileQ = useLiveQuery(async () => ({ uid: userId, p: userId ? (await db.profile.get(userId)) ?? null : null }), [userId]);
  const profile = profileQ && profileQ.uid === userId ? profileQ.p : undefined;

  const onUser = useCallback(async (uid: string | null) => {
    if (!uid) { stopSync(); return; }
    const last = localStorage.getItem(LAST_USER);
    if (last && last !== uid) await clearLocalData(); // outra conta neste aparelho
    localStorage.setItem(LAST_USER, uid);
    void requestPersistentStorage();
    startSync(uid);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await onUser(data.session?.user.id ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'INITIAL_SESSION') return;
      setSession(s);
      if (event === 'SIGNED_IN') void onUser(s?.user.id ?? null);
      if (event === 'SIGNED_OUT') stopSync();
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [onUser]);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data) await db.profile.put(data as Profile);
  }, [userId]);

  // perfil ainda não em cache (primeiro acesso): busca já
  useEffect(() => {
    if (userId && profile === null) void refreshProfile();
  }, [userId, profile, refreshProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? translateAuthError(error.message) : null;
  }, []);

  const signOut = useCallback(async () => {
    stopSync();
    await unsubscribePush().catch(() => {});
    await supabase.auth.signOut().catch(() => {});
    await clearLocalData();
    localStorage.removeItem(LAST_USER);
    setSession(null);
  }, []);

  const value = useMemo<AuthState>(() => ({
    session, userId, profile: profile ?? null,
    isAdmin: profile?.role === 'admin',
    tz: profile?.timezone || DEFAULT_TZ,
    loading: loading || (!!userId && profile === undefined),
    signIn, signOut, refreshProfile,
  }), [session, userId, profile, loading, signIn, signOut, refreshProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fora do AuthProvider');
  return v;
}

/** Para telas que só existem com usuário logado. */
export function useMe() {
  const a = useAuth();
  return { ...a, userId: a.userId!, profile: a.profile! };
}
