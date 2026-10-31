import { useEffect, useState } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { AuthGate } from "./auth-gate";
import { apiRequest } from './api';
import { useSession, refreshSession, endSession, logoutSession, sessionDestination, setLocalDiagnosticDemoMode } from './auth-session';
import { EmailConfirmationGate } from './email-confirmation-gate';
import { QuestionPracticePage } from './question-practice';
import { LegalBoundary, LegalLinks } from './legal';
import { Brand, SettingsModal } from "./shell";
import { ProfessorArea } from "./ProfessorArea";
import { IntegrationShell } from "./integration-shell";
import { QuestionImportPreview } from "./question-import-preview";
import { InitialDiagnosticPage } from "./initial-diagnostic";
import { DiagnosticReview } from './diagnostic-review';
import { navigate as navigateTo, usePath } from "./navigation";
import { sessionRedirectTarget } from './auth-routing';
import { ClassesPage, ExamsPage, ClassExamAttempt } from "./class-exams";
import { GoalsPage } from "./goals-reports";
import { useStudentProgress, ProgressStatus, Evolution, RecentActivities, PerformanceIndicators, StudentHistory, PersistedResult } from "./student-progress";
import { StudyTrail } from "./study-trail";


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
  simuladoGeradoId?: string | null;
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
  active: "dashboard" | "estudar" | "diagnostico" | "questoes" | "desempenho";
  onNavigate: (view: "estudar" | "diagnostico" | "questoes") => void;
  role: string | null;
  onDashboard: () => void;
  onPerformance: () => void;
  onOpenSettings: () => void;
  onSair: () => void;
}) {
  const items: [string, string, "estudar" | "diagnostico" | "questoes" | null][] = [
    ["⌂", "Início", null],
    ["▤", "Estudar", "estudar"],
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
  const path = usePath();
  const [authLink, setAuthLink] = useState(() => /^#\/(verificar-email|reset-password)(\?|$)/.test(window.location.hash));
  useEffect(() => {
    const update = () => setAuthLink(/^#\/(verificar-email|reset-password)(\?|$)/.test(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const auth = useSession();
  useEffect(() => {
    const refresh = () => { if (!authLink && document.visibilityState !== 'hidden') void refreshSession().catch(() => {}); };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [authLink]);
  const activeSession = auth.session;
  const redirectTarget = auth.status === 'ready' && activeSession ? sessionRedirectTarget(activeSession, path) : null;
  useEffect(() => {
    if (redirectTarget) navigateTo(redirectTarget, true);
  }, [redirectTarget]);
  if (authLink || (auth.status === 'anonymous' && !sessionStorage.getItem('jurissim_token'))) return <AuthGate />;
  if (auth.status === 'error') return <main className="page"><p className="error" role="alert">{auth.message}</p><button onClick={() => void refreshSession().catch(() => {})}>Tentar novamente</button><button onClick={() => void logoutSession()}>Sair</button></main>;
  if (auth.status !== 'ready' || !auth.session || redirectTarget) return <SessionValidationScreen />;
  const { user } = auth.session;
  const sair = async () => { if (!await logoutSession()) return; if (user.role !== 'ALUNO') sessionStorage.setItem('jurissim_perfil', 'PROFESSOR'); window.location.assign('/'); };
  if (!user.emailVerificado) return <EmailConfirmationGate email={user.email} onSair={sair} />;
  if (user.role === 'ADMIN' && path === '/professor/questoes/importar') return <IntegrationShell key={user.id + ':' + user.role} user={user} onSair={sair}><QuestionImportPreview role={user.role} /></IntegrationShell>;
  if (user.role === 'PROFESSOR' || user.role === 'ADMIN') return <IntegrationShell key={user.id + ':' + user.role} user={user} onSair={sair}><ProfessorArea userId={user.id} nome={user.nome} email={user.email} role={user.role} onSair={sair} /></IntegrationShell>;
  if (auth.session.nextStep === 'INITIAL_DIAGNOSTIC') return <main className="mandatory-diagnostic-screen">
    <header className="mandatory-diagnostic-header"><span className="mandatory-diagnostic-brand-mark" aria-hidden="true"><img src="/brand/jurissim-logo.png" alt="" /></span><button type="button" onClick={() => void sair()}>Sair</button></header>
    <div className="mandatory-diagnostic-content"><InitialDiagnosticPage mandatory studentId={user.id} localDemoAvailable={auth.session.localDiagnosticDemoAvailable} onEnterDemo={() => { setLocalDiagnosticDemoMode(true); void refreshSession(true).catch(() => setLocalDiagnosticDemoMode(false)); }} onBack={() => { void refreshSession().then(session => { if (session.nextStep === 'DASHBOARD') navigateTo('/trilha', true); }).catch(() => {}); }} /></div>
    <footer className="app-legal-footer"><LegalLinks /></footer>
  </main>;
  const localDemoActive = user.role === 'ALUNO' && auth.session.localDiagnosticDemoActive === true;
  const exitLocalDemo = () => { void refreshSession(true).catch(() => {}); };
  return <IntegrationShell key={user.id + ':' + user.role} user={user} onSair={sair} localDiagnosticDemoActive={localDemoActive} onExitLocalDemo={exitLocalDemo}><StudentApp userId={user.id} role={user.role} nome={user.nome} email={user.email} initialDestination={sessionDestination(auth.session)} /></IntegrationShell>;
}

function SessionValidationScreen() {
  return <main className="session-validation" role="status" aria-live="polite">
    <div className="session-validation-card">
      <span className="session-validation-mark" aria-hidden="true">J</span>
      <span className="session-validation-spinner" aria-hidden="true" />
      <strong>JurisSim</strong>
      <span>Preparando seu ambiente de estudos…</span>
    </div>
  </main>;
}
function StudentApp({ userId, role, nome, email, initialDestination }: { userId: string; role: string; nome: string; email: string; initialDestination: string }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const route = usePath();
  const view = route.startsWith("/questoes") ? "questoes" : "diagnostico";
  const [id, setId] = useState<string>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string>();
  const [currentResult, setResult] = useState<Result>();
  const progress = useStudentProgress();
  const result = currentResult ?? (["/dashboard", "/desempenho", "/trilha", "/estudar"].includes(route) ? progress.latestResult : undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [trailId, setTrailId] = useState<string>();
  const [trailQuestions, setTrailQuestions] = useState<Question[]>([]);
  const [trailIndex, setTrailIndex] = useState(0);
  const [trailAnswer, setTrailAnswer] = useState<string>();
  const [trailResult, setTrailResult] = useState<TrailResult>();

  const sair = () => {
    endSession();
    window.location.reload();
  };

  const navigate = navigateTo;
  const navigateView = (destination: "estudar" | "diagnostico" | "questoes") => navigate(
    destination === "questoes" ? "/questoes" : destination === "diagnostico" ? "/diagnostico" : "/estudar",
  );
  useEffect(() => {
    if (route.startsWith("/professor")) {
      const destination = initialDestination;
      navigateTo(destination, true);
    }
  }, [route, role, initialDestination]);

  if (route === "/diagnostico-inicial") return <InitialDiagnosticPage studentId={userId} onBack={() => navigate("/")} />;
  const practiceRoute = /^\/questoes\/pratica\/([^/]+)$/.exec(route);


  const classAttemptRoute = /^\/simulados\/tentativas\/([^/]+)$/.exec(route);
  if (route === "/metas") return <GoalsPage />;
  if (route === "/turmas") return <ClassesPage teacher={false} />;
  if (route === "/simulados") return <ExamsPage teacher={false} />;
  if (classAttemptRoute) return <ClassExamAttempt key={classAttemptRoute[1]} id={classAttemptRoute[1]} onCompleted={() => void progress.refresh()} />;
  const resultRoute = /^\/resultados\/(diagnostico|trilha)\/([^/]+)$/.exec(route);
  const diagnosticReviewRoute = /^\/resultados\/diagnostico\/([^/]+)\/correcao$/.exec(route);
  if (diagnosticReviewRoute) return <DiagnosticReview attemptId={diagnosticReviewRoute[1]} onBack={() => navigate(`/resultados/diagnostico/${diagnosticReviewRoute[1]}`)} />;
  if (route === "/historico") return <StudentHistory />;
  if (route === "/estudar") return <StudyTrail mode="study" userId={userId} result={result} onQuestions={(discipline) => navigate(`/questoes?disciplina=${encodeURIComponent(discipline)}`)} />;
  if (route === "/trilha") return <StudyTrail mode="trail" userId={userId} result={result} onQuestions={(discipline) => navigate(`/questoes?disciplina=${encodeURIComponent(discipline)}`)} />;
  if (resultRoute) return <PersistedResult type={resultRoute[1] as "diagnostico" | "trilha"} id={resultRoute[2]} />;

  if (route === "/dashboard" && role === "ALUNO") {
    const firstName = nome.trim().split(/\s+/)[0] || "estudante";
    const metrics = progress.data?.learning?.disciplines.map((item) => ({ disciplina: item.discipline, percentual: item.percentage ?? 0 })) ?? result?.performances.filter((metric) => metric.tipo === "DISCIPLINA") ?? [];
    const totalAnswered = progress.data?.totals.answeredQuestions ?? 0;
    const totalCorrect = progress.data?.totals.correctAnswers ?? 0;
    const trail = result?.trail;
    return (
      <div className="shell">
        <Sidebar active="dashboard" onNavigate={navigateView} role={role} onDashboard={() => navigate("/dashboard")} onPerformance={() => navigate("/desempenho")} onOpenSettings={() => setSettingsOpen(true)} onSair={sair} />
        <main className="content">
          <header><span>Início</span><b>Olá, {firstName}</b></header>
          <ProgressStatus loading={progress.loading} error={progress.error} refresh={() => void progress.refresh()} />
          {progress.resultError && <div className="study-notice" role="alert"><p>O resumo da conta foi carregado, mas o resultado do diagnóstico antigo está indisponível: {progress.resultError}</p><button className="outline-button" onClick={() => void progress.refresh()}>Tentar novamente</button></div>}
          <section className="page dashboard-page">
            <div className="dashboard-heading">
              <div><p className="gold">JURISSIM · OAB</p><h1>Seu espaço de estudos</h1><p className="muted">Acompanhe seu preparo e continue de onde parou.</p></div>
              <div className="dashboard-heading-actions">
                <button className="primary" onClick={() => navigate("/estudar")}>Estudar agora <b>→</b></button>
                <button className="text-button" onClick={() => navigate("/trilha")}>Minha Trilha de Estudos</button>
                <button className="text-button" onClick={() => navigate("/diagnostico-inicial")}>Conhecer o novo diagnóstico</button>
              </div>
            </div>
            <article className="dashboard-recommendation">
              <div className="recommendation-icon">✦</div>
              <div className="recommendation-copy">
                <p className="gold">RECOMENDADO PARA VOCÊ</p>
              {progress.data?.learning?.priorityTopic ? <><h2>{progress.data.learning.priorityTopic.discipline}</h2><p>Retome {progress.data.learning.priorityTopic.topic} · {progress.data.learning.priorityTopic.percentage}% em {progress.data.learning.priorityTopic.total} respostas</p></> : trail ? <><h2>{trail.disciplinaPrioritaria}</h2><p>{trail.assuntoPrioritario ?? "Conteudos gerais da disciplina"} · nivel {labels[trail.nivelRecomendado] ?? trail.nivelRecomendado}</p></> : <><h2>Seu painel está pronto</h2><p>As recomendações aparecem após seu primeiro diagnóstico concluído.</p></>}
              </div>
              {trail && <button className="outline-button" onClick={() => navigate("/desempenho")}>Ver trilha</button>}
            </article>
            <div className="dashboard-stats">
              <article><span>Seu nível</span><strong>{result ? labels[result.level] ?? result.level : "—"}</strong><small>{result ? "Resultado do diagnóstico" : "Sem resultado disponível"}</small></article>
              <article><span>Questões respondidas</span><strong>{totalAnswered || "—"}</strong><small>{totalAnswered ? `${totalCorrect} acertos no histórico` : "Aguardando atividade registrada"}</small></article>
              <article><span>Disciplinas avaliadas</span><strong>{result ? metrics.length : "—"}</strong><small>{result ? "No último diagnóstico" : "Aguardando diagnóstico"}</small></article>
            </div>
            <div className="dashboard-grid">
              <article className="panel dashboard-panel">
                <div className="dashboard-panel-heading"><div><p className="gold">VISÃO POR MATÉRIA</p><h2>Desempenho por disciplina</h2></div><button className="text-button" onClick={() => navigate("/desempenho")}>Ver meu desempenho</button></div>
                {metrics.length ? metrics.map((metric) => <div className="metric" key={metric.disciplina}><span>{metric.disciplina}</span><div><i style={{ width: `${metric.percentual}%` }} /></div><b>{metric.percentual}%</b></div>) : <p className="empty-dashboard">O desempenho por matéria será exibido após respostas registradas.</p>}
              </article>
              <article className="panel dashboard-panel">
                <div className="dashboard-panel-heading"><div><p className="gold">EVOLUÇÃO</p><h2>Seu progresso</h2></div></div>
                <Evolution items={progress.data?.evolution} />
              </article>
              <article className="panel dashboard-panel dashboard-activity">
                <div className="dashboard-panel-heading"><div><p className="gold">ATIVIDADE</p><h2>Atividade recente</h2></div></div>
                <RecentActivities items={progress.data?.recentActivities} />
              </article>
              <article className="panel dashboard-panel">
                <div className="dashboard-panel-heading"><div><p className="gold">TRILHAS</p><h2>Progresso das trilhas adaptativas</h2></div></div>
                {progress.data?.learning?.trailProgress.length ? progress.data.learning.trailProgress.slice(0, 5).map((item) => <div className="metric" key={item.id}><span>{item.discipline}{item.topic ? ` · ${item.topic}` : ""}</span><div><i style={{ width: `${item.total ? Math.round(item.answered / item.total * 100) : 0}%` }} /></div><b>{item.completed ? "Concluída" : `${item.answered}/${item.total}`}</b></div>) : <p className="empty-dashboard">As trilhas concluídas e em andamento aparecerão aqui.</p>}
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
            <h1>{progress.data?.totals.completedActivities ? "Seu desempenho" : "Dados ainda indisponíveis"}</h1>
            <ProgressStatus loading={progress.loading} error={progress.error} refresh={() => void progress.refresh()} />
            {progress.resultError ? <p className="error" role="alert">O resultado do diagnóstico antigo está indisponível: {progress.resultError}</p> : <p className="muted">Nenhum diagnóstico concluído foi encontrado na sua conta.</p>}
            <PerformanceIndicators data={progress.data} />
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

  if (view === "questoes" || practiceRoute) {
    return (
      <div className="shell">
        <Sidebar active="questoes" onNavigate={navigateView} role={role} onDashboard={() => navigate("/dashboard")} onPerformance={() => navigate("/desempenho")} onOpenSettings={() => setSettingsOpen(true)} onSair={sair} />
        <main className="content">
          <header>
            Banco de questões <TopBar nome={nome} />
          </header>
          <QuestionPracticePage key={practiceRoute?.[1] ?? 'chooser'} attemptId={practiceRoute?.[1]} initialDiscipline={new URLSearchParams(window.location.search).get('disciplina') ?? undefined} />
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

  const call = apiRequest;

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
      void progress.refresh();
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
      if (route === "/desempenho") navigate("/diagnostico");
      setResult({ ...result, trail: { ...result.trail, simuladoGeradoId: attempt.id } });
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
      void progress.refresh();
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

  if (trailId && trailQuestions.length > 0 && !trailResult && route !== "/desempenho") {
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
          <ProgressStatus loading={progress.loading} error={progress.error} refresh={() => void progress.refresh()} />
          {route === "/desempenho" && <PerformanceIndicators data={progress.data} />}
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
                  disabled={loading || !!trail.simuladoGeradoId}
                  onClick={generateTrail}
                >
                  {trail.simuladoGeradoId ? "Exercícios já gerados" : loading ? "Gerando..." : "Gerar exercícios"} <b>→</b>
                </button>
                {trail.simuladoGeradoId && <button className="text-button" onClick={() => navigate("/historico")}>Consultar exercícios no histórico</button>}
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

const application = (
    <LegalBoundary>
      {import.meta.env.VITE_JURISSIM_DEMO_MODE === 'true' && <div className="jurissim-demo-global-banner" role="status">
        DEMONSTRAÇÃO ACADÊMICA — todos os registros são sintéticos. Os slots OAB são apenas simulações técnicas; não são questões oficiais, licenciadas ou homologadas.
      </div>}
      <App />
    </LegalBoundary>
);
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
createRoot(document.getElementById("root")!).render(clientId ? <GoogleOAuthProvider clientId={clientId}>{application}</GoogleOAuthProvider> : application);
