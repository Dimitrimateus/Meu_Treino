import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface ToastItem { id: number; text: string; action?: { label: string; run: () => void }; ms: number }
interface ToastApi { show: (text: string, opts?: { action?: ToastItem['action']; ms?: number }) => void }

const Ctx = createContext<ToastApi>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const show = useCallback<ToastApi['show']>((text, opts) => {
    const id = ++idRef.current;
    const ms = opts?.ms ?? (opts?.action ? 6000 : 3000);
    setItems((l) => [...l.slice(-2), { id, text, action: opts?.action, ms }]);
    if (ms > 0) setTimeout(() => dismiss(id), ms);
  }, [dismiss]);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((t) => (
          <div className="toast" key={t.id}>
            <span className="grow">{t.text}</span>
            {t.action && <button onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
