import { useEffect, useState } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { AuthGate } from "./auth-gate";
import { decodeRole } from "./jwt";
import { QuestoesPage } from "./QuestoesPage";
import { LegalBoundary, LegalLinks } from './legal';

const api = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

type Alternative = { id: string; text: string };
type Question = {
  id: string;
  position: number;
  statement: string;
  discipline: string;
  topic: string;
  difficulty: string;
  alternatives: Alternative[];
  selectedOptionId: string | null;
};
type Metric = { tipo: string; disciplina: string; percentual: number };
type Trail = {
  id: string;
  disciplinaPrioritaria: string;
  assuntoPrioritario: string | null;
  nivelRecomendado: string;
  quantidadeRecomendada: number;
  justificativa: string;
};
type Result = {
  overallPercentage: number;
  level: string;
  recommendation: string;
  performances: Metric[];
  trail: Trail | null;
};
type TrailResult = {
  level: string;
  overallPercentage: number;
  recommendation: string;
};
const labels: Record<string, string> = {
  BASICO: "Básico",
  INTERMEDIARIO: "Intermediário",
  AVANCADO: "Avançado",
};

function Brand() {
  return (
    <div className="brand">
      <b>⚖</b>
      <span>
        <strong>JurisSim</strong>
        <small>Plataforma adaptativa para o Exame da OAB.</small>
      </span>
    </div>
  );
}

