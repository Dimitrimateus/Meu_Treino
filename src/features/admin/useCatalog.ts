// Catálogo lido online (editor do admin é online-only).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Exercise, ExerciseType } from '../../lib/types';
import { syncNow } from '../../lib/sync/engine';

export function useOnlineList<T>(table: 'exercise_types' | 'exercises', order = 'name') {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const { data, error } = await supabase.from(table).select('*').is('deleted_at', null).order(order);
    if (error) setError(/fetch/i.test(error.message) ? 'Sem conexão. O editor do admin precisa de internet.' : error.message);
    else { setError(null); setRows(data as T[]); }
  }, [table, order]);
  useEffect(() => { void reload(); }, [reload]);
  return { rows, error, reload };
}

export const useTypes = () => useOnlineList<ExerciseType>('exercise_types');
export const useExercises = () => useOnlineList<Exercise>('exercises');

/** Depois de escrever no servidor, atualiza o cache local do próprio admin. */
export function afterAdminWrite() { void syncNow(); }

export function friendlyError(e: { message: string; code?: string } | null): string | null {
  if (!e) return null;
  if (/fetch|network/i.test(e.message)) return 'Sem conexão. O editor do admin precisa de internet.';
  if (e.code === '23505') return 'Já existe um item com esse nome.';
  if (e.code === '42501') return 'Sem permissão.';
  return e.message;
}
