import { useRef, useState } from 'react';
import { apiRequest } from './api';
import { endSession } from './auth-session';
import { navigate } from './navigation';
import './account-actions.css';

export function AccountDeactivation() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  return <article className="v0-panel">
    <h2>Desativar minha conta</h2>
    <p>A desativação bloqueia seu acesso e encerra todas as sessões. Seus dados pessoais, e-mail e históricos acadêmicos serão preservados; o e-mail não será liberado para outro cadastro. Esta ação não é uma exclusão definitiva.</p>
    <p>Uma eventual reativação exige atendimento e verificação de identidade. Não há reativação automática pelo login nem pelo botão de reativar usuários suspensos do ADMIN.</p>
    <p>Responsáveis institucionais precisam transferir suas responsabilidades. Contas Google exigem reautenticação específica pelo suporte.</p>
    {!open ? <button className="account-action-button" type="button" onClick={() => setOpen(true)}>Desativar minha conta</button> : <form className="account-action-form" aria-busy={busy} onSubmit={event => {
      event.preventDefault();
      if (pending.current || confirmation !== 'DESATIVAR' || !password) return;
      pending.current = true; setBusy(true); setError('');
      void apiRequest('/auth/conta/desativacao', { method: 'POST', body: JSON.stringify({ senhaAtual: password, confirmation }) })
        .then(() => { endSession(); navigate('/', true); })
        .catch(cause => setError(cause instanceof Error ? cause.message : 'Não foi possível desativar a conta.'))
        .finally(() => { pending.current = false; setBusy(false); setPassword(''); });
    }}>
      <label>Senha atual<input name="deactivation-password" type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
      <label>Digite DESATIVAR para confirmar<input name="deactivation-confirmation" autoComplete="off" required value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="account-actions"><button className="account-action-button" disabled={busy || confirmation !== 'DESATIVAR' || !password}>{busy ? 'Desativando...' : 'Confirmar desativação da conta'}</button>
      <button className="account-action-button" type="button" disabled={busy} onClick={() => { setOpen(false); setPassword(''); setConfirmation(''); setError(''); }}>Cancelar</button></div>
    </form>}
  </article>;
}
