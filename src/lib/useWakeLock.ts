import { useEffect } from 'react';

/** Mantém a tela acesa durante o treino (Screen Wake Lock), com fallback silencioso. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try { lock = await navigator.wakeLock.request('screen'); } catch { /* sem suporte/negado */ }
      if (cancelled) void lock?.release();
    };
    const onVis = () => { if (document.visibilityState === 'visible') void acquire(); };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis); void lock?.release().catch(() => {}); };
  }, [active]);
}

export function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* sem suporte */ }
}
