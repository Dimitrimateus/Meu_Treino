// Instalação (beforeinstallprompt / guia iOS) e atualização do service worker.
import { useSyncExternalStore } from 'react';
import { isIos, isStandalone } from './push';

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

interface PwaState { needRefresh: boolean; canInstall: boolean }
let state: PwaState = { needRefresh: false, canInstall: false };
let deferred: BeforeInstallPromptEvent | null = null;
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();
const set = (p: Partial<PwaState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };

export async function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => { deferred = null; set({ canInstall: false }); });
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => set({ needRefresh: true }),
      onRegisteredSW: (_url, reg) => {
        // procura atualização ao voltar para o app
        if (reg) document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update(); });
      },
    });
  } catch { /* sem SW */ }
}

export function usePwa(): PwaState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state, () => state);
}

export async function applyUpdate() { await updateSW?.(true); }

export async function promptInstall() {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice;
  deferred = null;
  set({ canInstall: false });
}

/** iPhone/iPad no Safari, fora do modo instalado: mostrar guia "Como instalar". */
export function shouldShowIosInstallGuide(): boolean {
  return isIos() && !isStandalone();
}

export type ThemePref = 'auto' | 'light' | 'dark';
export function getTheme(): ThemePref {
  try { return (localStorage.getItem('treinos-theme') as ThemePref) || 'auto'; } catch { return 'auto'; }
}
export function applyTheme(t: ThemePref = getTheme()) {
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  try { localStorage.setItem('treinos-theme', t); } catch { /* ignore */ }
}
