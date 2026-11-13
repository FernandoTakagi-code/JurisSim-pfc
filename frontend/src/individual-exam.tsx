import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api";
import { navigate } from "./navigation";
import "./individual-exam.css";

const enabled = import.meta.env.VITE_INDIVIDUAL_EXAM_UI_ENABLED === "true";
type Option = { id: string; letter: string; text: string };
type Question = {
  id: string;
  position: number;
  statement: string;
  discipline: string;
  topic: string;
  selectedOptionId: string | null;
  alternatives: Option[];
};
type Attempt = {
  id: string;
  provisional: boolean;
  state: "IN_PROGRESS" | "COMPLETED";
  quantity: number;
  questions: Question[];
};
type Availability = {
  quantity: number;
  provisional: boolean;
  canStart: boolean;
  activeAttemptId: string | null;
  disciplines: {
    discipline: string;
    available: number;
    required: number;
    missing: number;
  }[];
};
type Result = {
  provisional: boolean;
  total: number;
  correct: number;
  percentage: number;
  disciplines: { discipline: string; total: number; correct: number }[];
  answers: {
    id: string;
    statement: string;
    discipline: string;
    selectedOptionId: string | null;
    correctOptionId: string;
    correct: boolean;
    explanation: string;
    alternatives: Option[];
  }[];
};
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível concluir a solicitação.";
export function ProvisionalNotice() {
  return (
    <details className="individual-notice">
      <summary>
        <span className="individual-status-dot" />
        Piloto provisório · revisão humana pendente
      </summary>
      <p>
        Questões autorais assistidas por IA. Gabaritos e resultados estão
        sujeitos a correção. Esta atividade não é uma avaliação oficial.
      </p>
    </details>
  );
}

