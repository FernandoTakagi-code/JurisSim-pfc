// Tela exibida quando o ADMIN publicou uma nova versão dos Termos de Uso e a conta ainda não aceitou.
import { useEffect, useState } from "react";
import { LegalLinks, TermsSections } from "./legal";
import { AccountDeletion } from "./account-deletion";
import { acceptLegalUpdate, loadCurrentLegal, type CurrentTerms, type LegalVersions } from "./terms-of-use";

export function LegalUpdateGate({ versions, onAccepted, onSair }: { versions: LegalVersions; onAccepted: () => void | Promise<void>; onSair: () => void }) {
  const [terms, setTerms] = useState<CurrentTerms | null>(null);
  const [checked, setChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [declining, setDeclining] = useState(false);
  useEffect(() => {
    let active = true;
    loadCurrentLegal(true)
      .then((current) => { if (active) setTerms(current.terms); })
      .catch(() => { if (active) setMessage("Não foi possível carregar os Termos de Uso. Verifique sua conexão e tente novamente."); });
    return () => { active = false; };
  }, []);
  const accept = async () => {
    if (!terms || !checked || sending) return;
    setSending(true);
    setMessage("");
    try {
      const result = await acceptLegalUpdate({ termsVersion: terms.version, privacyVersion: versions.privacyVersion });
      if (result === "accepted") { await onAccepted(); return; }
      // Outra versão foi publicada enquanto a pessoa lia: mostra a nova e pede o aceite de novo.
      const latest = await loadCurrentLegal(true);
      setTerms(latest.terms);
      setChecked(false);
      setMessage("Os Termos foram atualizados de novo. Leia a versão abaixo antes de aceitar.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível registrar o aceite.");
    } finally {
      setSending(false);
    }
  };
  return (
    <main className="email-confirmation-screen legal-update-screen">
      <section className="email-confirmation-card legal-update-card" aria-labelledby="legal-update-title">
        <img className="email-confirmation-logo" src="/brand/jurissim-logo.png" alt="JurisSim" />
        <h1 id="legal-update-title">Os Termos de Uso foram atualizados</h1>
        <p>Para continuar usando o JurisSim, leia a nova versão e confirme o aceite. O <a href="#/privacidade">Aviso de Privacidade</a> continua o mesmo.</p>
        {terms ? (
          <>
            <p className="muted">Versão {terms.version} · Vigência desde {new Date(terms.publishedAt).toLocaleDateString("pt-BR")}</p>
            <div className="legal-update-text" tabIndex={0} aria-label="Texto dos Termos de Uso"><TermsSections sections={terms.sections} /></div>
          </>
        ) : !message && <p role="status">Carregando os Termos de Uso…</p>}
        {message && <p role="alert" className="error">{message}</p>}
        <label className="legal-consent">
          <input type="checkbox" checked={checked} disabled={!terms} onChange={(event) => setChecked(event.target.checked)} />
          <span>Li e aceito a nova versão dos Termos de Uso.</span>
        </label>
        <div className="email-confirmation-actions">
          <button className="primary" disabled={!terms || !checked || sending} onClick={() => void accept()}>Aceitar e continuar</button>
          <button type="button" onClick={onSair}>Sair</button>
        </div>
        {/* Quem não concorda com a nova versão pode excluir a conta sem precisar aceitá-la. */}
        <button type="button" className="text-button" aria-expanded={declining} onClick={() => setDeclining((open) => !open)}>
          Não concordo e quero excluir minha conta
        </button>
        {declining && <AccountDeletion embedded />}
        <LegalLinks />
      </section>
    </main>
  );
}
