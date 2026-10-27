import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "./api";
import {
  finalizeInitialDiagnostic,
  getInitialDiagnosticAnswers,
  getInitialDiagnosticQuestions,
  getInitialDiagnosticResult,
  initialDiagnosticUiEnabled,
  saveInitialDiagnosticAnswer,
  startOrRecoverInitialDiagnostic,
  type InitialDiagnosticResult,
  type InitialDiagnosticShortage,
} from "./initial-diagnostic-api";
import { INITIAL_DIAGNOSTIC_DISCIPLINES, INITIAL_DIAGNOSTIC_QUESTION_COUNT, INITIAL_DIAGNOSTIC_QUESTIONS_PER_DISCIPLINE } from "../../backend/src/services/initial-diagnostic-config";
import "./initial-diagnostic.css";

export { INITIAL_DIAGNOSTIC_DISCIPLINES } from "../../backend/src/services/initial-diagnostic-config";

export type InitialDiagnosticDiscipline = typeof INITIAL_DIAGNOSTIC_DISCIPLINES[number];
export type AlternativeLetter = "A" | "B" | "C" | "D";

export type InitialDiagnosticAlternative = {
  id: string;
  letter: AlternativeLetter;
  text: string;
};

/** No answer key is part of the client contract for an in-progress attempt. */
export type InitialDiagnosticQuestion = {
  id: string;
  position: number;
  discipline: InitialDiagnosticDiscipline;
  statement: string;
  alternatives: readonly InitialDiagnosticAlternative[];
};

export type InitialDiagnosticAttemptView = {
  id: string;
  questions: readonly InitialDiagnosticQuestion[];
};

type InitialDiagnosticPageProps = { onBack: () => void; studentId: string; mandatory?: boolean; onEnterDemo?: () => void; localDemoAvailable?: boolean };
type PagePhase = "intro" | "loading" | "attempt" | "result";
type DiagnosticUiError = { message: string; shortages?: InitialDiagnosticShortage[]; disabled?: boolean };
const STORAGE_PREFIX = "jurissim_initial_diagnostic_attempt_";

function isShortageList(value: unknown): value is InitialDiagnosticShortage[] {
  return Array.isArray(value) && value.every(item => item && typeof item.discipline === "string"
    && typeof item.level === "string" && typeof item.origin === "string"
    && Number.isInteger(item.required) && Number.isInteger(item.available));
}

function mapApiError(cause: unknown): DiagnosticUiError {
  if (!(cause instanceof ApiError)) {
    return { message: cause instanceof Error ? cause.message : "Não foi possível conectar ao serviço. Tente novamente." };
  }
  if (cause.status === 401) return { message: "Sua sessão expirou. Entre novamente para continuar." };
  if (cause.status === 403) return { message: "Sua conta não tem permissão para acessar este diagnóstico." };
  if (cause.status === 503 && cause.code === "INITIAL_DIAGNOSTIC_DISABLED") {
    return { message: "O Diagnóstico Inicial ainda está desativado enquanto a validação do serviço é concluída.", disabled: true };
  }
  if (cause.status === 503) return { message: "O serviço está temporariamente indisponível. Suas respostas salvas permanecem no servidor; tente novamente." };
  if (cause.status === 409 && cause.code === "INITIAL_DIAGNOSTIC_INSUFFICIENT_QUESTION_BANK") {
    const payload = cause.payload as { shortages?: unknown } | undefined;
    return {
      message: "Ainda não há questões elegíveis suficientes para montar o diagnóstico completo.",
      shortages: isShortageList(payload?.shortages) ? payload.shortages : undefined,
    };
  }
  if (cause.status === 409) return { message: "A tentativa mudou de estado no servidor. Atualize os dados e tente novamente." };
  return { message: cause.message || "Não foi possível concluir a operação." };
}

function answerMap(answers: readonly { questionId: string; selectedOptionId: string }[]) {
  return Object.fromEntries(answers.map(answer => [answer.questionId, answer.selectedOptionId]));
}

