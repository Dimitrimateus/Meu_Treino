import { useEffect, useRef, type ReactNode } from 'react';

interface Props { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }

export function Modal({ title, onClose, children, actions }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string; message: ReactNode; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void; busy?: boolean;
}
export function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger, onConfirm, onCancel, busy }: ConfirmProps) {
  return (
    <Modal title={title} onClose={onCancel} actions={<>
      <button className="btn secondary" onClick={onCancel}>Cancelar</button>
      <button className={`btn ${danger ? 'danger' : ''}`} onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
    </>}>
      <div>{message}</div>
    </Modal>
  );
}
