import { useState } from 'react';
import { apiRequest } from './api';
import { LegalLinks } from './legal';

export function EmailConfirmationGate({ email, onSair }: { email: string; onSair: () => void }) {
  const [gateReenviando, setGateReenviando] = useState(false);
  const [gateMensagem, setGateMensagem] = useState('');
  const [gateErro, setGateErro] = useState('');
  const [localVerificationUrl, setLocalVerificationUrl] = useState('');

    const reenviarConfirmacaoGate = async () => {
      setGateReenviando(true);
      setGateErro("");
      setGateMensagem("");
      setLocalVerificationUrl("");
      try {
        const body = await apiRequest<{ message: string; localVerificationUrl?: string }>("/auth/email-verification", { method: "POST" });
        setLocalVerificationUrl(body.localVerificationUrl ?? "");
        setGateMensagem(body.message ?? "E-mail de confirmação enviado.");
      } catch (cause) {
        setGateErro(cause instanceof Error ? cause.message : "Erro inesperado.");
      } finally {
        setGateReenviando(false);
      }
    };
    return (
      <main className="email-confirmation-screen">
        <section className="email-confirmation-card" aria-labelledby="email-confirmation-title">
          <img className="email-confirmation-logo" src="/brand/jurissim-logo.png" alt="JurisSim — Educação Jurídica" />
          <h1 id="email-confirmation-title">Confirme seu e-mail</h1>
          <p className="muted">
            Confirme o endereço <b>{email}</b> para liberar o acesso ao JurisSim.
            Verifique sua caixa de entrada e o spam ou solicite um novo link abaixo.
          </p>
          <div className="email-confirmation-actions">
            <button className="primary" type="button" disabled={gateReenviando} onClick={reenviarConfirmacaoGate}>
              {gateReenviando ? "Enviando..." : "Reenviar e-mail de confirmação"}
            </button>
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