function validQuestionSet(questions: readonly InitialDiagnosticQuestion[]): boolean {
  if (questions.length !== 30) return false;
  const ordered = questions.every((question, index) => question.position === index + 1);
  const distribution = INITIAL_DIAGNOSTIC_DISCIPLINES.every(discipline => questions.filter(question => question.discipline === discipline).length === 6);
  const choices = questions.every(question => question.alternatives.length === 4
    && new Set(question.alternatives.map(option => option.letter)).size === 4
    && ["A", "B", "C", "D"].every(letter => question.alternatives.some(option => option.letter === letter)));
  return ordered && distribution && choices;
}

export function InitialDiagnosticPage({ onBack, studentId, mandatory = false, onEnterDemo, localDemoAvailable = false }: InitialDiagnosticPageProps) {
  const [phase, setPhase] = useState<PagePhase>("intro");
  const [attemptId, setAttemptId] = useState("");
  const [questions, setQuestions] = useState<InitialDiagnosticQuestion[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [confirmedAnswers, setConfirmedAnswers] = useState<Record<string, string>>({});
  const [savingQuestionId, setSavingQuestionId] = useState("");
  const [result, setResult] = useState<InitialDiagnosticResult | null>(null);
  const [error, setError] = useState<DiagnosticUiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const finalizationInFlight = useRef(false);
  const answerSaveInFlight = useRef(false);
  const storageKey = `${STORAGE_PREFIX}${studentId}`;
  const unavailable = !initialDiagnosticUiEnabled || error?.disabled === true;

  const storeAttemptId = (id: string | null) => {
    try {
      if (id) sessionStorage.setItem(storageKey, id);
      else sessionStorage.removeItem(storageKey);
    } catch { /* Server remains the source of truth when storage is unavailable. */ }
  };

  const loadAttempt = async (id: string) => {
    const [questionResponse, answerResponse] = await Promise.all([
      getInitialDiagnosticQuestions(id),
      getInitialDiagnosticAnswers(id),
    ]);
    const loadedQuestions: InitialDiagnosticQuestion[] = questionResponse.questions.map(question => ({
      id: question.id,
      position: question.position,
      discipline: question.discipline as InitialDiagnosticDiscipline,
      statement: question.statement,
      alternatives: question.alternatives.map(alternative => ({ id: alternative.id, letter: alternative.letter, text: alternative.text })),
    }));
    if (!validQuestionSet(loadedQuestions) || answerResponse.attemptId !== id || answerResponse.total !== 30) {
      throw new Error("O servidor não retornou uma tentativa completa e consistente.");
    }
    const saved = answerMap(answerResponse.answers);
    setAttemptId(id);
    setQuestions(loadedQuestions);
    setDraftAnswers(saved);
    setConfirmedAnswers(saved);
    setResult(null);
    setError(null);
    setPhase("attempt");
  };

  const resumeAttempt = async (id: string) => {
    setPhase("loading");
    setBusy(true);
    setError(null);
    try {
      try {
        const completed = await getInitialDiagnosticResult(id);
        setAttemptId(id);
        setResult(completed);
        setPhase("result");
        return;
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status !== 409) throw cause;
      }
      await loadAttempt(id);
    } catch (cause) {
      const mapped = mapApiError(cause);
      setError(mapped);
      if (cause instanceof ApiError && cause.status === 404) storeAttemptId(null);
      if (mapped.disabled) setPhase("intro");
      else if (cause instanceof ApiError && cause.status === 404) setPhase("intro");
      else setPhase("intro");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!initialDiagnosticUiEnabled) return;
    let storedId: string | null = null;
    try { storedId = sessionStorage.getItem(storageKey); } catch { /* Optional resume hint. */ }
    if (storedId) void resumeAttempt(storedId);
    // This effect intentionally runs once per authenticated student.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const startOrResume = async () => {
    if (busy || !initialDiagnosticUiEnabled) return;
    setBusy(true);
    setPhase("loading");
    setError(null);
    try {
      const started = await startOrRecoverInitialDiagnostic();
      storeAttemptId(started.attemptId);
      setAttemptId(started.attemptId);
      if (started.status === "COMPLETED") {
        const completed = await getInitialDiagnosticResult(started.attemptId);
        setResult(completed);
        setPhase("result");
      } else {
        await loadAttempt(started.attemptId);
      }
    } catch (cause) {
      const mapped = mapApiError(cause);
      setError(mapped);
      if (mapped.disabled) storeAttemptId(null);
      setPhase("intro");
    } finally {
      setBusy(false);
    }
  };

  const persistAnswer = async (questionId: string, selectedOptionId: string) => {
    if (!attemptId || busy || answerSaveInFlight.current) throw new Error("Aguarde o salvamento atual antes de responder outra questão.");
    answerSaveInFlight.current = true;
    setDraftAnswers(current => ({ ...current, [questionId]: selectedOptionId }));
    setSavingQuestionId(questionId);
    setError(null);
    try {
      const saved = await saveInitialDiagnosticAnswer(attemptId, questionId, selectedOptionId);
      if (saved.questionId !== questionId || saved.selectedOptionId !== selectedOptionId) {
        throw new Error("O servidor não confirmou a resposta selecionada.");
      }
      setConfirmedAnswers(current => ({ ...current, [questionId]: selectedOptionId }));
    } catch (cause) {
      const mapped = mapApiError(cause);
      setError(mapped);
      throw new Error(mapped.message);
    } finally {
      answerSaveInFlight.current = false;
      setSavingQuestionId("");
    }
  };

  const requestFinalize = (answers: Readonly<Record<string, string>>) => {
    const allConfirmed = questions.length === 30 && questions.every(question =>
      answers[question.id] && confirmedAnswers[question.id] === answers[question.id]);
    if (!allConfirmed || savingQuestionId || busy) {
      setError({ message: "Aguarde a confirmação do servidor para todas as 30 respostas antes de finalizar." });
      return;
    }
    setConfirmFinalize(true);
  };

  const confirmAndFinalize = async () => {
    if (!attemptId || finalizationInFlight.current || busy) return;
    const allConfirmed = questions.length === 30 && questions.every(question =>
      draftAnswers[question.id] && confirmedAnswers[question.id] === draftAnswers[question.id]);
    if (!allConfirmed) {
      setConfirmFinalize(false);
      setError({ message: "Há respostas que ainda não foram confirmadas pelo servidor." });
      return;
    }
    finalizationInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await finalizeInitialDiagnostic(attemptId);
      // The result screen is shown only after re-reading the persisted result.
      const persistedResult = await getInitialDiagnosticResult(attemptId);
      setResult(persistedResult);
      setConfirmFinalize(false);
      setPhase("result");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          const persistedResult = await getInitialDiagnosticResult(attemptId);
          setResult(persistedResult);
          setConfirmFinalize(false);
          setPhase("result");
          return;
        } catch { /* Keep the attempt open if the server has not completed it. */ }
      }
      const mapped = mapApiError(cause);
      setError(mapped);
      if (mapped.disabled) storeAttemptId(null);
      setConfirmFinalize(false);
      setPhase("attempt");
    } finally {
      finalizationInFlight.current = false;
      setBusy(false);
    }
  };

  const renderError = () => error && <div className="initial-diagnostic-error-box" role="alert">
    <p>{error.message}</p>
    {error.shortages && error.shortages.length > 0 && <ul>{error.shortages.map((shortage, index) => <li key={`${shortage.discipline}-${shortage.level}-${shortage.origin}-${index}`}>
      {shortage.discipline} · {shortage.level} · {shortage.origin}: disponíveis {shortage.available} de {shortage.required}
    </li>)}</ul>}
  </div>;

  if (phase === "attempt" && attemptId) return <>
    <InitialDiagnosticWorkspace
      key={attemptId}
      attempt={{ id: attemptId, questions }}
      initialAnswers={draftAnswers}
      confirmedAnswers={confirmedAnswers}
      savingQuestionId={savingQuestionId}
      loading={busy}
      error={error?.message}
      onAnswerChange={persistAnswer}
      onFinalize={requestFinalize}
    />
    {confirmFinalize && <div className="initial-diagnostic-dialog-backdrop">
      <section className="initial-diagnostic-confirm" role="dialog" aria-modal="true" aria-labelledby="initial-diagnostic-confirm-title">
        <h2 id="initial-diagnostic-confirm-title">Finalizar o diagnóstico?</h2>
        <p>Depois de finalizar, não será possível alterar as respostas. O resultado será calculado com as respostas já salvas.</p>
        {renderError()}
        <div className="initial-diagnostic-actions">
          <button className="initial-diagnostic-secondary" type="button" disabled={busy} onClick={() => setConfirmFinalize(false)}>Voltar à revisão</button>
          <button className="initial-diagnostic-primary" type="button" disabled={busy} onClick={() => void confirmAndFinalize()}>{busy ? "Finalizando…" : "Confirmar finalização"}</button>
        </div>
      </section>
    </div>}
  </>;

  if (phase === "result" && result) return <InitialDiagnosticResultPage result={result} onBack={onBack} mandatory={mandatory} />;

  return (
    <section className="v0-page initial-diagnostic initial-diagnostic-intro" aria-labelledby="initial-diagnostic-title">
      {mandatory && <img className="initial-diagnostic-full-logo" src="/brand/jurissim-logo.png" alt="JurisSim — Educação Jurídica" />}
      <p className="initial-diagnostic-eyebrow">JURISSIM · DIAGNÓSTICO</p>
      <h1 id="initial-diagnostic-title">Seu ponto de partida para a OAB</h1>
      <p className="initial-diagnostic-lead">Esta avaliação obrigatória estabelece seu ponto de partida. São {INITIAL_DIAGNOSTIC_QUESTION_COUNT} questões, distribuídas por {INITIAL_DIAGNOSTIC_DISCIPLINES.length} disciplinas; o resultado identifica seus focos de estudo e orienta uma trilha personalizada.</p>
      <div className="initial-diagnostic-summary" aria-label="Composição do diagnóstico">
        <article><strong>{INITIAL_DIAGNOSTIC_QUESTION_COUNT}</strong><span>questões</span></article>
        <article><strong>{INITIAL_DIAGNOSTIC_QUESTIONS_PER_DISCIPLINE}</strong><span>por disciplina</span></article>
        <article><strong>{INITIAL_DIAGNOSTIC_DISCIPLINES.length}</strong><span>disciplinas</span></article>
      </div>
      <article className="initial-diagnostic-panel">
        <div>
          <p className="initial-diagnostic-eyebrow">CONTEÚDO DA AVALIAÇÃO</p>
          <h2>Uma visão equilibrada do seu conhecimento</h2>
          <p className="initial-diagnostic-muted">A seleção combina níveis de dificuldade e origens conforme os critérios do JurisSim. O conteúdo só será apresentado quando houver questões completas, revisadas e autorizadas.</p>
          <ul className="initial-diagnostic-disciplines">{INITIAL_DIAGNOSTIC_DISCIPLINES.map(discipline => <li key={discipline}>{discipline}</li>)}</ul>
        </div>
        <div className="initial-diagnostic-notice" role="status">
          <span aria-hidden="true">◇</span>
          <div>
            <strong>{phase === "loading" ? "Carregando sua tentativa" : unavailable ? "Diagnóstico temporariamente indisponível" : "Diagnóstico disponível"}</strong>
            <p>{phase === "loading" ? "Estamos verificando a tentativa e as respostas salvas." : unavailable ? "Estamos validando o serviço e o acervo de questões antes de liberar a avaliação. Nenhuma tentativa será iniciada enquanto ela estiver indisponível." : "O resultado será usado para identificar seus focos por disciplina e montar sua trilha adaptativa. Suas respostas serão confirmadas pelo servidor."}</p>
          </div>
        </div>
        {renderError()}
        <div className="initial-diagnostic-actions">
          <button className="initial-diagnostic-primary" type="button" disabled={!initialDiagnosticUiEnabled || error?.disabled || busy} onClick={() => void startOrResume()}>
            {busy ? "Carregando…" : unavailable ? "Diagnóstico indisponível" : "Iniciar ou retomar diagnóstico"}
          </button>
          {unavailable && <span>O acesso às demais ferramentas será liberado após a conclusão desta avaliação.</span>}
          {!mandatory && <button className="initial-diagnostic-secondary" type="button" onClick={onBack}>Voltar aos estudos</button>}
        </div>
        {mandatory && localDemoAvailable && onEnterDemo && <div className="initial-diagnostic-demo-optin">
          <p>O diagnóstico continua pendente e será obrigatório quando o acervo validado estiver disponível.</p>
          <button type="button" className="initial-diagnostic-secondary" onClick={onEnterDemo}>Acessar demonstração local</button>
        </div>}
      </article>
    </section>
  );
}

