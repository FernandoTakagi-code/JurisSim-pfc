import { apiRequest } from './api';
import { endSession, establishSession, sessionDestination } from './auth-session';
import { useEffect, useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { LegalLinks, legalAcceptance } from './legal';
import { PASSWORD_MIN_LENGTH, passwordError, passwordRequirements, validPasswordConfirmation } from '../../backend/src/password-policy';
import { validateRegistration } from './registration-validation';
import { INITIAL_DIAGNOSTIC_ATTEMPT_COUNT, INITIAL_DIAGNOSTIC_DISCIPLINES, INITIAL_DIAGNOSTIC_QUESTION_COUNT } from '../../backend/src/services/initial-diagnostic-config';
import './password-policy.css';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

function PasswordRequirements({ value }: { value: string }) {
  return <ul className="password-requirements" aria-label="Requisitos da senha">
    {passwordRequirements.map(requirement => {
      const satisfied = requirement.test(value);
      return <li key={requirement.id} data-satisfied={satisfied}>
        <span aria-hidden="true">{satisfied ? '✓' : '○'}</span>
        <span className="sr-only">{satisfied ? 'Atendido: ' : 'Pendente: '}</span>{requirement.label}
      </li>;
    })}
  </ul>;
}

function resetTokenFromHash() {
  const [route, query = ""] = window.location.hash.split("?");
  return route === "#/reset-password" ? new URLSearchParams(query).get("token") ?? "" : "";
}

function verifyTokenFromHash() {
  const [route, query = ""] = window.location.hash.split("?");
  return route === "#/verificar-email" ? new URLSearchParams(query).get("token") ?? "": "";
}

type Perfil = "ALUNO" | "PROFESSOR";

function perfilInicial(): Perfil {
  return sessionStorage.getItem("jurissim_perfil") === "PROFESSOR" ? "PROFESSOR" : "ALUNO";
}

function PerfilSwitch({ perfil, onChange, disabled }: { perfil: Perfil; onChange: (perfil: Perfil) => void; disabled: boolean }) {
  const opcoes: [Perfil, string, string][] = [
    ["ALUNO", "Aluno", "Estude e faça simulados"],
    ["PROFESSOR", "Professor", "Cadastre questões"],
  ];
  return (
    <div className="perfil-switch" role="radiogroup" aria-label="Entrar como">
      {opcoes.map(([valor, titulo, descricao]) => (
        <button
          key={valor}
          type="button"
          disabled={disabled}
          role="radio"
          aria-checked={perfil === valor}
          className={perfil === valor ? "active" : ""}
          onClick={() => onChange(valor)}
        >
          <b>{valor === "ALUNO" ? "🎓" : "⚖"}</b>
          <span>
            <strong>{titulo}</strong>
            <small>{descricao}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function VisualPanel() {
  return (
    <section className="auth-pitch">
      <img className="auth-brand-logo" src="/brand/jurissim-logo.png" alt="JurisSim — Educação Jurídica" />
      <div className="auth-pitch-copy">
        <p>DIAGNÓSTICO INTELIGENTE</p>
        <h1>
          Prepare-se para a OAB <em>No seu ritmo.</em>
        </h1>
        <span>
          Identifique suas dificuldades, pratique de forma personalizada e
          acompanhe sua evolução.
        </span>
      </div>
      <div className="auth-stats">
        <div>
          <b>{INITIAL_DIAGNOSTIC_QUESTION_COUNT}</b>
          <small>Questões do diagnóstico</small>
        </div>
        <div>
          <b>{INITIAL_DIAGNOSTIC_DISCIPLINES.length}</b>
          <small>Disciplinas avaliadas</small>
        </div>
        <div>
          <b>{INITIAL_DIAGNOSTIC_ATTEMPT_COUNT}</b>
          <small>Avaliação inicial única</small>
        </div>
      </div>
    </section>
  );
}

export function AuthGate() {
  const [resetToken, setResetToken] = useState(() => resetTokenFromHash());
  const [verifyToken, setVerifyToken] = useState(() => verifyTokenFromHash());
  const [googleNonce] = useState(() => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join(''));
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset" | "verify">(() =>
    window.location.hash.startsWith('#/reset-password') ? "reset" : window.location.hash.startsWith('#/verificar-email') ? "verify" : "login"
  );
  const [nome, setNome] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginSenha, setLoginSenha] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerSenha, setRegisterSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [perfil, setPerfil] = useState<Perfil>(() => perfilInicial());
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState<string>();
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState(() => sessionStorage.getItem('jurissim_logout_notice') ?? '');
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<"pending" | "success" | "error">("pending");
  const [verifyMessage, setVerifyMessage] = useState("");

  const post = (path: string, body: object) => apiRequest<any>(path, { method: 'POST', body: JSON.stringify(body) }, { authenticated: false });
  const googlePerfil = mode === "register" ? "ALUNO" : perfil;

  useEffect(() => {
    const consumeLink = () => {
      const route = window.location.hash.split('?')[0];
      if (route !== '#/reset-password' && route !== '#/verificar-email') return;
      const token = route === '#/reset-password' ? resetTokenFromHash() : verifyTokenFromHash();
      setRecoveryNotice(''); setRecoveryRequested(false);
      setNewPassword(''); setConfirmNewPassword('');
      setMode(route === '#/reset-password' ? 'reset' : 'verify');
      setResetToken(route === '#/reset-password' ? token : ''); setVerifyToken(route === '#/verificar-email' ? token : '');
      setError(token ? '' : 'Link inválido ou incompleto. Solicite um novo link.');
      window.history.replaceState({}, '', window.location.pathname);
    };
    consumeLink(); window.addEventListener('hashchange', consumeLink);
    return () => window.removeEventListener('hashchange', consumeLink);
  }, []);

  useEffect(() => {
    if (mode !== "verify") return;
    if (!verifyToken) { setVerifyStatus('error'); setVerifyMessage('Link inválido ou incompleto. Solicite um novo link.'); return; }
    let cancelled = false;
    setVerifyStatus('pending');
    (async () => {
      try {
        const result = await post("/auth/email-verification/confirm", { token: verifyToken });
        if (cancelled) return;
        window.history.replaceState({}, "", window.location.pathname);
        setVerifyStatus("success");
        setVerifyMessage(result.message ?? "E-mail confirmado com sucesso!");
      } catch (cause) {
        if (cancelled) return;
        setVerifyStatus("error");
        setVerifyMessage(cause instanceof Error ? cause.message : "Não foi possível confirmar o e-mail.");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyToken, mode]);

  const estabelecerSessao = async (token: string) => {
    const session = await establishSession(token);
    sessionStorage.setItem('jurissim_perfil', session.user.role === 'ALUNO' ? 'ALUNO' : 'PROFESSOR');
    window.location.assign(sessionDestination(session));
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    setLoading(true);
    setError("");
    try {
      if (!credentialResponse.credential) {
        throw new Error("Não foi possível obter as credenciais do Google.");
      }
      const result = await post("/auth/google", {
        credential: credentialResponse.credential,
        nonce: googleNonce,
        perfil: googlePerfil,
      });
      if (result.requiresAcceptance) {
        setPendingGoogleCredential(credentialResponse.credential);
        setAccepted(false);
        return;
      }
      await estabelecerSessao(result.token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao entrar com o Google.");
    } finally {
      setLoading(false);
    }
  };

  const acceptGoogleLegal = async () => {
    if (!accepted || !pendingGoogleCredential) return;
    setLoading(true);
    setError("");
    try {
      const result = await post("/auth/google", {
        credential: pendingGoogleCredential,
        nonce: googleNonce,
        acceptance: legalAcceptance,
        perfil: googlePerfil,
      });
      if (result.requiresAcceptance) throw new Error("Confirme o aceite para continuar.");
      setPendingGoogleCredential(undefined);
      await estabelecerSessao(result.token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir o cadastro Google.");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      if ((mode === 'register' && registerSenha !== confirmacaoSenha) || (mode === 'reset' && newPassword !== confirmNewPassword)) throw new Error('As senhas não coincidem.');
      if (mode === 'register' || mode === 'reset') {
        const message = passwordError(mode === 'register' ? registerSenha : newPassword);
        if (message) throw new Error(message);
      }
      if (mode === "forgot") {
        const result = await post("/auth/password-recovery", { email: recoveryEmail });
        setRecoveryRequested(true);
        setRecoveryNotice(result.message);
      } else if (mode === "reset") {
        const result = await post("/auth/password-reset", {
          token: resetToken,
          senha: newPassword,
          confirmacaoSenha: confirmNewPassword,
        });
        endSession();
        window.history.replaceState({}, "", window.location.pathname);
        setResetToken("");
        setNewPassword("");
        setConfirmNewPassword("");
        setMode("login");
        setRecoveryNotice(result.message);
      } else if (mode === "register") {
        if (!accepted) throw new Error('Aceite os Termos de Uso e a Política de Privacidade.');
        const registration = await post("/auth/register", {
          nome,
          email: registerEmail,
          senha: registerSenha,
          confirmacaoSenha,
          acceptance: legalAcceptance,
        });
        setMode("login");
        setLoginEmail(registerEmail);
        setRecoveryNotice(registration.emailVerification?.message ?? "Conta criada. Confirme seu e-mail para acessar o sistema.");
        setRegisterSenha("");
        setConfirmacaoSenha("");
        setAccepted(false);
      } else {
        const login = await post("/auth/login", { email: loginEmail, senha: loginSenha, perfil });
        await estabelecerSessao(login.token);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  if (mode === "verify") {
    return (
      <main className="auth-layout">
        <VisualPanel />
        <section className="auth-content">
          <div className="auth-form-wrap">
            <header>
              <h2>Confirmação de e-mail</h2>
            </header>
            <div className="auth-card">
              {verifyStatus === "pending" && <p>Confirmando seu e-mail...</p>}
              {verifyStatus === "success" && <p className="recovery-notice" role="status">{verifyMessage}</p>}
              {verifyStatus === "error" && <small className="error" role="alert">{verifyMessage}</small>}
              <button className="auth-submit" type="button" onClick={() => { setMode("login"); window.history.replaceState({}, "", window.location.pathname); }}>
                Ir para o Login
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (pendingGoogleCredential) {
    return (
      <main className="google-consent-page">
        <section className="google-consent-card" aria-labelledby="google-legal-title">
          <img className="google-consent-logo" src="/brand/jurissim-logo.png" alt="JurisSim — Educação Jurídica" />
          <div className="google-consent-mark" aria-hidden="true">✓</div>
          <p className="google-consent-eyebrow">SEU ACESSO AO JURISSIM</p>
          <h1 id="google-legal-title">Antes de começar, precisamos do seu aceite</h1>
          <p className="google-consent-intro">Para criar sua conta e continuar, consulte e aceite os documentos que explicam as regras de uso da plataforma e como seus dados são tratados.</p>
          <nav className="google-consent-documents" aria-label="Documentos legais">
            <a href="#/termos"><span><small>DOCUMENTO 01</small><strong>Termos de Uso</strong></span><b aria-hidden="true">↗</b></a>
            <a href="#/privacidade"><span><small>DOCUMENTO 02</small><strong>Política de Privacidade</strong></span><b aria-hidden="true">↗</b></a>
          </nav>
          <label className="google-consent-check">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            <span>Li e aceito os Termos de Uso e a Política de Privacidade</span>
          </label>
          {error && <small className="error" role="alert">{error}</small>}
          <button className="auth-submit google-consent-submit" type="button" disabled={!accepted || loading} onClick={acceptGoogleLegal}>
            {loading ? "Aguarde..." : "Aceitar e continuar"}
          </button>
          <button className="google-consent-cancel" type="button" disabled={loading} onClick={() => { setPendingGoogleCredential(undefined); setAccepted(false); setError(""); }}>
            Cancelar e voltar ao login
          </button>
          <p className="google-consent-footnote">Seu aceite será registrado junto às versões atuais dos documentos.</p>
        </section>
      </main>
    );
  }

  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isRecovery = mode === "forgot" || mode === "reset";
  const email = isLogin ? loginEmail : registerEmail;
  const senha = isLogin ? loginSenha : registerSenha;
  const registrationValidation = validateRegistration({
    name: nome, email: registerEmail, password: registerSenha,
    confirmation: confirmacaoSenha, accepted,
  });
  const title = mode === "register" ? "Crie sua conta de estudante" : mode === "forgot" ? "Esqueci minha senha" : mode === "reset" ? "Defina uma nova senha" : "Login";
  return (
    <main className="auth-layout">
      <VisualPanel />
      <section className="auth-content">
        <div className="auth-form-wrap">
          <header>
            <h2>{title}</h2>
            <p>
              {isRecovery ? "Recupere o acesso à sua conta JurisSim." : isLogin
                ? perfil === "PROFESSOR" ? "Acesse a área do professor" : "Acesse sua área de estudos"
                : "Crie sua conta de estudante e comece sua preparação para a OAB."}
            </p>
          </header>
          {isLogin && <PerfilSwitch disabled={loading} perfil={perfil} onChange={(valor) => { setPerfil(valor); setError(""); setPendingGoogleCredential(undefined); setAccepted(false); }} />}
          <form className="auth-card" onSubmit={event => { event.preventDefault(); void submit(); }}>
            {isRegister && (
              <>
                <label>
                  Nome completo
                  <input
                    name="name"
                    required minLength={2} maxLength={120}
                    aria-invalid={!!nome && !!registrationValidation.name}
                    aria-describedby={nome && registrationValidation.name ? "registration-name-error" : undefined}
                    autoComplete="name"
                    placeholder="Digite seu nome completo"
                    value={nome}
                    onChange={(event) => setNome(event.target.value)}
                  />
                  {nome && registrationValidation.name && <small id="registration-name-error" className="error" role="status">{registrationValidation.name}</small>}
                </label>
              </>
            )}
            {!isRecovery && <label>
              E-mail
              <input
                name="email"
                required maxLength={254}
                aria-invalid={isRegister && !!registerEmail && !!registrationValidation.email}
                aria-describedby={isRegister ? "registration-email-error" : undefined}
                autoComplete="email"
                type="email"
                placeholder="Digite seu e-mail"
                value={email}
                onChange={(event) => isLogin ? setLoginEmail(event.target.value) : setRegisterEmail(event.target.value)}
              />
              {isRegister && registerEmail && registrationValidation.email && <small id="registration-email-error" className="error" role="status">{registrationValidation.email}</small>}
            </label>}
            {(isLogin || isRegister) && <label>
              Sua senha
              <span className="password-field">
                <input
                  name={isLogin ? "current-password" : "new-password"}
                  required minLength={isRegister ? PASSWORD_MIN_LENGTH : 1} maxLength={isRegister ? 72 : 1024}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  type={showPassword ? "text" : "password"}
                  placeholder="Digite sua senha"
                  value={senha}
                  onChange={(event) => isLogin ? setLoginSenha(event.target.value) : setRegisterSenha(event.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "◉" : "◌"}
                </button>
              </span>
            </label>}
            {isRegister && (
              <label>
                Confirme sua senha
                <span className="password-field">
                  <input
                    name="confirm-password"
                    required minLength={PASSWORD_MIN_LENGTH} maxLength={72}
                    aria-invalid={!!confirmacaoSenha && !!registrationValidation.confirmation}
                    aria-describedby={confirmacaoSenha ? "registration-password-match" : undefined}
                    autoComplete="new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Digite sua senha novamente"
                    value={confirmacaoSenha}
                    onChange={(event) =>
                      setConfirmacaoSenha(event.target.value)
                    }
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Ocultar senha" : "Mostrar senha"
                    }
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "◉" : "◌"}
                  </button>
                </span>
              </label>
            )}
            {isLogin && (
              <div className="auth-options">
                <span>Sessão neste navegador</span>
                <button type="button" onClick={() => { setRecoveryEmail(loginEmail); setRecoveryRequested(false); setRecoveryNotice(""); setError(""); setMode("forgot"); }}>Esqueceu a senha?</button>
              </div>
            )}
            {mode === "forgot" && !recoveryRequested && <label>
              E-mail associado à conta
              <input name="recovery-email" autoComplete="email" type="email" required placeholder="Digite seu e-mail" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} />
            </label>}
            {mode === "forgot" && recoveryRequested && <p className="recovery-notice" role="status">{recoveryNotice}</p>}
            {mode === "reset" && <>
              <label>
                Nova senha
                <span className="password-field"><input name="new-password" autoComplete="new-password" placeholder="Digite uma nova senha" type={showPassword ? "text" : "password"} minLength={PASSWORD_MIN_LENGTH} required aria-describedby="reset-password-requirements" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "◉" : "◌"}</button></span>
              </label>
              <div id="reset-password-requirements"><PasswordRequirements value={newPassword} /></div>
              {newPassword && new TextEncoder().encode(newPassword).length > 72 && <p className="password-feedback" role="status">A senha deve ter no máximo 72 bytes em UTF-8.</p>}
              <label>
                Confirme a nova senha
                <span className="password-field"><input name="confirm-new-password" autoComplete="new-password" placeholder="Repita a senha" type={showPassword ? "text" : "password"} minLength={PASSWORD_MIN_LENGTH} required aria-invalid={!!confirmNewPassword && newPassword !== confirmNewPassword} aria-describedby="reset-password-match" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} /><button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "◉" : "◌"}</button></span>
              </label>
              <p id="reset-password-match" className="password-feedback" role="status">{confirmNewPassword && newPassword !== confirmNewPassword ? 'As senhas não coincidem.' : ''}</p>
            </>}
            {isRegister && <PasswordRequirements value={registerSenha} />}
            {isRegister && registerSenha && registrationValidation.password && <p className="password-feedback" role="status">{registrationValidation.password}</p>}
            {isRegister && (registerSenha || confirmacaoSenha) && <p id="registration-password-match" className="password-feedback" role="status">{registrationValidation.confirmation}</p>}
            {isRegister && <div className="legal-consent">
              <input id="legal-acceptance" type="checkbox" required checked={accepted} onChange={(event) => setAccepted(event.target.checked)} aria-labelledby="legal-consent-label" />
              <span id="legal-consent-label"><label htmlFor="legal-acceptance">Li e aceito </label>os <a href="#/termos">Termos de Uso</a> e a <a href="#/privacidade">Política de Privacidade</a>.</span>
            </div>}
            {isRegister && registrationValidation.firstError && <p id="registration-feedback" className="password-feedback" role="status" aria-live="polite">{registrationValidation.firstError}</p>}
            <button type="submit" className="auth-submit" disabled={loading || (isRegister && !registrationValidation.valid) || (mode === "forgot" && (recoveryRequested || !recoveryEmail)) || (mode === "reset" && (!resetToken || !validPasswordConfirmation(newPassword, confirmNewPassword)))}>
              {loading ? "Aguarde..." : isLogin ? (perfil === "PROFESSOR" ? "Entrar como professor" : "Entrar como aluno") : isRegister ? "Criar conta de estudante" : mode === "forgot" ? "Enviar instruções" : "Salvar nova senha"}
            </button>
            {error && <small className="error" role="alert">{error}</small>}
            {mode === "reset" && recoveryNotice && <p className="recovery-notice" role="status">{recoveryNotice}</p>}
            {isLogin && recoveryNotice && <p className="recovery-notice" role="status">{recoveryNotice}</p>}
            {isRecovery && <button className="text-button" type="button" onClick={() => { setMode("login"); setRecoveryRequested(false); setRecoveryNotice(""); setError(""); }}>Voltar ao Login</button>}
            {!isRecovery && <div className="auth-divider">
              <span>ou</span>
            </div>}
            {!isRecovery && !googleClientId && <small className="muted">Login Google indisponível no momento.</small>}
            {!isRecovery && googleClientId && !pendingGoogleCredential && <GoogleLogin
              nonce={googleNonce}
              onSuccess={handleGoogleSuccess}
              onError={() => setError("Não foi possível entrar com o Google.")}
            />}
          </form>
          {!isRecovery && <p className="auth-switch">
            {isLogin ? "Ainda não tem uma conta?" : "Já possui uma conta?"}{" "}
            <button
              type="button"
              disabled={loading}
              onClick={() => setMode(isLogin ? "register" : "login")}
            >
              {isLogin ? "Cadastre-se" : "Entrar"}
            </button>
          </p>}
          <LegalLinks />
        </div>
      </section>
    </main>
  );
}
