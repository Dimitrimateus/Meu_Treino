// Lista de pessoas (só admin) para o seletor "Ver: [Eu ▾ / Nome]". Online, com cache local.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from './supabase';
import type { Profile } from './types';
import { useAuth } from '../features/auth/AuthProvider';

const KEY = 'treinos-people';

function cached(): Profile[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function usePeople(enabled: boolean): Profile[] {
  const [people, setPeople] = useState<Profile[]>(cached);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    supabase.from('profiles').select('*').order('name').then(({ data }) => {
      if (!alive || !data) return;
      setPeople(data as Profile[]);
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
    });
    return () => { alive = false; };
  }, [enabled]);
  return people;
}

/** Pessoa selecionada via ?u= (admin). Usuária comum sempre vê a si mesma. */
export function useViewedPerson() {
  const { userId, isAdmin, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const people = usePeople(isAdmin);
  const requested = params.get('u');
  const viewedId = isAdmin && requested ? requested : userId!;
  const isSelf = viewedId === userId;
  const viewed = isSelf ? profile : people.find((p) => p.id === viewedId) ?? null;
  const setViewed = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === userId) next.delete('u'); else next.set('u', id);
    setParams(next, { replace: true });
  };
  return { viewedId, isSelf, viewed, people, setViewed, isAdmin };
}