function InitialDiagnosticResultPage({ result, onBack, mandatory }: { result: InitialDiagnosticResult; onBack: () => void; mandatory: boolean }) {
  const disciplineResults = result.performances.filter(metric => metric.tipo === "DISCIPLINA");
  return <section className="v0-page initial-diagnostic initial-diagnostic-result" aria-labelledby="initial-diagnostic-result-title">
    <p className="initial-diagnostic-eyebrow">DIAGNÓSTICO CONCLUÍDO</p>
    <h1 id="initial-diagnostic-result-title">Seu resultado</h1>
    <p className="initial-diagnostic-lead">Este resultado foi carregado do servidor após a finalização.</p>
    <article className="initial-diagnostic-result-summary">
      <div><strong>{result.overallPercentage}%</strong><span>aproveitamento geral</span></div>
      <div><strong>{result.correctAnswers}/{result.totalQuestions}</strong><span>respostas corretas</span></div>
      <div><strong>{result.level}</strong><span>nível recomendado</span></div>
    </article>
    <article className="initial-diagnostic-panel">
      <p className="initial-diagnostic-eyebrow">DESEMPENHO POR DISCIPLINA</p>
      <div className="initial-diagnostic-discipline-results">
        {disciplineResults.map(metric => <div key={metric.disciplina}>
          <span>{metric.disciplina}</span><strong>{metric.acertos}/{metric.totalQuestoes} · {metric.percentual}%</strong>
          <i><span style={{ width: `${Math.max(0, Math.min(100, metric.percentual))}%` }} /></i>
        </div>)}
      </div>
      <h2>Próximo foco de estudo</h2>
      <p className="initial-diagnostic-muted">{result.recommendation}</p>
      <button className="initial-diagnostic-secondary" type="button" onClick={onBack}>{mandatory ? "Acessar minha trilha de estudos" : "Voltar ao painel"}</button>
    </article>
  </section>;
}

