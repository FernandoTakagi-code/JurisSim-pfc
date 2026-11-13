import { useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { apiRequest } from './api';
import { endSession, useSession } from './auth-session';
import { navigate } from './navigation';
import { accountDeletionEnabled, accountDeletionUnavailableMessage } from '../../backend/src/account-deletion-availability';
import './account-actions.css';

function IdentityFields({ password, setPassword, google, setGoogle, busy, ready, onGoogle, onError }: {
  password: string; setPassword: (value: string) => void; google: boolean; setGoogle: (value: boolean) => void;
  busy: boolean; ready: boolean; onGoogle: (credential: string) => void; onError: (error: string) => void;
}) {
  return <>
    <label className="account-identity-toggle"><input type="checkbox" checked={google} disabled={busy} onChange={event => { setGoogle(event.target.checked); setPassword(''); }} />Confirmar identidade com Google</label>
    {!google ? <label>Minha senha atual<input type="password" autoComplete="current-password" required maxLength={1024} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
      : ready && !busy && import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ? <GoogleLogin auto_select={false} onSuccess={result => { if (result.credential) onGoogle(result.credential); }} onError={() => onError('Não foi possível confirmar sua identidade Google.')} />
        : <p className="account-action-note">Complete a confirmação para reautenticar com Google. O serviço Google precisa estar configurado; não será usada a senha do usuário que será excluído.</p>}
  </>;
}

export function AccountDeletion() {
  const { session } = useSession();
  const [open, setOpen] = useState(false), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [google, setGoogle] = useState(false);
  const pending = useRef(false);
  if (session?.user.role !== 'ALUNO') return null;
  const available = accountDeletionEnabled();
  async function remove(googleCredential?: string) {
    if (!available || pending.current || confirmation !== 'EXCLUIR' || (!googleCredential && !password)) return;
    pending.current = true; setBusy(true); setError('');
    try {
      await apiRequest('/auth/conta', { method: 'DELETE', body: JSON.stringify({ confirmation, ...(googleCredential ? { googleCredential } : { senhaAtual: password }) }) });
      endSession(); navigate('/', true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a conta.'); }
    finally { pending.current = false; setBusy(false); setPassword(''); }
  }
  return <article className="v0-panel">
    <h2>Excluir minha conta</h2>
    <p>A exclusão é irreversível: seu nome, e-mail, senha e foto serão removidos e suas sessões encerradas. Históricos acadêmicos e auditoria serão preservados com uma identidade anonimizada. O e-mail ficará disponível para novo cadastro, que não terá acesso ao histórico anterior.</p>
    <p>Responsáveis institucionais devem transferir suas responsabilidades antes da exclusão.</p>
    {!available && <p className="account-action-note" role="status">{accountDeletionUnavailableMessage}</p>}
    {!open ? <button className="account-action-button account-action-danger" type="button" disabled={!available} onClick={() => setOpen(true)}>Excluir minha conta</button> : <form className="account-action-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); if (!google) void remove(); }}>
      <label>Digite EXCLUIR para confirmar<input autoComplete="off" required value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></label>
      <IdentityFields {...{ password, setPassword, google, setGoogle, busy }} ready={confirmation === 'EXCLUIR'} onGoogle={credential => void remove(credential)} onError={setError} />
      {error && <p role="alert">{error}</p>}
      <div className="account-actions">{!google && <button className="account-action-button account-action-danger" disabled={busy || confirmation !== 'EXCLUIR' || !password}>{busy ? 'Excluindo...' : 'Confirmar exclusão da minha conta'}</button>}
        <button className="account-action-button" type="button" disabled={busy} onClick={() => { setOpen(false); setPassword(''); setConfirmation(''); setError(''); }}>Cancelar</button></div>
    </form>}
  </article>;
}

export function AdminAccountDeletion({ userId, email, disabled, onDone }: { userId: string; email: string; disabled: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false), [blockEmail, setBlockEmail] = useState(false), [confirmation, setConfirmation] = useState(''), [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [password, setPassword] = useState(''), [google, setGoogle] = useState(false);
  const pending = useRef(false), available = accountDeletionEnabled();
  const ready = confirmation === 'EXCLUIR' && reason.trim().length >= 3;
  async function remove(googleCredential?: string) {
    if (!available || disabled || pending.current || !ready || (!googleCredential && !password)) return;
    pending.current = true; setBusy(true); setError('');
    try {
      await apiRequest(`/institutions/admin/users/${userId}`, { method: 'DELETE', body: JSON.stringify({ confirmation, blockEmail, reason, ...(googleCredential ? { googleCredential } : { senhaAtual: password }) }) });
      setOpen(false); onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao excluir.'); }
    finally { pending.current = false; setBusy(false); setPassword(''); }
  }
  return <div className="account-action-block">
    <button className="account-action-button account-action-danger" type="button" disabled={!available || disabled || busy} onClick={() => setOpen(true)}>Excluir conta</button>
    {!available && <small className="account-action-note">{accountDeletionUnavailableMessage}</small>}
    {open && <form className="account-action-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); if (!google) void remove(); }}>
      <p>Excluir {email}? A identidade será anonimizada e as sessões revogadas. Históricos acadêmicos e auditoria serão preservados. Vínculos institucionais e a existência de outro ADMIN ativo serão verificados pelo servidor.</p>
      <label>Reutilização do e-mail<select disabled={busy} value={String(blockEmail)} onChange={event => setBlockEmail(event.target.value === 'true')}><option value="false">Liberar para novo cadastro</option><option value="true">Bloquear novo cadastro</option></select></label>
      <label>Justificativa<textarea required minLength={3} maxLength={500} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <label>Digite EXCLUIR<input required autoComplete="off" disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
      <p>Confirme a identidade da sua conta ADMIN. Nunca informe a senha do usuário selecionado.</p>
      <IdentityFields {...{ password, setPassword, google, setGoogle, busy, ready }} onGoogle={credential => void remove(credential)} onError={setError} />
      {error && <p role="alert">{error}</p>}
      <div className="account-actions">{!google && <button className="account-action-button account-action-danger" disabled={busy || !ready || !password}>{busy ? 'Excluindo...' : 'Confirmar exclusão'}</button>}
        <button className="account-action-button" type="button" disabled={busy} onClick={() => { setOpen(false); setPassword(''); setConfirmation(''); setReason(''); setError(''); }}>Cancelar</button></div>
    </form>}
  </div>;
}

export function EmailReuseRevocation() {
  const [email, setEmail] = useState(''), [reason, setReason] = useState(''), [confirmation, setConfirmation] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const pending = useRef(false);
  return <details><summary>Revogar bloqueio de reutilização de e-mail</summary><form className="account-action-form" aria-busy={busy} onSubmit={event => {
    event.preventDefault(); if (!accountDeletionEnabled() || pending.current || confirmation !== 'REVOGAR' || reason.trim().length < 3) return;
    pending.current = true; setBusy(true); setMessage(''); setError('');
    void apiRequest('/institutions/admin/email-reuse/revoke', { method: 'POST', body: JSON.stringify({ email, reason, confirmation }) }).then(() => { setMessage('Bloqueio revogado. O e-mail pode ser usado em um novo cadastro.'); setEmail(''); setReason(''); setConfirmation(''); }).catch(cause => setError(cause instanceof Error ? cause.message : 'Falha ao revogar.')).finally(() => { pending.current = false; setBusy(false); });
  }}><fieldset disabled={!accountDeletionEnabled() || busy}><label>E-mail bloqueado<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label><label>Justificativa<textarea required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label><label>Digite REVOGAR<input required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><button className="account-action-button account-action-positive" disabled={confirmation !== 'REVOGAR'}>{busy ? 'Revogando...' : 'Revogar bloqueio'}</button></fieldset>{!accountDeletionEnabled() && <p className="account-action-note">{accountDeletionUnavailableMessage}</p>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</form></details>;
}
