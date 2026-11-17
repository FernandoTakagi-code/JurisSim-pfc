import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apiRequest } from './api';
import { endSession, useSession } from './auth-session';
import { AccountConfirmationDialog } from './account-confirmation-dialog';
import { Icon } from './ui-icon';
import './account-actions.css';

function ConfirmationLayer({ title, description, close, busy, children }: {
  title: string; description: string; close: () => void; busy: boolean; children: ReactNode;
}) {
  return <AccountConfirmationDialog title={title} description={description} close={close} busy={busy}>{children}</AccountConfirmationDialog>;
}

export function AccountEmailChange({ compact = false }: { compact?: boolean }) {
  const { session } = useSession();
  const currentEmail = session?.user.email ?? '';
  const [open, setOpen] = useState(false), [newEmail, setNewEmail] = useState(''), [confirmation, setConfirmation] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const pending = useRef(false);
  async function submit() {
    if (pending.current || !newEmail.trim() || newEmail.trim().toLowerCase() !== confirmation.trim().toLowerCase() || !password) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await apiRequest<{ message: string }>('/auth/account/email-change', { method: 'POST', body: JSON.stringify({ newEmail, confirmationEmail: confirmation, senhaAtual: password }) });
      setMessage(result.message); setOpen(false); setNewEmail(''); setConfirmation(''); setPassword('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível solicitar a troca de e-mail.'); }
    finally { pending.current = false; setBusy(false); setPassword(''); }
  }
  const trigger = compact
    ? <button className="security-action-row" type="button" onClick={() => { setError(''); setOpen(true); }}><span className="security-action-icon"><Icon name="mail" /></span><span className="security-action-copy"><strong>Alterar e-mail</strong><small>Atualize seu endereço com confirmação de segurança.</small></span><span className="security-action-arrow"><Icon name="right" /></span></button>
    : <button className="account-action-button account-session-confirm" type="button" onClick={() => { setError(''); setOpen(true); }}>Solicitar troca de e-mail</button>;
  const content = <>
    {!compact && <><h2>Alterar e-mail</h2><p>E-mail atual: <strong>{currentEmail}</strong></p><p>O novo endereço só será ativado após a confirmação enviada a ele. Depois da confirmação, você precisará entrar novamente.</p></>}
    {trigger}
    {message && <p role="status">{message}</p>}{error && !open && <p role="alert">{error}</p>}
    {open && <ConfirmationLayer title="Alterar e-mail" description={`E-mail atual: ${currentEmail}. Confirme sua identidade com a senha atual. O endereço de login só muda depois que você confirmar o link enviado ao novo e-mail.`} busy={busy} close={() => { if (!busy) { setOpen(false); setPassword(''); setError(''); } }}>
      <form className="account-action-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label>Novo e-mail<input type="email" autoComplete="email" maxLength={254} required value={newEmail} disabled={busy} onChange={event => setNewEmail(event.target.value)} /></label>
        <label>Confirme o novo e-mail<input type="email" autoComplete="email" maxLength={254} required value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></label>
        <label>Senha atual<input type="password" autoComplete="current-password" required maxLength={1024} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <div className="account-actions"><button className="account-action-button account-action-positive" disabled={busy || !password || !newEmail || newEmail.toLowerCase() !== confirmation.toLowerCase()}>{busy ? 'Enviando…' : 'Enviar confirmação'}</button><button className="account-action-button" type="button" disabled={busy} onClick={() => { setOpen(false); setPassword(''); setError(''); }}>Cancelar</button></div>
      </form>
    </ConfirmationLayer>}
  </>;
  return compact ? <div className="security-action-container">{content}</div> : <article className="v0-panel account-security-card">{content}</article>;
}

export function AccountPasswordChange({ compact = false }: { compact?: boolean }) {
  const { session } = useSession();
  const email = session?.user.email ?? '';
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const pending = useRef(false);
  async function submit() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage(''); setError('');
    try { const result = await apiRequest<{ message: string }>('/auth/password-recovery', { method: 'POST', body: JSON.stringify({ email }) }, { authenticated: false }); setMessage(result.message); setOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o link.'); }
    finally { pending.current = false; setBusy(false); }
  }
  const trigger = compact
    ? <button className="security-action-row" type="button" onClick={() => { setError(''); setOpen(true); }}><span className="security-action-icon"><Icon name="lock" /></span><span className="security-action-copy"><strong>Redefinir senha</strong><small>Receba um link seguro para redefinir sua senha.</small></span><span className="security-action-arrow"><Icon name="right" /></span></button>
      : <button className="account-action-button account-session-confirm" type="button" onClick={() => { setError(''); setOpen(true); }}>Redefinir senha</button>;
  const content = <>
    {!compact && <><h2>Alterar senha</h2><p>Enviaremos um link temporário e de uso único para <strong>{email}</strong>. O processo é o mesmo da recuperação de senha do login e revoga as sessões anteriores ao concluir.</p></>}
    {trigger}
    {message && <p role="status">{message}</p>}{error && !open && <p role="alert">{error}</p>}
    {open && <ConfirmationLayer title="Redefinir senha" description={`Enviaremos um link seguro para ${email}. O link é temporário, de uso único, e a redefinição encerra as sessões anteriores.`} busy={busy} close={() => { if (!busy) { setOpen(false); setError(''); } }}>
      <div className="account-action-form"><div className="account-actions"><button className="account-action-button account-action-positive" type="button" disabled={busy} onClick={() => void submit()}>{busy ? 'Enviando…' : 'Enviar link de redefinição'}</button><button className="account-action-button" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button></div>{error && <p role="alert">{error}</p>}</div>
    </ConfirmationLayer>}
  </>;
  return compact ? <div className="security-action-container">{content}</div> : <article className="v0-panel account-security-card">{content}</article>;
}

export function ConfirmAccountEmailChange() {
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState('Confirmando o novo endereço…');
  const [token] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('token') ?? '');
  const confirmationRequest = useRef<Promise<{ message: string }> | null>(null);
  useEffect(() => {
    window.history.replaceState({}, '', window.location.pathname);
    if (!token) { setStatus('error'); setMessage('Link inválido ou incompleto. Solicite uma nova confirmação.'); return; }
    let cancelled = false;
    confirmationRequest.current ??= apiRequest<{ message: string }>('/auth/account/email-change/confirm', { method: 'POST', body: JSON.stringify({ token }) }, { authenticated: false });
    void confirmationRequest.current.then(result => {
      if (cancelled) return; setStatus('success'); setMessage(result.message); endSession();
    }).catch(cause => { if (!cancelled) { setStatus('error'); setMessage(cause instanceof Error ? cause.message : 'Não foi possível confirmar o novo endereço.'); } });
    return () => { cancelled = true; };
  }, []);
  return <main className="email-confirmation-screen"><section className="email-confirmation-card" aria-live="polite"><h1>Confirmação de novo e-mail</h1><p role={status === 'error' ? 'alert' : 'status'}>{message}</p>{status === 'success' && <button className="primary" onClick={() => window.location.assign('/')}>Ir para o login</button>}{status === 'error' && <button onClick={() => window.location.assign('/')}>Voltar ao login</button>}</section></main>;
}