type InitialDiagnosticWorkspaceProps = {
  attempt: InitialDiagnosticAttemptView;
  initialAnswers?: Readonly<Record<string, string>>;
  confirmedAnswers?: Readonly<Record<string, string>>;
  savingQuestionId?: string;
  loading?: boolean;
  error?: string;
  onAnswerChange?: (questionId: string, alternativeId: string) => void | Promise<void>;
  onFinalize?: (answers: Readonly<Record<string, string>>) => void;
};

function validateAttempt(attempt: InitialDiagnosticAttemptView): string | null {
  if (attempt.questions.length !== 30) return "Esta tentativa não contém exatamente 30 questões.";
  const disciplineCounts = new Map<InitialDiagnosticDiscipline, number>();
  for (const question of attempt.questions) {
    disciplineCounts.set(question.discipline, (disciplineCounts.get(question.discipline) ?? 0) + 1);
    const letters = question.alternatives.map(alternative => alternative.letter);
    if (question.alternatives.length !== 4 || new Set(letters).size !== 4 || !["A", "B", "C", "D"].every(letter => letters.includes(letter as AlternativeLetter))) {
      return `A questão ${question.position} não possui as quatro alternativas esperadas.`;
    }
  }
  if (INITIAL_DIAGNOSTIC_DISCIPLINES.some(discipline => disciplineCounts.get(discipline) !== 6)) {
    return "A distribuição da tentativa não corresponde a seis questões por disciplina.";
  }
  return null;
}

