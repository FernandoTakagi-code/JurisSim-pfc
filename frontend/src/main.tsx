import { useEffect, useRef, useState } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { AuthGate } from "./auth-gate";
import {TeacherInvitationLanding} from './invitation-onboarding';
import {InstitutionArea} from './institution-area';
import { apiRequest } from './api';
import { useSession, refreshSession, endSession, logoutSession, sessionDestination, setLocalDiagnosticDemoMode } from './auth-session';
import { EmailConfirmationGate } from './email-confirmation-gate';
import { QuestionPracticePage } from './question-practice';
import { IndividualExamPage } from './individual-exam';
import { LegalBoundary, LegalLinks } from './legal';
import { Brand } from "./shell";
import { ProfessorArea } from "./ProfessorArea";
import { IntegrationShell } from "./integration-shell";
import { GeneralAdministration, InstitutionsPortal, InstitutionContext } from './administration';
import './invitation-token';
import { InitialDiagnosticPage } from "./initial-diagnostic";
import { DiagnosticReview } from './diagnostic-review';
import { navigate as navigateTo, usePath } from "./navigation";
import { sessionRedirectTarget } from './auth-routing';
import { ClassesPage, ExamsPage, ClassExamAttempt } from "./class-exams";
import { GoalsPage } from "./goals-reports";
import { useStudentProgress, ProgressStatus, Evolution, RecentActivities, PerformanceIndicators, StudentHistory, PersistedResult } from "./student-progress";
import { AdaptiveTrail } from "./adaptive-trail";
import { TrailLaunchButton } from "./trail-launch";
import { StudyTrail } from "./study-trail";
import { useAttemptResume } from './attempt-resume';


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
  if(path === '/convite-professor') return <TeacherInvitationLanding/>;
  if (authLink || (auth.status === 'anonymous' && !sessionStorage.getItem('jurissim_token'))) return <AuthGate />;
  if (auth.status === 'error') return <main className="page"><p className="error" role="alert">{auth.message}</p><button onClick={() => void refreshSession().catch(() => {})}>Tentar novamente</button><button onClick={() => void logoutSession()}>Sair</button></main>;
  if (auth.status !== 'ready' || !auth.session || redirectTarget) return <SessionValidationScreen />;
  const { user } = auth.session;
  const sair = async () => { if (!await logoutSession()) return; window.location.assign('/'); };
  if(auth.session.administration?.needsInstitutionLink && !user.emailVerificado) return <EmailConfirmationGate email={user.email} onSair={sair}/>;
  if(auth.session.administration?.needsInstitutionLink && path!=='/instituicoes' && path!=='/professor/perfil' && path!=='/professor/configuracoes') return <IntegrationShell user={user} onSair={sair}><section className="page"><h1>Vínculo institucional pendente</h1><p>Sua conta e seu histórico foram preservados. Confirme seu e-mail pelo fluxo normal e solicite ao responsável um convite da instituição legítima. Nenhum vínculo será criado automaticamente.</p></section></IntegrationShell>;
  if (path === '/instituicoes') return <InstitutionArea session={auth.session} onSair={sair}/>;
  if (!user.emailVerificado) return <EmailConfirmationGate email={user.email} onSair={sair} />;
  if (path.startsWith('/administracao') || (user.role === 'ADMIN' && !path.startsWith('/professor'))) return <IntegrationShell user={user} onSair={sair}>{user.role === 'ADMIN' ? <GeneralAdministration /> : <section className="page"><h1>Acesso não autorizado</h1><p>Área exclusiva da administração geral.</p></section>}</IntegrationShell>;
  if (user.role === 'PROFESSOR' && auth.session.administration && auth.session.administration.memberships.filter(m => m.role === 'TEACHER').length > 1 && !sessionStorage.getItem('jurissim_institution')) return <IntegrationShell user={user} onSair={sair}><InstitutionContext session={auth.session} /></IntegrationShell>;
  if (user.role === 'PROFESSOR') return <IntegrationShell key={user.id + ':' + user.role} user={user} onSair={sair}><ProfessorArea userId={user.id} nome={user.nome} email={user.email} role={user.role} onSair={sair} /></IntegrationShell>;
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

  const route = usePath();
  const view = route.startsWith("/questoes") ? "questoes" : "diagnostico";
  const [id, setId] = useState<string>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string>();
  const [currentResult, setResult] = useState<Result>();
  const progress = useStudentProgress();
  const previousProgressRoute = useRef(route);
  useEffect(() => {
    const changed = previousProgressRoute.current !== route;
    previousProgressRoute.current = route;
    if (changed && ["/dashboard", "/trilha"].includes(route)) void progress.refresh();
  }, [route, progress.refresh]);
  const result = (currentResult?.level || route === '/diagnostico' ? currentResult : undefined)
    ?? (["/dashboard", "/desempenho", "/trilha", "/estudar"].includes(route) ? progress.latestResult : undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [trailId, setTrailId] = useState<string>();
  const [trailQuestions, setTrailQuestions] = useState<Question[]>([]);
  const [trailIndex, setTrailIndex] = useState(0);
  const [trailAnswer, setTrailAnswer] = useState<string>();
  const [trailResult, setTrailResult] = useState<TrailResult>();
  const attemptMutationPending = useRef(false);
  const recovery = useAttemptResume(route);
  useEffect(() => {
    const saved = recovery.restored;
    if (!saved) return;
    setError('');
    const firstUnanswered = saved.questions.findIndex(question => !question.selectedOptionId);
    const position = firstUnanswered < 0 ? Math.max(0, saved.questions.length - 1) : firstUnanswered;
    if (saved.kind === 'diagnostico') {
      setId(saved.id); setQuestions(saved.questions); setIndex(position);
      setAnswer(saved.questions[position]?.selectedOptionId ?? undefined);
      setResult(saved.result); setTrailId(undefined); setTrailQuestions([]); setTrailResult(undefined);
    } else {
      setId(undefined); setTrailId(saved.id); setTrailQuestions(saved.questions); setTrailIndex(position);
      setTrailAnswer(saved.questions[position]?.selectedOptionId ?? undefined);
      setResult({ overallPercentage: 0, level: '', recommendation: '', performances: [], trail: null });
      setTrailResult(saved.result);
    }
  }, [recovery.restored]);



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

  if (recovery.requested && (recovery.loading || recovery.error)) return <section className="page">
    <h1>{recovery.loading ? 'Retomando sua tentativa…' : 'Não foi possível retomar a tentativa'}</h1>
    {recovery.error && <><p className="error" role="alert">{recovery.error}</p><button className="outline-button" onClick={recovery.retry}>Tentar novamente</button></>}
  </section>;
  if (route === "/diagnostico-inicial") return <InitialDiagnosticPage studentId={userId} onBack={() => navigate("/")} />;
  const practiceRoute = /^\/questoes\/pratica\/([^/]+)$/.exec(route);
  const reviewRoute = /^\/questoes\/revisao\/([^/]+)$/.exec(route);


  const classAttemptRoute = /^\/simulados\/tentativas\/([^/]+)$/.exec(route);
  const individualExamRoute = /^\/simulados\/individual\/([^/]+)$/.exec(route);
  if (individualExamRoute) return <IndividualExamPage key={individualExamRoute[1]} id={individualExamRoute[1]} />;
  if (route === "/metas") return <GoalsPage />;
  if (route === "/turmas") return <ClassesPage teacher={false} />;
  if (route === "/simulados") return <ExamsPage teacher={false} />;
  if (classAttemptRoute) return <ClassExamAttempt key={classAttemptRoute[1]} id={classAttemptRoute[1]} onCompleted={() => void progress.refresh()} />;
  const resultRoute = /^\/resultados\/(diagnostico|diagnostico-inicial|trilha)\/([^/]+)$/.exec(route);
  const diagnosticReviewRoute = /^\/resultados\/diagnostico\/([^/]+)\/correcao$/.exec(route);
  if (diagnosticReviewRoute) return <DiagnosticReview attemptId={diagnosticReviewRoute[1]} onBack={() => navigate(`/resultados/diagnostico/${diagnosticReviewRoute[1]}`)} />;
  if (route === "/historico") return <StudentHistory />;
  if (route === "/estudar") return <StudyTrail userId={userId} result={result} onQuestions={(discipline) => navigate(`/questoes?disciplina=${encodeURIComponent(discipline)}`)} />;
  if (route === "/trilha") return <AdaptiveTrail progress={progress} />;
  if (resultRoute) return <PersistedResult type={resultRoute[1] as "diagnostico" | "diagnostico-inicial" | "trilha"} id={resultRoute[2]} />;

  if (route === "/dashboard" && role === "ALUNO") {
    const academic = !progress.loading && !progress.error ? progress.data : undefined;
    const dashboardResult = academic && !progress.resultError ? result : undefined;
    const metrics = academic?.learning?.disciplines.map((item) => ({ disciplina: item.discipline, percentual: item.percentage ?? 0 })) ?? dashboardResult?.performances.filter((metric) => metric.tipo === "DISCIPLINA") ?? [];
    const totalAnswered = academic?.totals.answeredQuestions ?? 0;
    const totalCorrect = academic?.totals.correctAnswers ?? 0;
    const trail = dashboardResult?.trail;
    return (
      <div className="shell">        <main className="content">
          <ProgressStatus loading={progress.loading} error={progress.error} refresh={() => void progress.refreshAcademic()} />
          <ProgressStatus loading={progress.dashboardLoading} error={progress.dashboardError} refresh={() => void progress.refreshDashboard()} loadingMessage="Carregando metas de estudo..." />
          {progress.resultError && <div className="study-notice" role="alert"><p>O resumo da conta foi carregado, mas o resultado do diagnóstico antigo está indisponível: {progress.resultError}</p><button className="outline-button" onClick={() => void progress.refresh()}>Tentar novamente</button></div>}
          <section className="page dashboard-page">
            <div className="dashboard-heading">
              <div><p className="gold">JURISSIM · OAB</p><h1>Seu espaço de estudos</h1><p className="muted">Acompanhe seu preparo e continue de onde parou.</p></div>
              <div className="dashboard-heading-actions">
                <button className="primary" onClick={() => navigate("/estudar")}>Estudar agora <b>→</b></button>
                <button className="text-button" onClick={() => navigate("/trilha")}>Minha Trilha Adaptativa</button>
                <button className="text-button" onClick={() => navigate("/diagnostico-inicial")}>Conhecer o novo diagnóstico</button>
              </div>
            </div>
            <article className="dashboard-recommendation">
              <div className="recommendation-icon">✦</div>
              <div className="recommendation-copy">
                <p className="gold">{academic?.learning?.priorityTopic || trail ? "RECOMENDADO PARA VOCÊ" : "COMECE POR AQUI"}</p>
              {academic?.learning?.priorityTopic ? <><h2>{academic.learning.priorityTopic.discipline}</h2><p>Retome {academic.learning.priorityTopic.topic} · {academic.learning.priorityTopic.percentage}% em {academic.learning.priorityTopic.total} respostas</p></> : trail ? <><h2>{trail.disciplinaPrioritaria}</h2><p>{trail.assuntoPrioritario ?? "Conteudos gerais da disciplina"} · nivel {labels[trail.nivelRecomendado] ?? trail.nivelRecomendado}</p></> : <><h2>Seu painel está pronto</h2><p>As recomendações aparecem após seu primeiro diagnóstico concluído.</p></>}
              </div>
              {trail && <button className="outline-button" onClick={() => navigate("/trilha")}>Abrir trilha adaptativa</button>}
            </article>
            <div className="dashboard-stats">
              <article><span>Seu nível</span><strong>{dashboardResult ? labels[dashboardResult.level] ?? dashboardResult.level : "—"}</strong><small>{dashboardResult ? "Resultado do diagnóstico" : "Sem resultado disponível"}</small></article>
              <article><span>Questões respondidas</span><strong>{academic ? totalAnswered : "—"}</strong><small>{totalAnswered ? `${totalCorrect} acertos em atividades concluídas` : "Aguardando atividade registrada"}</small></article>
              <article><span>Disciplinas com respostas</span><strong>{academic ? metrics.length : "—"}</strong><small>{academic ? "No desempenho registrado" : "Aguardando dados"}</small></article>
            </div>
            <div className="dashboard-grid student-entry-cards">
              <article className="panel"><p className="gold">CONTEÚDOS E AULAS</p><h2>Estudar</h2><p className="muted">Aprenda por disciplina, revise e continue suas aulas. Leituras e autoavaliações ficam salvas neste navegador.</p><button className="primary" onClick={() => navigate("/estudar")}>Estudar agora</button></article>
              <article className="panel"><p className="gold">EXERCÍCIOS PERSONALIZADOS</p><h2>Minha Trilha Adaptativa</h2><p className="muted">Consulte as prioridades do diagnóstico, retome exercícios e acompanhe resultados salvos na sua conta.</p><button className="outline-button" onClick={() => navigate("/trilha")}>Abrir trilha adaptativa</button></article>
            </div>
            <article className="panel dashboard-today"><div><p className="gold">METAS DIÁRIAS</p><h2>Hoje</h2>
              {progress.studyDashboard && !progress.dashboardLoading && !progress.dashboardError && <p>{progress.studyDashboard.todayAnsweredQuestions} respostas registradas{progress.studyDashboard.todayGoal ? ` de ${progress.studyDashboard.todayGoal.targetQuestions} da meta (${progress.studyDashboard.todayGoal.progressPercentage}%)` : ". Crie uma meta para acompanhar seu objetivo."}</p>}
              {progress.dashboardLoading && <p className="muted">Atualizando o resumo de hoje...</p>}
              {progress.dashboardError && <p className="muted">Resumo indisponível. Use a opção de tentar novamente acima.</p>}
            </div><button className="text-button" onClick={() => navigate("/metas")}>Gerenciar metas</button></article>
            <div className="dashboard-grid">
              <article className="panel dashboard-panel">
                <div className="dashboard-panel-heading"><div><p className="gold">VISÃO POR MATÉRIA</p><h2>Desempenho por disciplina</h2></div><button className="text-button" onClick={() => navigate("/desempenho")}>Ver meu desempenho</button></div>
                {metrics.length ? metrics.map((metric) => <div className="metric" key={metric.disciplina}><span>{metric.disciplina}</span><div><i style={{ width: `${metric.percentual}%` }} /></div><b>{metric.percentual}%</b></div>) : <p className="empty-dashboard">O desempenho por matéria será exibido após respostas registradas.</p>}
              </article>
              <article className="panel dashboard-panel">
                <div className="dashboard-panel-heading"><div><p className="gold">EVOLUÇÃO</p><h2>Seu progresso</h2></div></div>
                <Evolution items={academic?.evolution} />
              </article>
              <article className="panel dashboard-panel dashboard-activity">
                <div className="dashboard-panel-heading"><div><p className="gold">ATIVIDADE</p><h2>Atividade recente</h2></div></div>
                <RecentActivities items={academic?.recentActivities} />
              </article>
              <article className="panel dashboard-panel">
                <div className="dashboard-panel-heading"><div><p className="gold">TRILHAS</p><h2>Progresso das trilhas adaptativas</h2></div></div>
                {academic?.learning?.trailProgress.length ? academic.learning.trailProgress.slice(0, 5).map((item) => <div className="metric" key={item.id}><span>{item.discipline}{item.topic ? ` · ${item.topic}` : ""}</span><div><i style={{ width: `${item.total ? Math.round(item.answered / item.total * 100) : 0}%` }} /></div><b>{item.completed ? "Concluída" : `${item.answered}/${item.total}`}</b></div>) : <p className="empty-dashboard">As trilhas concluídas e em andamento aparecerão aqui.</p>}
              </article>
            </div>
          </section>
        </main>

      </div>
    );
  }

  if (route === "/desempenho" && !result) {
    return (
      <div className="shell">        <main className="content">
          <section className="page">
            <p className="gold">SEU DESEMPENHO</p>
            <h1>{progress.data?.totals.completedActivities ? "Seu desempenho" : "Dados ainda indisponíveis"}</h1>
            <ProgressStatus loading={progress.loading} error={progress.error} refresh={() => void progress.refreshAcademic()} />
            {progress.resultError ? <p className="error" role="alert">O resultado do diagnóstico antigo está indisponível: {progress.resultError}</p> : <p className="muted">Nenhum diagnóstico concluído foi encontrado na sua conta.</p>}
            <PerformanceIndicators data={progress.data} />
            <button className="primary" onClick={() => navigate("/dashboard")}>Ir para o Dashboard <b>→</b></button>
          </section>
        </main>

      </div>
    );
  }

  if (view === "questoes" || practiceRoute) {
    return (
      <div className="shell">        <main className="content">
          <QuestionPracticePage key={reviewRoute?.[1] ?? practiceRoute?.[1] ?? (route.startsWith('/questoes/revisao') ? 'review-chooser' : 'chooser')} review={route.startsWith('/questoes/revisao')} attemptId={reviewRoute?.[1] ?? practiceRoute?.[1]} initialDiscipline={new URLSearchParams(window.location.search).get('disciplina') ?? undefined} />
        </main>

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
      navigate(`/diagnostico?tentativa=${encodeURIComponent(attempt.id)}`);
      recovery.retry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const next = async () => {
    if (!id || !answer || !questions[index] || attemptMutationPending.current) return;
    attemptMutationPending.current = true;
    setLoading(true);
    setError("");
    try {
      if (!questions[index].selectedOptionId) await call(`/diagnostics/${id}/answers/${questions[index].id}`, {
        method: "PUT",
        body: JSON.stringify({ selectedOptionId: answer }),
      });
      setQuestions(current => current.map(question => question.id === questions[index].id ? { ...question, selectedOptionId: answer } : question));
      if (index + 1 < questions.length) {
        setAnswer(questions[index + 1].selectedOptionId ?? undefined);
        setIndex(index + 1);
        return;
      }
      await call(`/diagnostics/${id}/finalize`, { method: "POST" });
      const diagnosticResult = await call<Result>(`/diagnostics/${id}/result`);
      setResult(diagnosticResult);
      void progress.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro inesperado.");
      // A lost response does not prove that the write failed. Re-read the owned
      // attempt before allowing another answer or completion request.
      recovery.retry();
    } finally {
      attemptMutationPending.current = false;
      setLoading(false);
    }
  };

  const nextTrailQuestion = async () => {
    if (!trailId || !trailAnswer || !trailQuestions[trailIndex] || attemptMutationPending.current) return;
    attemptMutationPending.current = true;
    setLoading(true);
    setError("");
    try {
      if (!trailQuestions[trailIndex].selectedOptionId) await call(
        `/trilhas/attempts/${trailId}/answers/${trailQuestions[trailIndex].id}`,
        {
          method: "PUT",
          body: JSON.stringify({ selectedOptionId: trailAnswer }),
        },
      );
      setTrailQuestions(current => current.map(question => question.id === trailQuestions[trailIndex].id ? { ...question, selectedOptionId: trailAnswer } : question));
      if (trailIndex + 1 < trailQuestions.length) {
        setTrailAnswer(trailQuestions[trailIndex + 1].selectedOptionId ?? undefined);
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
      // A lost response does not prove that the write failed. Re-read the owned
      // attempt before allowing another answer or completion request.
      recovery.retry();
    } finally {
      attemptMutationPending.current = false;
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
              <b>OAB</b>Estudo por matéria
            </div>
            <div>
              <b>Acervo</b>Questões disponíveis
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
              Faça o diagnóstico legado com as questões públicas disponíveis e
              receba uma trilha personalizada para começar a estudar.
            </p>
            <article className="start-card">
              <b className="spark">✦</b>
              <h3>Comece sua preparação</h3>
              <p>
                A quantidade depende do acervo disponível e será exibida ao
                iniciar. Seu resultado é calculado pela API, sem exigir vínculo
                com uma instituição.
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
      <div className="shell">        <main className="content">
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

      </div>
    );
  }

  if (trailId && trailQuestions.length > 0 && !trailResult && route !== "/desempenho") {
    const question = trailQuestions[trailIndex];
    return (
      <div className="shell">        <main className="content">
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

      </div>
    );
  }

  if (trailResult && route !== "/desempenho") {
    return (
      <div className="shell">        <main className="content">
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
                  {labels[result.level] ?? '—'} → {labels[trailResult.level]}
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

      </div>
    );
  }

  const metrics = result.performances.filter(
    (metric) => metric.tipo === "DISCIPLINA",
  );
  const trail = result.trail;
  return (
    <div className="shell">      <main className="content">
        <section className="page result">
          <ProgressStatus loading={progress.loading} error={progress.error} refresh={() => void progress.refreshAcademic()} />
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
                <TrailLaunchButton trail={trail} />
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
