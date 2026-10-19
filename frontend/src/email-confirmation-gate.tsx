import { useState } from 'react';
import { apiRequest } from './api';

export function EmailConfirmationGate({ email, onSair }: { email: string; onSair: () => void }) {
  const [gateReenviando, setGateReenviando] = useState(false);
  const [gateMensagem, setGateMensagem] = useState('');
  const [gateErro, setGateErro] = useState('');

    const reenviarConfirmacaoGate = async () => {
      setGateReenviando(true);
      setGateErro("");
      setGateMensagem("");
      try {
        const body = await apiRequest<{ message: string }>("/auth/email-verification", { method: "POST" });
        setGateMensagem(body.message ?? "E-mail de confirmação enviado.");
      } catch (cause) {
        setGateErro(cause instanceof Error ? cause.message : "Erro inesperado.");
      } finally {
        setGateReenviando(false);
      }
    };
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f6f8",
        }}
      >
        <section style={{ maxWidth: 420, width: "90%", background: "#fff", borderRadius: 12, padding: 32, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <h1 style={{ marginTop: 0 }}>Confirme seu e-mail</h1>
          <p className="muted">
            Confirme o endereço <b>{email}</b> para liberar o acesso ao JurisSim.
            Verifique sua caixa de entrada e o spam ou solicite um novo link abaixo.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
            <button className="primary" type="button" disabled={gateReenviando} onClick={reenviarConfirmacaoGate}>
              {gateReenviando ? "Enviando..." : "Reenviar e-mail de confirmação"}
            </button>
            <button type="button" onClick={onSair}>Sair</button>
          </div>
          {gateMensagem && <p className="recovery-notice" role="status" style={{ marginTop: 12 }}>{gateMensagem}</p>}
          {gateErro && <small className="error" role="alert" style={{ display: "block", marginTop: 12 }}>{gateErro}</small>}
        </section>
      </div>
    );
}
