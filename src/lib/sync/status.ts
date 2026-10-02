// Estado observável do motor de sync (para o indicador no topo e Perfil).
import { useSyncExternalStore } from 'react';

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
}

let state: SyncStatus = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  lastSyncAt: Number(globalThis.localStorage?.getItem('treinos-last-sync')) || null,
  lastError: null,
};
const listeners = new Set<() => void>();

export function setSyncStatus(patch: Partial<SyncStatus>) {
  state = { ...state, ...patch };
  if (patch.lastSyncAt) {
    try { localStorage.setItem('treinos-last-sync', String(patch.lastSyncAt)); } catch { /* ignore */ }
  }
  listeners.forEach((l) => l());
}

export function getSyncStatus() { return state; }

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => state,
  );
}
