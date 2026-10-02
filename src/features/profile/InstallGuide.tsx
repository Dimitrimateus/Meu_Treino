import { useState } from 'react';
import { promptInstall, shouldShowIosInstallGuide, usePwa } from '../../lib/pwa';
import { APP_NAME } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';

export function IosInstallSteps() {
  return (
    <ol className="install-steps">
      <li><span className="step-ico"><Icon name="share" /></span>No <strong>Safari</strong>, toque em <strong>Compartilhar</strong> (quadrado com seta para cima).</li>
      <li><span className="step-ico"><Icon name="plus" /></span>Role e toque em <strong>Adicionar à Tela de Início</strong>.</li>
      <li><span className="step-ico"><Icon name="check" /></span>Toque em <strong>Adicionar</strong> e abra o app pelo ícone “{APP_NAME}”.</li>
      <li><span className="step-ico"><Icon name="bell" /></span>Em <strong>Perfil</strong>, toque em <strong>Ativar lembretes</strong>.</li>
    </ol>
  );
}

/** Banner na Semana: iOS fora do modo instalado → guia; Android/desktop → botão Instalar. */
export function InstallBanner() {
  const { canInstall } = usePwa();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('treinos-install-dismissed') === '1'; } catch { return false; } });
  const [open, setOpen] = useState(false);
  const ios = shouldShowIosInstallGuide();
  if (hidden || (!ios && !canInstall)) return null;
  const dismiss = () => { try { localStorage.setItem('treinos-install-dismissed', '1'); } catch { /* ignore */ } setHidden(true); };
  return (
    <div className="banner row between">
      <span className="grow">Instale o app para usar offline e receber lembretes.</span>
      {ios ? <button className="btn sm" onClick={() => setOpen(true)}>Como instalar</button>
        : <button className="btn sm" onClick={() => void promptInstall()}>Instalar</button>}
      <button className="btn ghost icon-btn" aria-label="Dispensar" onClick={dismiss}><Icon name="close" /></button>
      {open && (
        <Modal title="Como instalar no iPhone" onClose={() => setOpen(false)} actions={<button className="btn" onClick={() => setOpen(false)}>Entendi</button>}>
          <IosInstallSteps />
        </Modal>
      )}
    </div>
  );
}
