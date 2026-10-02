// Realtime nas tabelas do treino: quando o admin altera o treino, puxa na hora.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';

let channel: RealtimeChannel | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

export function startRealtime(userId: string, onChange: () => void) {
  stopRealtime();
  const fire = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(onChange, 800);
  };
  try {
    channel = supabase
      .channel(`routine-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routine_days', filter: `user_id=eq.${userId}` }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routine_exercises', filter: `user_id=eq.${userId}` }, fire)
      .subscribe();
  } catch { /* sem realtime: o sync periódico cobre */ }
}

export function stopRealtime() {
  if (debounce) clearTimeout(debounce);
  if (channel) { void supabase.removeChannel(channel); channel = null; }
}
