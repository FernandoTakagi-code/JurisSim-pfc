import { useEffect, useRef, useState } from 'react';
import { ApiError, apiRequest } from './api';
import { refreshSession, useSession } from './auth-session';
import { LegalLinks } from './legal';

export function EmailConfirmationGate({ email, onSair, invitationPending=false }: { email: string; onSair: () => void; invitationPending?:boolean }) {
  const institutional = useSession().session?.registrationIntent === 'INSTITUTION';
  const [institutionNotice]=useState(()=>{const notice=sessionStorage.getItem('jurissim_institution_notice');sessionStorage.removeItem('jurissim_institution_notice');return notice;});
  const [gateReenviando, setGateReenviando] = useState(false);
  const [gateMensagem, setGateMensagem] = useState('');
  const [gateErro, setGateErro] = useState('');
  const [localVerificationUrl, setLocalVerificationUrl] = useState('');
  const pending = useRef(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

    const reenviarConfirmacaoGate = async () => {
      if (pending.current || cooldown) return;
      pending.current = true;
      setGateReenviando(true);
      setGateErro("");
      setGateMensagem("");
      setLocalVerificationUrl("");
      try {
        const body = await apiRequest<{ message: string; localVerificationUrl?: string }>("/auth/email-verification", { method: "POST" });
        setLocalVerificationUrl(body.localVerificationUrl ?? "");
        setGateMensagem(body.message ?? "E-mail de confirmação enviado.");
        setCooldown(60);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 429) setCooldown(60);
        setGateErro(cause instanceof Error ? cause.message : "Erro inesperado.");
      } finally {
        pending.current = false;
        setGateReenviando(false);
      }
    };
    return (
      <main className="email-confirmation-screen">
        <section className="email-confirmation-card" aria-labelledby="email-confirmation-title">
          <img className="email-confirmation-logo" src="/brand/jurissim-logo.png" alt="JurisSim — Educação Jurídica" />
          <h1 id="email-confirmation-title">Confirme seu e-mail</h1>
          {invitationPending&&<p>Seu convite continua aguardando aceitação. Confirme o e-mail e volte a esta aba para clicar em Já confirmei meu e-mail. Se abrir outra aba ou perder o contexto, reabra o link original do convite. Nenhum vínculo será criado automaticamente.</p>}
          {institutional && <p>A conta do responsável foi criada. Confirme o e-mail para acompanhar sua solicitação na área institucional, sem acessar o dashboard do aluno.</p>}
          {institutional&&institutionNotice&&<p role="status">{institutionNotice}</p>}
          <p className="muted">
            Confirme o endereço <b>{email}</b> para liberar o acesso ao JurisSim.
            Verifique sua caixa de entrada e o spam ou solicite um novo link abaixo.
          </p>
          <div className="email-confirmation-actions">
            <button className="primary" type="button" disabled={gateReenviando || cooldown > 0} onClick={reenviarConfirmacaoGate}>
              {gateReenviando ? "Enviando..." : cooldown ? `Aguarde ${cooldown}s para reenviar` : "Reenviar e-mail de confirmação"}
            </button>
            <button type="button" onClick={() => { void refreshSession(true).catch(cause => setGateErro(cause instanceof Error ? cause.message : 'Não foi possível verificar a confirmação.')); }}>Já confirmei meu e-mail</button>
            <button type="button" onClick={onSair}>Sair</button>
          </div>
          {gateMensagem && <p className="recovery-notice" role="status">{gateMensagem}</p>}
          {localVerificationUrl && <p><a href={localVerificationUrl} rel="noreferrer">Confirmar e-mail local</a></p>}
          {gateErro && <small className="error" role="alert">{gateErro}</small>}
          <LegalLinks />
        </section>
      </main>
    );
}
