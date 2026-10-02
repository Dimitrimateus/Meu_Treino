// Camada fina sobre o Supabase usada pelo motor de sync (injetável nos testes).
import { supabase } from '../supabase';
import type { PushTable, SyncedTable } from '../types';

export interface RemoteError { message: string; code?: string; status?: number }
export type Row = Record<string, unknown>;

export interface Remote {
  upsert(table: PushTable, rows: Row[]): Promise<{ error: RemoteError | null }>;
  fetchChanged(table: SyncedTable, since: string | null, ownerId: string | null, limit: number): Promise<{ data: Row[] | null; error: RemoteError | null }>;
  findSessionByDate(userId: string, date: string): Promise<{ data: Row | null; error: RemoteError | null }>;
  fetchSessionExercises(sessionId: string): Promise<{ data: Row[] | null; error: RemoteError | null }>;
  uploadPhoto(path: string, blob: Blob): Promise<{ error: RemoteError | null }>;
  removePhoto(path: string): Promise<{ error: RemoteError | null }>;
}

function toErr(error: { message: string; code?: string } | null, status?: number): RemoteError | null {
  if (!error) return null;
  return { message: error.message, code: error.code, status };
}

export const supabaseRemote: Remote = {
  async upsert(table, rows) {
    const res = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    return { error: toErr(res.error, res.status) };
  },
  async fetchChanged(table, since, ownerId, limit) {
    let q = supabase.from(table).select('*').order('updated_at', { ascending: true }).limit(limit);
    if (since) q = q.gte('updated_at', since);
    if (ownerId) q = q.eq('user_id', ownerId);
    const res = await q;
    return { data: (res.data as Row[] | null) ?? null, error: toErr(res.error, res.status) };
  },
  async findSessionByDate(userId, date) {
    const res = await supabase.from('workout_sessions').select('*')
      .eq('user_id', userId).eq('session_date', date).is('deleted_at', null).maybeSingle();
    return { data: (res.data as Row | null) ?? null, error: toErr(res.error, res.status) };
  },
  async fetchSessionExercises(sessionId) {
    const res = await supabase.from('session_exercises').select('*').eq('session_id', sessionId);
    return { data: (res.data as Row[] | null) ?? null, error: toErr(res.error, res.status) };
  },
  async uploadPhoto(path, blob) {
    const res = await supabase.storage.from('progress-photos').upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    const e = res.error as (Error & { statusCode?: string; status?: number }) | null;
    return { error: e ? { message: e.message, status: Number(e.statusCode ?? e.status ?? 0) || undefined } : null };
  },
  async removePhoto(path) {
    const res = await supabase.storage.from('progress-photos').remove([path]);
    return { error: res.error ? { message: res.error.message } : null };
  },
};
