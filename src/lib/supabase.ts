import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('<PROJECT_REF>'));

// Só a anon key (pública, protegida por RLS) vai para o cliente.
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? url! : 'http://localhost:54321',
  isSupabaseConfigured ? anonKey! : 'public-anon-key',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'treinos-auth' },
  },
);

export const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined) || 'Treinos';

/** URL pública de uma mídia de exercício (bucket público). */
export function exerciseMediaUrl(path: string): string {
  return supabase.storage.from('exercise-media').getPublicUrl(path).data.publicUrl;
}