export function ExamResult({
  result,
  kind = "exam",
}: {
  result: Result;
  kind?: "exam" | "practice" | "review";
}) {
  const [incorrectOnly, setIncorrectOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(result.answers[0]?.id);
  const answers = result.answers.filter(
    (answer) => !incorrectOnly || !answer.correct,
  );
  const selected = answers.find((a) => a.id === selectedId) ?? answers[0];
  const position = selected
    ? result.answers.findIndex((a) => a.id === selected.id) + 1
    : 0;
  const reviewIndex = selected
    ? answers.findIndex((a) => a.id === selected.id)
    : -1;
  return (
    <section className="individual-exam individual-results">
      <div className="individual-topline">
        <span className="individual-eyebrow">
          {kind === "review"
            ? "REVISÃO DE QUESTÕES"
            : kind === "practice"
              ? "TREINO POR QUESTÕES"
              : "SIMULADO INDIVIDUAL"}
        </span>
        <button
          className="individual-link"
          onClick={() =>
            navigate(
              kind === "review"
                ? "/questoes/revisao"
                : kind === "practice"
                  ? "/questoes"
                  : "/simulados",
            )
          }
        >
          {kind === "review"
            ? "← Voltar às revisões"
            : kind === "practice"
              ? "← Voltar às questões"
              : "← Voltar aos simulados"}
        </button>
      </div>
      <h1>Seu resultado</h1>
      {kind === "review" && (
        <p className="individual-notice">
          Resultado desta revisão. Suas respostas anteriores, diagnóstico e
          nível foram preservados.
        </p>
      )}
      <p className="individual-subtitle">
        Confira seu desempenho e entenda cada resposta.
      </p>
      <div className="individual-result-summary">
        <div>
          <span className="individual-eyebrow">APROVEITAMENTO</span>
          <strong className="individual-percentage">
            {result.percentage.toLocaleString("pt-BR")}
            <small>%</small>
          </strong>
          <p>
            {result.correct} {result.correct === 1 ? "acerto" : "acertos"} em{" "}
            {result.total} questões
          </p>
        </div>
        <div className="individual-discipline-results">
          {result.disciplines.map((d) => (
            <div key={d.discipline}>
              <span>{d.discipline.replace("Direito ", "")}</span>
              <b>
                {d.correct}
                <small> / {d.total}</small>
              </b>
              <div className="individual-meter">
                <i
                  style={{
                    width: `${d.total ? (d.correct / d.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      {result.provisional && <ProvisionalNotice />}
      <div className="individual-review-heading">
        <h2>Revisão das questões</h2>
        <div className="individual-filter" aria-label="Filtrar correção">
          <button
            aria-pressed={!incorrectOnly}
            onClick={() => setIncorrectOnly(false)}
          >
            Todas · {result.total}
          </button>
          <button
            aria-pressed={incorrectOnly}
            onClick={() => setIncorrectOnly(true)}
          >
            Incorretas · {result.total - result.correct}
          </button>
        </div>
      </div>
      <nav className="individual-review-map" aria-label="Questões para revisar">
        {answers.map((a) => (
          <button
            key={a.id}
            className={`${a.correct ? "is-correct" : "is-incorrect"} ${a.id === selected?.id ? "is-current" : ""}`}
            aria-label={`Revisar questão ${result.answers.indexOf(a) + 1}, ${a.correct ? "correta" : "incorreta"}`}
            aria-current={a.id === selected?.id ? "step" : undefined}
            onClick={() => setSelectedId(a.id)}
          >
            {result.answers.indexOf(a) + 1}
          </button>
        ))}
      </nav>
      {selected ? (
        <article className="individual-question individual-review-question">
          <div className="individual-question-meta">
            <span>
              QUESTÃO {String(position).padStart(2, "0")} ·{" "}
              {selected.discipline}
            </span>
            <span
              className={
                selected.correct
                  ? "individual-correct-text"
                  : "individual-incorrect-text"
              }
            >
              {selected.correct ? "✓ Você acertou" : "× Você errou"}
            </span>
          </div>
          <h2>{selected.statement}</h2>
          <div className="individual-options">
            {selected.alternatives.map((a) => (
              <div
                key={a.id}
                className={`individual-review-option ${a.id === selected.correctOptionId ? "is-correct" : a.id === selected.selectedOptionId ? "is-incorrect" : ""}`}
              >
                <b>{a.letter}</b>
                <span>{a.text}</span>
                {(a.id === selected.correctOptionId ||
                  a.id === selected.selectedOptionId) && (
                  <small>
                    {a.id === selected.correctOptionId
                      ? "Resposta correta"
                      : "Sua resposta"}
                  </small>
                )}
              </div>
            ))}
          </div>
          <div className="individual-explanation">
            <h3>Entenda a resposta</h3>
            <p>{selected.explanation}</p>
          </div>
          <div className="individual-question-actions">
            <button
              className="individual-secondary"
              disabled={reviewIndex <= 0}
              onClick={() => setSelectedId(answers[reviewIndex - 1].id)}
            >
              ← Anterior
            </button>
            <span>
              {reviewIndex + 1} de {answers.length}
            </span>
            <button
              className="individual-primary"
              disabled={reviewIndex + 1 >= answers.length}
              onClick={() => setSelectedId(answers[reviewIndex + 1].id)}
            >
              Próxima →
            </button>
          </div>
        </article>
      ) : (
        <div className="individual-empty">
          <h3>Todas corretas!</h3>
          <p>Nenhuma questão incorreta para revisar neste simulado.</p>
        </div>
      )}
      <p className="individual-footnote">
        Este resultado não é uma nota oficial da OAB e não altera seu
        diagnóstico inicial.
      </p>
    </section>
  );
}

export function IndividualExamLobby() {
  const [data, setData] = useState<Availability>();
  const [busy, setBusy] = useState(enabled);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setBusy(true);
    setError("");
    setData(undefined);
    void apiRequest<Availability>("/individual-exams/availability")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  const start = async () => {
    if (!data || busy) return;
    if (data.activeAttemptId) {
      navigate(`/simulados/individual/${data.activeAttemptId}`);
      return;
    }
    if (!data.canStart) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest<{ attempt: Attempt }>(
        "/individual-exams",
        { method: "POST", body: "{}" },
      );
      navigate(`/simulados/individual/${response.attempt.id}`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="individual-exam individual-lobby"
      aria-labelledby="individual-exams-title"
    >
      <p className="individual-eyebrow">PRATIQUE EM MODO DE PROVA</p>
      <h2 id="individual-exams-title">
        {enabled
          ? "Um simulado para testar seus conhecimentos"
          : "Simulados individuais em preparação"}
      </h2>
      <p className="individual-subtitle">
        Questões de cinco disciplinas, com correção comentada ao final.
      </p>
      <div className="individual-facts">
        <span>
          <b>30</b> questões
        </span>
        <span>
          <b>5</b> disciplinas
        </span>
        <span>Sem limite de tempo</span>
        <span>Salvamento automático</span>
      </div>
      {!enabled && (
        <p className="muted" role="status">
          Estamos preparando o fluxo e o acervo liberado, separado das questões
          já respondidas no diagnóstico. O simulado individual ainda não está
          disponível.
        </p>
      )}
      {enabled && busy && <p role="status">Consultando disponibilidade…</p>}
      {data && (
        <>
          {data.provisional && <ProvisionalNotice />}
          <div className="individual-inventory">
            {data.disciplines.map((d) => (
              <div key={d.discipline}>
                <span>{d.discipline.replace("Direito ", "")}</span>
                <strong>
                  {d.available}
                  <small> disponíveis</small>
                </strong>
                <small>
                  {d.missing > 0
                    ? `Faltam ${d.missing} para iniciar`
                    : `${d.required} por simulado`}
                </small>
              </div>
            ))}
          </div>
          {data.activeAttemptId ? (
            <p className="muted">
              Você tem um simulado em andamento. Continue para concluí-lo.
            </p>
          ) : (
            !data.canStart && (
              <p className="muted" role="status">
                Ainda não há seis questões inéditas liberadas em cada
                disciplina. Aguarde a ampliação do acervo.
              </p>
            )
          )}
          <button
            className="individual-primary"
            disabled={busy || (!data.canStart && !data.activeAttemptId)}
            onClick={() => void start()}
          >
            {data.activeAttemptId
              ? "Continuar simulado"
              : "Iniciar simulado de 30 questões"}{" "}
            <span aria-hidden="true">→</span>
          </button>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {enabled && (
        <button
          className="individual-link"
          disabled={busy}
          onClick={() => setRefresh((v) => v + 1)}
        >
          Atualizar disponibilidade
        </button>
      )}
      <p className="individual-footnote">
        Você pode sair e continuar depois. Este recorte não é uma prova completa
        ou oficial da OAB.
      </p>
    </section>
  );
}

export function IndividualExamPage({ id }: { id: string }) {
  const [attempt, setAttempt] = useState<Attempt>();
  const [result, setResult] = useState<Result>();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(enabled);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const questionTitle = useRef<HTMLHeadingElement>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirmOpen) confirmDialog.current?.showModal();
    else confirmDialog.current?.close();
  }, [confirmOpen]);
  useEffect(() => {
    if (attempt?.state === "IN_PROGRESS") {
      questionTitle.current?.focus({ preventScroll: true });
      questionTitle.current?.scrollIntoView({
        block: "nearest",
        behavior: "auto",
      });
    }
  }, [index, attempt?.id, attempt?.state]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setBusy(true);
    setError("");
    setAttempt(undefined);
    setResult(undefined);
    void apiRequest<{ attempt: Attempt }>(`/individual-exams/${id}`)
      .then(async ({ attempt: value }) => {
        if (!active) return;
        setAttempt(value);
        setIndex(
          Math.max(
            0,
            value.questions.findIndex((q) => !q.selectedOptionId),
          ),
        );
        if (value.state === "COMPLETED") {
          const response = await apiRequest<{ result: Result }>(
            `/individual-exams/${id}/result`,
          );
          if (active) setResult(response.result);
        }
      })
      .catch((cause) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [id, refresh]);
  const save = async (question: Question, alternativeId: string) => {
    if (busy || !attempt || attempt.state !== "IN_PROGRESS") return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/individual-exams/${id}/answers/${question.id}`, {
        method: "PUT",
        body: JSON.stringify({ alternativeId }),
      });
      setAttempt((current) =>
        current
          ? {
              ...current,
              questions: current.questions.map((q) =>
                q.id === question.id
                  ? { ...q, selectedOptionId: alternativeId }
                  : q,
              ),
            }
          : current,
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  const finalize = async () => {
    if (busy || !attempt || attempt.questions.some((q) => !q.selectedOptionId))
      return;
    setConfirmOpen(false);
    setSubmitting(true);
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest<{ result: Result }>(
        `/individual-exams/${id}/finalize`,
        { method: "POST", body: "{}" },
      );
      setResult(response.result);
      setAttempt({ ...attempt, state: "COMPLETED" });
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
      setSubmitting(false);
    }
  };
  const back = (
    <button
      className="outline-button"
      disabled={busy}
      onClick={() => navigate("/simulados")}
    >
      Voltar aos simulados
    </button>
  );
  if (!enabled)
    return (
      <section className="page">
        <h1>Simulado individual em preparação</h1>
        <p>A funcionalidade ainda não está disponível.</p>
        {back}
      </section>
    );
  if (busy && !attempt)
    return (
      <section className="page">
        <p role="status">Carregando simulado…</p>
      </section>
    );
  if (result) return <ExamResult result={result} />;
  const current = attempt?.questions[index];
  if (!attempt || !current || attempt.state === "COMPLETED")
    return (
      <section className="page">
        <h1>Simulado individual</h1>
        <p className="error" role="alert">
          {error || "Não foi possível carregar a correção."}
        </p>
        <button
          className="outline-button"
          disabled={busy}
          onClick={() => setRefresh((v) => v + 1)}
        >
          Tentar novamente
        </button>
        {back}
      </section>
    );
  const answered = attempt.questions.filter((q) => q.selectedOptionId).length;
  const pending = attempt.quantity - answered;
  const goTo = (next: number) => {
    setIndex(next);
    setMapOpen(false);
  };
  return (
    <section className="individual-exam">
      <div className="individual-topline">
        <span className="individual-eyebrow">SIMULADO INDIVIDUAL</span>
        <button
          className="individual-link"
          disabled={busy}
          onClick={() => navigate("/simulados")}
        >
          ← Salvar e sair
        </button>
      </div>
      <div className="individual-title-row">
        <div>
          <h1>Seu simulado</h1>
          <p className="individual-subtitle">
            30 questões · Correção ao final · Sem limite de tempo
          </p>
        </div>
        <button
          className="individual-secondary individual-map-toggle"
          aria-expanded={mapOpen}
          aria-controls="individual-question-map"
          onClick={() => setMapOpen((v) => !v)}
        >
          Mapa das questões
        </button>
      </div>
      {attempt.provisional && <ProvisionalNotice />}
      <div className="individual-grid">
        <div className="individual-workspace">
          <article className="individual-question">
            <div className="individual-question-meta">
              <span className="individual-question-number">
                QUESTÃO {String(index + 1).padStart(2, "0")}{" "}
                <small>/ {attempt.quantity}</small>
              </span>
              <span className="individual-discipline">
                {current.discipline.replace("Direito ", "")}
              </span>
            </div>
            <p className="individual-topic">{current.topic}</p>
            <h2 ref={questionTitle} tabIndex={-1}>
              {current.statement}
            </h2>
            <fieldset className="individual-options">
              <legend>Selecione uma alternativa</legend>
              {current.alternatives.map((a) => (
                <label
                  key={a.id}
                  className={
                    current.selectedOptionId === a.id ? "is-selected" : ""
                  }
                >
                  <input
                    type="radio"
                    name="exam-answer"
                    disabled={busy}
                    checked={current.selectedOptionId === a.id}
                    onChange={() => void save(current, a.id)}
                  />
                  <b>{a.letter}</b>
                  <span>{a.text}</span>
                  <i aria-hidden="true">
                    {current.selectedOptionId === a.id ? "✓" : ""}
                  </i>
                </label>
              ))}
            </fieldset>
            <div
              className={`individual-save-status ${error ? "has-error" : ""}`}
              role="status"
              aria-live="polite"
            >
              {error
                ? "Sua última ação não foi confirmada. Confira a mensagem abaixo e tente novamente."
                : busy
                  ? submitting
                    ? "Entregando simulado…"
                    : "Salvando resposta…"
                  : current.selectedOptionId
                    ? "✓ Resposta salva automaticamente. Você pode alterá-la antes de entregar."
                    : "Ao selecionar uma alternativa, a resposta será salva automaticamente."}
            </div>
          </article>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="individual-question-actions">
            <button
              className="individual-secondary"
              disabled={busy || index === 0}
              onClick={() => goTo(index - 1)}
            >
              ← Anterior
            </button>
            <span>
              {index + 1} de {attempt.quantity}
            </span>
            {index + 1 < attempt.quantity ? (
              <button
                className="individual-primary"
                disabled={busy}
                onClick={() => goTo(index + 1)}
              >
                Próxima questão →
              </button>
            ) : (
              <button
                className="individual-primary"
                disabled={busy}
                onClick={() => setConfirmOpen(true)}
              >
                Revisar e entregar →
              </button>
            )}
          </div>
        </div>
        <section
          id="individual-question-map"
          className={`individual-map ${mapOpen ? "is-open" : ""}`}
          aria-label="Progresso e navegação"
        >
          <div className="individual-map-heading">
            <h2>Seu progresso</h2>
            <strong>
              {answered}
              <small>/{attempt.quantity}</small>
            </strong>
          </div>
          <div
            className="individual-meter"
            role="progressbar"
            aria-label="Questões respondidas"
            aria-valuemin={0}
            aria-valuemax={attempt.quantity}
            aria-valuenow={answered}
          >
            <i style={{ width: `${(answered / attempt.quantity) * 100}%` }} />
          </div>
          <p>
            {pending === 0
              ? "Tudo pronto para entregar."
              : `${pending} ${pending === 1 ? "questão pendente" : "questões pendentes"}`}
          </p>
          <nav
            className="individual-question-map"
            aria-label="Navegação das questões"
          >
            {attempt.questions.map((q, i) => (
              <button
                key={q.id}
                disabled={busy}
                className={`${q.selectedOptionId ? "is-answered" : ""} ${i === index ? "is-current" : ""}`}
                aria-current={i === index ? "step" : undefined}
                aria-label={`Questão ${i + 1}${q.selectedOptionId ? ", respondida" : ", pendente"}`}
                onClick={() => goTo(i)}
              >
                {i + 1}
              </button>
            ))}
          </nav>
          <div className="individual-map-legend">
            <span>
              <i className="is-answered" />
              Respondida
            </span>
            <span>
              <i />
              Pendente
            </span>
            <span>
              <i className="is-current" />
              Atual
            </span>
          </div>
          {pending > 0 && (
            <button
              className="individual-link"
              disabled={busy}
              onClick={() =>
                goTo(attempt.questions.findIndex((q) => !q.selectedOptionId))
              }
            >
              Ir à primeira pendente →
            </button>
          )}
          <button
            className="individual-submit"
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
          >
            Revisar e entregar
          </button>
          <small className="individual-map-note">
            A correção aparece somente após a entrega.
          </small>
        </section>
      </div>
      <dialog
        className="individual-confirm"
        ref={confirmDialog}
        onCancel={() => setConfirmOpen(false)}
        aria-labelledby="individual-confirm-title"
      >
        <span className="individual-eyebrow">ANTES DE ENTREGAR</span>
        <h2 id="individual-confirm-title">
          {pending
            ? "Ainda há questões pendentes"
            : "Tudo pronto para ver o resultado?"}
        </h2>
        <p>
          {answered} de {attempt.quantity} questões respondidas.{" "}
          {pending
            ? "Responda as questões restantes para concluir o simulado."
            : "Após entregar, suas respostas serão bloqueadas e você poderá consultar a correção comentada."}
        </p>
        <div>
          <button
            className="individual-secondary"
            onClick={() => setConfirmOpen(false)}
          >
            Continuar revisando
          </button>
          {pending ? (
            <button
              className="individual-primary"
              onClick={() => {
                setConfirmOpen(false);
                goTo(attempt.questions.findIndex((q) => !q.selectedOptionId));
              }}
            >
              Responder pendentes →
            </button>
          ) : (
            <button
              className="individual-primary"
              onClick={() => void finalize()}
            >
              Entregar simulado
            </button>
          )}
        </div>
      </dialog>
    </section>
  );
}