export function InitialDiagnosticWorkspace({ attempt, initialAnswers = {}, confirmedAnswers = initialAnswers, savingQuestionId = "", loading = false, error, onAnswerChange, onFinalize }: InitialDiagnosticWorkspaceProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({ ...initialAnswers }));
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [answerError, setAnswerError] = useState("");
  const attemptError = useMemo(() => validateAttempt(attempt), [attempt]);

  useEffect(() => {
    setAnswers({ ...initialAnswers });
    setIndex(0);
    setReviewing(false);
  }, [attempt.id]);

  if (attemptError) {
    return <section className="v0-page initial-diagnostic" role="alert"><h1>Não foi possível abrir a tentativa</h1><p>{attemptError}</p></section>;
  }

  const question = attempt.questions[index];
  const answeredCount = attempt.questions.reduce((count, item) => count + Number(Boolean(answers[item.id] && confirmedAnswers[item.id] === answers[item.id])), 0);
  const unansweredPositions = attempt.questions.filter(item => !answers[item.id]).map(item => item.position);
  const unconfirmedPositions = attempt.questions.filter(item => answers[item.id] && confirmedAnswers[item.id] !== answers[item.id]).map(item => item.position);
  const selectAnswer = async (questionId: string, optionId: string) => {
    setAnswers(current => ({ ...current, [questionId]: optionId }));
    setAnswerError("");
    try {
      await onAnswerChange?.(questionId, optionId);
    } catch {
      setAnswerError("Não foi possível salvar esta resposta. Tente selecionar a alternativa novamente.");
    }
  };

  return (
    <section className="v0-page initial-diagnostic initial-diagnostic-workspace" aria-labelledby="initial-diagnostic-question-title">
      <div className="initial-diagnostic-workspace-head">
        <div>
          <p className="initial-diagnostic-eyebrow">DIAGNÓSTICO INICIAL</p>
          <h1>{reviewing ? "Revise suas respostas" : "Responda no seu ritmo"}</h1>
        </div>
        <span className="initial-diagnostic-count">{answeredCount}<small> / 30 confirmadas</small></span>
      </div>

      <div className="initial-diagnostic-progress" role="progressbar" aria-label="Progresso das respostas" aria-valuemin={0} aria-valuemax={30} aria-valuenow={answeredCount}>
        <span style={{ width: `${(answeredCount / 30) * 100}%` }} />
      </div>

      {savingQuestionId && <p className="initial-diagnostic-status" role="status">Salvando sua resposta no servidor…</p>}
      {error && <p className="initial-diagnostic-error" role="alert">{error}</p>}
      {answerError && <p className="initial-diagnostic-error" role="alert">{answerError}</p>}

      {reviewing ? (
        <>
          <p className="initial-diagnostic-muted">Confira o que marcou. Você pode voltar a qualquer questão antes de concluir.</p>
          {unansweredPositions.length > 0 && <p className="initial-diagnostic-review-warning" role="status">Ainda sem resposta: questões {unansweredPositions.join(", ")}.</p>}
          <ol className="initial-diagnostic-review-list">
            {attempt.questions.map((item, itemIndex) => {
              const selected = item.alternatives.find(alternative => alternative.id === answers[item.id]);
              const confirmed = Boolean(selected && confirmedAnswers[item.id] === selected.id);
              return <li key={item.id}>
                <span><strong>Questão {item.position}</strong><small>{item.discipline}</small></span>
                <span>{selected ? `Alternativa ${selected.letter} · ${confirmed ? "salva" : "aguardando confirmação"}` : "Sem resposta"}</span>
                <button type="button" className="initial-diagnostic-link" onClick={() => { setIndex(itemIndex); setReviewing(false); }}>Revisar</button>
              </li>;
            })}
          </ol>
          <div className="initial-diagnostic-footer">
            <button type="button" className="initial-diagnostic-secondary" onClick={() => setReviewing(false)}>Voltar à questão</button>
            <button type="button" className="initial-diagnostic-primary" disabled={loading || savingQuestionId !== "" || unansweredPositions.length > 0 || unconfirmedPositions.length > 0 || !onFinalize} onClick={() => onFinalize?.(answers)}>Finalizar diagnóstico</button>
          </div>
        </>
      ) : (
        <>
          <div className="initial-diagnostic-question-head">
            <p className="initial-diagnostic-eyebrow">QUESTÃO {question.position} DE 30</p>
            <span>{question.discipline}</span>
          </div>
          <nav className="initial-diagnostic-question-nav" aria-label="Navegar pelas questões">
            {attempt.questions.map((item, itemIndex) => <button
              type="button"
              key={item.id}
              disabled={loading || savingQuestionId !== ""}
              aria-current={itemIndex === index ? "step" : undefined}
              aria-label={`Questão ${item.position}${answers[item.id] ? ", respondida" : ", sem resposta"}`}
              className={`${itemIndex === index ? "is-current" : ""} ${answers[item.id] && confirmedAnswers[item.id] === answers[item.id] ? "is-answered" : ""} ${answers[item.id] && confirmedAnswers[item.id] !== answers[item.id] ? "is-pending" : ""}`}
              onClick={() => setIndex(itemIndex)}
            >{item.position}</button>)}
          </nav>
          <article className="initial-diagnostic-question-card">
            <h2 id="initial-diagnostic-question-title">{question.statement}</h2>
            <fieldset className="initial-diagnostic-answers" disabled={loading || savingQuestionId !== ""}>
              <legend>Selecione uma alternativa</legend>
              {question.alternatives.slice().sort((a, b) => a.letter.localeCompare(b.letter)).map(alternative => <label className={answers[question.id] === alternative.id ? "is-selected" : ""} key={alternative.id}>
                <input type="radio" name={`question-${question.id}`} value={alternative.id} checked={answers[question.id] === alternative.id} onChange={() => selectAnswer(question.id, alternative.id)} />
                <strong>{alternative.letter}</strong><span>{alternative.text}</span>
              </label>)}
            </fieldset>
            {answers[question.id] && confirmedAnswers[question.id] !== answers[question.id] && <button type="button" className="initial-diagnostic-secondary" disabled={savingQuestionId !== ""} onClick={() => selectAnswer(question.id, answers[question.id])}>Tentar salvar resposta novamente</button>}
          </article>
          <div className="initial-diagnostic-footer">
            <button type="button" className="initial-diagnostic-secondary" disabled={index === 0 || loading || savingQuestionId !== ""} onClick={() => setIndex(current => Math.max(0, current - 1))}>Questão anterior</button>
            {index < 29
              ? <button type="button" className="initial-diagnostic-primary" disabled={loading || savingQuestionId !== ""} onClick={() => setIndex(current => Math.min(29, current + 1))}>Próxima questão</button>
              : <button type="button" className="initial-diagnostic-primary" disabled={loading || savingQuestionId !== ""} onClick={() => setReviewing(true)}>Revisar respostas</button>}
            <button type="button" className="initial-diagnostic-link" disabled={loading || savingQuestionId !== ""} onClick={() => setReviewing(true)}>Ver revisão</button>
          </div>
        </>
      )}
    </section>
  );
}
