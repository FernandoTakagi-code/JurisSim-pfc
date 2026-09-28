import { useEffect, useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { LegalLinks, legalAcceptance } from './legal';

const api = import.meta.env.VITE_API_URL ?? "http://localhost:3333";
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

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

function PerfilSwitch({ perfil, onChange }: { perfil: Perfil; onChange: (perfil: Perfil) => void }) {
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
      <div className="auth-brand">
        <b>⚖</b>
        <span>
          <strong>JurisSim</strong>
          <small>Plataforma adaptativa de preparação para o Exame da OAB</small>
        </span>
      </div>
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
          <b>5</b>
          <small>Matérias</small>
        </div>
        <div>
          <b>2.000+</b>
          <small>Questões</small>
        </div>
        <div>
          <b>94%</b>
          <small>Evolução</small>
        </div>
      </div>
    </section>
  );
}

export function AuthGate() {
  const [resetToken, setResetToken] = useState(() => resetTokenFromHash());
  const [verifyToken] = useState(() => verifyTokenFromHash());
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset" | "verify">(() =>
    resetTokenFromHash() ? "reset" : verifyTokenFromHash() ? "verify" : "login"
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
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<"pending" | "success" | "error">("pending");
  const [verifyMessage, setVerifyMessage] = useState("");

  const post = async (path: string, body: object) => {
    let response: Response;
    try {
      response = await fetch(`${api}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error(
        "Não foi possível conectar ao servidor. Verifique se o backend está rodando na porta 3333.",
      );
    }
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message ?? "Não foi possível concluir a operação.");
    return data;
  };

  useEffect(() => {
    if (mode !== "verify" || !verifyToken) return;
    (async () => {
      try {
        const result = await post("/auth/email-verification/confirm", { token: verifyToken });
        window.history.replaceState({}, "", window.location.pathname);
        setVerifyStatus("success");
        setVerifyMessage(result.message ?? "E-mail confirmado com sucesso!");
      } catch (cause) {
        setVerifyStatus("error");
        setVerifyMessage(cause instanceof Error ? cause.message : "Não foi possível confirmar o e-mail.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const estabelecerSessao = async (token: string) => {
    let session: Response;
    try {
      session = await fetch(`${api}/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new Error(
        "Login realizado, mas não foi possível consultar a sessão. Verifique se o backend está rodando na porta 3333.",
      );
    }
    const body = await session.json();
    if (!session.ok) throw new Error(body.message ?? "Sessão inválida.");
    sessionStorage.setItem("jurissim_token", token);
    sessionStorage.setItem("jurissim_next_step", body.nextStep);
    sessionStorage.setItem("jurissim_user_name", body.user?.nome ?? "");
    sessionStorage.setItem("jurissim_email", body.user?.email ?? "");
    sessionStorage.setItem("jurissim_email_verificado", String(Boolean(body.user?.emailVerificado)));
    sessionStorage.setItem("jurissim_perfil", perfil);
    const destino = body.nextStep === "PROFESSOR" ? "/professor" : body.nextStep === "DASHBOARD" ? "/dashboard" : "/";
    window.location.assign(destino);
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
        perfil,
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
        acceptance: legalAcceptance,
        perfil,
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
    setLoading(true);
    setError("");
    try {
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
        window.history.replaceState({}, "", window.location.pathname);
        setResetToken("");
        setNewPassword("");
        setConfirmNewPassword("");
        setMode("login");
        setRecoveryNotice(result.message);
      } else if (mode === "register") {
        if (!accepted) throw new Error('Aceite os Termos de Uso e a Política de Privacidade.');
        await post("/auth/register", {
          nome,
          email: registerEmail,
          senha: registerSenha,
          confirmacaoSenha,
          role: perfil,
          acceptance: legalAcceptance,
        });
        setMode("login");
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
              {verifyStatus === "error" && <small className="error">{verifyMessage}</small>}
              <button className="auth-submit" type="button" onClick={() => { setMode("login"); window.history.replaceState({}, "", window.location.pathname); }}>
                Ir para o Login
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isRecovery = mode === "forgot" || mode === "reset";
  const email = isLogin ? loginEmail : registerEmail;
  const senha = isLogin ? loginSenha : registerSenha;
  const title = mode === "register" ? "Crie sua conta" : mode === "forgot" ? "Esqueci minha senha" : mode === "reset" ? "Defina uma nova senha" : "Login";
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
                : perfil === "PROFESSOR" ? "Cadastre-se para criar questões para seus alunos" : "Comece sua preparação para a OAB"}
            </p>
          </header>
          {!isRecovery && <PerfilSwitch perfil={perfil} onChange={(valor) => { setPerfil(valor); setError(""); setPendingGoogleCredential(undefined); setAccepted(false); }} />}
          <div className="auth-card">
            {isRegister && (
              <>
                <label>
                  Nome completo
                  <input
                    name="name"
                    autoComplete="name"
                    placeholder="Digite seu nome completo"
                    value={nome}
                    onChange={(event) => setNome(event.target.value)}
                  />
                </label>
              </>
            )}
            {!isRecovery && <label>
              E-mail
              <input
                name="email"
                autoComplete="email"
                type="email"
                placeholder="Digite seu e-mail"
                value={email}
                onChange={(event) => isLogin ? setLoginEmail(event.target.value) : setRegisterEmail(event.target.value)}
              />
            </label>}
            {(isLogin || isRegister) && <label>
              Sua senha
              <span className="password-field">
                <input
                  name={isLogin ? "current-password" : "new-password"}
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
                <label>
                  <input type="checkbox" /> Lembrar de mim
                </label>
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
                <span className="password-field"><input name="new-password" autoComplete="new-password" type={showPassword ? "text" : "password"} minLength={6} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "◉" : "◌"}</button></span>
              </label>
              <label>
                Confirme a nova senha
                <span className="password-field"><input name="confirm-new-password" autoComplete="new-password" type={showPassword ? "text" : "password"} minLength={6} required value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} /><button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "◉" : "◌"}</button></span>
              </label>
            </>}
            {isRegister && <div className="legal-consent">
              <input id="legal-acceptance" type="checkbox" required checked={accepted} onChange={(event) => setAccepted(event.target.checked)} aria-labelledby="legal-consent-label" />
              <span id="legal-consent-label"><label htmlFor="legal-acceptance">Li e aceito </label>os <a href="#/termos">Termos de Uso</a> e a <a href="#/privacidade">Política de Privacidade</a>.</span>
            </div>}
            <button className="auth-submit" disabled={loading || (isRegister && !accepted) || (mode === "forgot" && (recoveryRequested || !recoveryEmail)) || (mode === "reset" && (!newPassword || newPassword !== confirmNewPassword))} onClick={submit}>
              {loading ? "Aguarde..." : isLogin ? (perfil === "PROFESSOR" ? "Entrar como professor" : "Entrar como aluno") : isRegister ? (perfil === "PROFESSOR" ? "Criar conta de professor" : "Criar conta de aluno") : mode === "forgot" ? "Enviar instruções" : "Salvar nova senha"}
            </button>
            {error && <small className="error">{error}</small>}
            {mode === "reset" && recoveryNotice && <p className="recovery-notice" role="status">{recoveryNotice}</p>}
            {isLogin && recoveryNotice && <p className="recovery-notice" role="status">{recoveryNotice}</p>}
            {isRecovery && <button className="text-button" type="button" onClick={() => { setMode("login"); setRecoveryRequested(false); setRecoveryNotice(""); setError(""); }}>Voltar ao Login</button>}
            {!isRecovery && <div className="auth-divider">
              <span>ou</span>
            </div>}
            {!isRecovery && !googleClientId && <small className="error">Login Google indisponível: configure VITE_GOOGLE_CLIENT_ID em frontend/.env.</small>}
            {!isRecovery && googleClientId && !pendingGoogleCredential && <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError("Não foi possível entrar com o Google.")}
            />}
            {!isRecovery && googleClientId && pendingGoogleCredential && <section className="google-legal-consent" aria-labelledby="google-legal-title">
              <h3 id="google-legal-title">Antes de criar sua conta</h3>
              <p>Leia e aceite os documentos para concluir seu cadastro no JurisSim.</p>
              <div className="google-legal-links"><LegalLinks /></div>
              <label className="google-legal-check">
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                Li e aceito os Termos de Uso e o Aviso de Privacidade.
              </label>
              <button className="auth-submit" type="button" disabled={!accepted || loading} onClick={acceptGoogleLegal}>
                {loading ? "Aguarde..." : "Aceitar e continuar"}
              </button>
              <button className="text-button" type="button" disabled={loading} onClick={() => { setPendingGoogleCredential(undefined); setAccepted(false); }}>
                Cancelar e voltar ao login
              </button>
            </section>}
          </div>
          {!isRecovery && <p className="auth-switch">
            {isLogin ? "Ainda não tem uma conta?" : "Já possui uma conta?"}{" "}
            <button
              type="button"
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