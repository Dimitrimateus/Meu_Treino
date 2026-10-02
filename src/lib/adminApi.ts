import { supabase } from './supabase';
import type { Profile } from './types';

export interface AdminUser extends Profile { email?: string; last_sign_in_at?: string | null }

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    // tenta extrair a mensagem do corpo da resposta
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') msg = (await ctx.json()).error ?? msg;
    } catch { /* ignore */ }
    if (/fetch|network/i.test(msg)) msg = 'Sem conexão. Esta ação precisa de internet.';
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const adminApi = {
  list: () => call<{ users: AdminUser[] }>({ action: 'list' }).then((r) => r.users),
  create: (name: string, email: string, password: string) => call<{ id: string }>({ action: 'create', name, email, password }),
  resetPassword: (user_id: string, password: string) => call({ action: 'reset_password', user_id, password }),
  setRole: (user_id: string, role: 'admin' | 'user') => call({ action: 'set_role', user_id, role }),
  remove: (user_id: string) => call({ action: 'delete', user_id }),
};