function SettingsModal({
  nome,
  email,
  role,
  onClose,
}: {
  nome: string;
  email: string;
  role: string;
  onClose: () => void;
}) {
  const [nomeEditavel, setNomeEditavel] = useState(nome);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [senhaExclusao, setSenhaExclusao] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState("");

  const salvarNome = async () => {
    setSalvando(true);
    setErro("");
    try {
      const response = await fetch(`${api}/auth/nome`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("jurissim_token") ?? ""}`,
        },
        body: JSON.stringify({ nome: nomeEditavel }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.erro ?? "Não foi possível salvar.");
      sessionStorage.setItem("jurissim_user_name", body.usuario.nome);
      window.location.reload();
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : "Erro inesperado.");
      setSalvando(false);
    }
  };

  const excluirConta = async () => {
    setExcluindo(true);
    setErroExclusao("");
    try {
      const response = await fetch(`${api}/auth/conta`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("jurissim_token") ?? ""}`,
        },
        body: JSON.stringify({ senhaAtual: senhaExclusao || undefined }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Não foi possível excluir a conta.");
      sessionStorage.clear();
      window.location.reload();
    } catch (cause) {
      setErroExclusao(cause instanceof Error ? cause.message : "Erro inesperado.");
      setExcluindo(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 30,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          minWidth: 320,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Configurações da conta</h2>
        <label style={{ display: "block", marginBottom: 12 }}>
          <b>Nome</b>
          <input
            style={{ display: "block", width: "100%", marginTop: 4 }}
            value={nomeEditavel}
            onChange={(event) => setNomeEditavel(event.target.value)}
          />
        </label>
        <p>
          <b>E-mail:</b> {email}
        </p>
        <p>
          <b>Papel:</b> {role}
        </p>
        {erro && <small style={{ color: "crimson" }}>{erro}</small>}
        <hr />
        <section aria-labelledby="privacy-settings-title">
          <h3 id="privacy-settings-title">Privacidade e dados</h3>
          <LegalLinks />
          <p style={{ fontSize: 13, color: "#68758a", lineHeight: 1.5 }}>
            Para orientações sobre seus direitos, inclusive pedidos de exclusão quando aplicável, consulte a seção “Como exercer seus direitos” do Aviso de Privacidade. Esta tela não registra solicitações nem exclui dados.
          </p>
        </section>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={salvando || nomeEditavel === nome}
            onClick={salvarNome}
          >
            {salvando ? "Salvando..." : "Salvar nome"}
          </button>
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
        <hr />
        <section aria-labelledby="danger-zone-title">
          <h3 id="danger-zone-title" style={{ color: "crimson" }}>
            Excluir conta
          </h3>
          {!confirmandoExclusao ? (
            <button
              type="button"
              style={{ color: "crimson", borderColor: "crimson" }}
              onClick={() => setConfirmandoExclusao(true)}
            >
              Excluir minha conta
            </button>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: "#68758a" }}>
                Essa ação é permanente. Seus dados pessoais serão anonimizados e você
                perderá o acesso a esta conta.
              </p>
              <label style={{ display: "block", marginBottom: 8 }}>
                <b>Confirme sua senha</b>
                <input
                  type="password"
                  style={{ display: "block", width: "100%", marginTop: 4 }}
                  value={senhaExclusao}
                  onChange={(event) => setSenhaExclusao(event.target.value)}
                  placeholder="Deixe em branco se você entrou com o Google"
                />
              </label>
              {erroExclusao && <small style={{ color: "crimson" }}>{erroExclusao}</small>}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  style={{ color: "crimson", borderColor: "crimson" }}
                  disabled={excluindo}
                  onClick={excluirConta}
                >
                  {excluindo ? "Excluindo..." : "Confirmar exclusão"}
                </button>
                <button
                  type="button"
                  disabled={excluindo}
                  onClick={() => {
                    setConfirmandoExclusao(false);
                    setSenhaExclusao("");
                    setErroExclusao("");
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TopBar({ nome }: { nome: string }) {
  return <b>Olá, {nome}!</b>;
}

function Sidebar({
  active,
  onNavigate,
  role,
  onDashboard,
  onPerformance,
  onOpenSettings,
  onSair,
}: {
  active: "dashboard" | "diagnostico" | "questoes" | "desempenho";
  onNavigate: (view: "diagnostico" | "questoes") => void;
  role: string | null;
  onDashboard: () => void;
  onPerformance: () => void;
  onOpenSettings: () => void;
  onSair: () => void;
}) {
  const items: [string, string, "diagnostico" | "questoes" | null][] = [
    ["⌂", "Início", null],
    ["▤", "Estudar", "diagnostico"],
    ["?", "Questões", "questoes"],
    ["▥", "Meu desempenho", null],
  ];
  return (
    <aside className={active === "dashboard" ? "dashboard-sidebar" : undefined}>
      <Brand />
      <nav>
        {items.map(([icon, label, view], index) => (
          <button
            className={(view === active || (index === 0 && active === "dashboard") || (index === 3 && active === "desempenho")) ? "active" : ""}
            key={label}
            onClick={() => {
              if (index === 0 && role === "ALUNO") onDashboard();
              else if (index === 3 && role === "ALUNO") onPerformance();
              else if (view) onNavigate(view);
            }}
          >
            <i>{icon}</i>
            {label}
          </button>
        ))}
      </nav>
      <div className="nav-bottom">
        <button>
          <i>♙</i>Meu perfil
        </button>
        <button onClick={onOpenSettings}>
          <i>⚙</i>Configurações
        </button>
        <hr />
        <button onClick={onSair}>
          <i>⇥</i>Sair
        </button>
      </div>
    </aside>
  );
}

function App() {
  if (!sessionStorage.getItem("jurissim_token")) return <AuthGate />;

  const role = decodeRole(sessionStorage.getItem("jurissim_token")!) ?? "ALUNO";
  const nome = sessionStorage.getItem("jurissim_user_name") ?? "usuário";
  const email = sessionStorage.getItem("jurissim_email") ?? "";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [route, setRoute] = useState(() => window.location.pathname);
  const [view, setView] = useState<"diagnostico" | "questoes">(
    role === "PROFESSOR" || role === "ADMIN" ? "questoes" : "diagnostico",
  );
  const [id, setId] = useState<string>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string>();
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [trailId, setTrailId] = useState<string>();
  const [trailQuestions, setTrailQuestions] = useState<Question[]>([]);
  const [trailIndex, setTrailIndex] = useState(0);
  const [trailAnswer, setTrailAnswer] = useState<string>();
  const [trailResult, setTrailResult] = useState<TrailResult>();

  const sair = () => {
    sessionStorage.clear();
    window.location.reload();
  };

  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    setRoute(path);
  };
  const navigateView = (destination: "diagnostico" | "questoes") => {
    setView(destination);
    navigate("/");
  };
  const startStudying = () => {
    setId(undefined);
    setQuestions([]);
    setResult(undefined);
    setTrailId(undefined);
    setTrailQuestions([]);
    setTrailResult(undefined);
    setIndex(0);
    setTrailIndex(0);
    setView("diagnostico");
    navigate("/");
  };
  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (route === "/dashboard" && role !== "ALUNO") {
      window.history.replaceState({}, "", "/");
      setRoute("/");
    }
  }, [route, role]);

  if (route === "/dashboard" && role === "ALUNO") {
    const firstName = nome.trim().split(/\s+/)[0] || "estudante";
    const metrics = result?.performances.filter((metric) => metric.tipo === "DISCIPLINA") ?? [];
    const trail = result?.trail;
    return (
      <div className="shell">
        <Sidebar active="dashboard" onNavigate={(destination) => destination === "diagnostico" ? startStudying() : navigateView(destination)} role={role} onDashboard={() => navigate("/dashboard")} onPerformance={() => navigate("/desempenho")} onOpenSettings={() => setSettingsOpen(true)} onSair={sair} />
        <main className="content">
          <header><span>Início</span><b>Olá, {firstName}</b></header>
          <section className="page dashboard-page">
            <div className="dashboard-heading">
              <div><p className="gold">JURISSIM · OAB</p><h1>Seu espaço de estudos</h1><p className="muted">Acompanhe seu preparo e continue de onde parou.</p></div>
              <button className="primary" onClick={startStudying}>Estudar agora <b>→</b></button>
            </div>
            <article className="dashboard-recommendation">
              <div className="recommendation-icon">✦</div>
              <div className="recommendation-copy">
                <p className="gold">RECOMENDADO PARA VOCÊ</p>
                {trail ? <><h2>{trail.disciplinaPrioritaria}</h2><p>{trail.assuntoPrioritario ?? "Conteudos gerais da disciplina"} · nivel {labels[trail.nivelRecomendado] ?? trail.nivelRecomendado}</p></> : <><h2>Seu painel está pronto</h2><p>As recomendações aparecem quando houver resultados disponíveis nesta sessão.</p></>}
              </div>
              {trail && <button className="outline-button" onClick={() => navigate("/desempenho")}>Ver trilha</button>}
            </article>
            <div className="dashboard-stats">
              <article><span>Seu nível</span><strong>{result ? labels[result.level] ?? result.level : "—"}</strong><small>{result ? "Resultado do diagnóstico" : "Sem resultado disponível"}</small></article>
              <article><span>Acertos no diagnóstico</span><strong>{result ? `${result.overallPercentage}%` : "—"}</strong><small>{result ? "Percentual de acertos" : "Aguardando dados reais"}</small></article>
              <article><span>Disciplinas avaliadas</span><strong>{result ? metrics.length : "—"}</strong><small>{result ? "No último diagnóstico" : "Aguardando diagnóstico"}</small></article>
            </div>
            <div className="dashboard-grid">
              <article className="panel dashboard-panel">
                <div className="dashboard-panel-heading"><div><p className="gold">VISÃO POR MATÉRIA</p><h2>Desempenho por disciplina</h2></div><button className="text-button" onClick={() => navigate("/desempenho")}>Ver meu desempenho</button></div>
                {metrics.length ? metrics.map((metric) => <div className="metric" key={metric.disciplina}><span>{metric.disciplina}</span><div><i style={{ width: `${metric.percentual}%` }} /></div><b>{metric.percentual}%</b></div>) : <p className="empty-dashboard">O desempenho por matéria será exibido após um diagnóstico com resultados disponíveis.</p>}
              </article>
              <article className="panel dashboard-panel">
                <div className="dashboard-panel-heading"><div><p className="gold">EVOLUÇÃO</p><h2>Seu progresso</h2></div></div>
                <div className="empty-chart"><span>⌁</span><p>O histórico de evolução não está disponível.</p></div>
              </article>
              <article className="panel dashboard-panel dashboard-activity">
                <div className="dashboard-panel-heading"><div><p className="gold">ATIVIDADE</p><h2>Atividade recente</h2></div></div>
                <p className="empty-dashboard">O sistema ainda não fornece um histórico de atividades para este painel.</p>
              </article>
            </div>
          </section>
        </main>
        {settingsOpen && (
          <SettingsModal
            nome={nome}
            email={email}
            role={role}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    );
  }

  if (route === "/desempenho" && !result) {
    return (
      <div className="shell">
        <Sidebar active="desempenho" onNavigate={navigateView} role={role} onDashboard={() => navigate("/dashboard")} onPerformance={() => navigate("/desempenho")} onOpenSettings={() => setSettingsOpen(true)} onSair={sair} />
        <main className="content">
          <header><span>Meu desempenho</span><TopBar nome={nome} /></header>
          <section className="page">
            <p className="gold">SEU DESEMPENHO</p>
            <h1>Dados ainda indisponíveis</h1>
            <p className="muted">Não há resultados de diagnóstico carregados nesta sessão.</p>
            <button className="primary" onClick={() => navigate("/dashboard")}>Ir para o Dashboard <b>→</b></button>
          </section>
        </main>
        {settingsOpen && (
          <SettingsModal
            nome={nome}
            email={email}
            role={role}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    );
  }

  if (view === "questoes") {
    return (
      <div className="shell">
        <Sidebar active="questoes" onNavigate={navigateView} role={role} onDashboard={() => navigate("/dashboard")} onPerformance={() => navigate("/desempenho")} onOpenSettings={() => setSettingsOpen(true)} onSair={sair} />
        <main className="content">
          <header>
            Banco de questões <TopBar nome={nome} />
          </header>
          <QuestoesPage role={role} />
        </main>
        {settingsOpen && (
          <SettingsModal
            nome={nome}
            email={email}
            role={role}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    );
  }

  const call = async <T,>(path: string, init?: RequestInit) => {
    const response = await fetch(`${api}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionStorage.getItem("jurissim_token") ?? ""}`,
        ...init?.headers,
      },
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.message ?? "Não foi possível concluir a operação.");
    return body as T;
  };

  const start = async () => {
    setLoading(true);
    setError("");
    try {
      const attempt = await call<{ id: string }>("/diagnostics", {
        method: "POST",
        body: JSON.stringify({ questionCount: 30 }),
      });
      const response = await call<{ questions: Question[] }>(
        `/diagnostics/${attempt.id}/questions`,
      );
      setId(attempt.id);
      setQuestions(response.questions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const next = async () => {
    if (!id || !answer) return;
    setLoading(true);
    setError("");
    try {
      await call(`/diagnostics/${id}/answers/${questions[index].id}`, {
        method: "PUT",
        body: JSON.stringify({ selectedOptionId: answer }),
      });
      setAnswer(undefined);
      if (index + 1 < questions.length) {
        setIndex(index + 1);
        return;
      }
      await call(`/diagnostics/${id}/finalize`, { method: "POST" });
      const diagnosticResult = await call<Result>(`/diagnostics/${id}/result`);
      const trailResponse = await call<{ trail: Trail }>(
        `/diagnostics/${id}/trail`,
      );
      setResult({ ...diagnosticResult, trail: trailResponse.trail });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const generateTrail = async () => {
    if (!result?.trail) return;
    setLoading(true);
    setError("");
    try {
      const attempt = await call<{ id: string }>(
        `/trilhas/${result.trail.id}/gerar`,
        { method: "POST" },
      );
      const response = await call<{ questions: Question[] }>(
        `/trilhas/attempts/${attempt.id}/questions`,
      );
      if (route === "/desempenho") navigate("/");
      setTrailId(attempt.id);
      setTrailQuestions(response.questions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const nextTrailQuestion = async () => {
    if (!trailId || !trailAnswer) return;
    setLoading(true);
    setError("");
    try {
      await call(
        `/trilhas/attempts/${trailId}/answers/${trailQuestions[trailIndex].id}`,
        {
          method: "PUT",
          body: JSON.stringify({ selectedOptionId: trailAnswer }),
        },
      );
      setTrailAnswer(undefined);
      if (trailIndex + 1 < trailQuestions.length) {
        setTrailIndex(trailIndex + 1);
        return;
      }
      const finalized = await call<TrailResult>(
        `/trilhas/attempts/${trailId}/finalize`,
        { method: "POST" },
      );
      setTrailResult(finalized);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  if (!id && !result)
    return (
      <main className="landing">
        <section className="pitch">
          <Brand />
          <div className="pitch-text">
            <p>DIAGNÓSTICO INTELIGENTE</p>
            <h1>
              Prepare-se para a OAB <em>no seu ritmo.</em>
            </h1>
            <span>
              Identifique suas dificuldades, pratique de forma personalizada e
              acompanhe sua evolução.
            </span>
          </div>
          <div className="stats">
            <div>
              <b>6</b>Matérias
            </div>
            <div>
              <b>30</b>Questões autorais
            </div>
            <div>
              <b>3</b>Níveis
            </div>
          </div>
        </section>
        <section className="entry">
          <div>
            <p className="gold">JURISSIM · OAB</p>
            <h2>Simulado Diagnóstico Inicial</h2>
            <p className="muted">
              Descubra seu nível e receba uma trilha personalizada para começar
              a estudar.
            </p>
            <article className="start-card">
              <b className="spark">✦</b>
              <h3>Comece sua preparação</h3>
              <p>
                As questões são obtidas do banco de dados e o seu resultado é
                calculado pela API.
              </p>
              <button className="primary" disabled={loading} onClick={start}>
                {loading ? "Preparando..." : "Iniciar diagnóstico"} <b>→</b>
              </button>
              {error && <small className="error">{error}</small>}
            </article>
          </div>
        </section>
      </main>
    );

  if (!result) {
    const question = questions[index];
    return (
      <div className="shell">
        <Sidebar active="diagnostico" onNavigate={navigateView} role={role} onDashboard={() => navigate("/dashboard")} onPerformance={() => navigate("/desempenho")} onOpenSettings={() => setSettingsOpen(true)} onSair={sair} />
        <main className="content">
          <header>
            Simulado diagnóstico <TopBar nome={nome} />
          </header>
          <section className="page">
            <p className="gold">
              QUESTÃO {index + 1} DE {questions.length}
            </p>
            <div className="heading">
              <div>
                <h1>Responda com calma.</h1>
                <p>
                  {question.discipline}
                  {question.topic && ` · ${question.topic}`}
                </p>
              </div>
              <strong>
                {index + 1}
                <small>/{questions.length}</small>
              </strong>
            </div>
            <div className="progress">
              <i
                style={{ width: `${((index + 1) / questions.length) * 100}%` }}
              />
            </div>
            <article className="question">
              <h2>{question.statement}</h2>
              <div className="answers">
                {question.alternatives.map((alternative, alternativeIndex) => (
                  <label
                    className={answer === alternative.id ? "picked" : ""}
                    key={alternative.id}
                  >
                    <input
                      type="radio"
                      checked={answer === alternative.id}
                      onChange={() => setAnswer(alternative.id)}
                    />
                    <b>{String.fromCharCode(65 + alternativeIndex)}</b>
                    <span>{alternative.text}</span>
                  </label>
                ))}
              </div>
              <footer>
                {error && <span className="error">{error}</span>}
                <button
                  className="primary"
                  disabled={!answer || loading}
                  onClick={next}
                >
                  {loading
                    ? "Salvando..."
                    : index + 1 === questions.length
                      ? "Finalizar diagnóstico"
                      : "Próxima questão"}{" "}
                  <b>→</b>
                </button>
              </footer>
            </article>
          </section>
        </main>
        {settingsOpen && (
          <SettingsModal
            nome={nome}
            email={email}
            role={role}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    );
  }

  if (trailId && trailQuestions.length > 0 && !trailResult) {
    const question = trailQuestions[trailIndex];
    return (
      <div className="shell">
        <Sidebar active="diagnostico" onNavigate={navigateView} role={role} onDashboard={() => navigate("/dashboard")} onPerformance={() => navigate("/desempenho")} onOpenSettings={() => setSettingsOpen(true)} onSair={sair} />
        <main className="content">
          <header>
            Trilha de exercícios <TopBar nome={nome} />
          </header>
          <section className="page">
            <p className="gold">
              EXERCÍCIO {trailIndex + 1} DE {trailQuestions.length}
            </p>
            <div className="heading">
              <div>
                <h1>Vamos praticar.</h1>
                <p>
                  {question.discipline}
                  {question.topic && ` · ${question.topic}`}
                </p>
              </div>
              <strong>
                {trailIndex + 1}
                <small>/{trailQuestions.length}</small>
              </strong>
            </div>
            <div className="progress">
              <i
                style={{
                  width: `${((trailIndex + 1) / trailQuestions.length) * 100}%`,
                }}
              />
            </div>
            <article className="question">
              <h2>{question.statement}</h2>
              <div className="answers">
                {question.alternatives.map((alternative, alternativeIndex) => (
                  <label
                    className={trailAnswer === alternative.id ? "picked" : ""}
                    key={alternative.id}
                  >
                    <input
                      type="radio"
                      checked={trailAnswer === alternative.id}
                      onChange={() => setTrailAnswer(alternative.id)}
                    />
                    <b>{String.fromCharCode(65 + alternativeIndex)}</b>
                    <span>{alternative.text}</span>
                  </label>
                ))}
              </div>
              <footer>
                {error && <span className="error">{error}</span>}
                <button
                  className="primary"
                  disabled={!trailAnswer || loading}
                  onClick={nextTrailQuestion}
                >
                  {loading
                    ? "Salvando..."
                    : trailIndex + 1 === trailQuestions.length
                      ? "Finalizar exercícios"
                      : "Próximo exercício"}{" "}
                  <b>→</b>
                </button>
              </footer>
            </article>
          </section>
        </main>
        {settingsOpen && (
          <SettingsModal
            nome={nome}
            email={email}
            role={role}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    );
  }

  if (trailResult && route !== "/desempenho") {
    return (
      <div className="shell">
        <Sidebar active="diagnostico" onNavigate={navigateView} role={role} onDashboard={() => navigate("/dashboard")} onPerformance={() => navigate("/desempenho")} onOpenSettings={() => setSettingsOpen(true)} onSair={sair} />
        <main className="content">
          <header>
            Trilha concluída <TopBar nome={nome} />
          </header>
          <section className="page result">
            <p className="gold">EXERCÍCIOS CONCLUÍDOS</p>
            <h1>Seu nível foi atualizado</h1>
            <p className="muted">
              O motor adaptativo reclassificou seu nível com base nessas
              respostas.
            </p>
            <article className="summary">
              <div className="score">
                <b>{trailResult.overallPercentage}%</b>
                <small>de acertos nesta trilha</small>
              </div>
              <div>
                <p className="gold">NÍVEL ANTERIOR → NÍVEL ATUAL</p>
                <h2>
                  {labels[result.level]} → {labels[trailResult.level]}
                </h2>
                <p>{trailResult.recommendation}</p>
                <div className="result-actions">
                  <button className="primary" onClick={() => navigate("/dashboard")}>Voltar ao Dashboard <b>→</b></button>
                  <button className="outline-button" onClick={() => navigate("/desempenho")}>Ver meu desempenho</button>
                </div>
              </div>
            </article>
          </section>
        </main>
        {settingsOpen && (
          <SettingsModal
            nome={nome}
            email={email}
            role={role}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    );
  }

  const metrics = result.performances.filter(
    (metric) => metric.tipo === "DISCIPLINA",
  );
  const trail = result.trail;
  return (
    <div className="shell">
      <Sidebar active="diagnostico" onNavigate={navigateView} role={role} onDashboard={() => navigate("/dashboard")} onPerformance={() => navigate("/desempenho")} onOpenSettings={() => setSettingsOpen(true)} onSair={sair} />
      <main className="content">
        <header>
          Resultado do diagnóstico <TopBar nome={nome} />
        </header>
        <section className="page result">
          <p className="gold">DIAGNÓSTICO CONCLUÍDO</p>
          <h1>Seu desempenho</h1>
          <p className="muted">Veja seu ponto de partida para a preparação.</p>
          <article className="summary">
            <div className="score">
              <b>{result.overallPercentage}%</b>
              <small>de acertos</small>
            </div>
            <div>
              <p className="gold">SEU NÍVEL ATUAL</p>
              <h2>{labels[result.level]}</h2>
              <p>{result.recommendation}</p>
            </div>
          </article>
          <article className="panel">
            <h2>Desempenho por disciplina</h2>
            {metrics.map((metric) => (
              <div className="metric" key={metric.disciplina}>
                <span>{metric.disciplina}</span>
                <div>
                  <i style={{ width: `${metric.percentual}%` }} />
                </div>
                <b>{metric.percentual}%</b>
              </div>
            ))}
          </article>
          {trail && (
            <article className="trail">
              <div>
                <p className="gold">SUA TRILHA PERSONALIZADA</p>
                <h2>{trail.disciplinaPrioritaria}</h2>
                <p>
                  <b>Tópico prioritário:</b>{" "}
                  {trail.assuntoPrioritario ?? "Conteúdos gerais da disciplina"}
                </p>
                <p>
                  <b>Nível recomendado:</b> {labels[trail.nivelRecomendado]}
                </p>
                <button
                  className="primary"
                  disabled={loading}
                  onClick={generateTrail}
                >
                  {loading ? "Gerando..." : "Gerar exercícios"} <b>→</b>
                </button>
                {error && <small className="error">{error}</small>}
              </div>
              <strong>
                {trail.quantidadeRecomendada}
                <small>
                  questões
                  <br />
                  recomendadas
                </small>
              </strong>
            </article>
          )}
          <button className="outline-button result-dashboard-link" onClick={() => navigate("/dashboard")}>Ir para o Dashboard</button>
        </section>
      </main>
      {settingsOpen && (
        <SettingsModal
          nome={nome}
          email={email}
          role={role}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""}>
    <LegalBoundary>
      <App />
      {sessionStorage.getItem('jurissim_token') && <footer className="app-legal-footer"><LegalLinks /></footer>}
    </LegalBoundary>
  </GoogleOAuthProvider>,
);