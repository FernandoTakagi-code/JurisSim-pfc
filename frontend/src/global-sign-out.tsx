import { useRef, useState } from 'react';
import { signOutAllDevices } from './auth-session';
import { navigate } from './navigation';
import { AccountConfirmationDialog } from './account-confirmation-dialog';
import './account-actions.css';

export function GlobalSignOut() {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false);
  const close = () => { if (!pending.current) { setOpen(false); setError(''); } };
  const confirm = () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    void signOutAllDevices().then(signedOut => { if (signedOut) navigate('/', true); }).catch(cause => setError(cause instanceof Error ? cause.message : 'Não foi possível encerrar as sessões. Tente novamente.')).finally(() => { pending.current = false; setBusy(false); });
  };
  return <article className="v0-panel">
    <h2>Sair de todos os dispositivos</h2>
    <p>Encerra todas as sessões da sua conta, inclusive esta. Seus dados, e-mail, histórico acadêmico e vínculos serão preservados. A conta continuará ativa.</p>
    <button type="button" className="account-action-button" onClick={event => { event.currentTarget.focus(); setOpen(true); }}>Sair de todos os dispositivos</button>
    {open && <AccountConfirmationDialog title="Encerrar todas as sessões?" description="Você será desconectado deste dispositivo e de todos os outros em que sua conta estiver conectada. Seus dados e histórico serão preservados." busy={busy} close={close}>
      {error && <p role="alert">{error}</p>}
      <div className="account-actions"><button type="button" data-confirmation-cancel className="account-action-button" disabled={busy} onClick={close}>Cancelar</button>
        <button type="button" className="account-action-button account-session-confirm" disabled={busy} onClick={confirm}>{busy ? 'Encerrando sessões...' : 'Sim, encerrar todas as sessões'}</button></div>
    </AccountConfirmationDialog>}
  </article>;
}
