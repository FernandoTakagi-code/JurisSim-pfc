import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api";
import { navigate } from "./navigation";
import { ExamResult, ProvisionalNotice } from "./individual-exam";
import "./question-practice.css";

type Option = { id: string; letter: string; text: string };
type Feedback = {
  correct: boolean;
  explanation: string;
  correctOptionId: string | null;
};
type Question = {
  id: string;
  position: number;
  statement: string;
  discipline: string;
  topic: string;
  level: string;
  selectedOptionId: string | null;
  alternatives: Option[];
  feedback?: Feedback;
};
type Attempt = {
  id: string;
  provisional: boolean;
  state: "IN_PROGRESS" | "COMPLETED";
  discipline: string;
  topic: string | null;
  questions: Question[];
};
type Availability = {
  history?: {
    id: string;
    filter: string;
    topic: string | null;
    createdAt: string;
    completed: boolean;
    quantity: number;
    answered: number;
  }[];
  provisional: boolean;
  availableCount: number;
  availableQuantities: number[];
  topics: { name: string; availableCount: number }[];
  activeAttempt: { id: string; quantity: number; topic: string | null } | null;
};
type Result = {
  provisional: boolean;
  total: number;
  correct: number;
  incorrect: number;
  percentage: number;
  answers: {
    questionId: string;
    statement: string;
    discipline: string;
    selectedOptionId: string | null;
    correctOptionId: string | null;
    correct: boolean;
    explanation: string;
    alternatives: Option[];
  }[];
};
const disciplines = [
  "Direito Constitucional",
  "Direito Civil",
  "Direito Penal",
  "Direito Administrativo",
  "Direito do Trabalho",
];
const practiceEnabled =
  import.meta.env.VITE_QUESTION_PRACTICE_UI_ENABLED === "true";
const shortName = (value: string) => value.replace(/^Direito (do )?/, "");
const message = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "Não foi possível concluir a solicitação.";

export function QuestionPracticePage({
  attemptId,
  initialDiscipline,
  initialTopic,
  review = false,
}: {
  attemptId?: string;
  initialDiscipline?: string;
  initialTopic?: string;
  review?: boolean;
}) {
  const enabled = review
    ? import.meta.env.VITE_QUESTION_REVIEW_UI_ENABLED === "true"
    : practiceEnabled;
  const api = review ? "/question-review" : "/question-practice";
  const catalogPath = review ? "/questoes/revisao" : "/questoes";
  const attemptPath = review ? "/questoes/revisao/" : "/questoes/pratica/";
  const [filter, setFilter] = useState<"all" | "incorrect">("incorrect");
  const [discipline, setDiscipline] = useState(
    disciplines.includes(initialDiscipline ?? "")
      ? initialDiscipline!
      : disciplines[0],
  );
  const [topic, setTopic] = useState(initialTopic ?? "");
  const [quantity, setQuantity] = useState(5);
  const [availability, setAvailability] = useState<Availability>();
  const quantities =
    review &&
    availability &&
    availability.availableCount > 0 &&
    availability.availableCount < 5
      ? [availability.availableCount, 10, 20]
      : [5, 10, 20];
  const [loadingCatalog, setLoadingCatalog] = useState(enabled && !attemptId);
  const [attempt, setAttempt] = useState<Attempt>();
  const [result, setResult] = useState<Result>();
  const [index, setIndex] = useState(0);
  const [selection, setSelection] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const questionTitle = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (
      !attemptId &&
      initialDiscipline &&
      disciplines.includes(initialDiscipline)
    ) {
      setDiscipline(initialDiscipline);
      setTopic(initialTopic ?? "");
    }
  }, [attemptId, initialDiscipline, initialTopic]);
  useEffect(() => {
    if (!enabled || attemptId) return;
    let active = true;
    setLoadingCatalog(true);
    setAvailability(undefined);
    setError("");
    const params = new URLSearchParams();
    if (topic) params.set("topic", topic);
    if (review) params.set("filter", filter);
    const query = params.size ? `?${params}` : "";
    void apiRequest<Availability>(
      `${api}/catalog/${encodeURIComponent(discipline)}/availability${query}`,
    )
      .then((data) => {
        if (active) {
          setAvailability(data);
          setQuantity((old) =>
            data.availableQuantities.includes(old)
              ? old
              : (data.availableQuantities[0] ?? 5),
          );
        }
      })
      .catch((cause) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setLoadingCatalog(false);
      });
    return () => {
      active = false;
    };
  }, [attemptId, discipline, topic, refresh, review, filter, api, enabled]);
  useEffect(() => {
    if (!enabled || !attemptId) return;
    let active = true;
    setBusy(true);
    setAttempt(undefined);
    setResult(undefined);
    setError("");
    void apiRequest<{ attempt: Attempt }>(`${api}/${attemptId}`)
      .then(async ({ attempt: value }) => {
        if (!active) return;
        setAttempt(value);
        setDiscipline(value.discipline);
        const first = value.questions.findIndex((q) => !q.selectedOptionId);
        const position = first < 0 ? value.questions.length - 1 : first;
        setIndex(Math.max(0, position));
        setSelection(value.questions[position]?.selectedOptionId ?? "");
        if (value.state === "COMPLETED") {
          const response = await apiRequest<{ result: Result }>(
            `${api}/${attemptId}/result`,
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
  }, [attemptId, refresh, api, enabled]);
  useEffect(() => {
    questionTitle.current?.focus({ preventScroll: true });
    questionTitle.current?.scrollIntoView({ block: "nearest" });
  }, [index, attempt?.id]);

  const current = attempt?.questions[index];
  const feedback = current?.feedback;
  const answered =
    attempt?.questions.filter((q) => q.selectedOptionId).length ?? 0;
  const start = async () => {
    if (!enabled || busy || loadingCatalog || !availability) return;
    if (availability.activeAttempt) {
      navigate(`${attemptPath}${availability.activeAttempt.id}`);
      return;
    }
    if (!availability.availableQuantities.includes(quantity)) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest<{ attempt: Attempt }>(api, {
        method: "POST",
        body: JSON.stringify({
          discipline,
          topic: topic || null,
          quantity,
          ...(review ? { filter } : {}),
        }),
      });
      navigate(`${attemptPath}${response.attempt.id}`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  const confirmAnswer = async () => {
    if (!attempt || !current || !selection || busy || feedback) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest<Feedback>(
        `${api}/${attempt.id}/answers/${current.id}`,
        { method: "PUT", body: JSON.stringify({ alternativeId: selection }) },
      );
      setAttempt((old) =>
        old
          ? {
              ...old,
              questions: old.questions.map((q) =>
                q.id === current.id
                  ? { ...q, selectedOptionId: selection, feedback: response }
                  : q,
              ),
            }
          : old,
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  const finalize = async () => {
    if (!attempt || busy || answered !== attempt.questions.length) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest<{ result: Result }>(
        `${api}/${attempt.id}/finalize`,
        { method: "POST" },
      );
      setResult(response.result);
      setAttempt({ ...attempt, state: "COMPLETED" });
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  const goTo = (position: number) => {
    if (!attempt) return;
    setIndex(position);
    setSelection(attempt.questions[position].selectedOptionId ?? "");
    setError("");
  };

  if (!attemptId)
    return (
      <section className="individual-exam practice-study">
        <p className="individual-eyebrow">
          {review ? "REVISÃO DE QUESTÕES" : "TREINO POR QUESTÕES"}
        </p>
        <h1>
          {review
            ? "Volte aos pontos que precisam de atenção"
            : "O que você quer estudar hoje?"}
        </h1>
        <p className="individual-subtitle">
          {review
            ? "Refaça questões de atividades concluídas. A revisão fica separada e não altera seu diagnóstico ou nível."
            : "Escolha seu foco e aprenda com a correção de cada resposta."}
        </p>
        <nav className="practice-mode-switch" aria-label="Modo de estudo">
          <button aria-pressed={!review} onClick={() => navigate("/questoes")}>
            Questões inéditas
          </button>
          <button
            aria-pressed={review}
            onClick={() => navigate("/questoes/revisao")}
          >
            Revisar respondidas
          </button>
        </nav>
        {review && (
          <fieldset className="practice-review-filter">
            <legend>O que revisar?</legend>
            <label>
              <input
                type="radio"
                name="review-filter"
                checked={filter === "incorrect"}
                onChange={() => {
                  setFilter("incorrect");
                  setTopic("");
                  setAvailability(undefined);
                }}
              />{" "}
              Somente erradas
            </label>
            <label>
              <input
                type="radio"
                name="review-filter"
                checked={filter === "all"}
                onChange={() => {
                  setFilter("all");
                  setTopic("");
                  setAvailability(undefined);
                }}
              />{" "}
              Todas as respondidas
            </label>
            <p>
              Consideramos sua última resposta de cada questão em atividades
              concluídas. Questões de simulados ainda em andamento ficam de
              fora.
            </p>
          </fieldset>
        )}
        {availability?.provisional && <ProvisionalNotice />}
        {!enabled && (
          <p className="individual-notice">
            {review
              ? "A revisão de questões está em preparação."
              : "O treino individual está em preparação."}
          </p>
        )}
        <div className="practice-setup-grid">
          <div className="practice-setup-card">
            <h2>1. Escolha uma disciplina</h2>
            <div
              className="practice-disciplines"
              aria-label={
                review ? "Disciplina da revisão" : "Disciplina do treino"
              }
            >
              {disciplines.map((d) => (
                <button
                  key={d}
                  disabled={!enabled || busy}
                  aria-pressed={discipline === d}
                  onClick={() => {
                    setDiscipline(d);
                    setTopic("");
                    setAvailability(undefined);
                  }}
                >
                  {shortName(d)}
                  <span aria-hidden="true">{discipline === d ? "✓" : "→"}</span>
                </button>
              ))}
            </div>
            <label className="practice-field" htmlFor="practice-topic">
              Assunto
              <select
                id="practice-topic"
                disabled={!enabled || busy || loadingCatalog || !availability}
                value={topic}
                onChange={(event) => {
                  setTopic(event.target.value);
                  setAvailability(undefined);
                }}
              >
                <option value="">Todos os assuntos</option>
                {availability?.topics.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} · {t.availableCount}{" "}
                    {review ? "para revisar" : "inéditas"}
                  </option>
                ))}
              </select>
            </label>
            <h2>2. Defina o tamanho {review ? "da revisão" : "do treino"}</h2>
            <fieldset
              className="practice-sizes"
              disabled={
                !enabled ||
                busy ||
                loadingCatalog ||
                !availability ||
                Boolean(availability.activeAttempt)
              }
            >
              <legend className="practice-sr-only">
                Quantidade de questões
              </legend>
              {quantities.map((n) => (
                <label
                  key={n}
                  className={`${quantity === n && availability?.availableQuantities.includes(n) ? "is-selected" : ""} ${!availability?.availableQuantities.includes(n) ? "is-unavailable" : ""}`}
                >
                  <input
                    type="radio"
                    name="practice-size"
                    value={n}
                    checked={
                      quantity === n &&
                      Boolean(availability?.availableQuantities.includes(n))
                    }
                    disabled={!availability?.availableQuantities.includes(n)}
                    onChange={() => setQuantity(n)}
                  />
                  <strong>{n}</strong>
                  <span>{n === 1 ? "questão" : "questões"}</span>
                  <small>
                    {loadingCatalog
                      ? "Consultando…"
                      : availability &&
                          !availability.availableQuantities.includes(n)
                        ? review
                          ? "Histórico insuficiente"
                          : "Acervo insuficiente"
                        : "Correção por questão"}
                  </small>
                </label>
              ))}
            </fieldset>
            <p className="practice-inventory-status" role="status">
              {loadingCatalog
                ? review
                  ? "Consultando seu histórico…"
                  : "Consultando seu estoque de questões inéditas…"
                : availability
                  ? review
                    ? `${availability.availableCount} ${availability.availableCount === 1 ? "questão" : "questões"} para revisar neste filtro. Cada questão aparece uma vez.`
                    : `${availability.availableCount} questões inéditas neste filtro. As já respondidas em treinos e simulados ficam fora desta seleção.`
                  : "Selecione uma disciplina para consultar a disponibilidade."}
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="individual-link"
              disabled={!enabled || busy || loadingCatalog}
              onClick={() => setRefresh((v) => v + 1)}
            >
              Atualizar disponibilidade
            </button>
          </div>
          <section
            className="practice-summary"
            aria-labelledby="practice-summary-title"
          >
            <p className="individual-eyebrow">
              {review ? "SUA REVISÃO" : "SEU TREINO"}
            </p>
            <h2 id="practice-summary-title">{shortName(discipline)}</h2>
            <p>
              {availability?.activeAttempt?.topic ??
                (topic || "Todos os assuntos")}
            </p>
            <div className="practice-summary-number">
              <strong>
                {availability?.activeAttempt?.quantity ?? quantity}
              </strong>
              <span>
                {(availability?.activeAttempt?.quantity ?? quantity) === 1
                  ? "questão"
                  : "questões"}
              </span>
            </div>
            <ul>
              <li>Correção comentada a cada resposta</li>
              <li>Respostas confirmadas ficam salvas</li>
              <li>Você pode sair e retomar depois</li>
            </ul>
            {availability?.activeAttempt && (
              <p className="practice-resume-note">
                {review
                  ? "Você tem uma revisão em andamento neste foco."
                  : "Você tem um treino em andamento neste foco."}
              </p>
            )}
            {availability &&
              !availability.activeAttempt &&
              availability.availableQuantities.length === 0 && (
                <p className="practice-resume-note" role="status">
                  {review
                    ? "Nenhuma questão disponível para este filtro. Escolha outra disciplina, veja todas as respondidas ou conclua uma atividade."
                    : "Não há questões inéditas suficientes para um treino de 5. Escolha outro assunto ou disciplina."}
                </p>
              )}
            <button
              className="individual-primary"
              disabled={
                !enabled ||
                busy ||
                loadingCatalog ||
                !availability ||
                (!availability.activeAttempt &&
                  !availability.availableQuantities.includes(quantity))
              }
              onClick={() => void start()}
            >
              {busy
                ? "Preparando…"
                : availability?.activeAttempt
                  ? review
                    ? "Continuar revisão →"
                    : "Continuar treino →"
                  : review
                    ? "Começar revisão →"
                    : "Começar treino →"}
            </button>
            <p className="individual-footnote">
              {review
                ? "Você responderá novamente antes de ver a correção. O conteúdo é copiado da atividade original e suas respostas anteriores ficam preservadas."
                : "Depois de ver a correção, a resposta fica bloqueada. Simulados têm correção somente na entrega."}
            </p>
          </section>
        </div>
        {review && Boolean(availability?.history?.length) && (
          <section className="practice-review-history">
            <h2>Suas revisões nesta disciplina</h2>
            {availability!.history!.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`${attemptPath}${item.id}`)}
              >
                <span>
                  <strong>
                    {item.filter === "incorrect"
                      ? "Somente erradas"
                      : "Todas as respondidas"}
                  </strong>{" "}
                  · {item.topic || "Todos os assuntos"}
                  <small>
                    {new Date(item.createdAt).toLocaleDateString("pt-BR")} ·{" "}
                    {item.answered}/{item.quantity} respostas
                  </small>
                </span>
                <b>{item.completed ? "Ver resultado →" : "Continuar →"}</b>
              </button>
            ))}
          </section>
        )}
      </section>
    );
  if (!enabled)
    return (
      <section className="individual-exam">
        <h1>Treino em preparação</h1>
        <button
          className="individual-secondary"
          onClick={() => navigate(catalogPath)}
        >
          Voltar às questões
        </button>
      </section>
    );
  if (busy && !attempt)
    return (
      <section className="individual-exam">
        <p role="status">
          {review ? "Carregando sua revisão…" : "Carregando seu treino…"}
        </p>
      </section>
    );
  if (result)
    return (
      <ExamResult
        kind={review ? "review" : "practice"}
        result={{
          ...result,
          disciplines: [
            {
              discipline: attempt?.discipline ?? discipline,
              total: result.total,
              correct: result.correct,
            },
          ],
          answers: result.answers.map((a) => ({
            ...a,
            id: a.questionId,
            correctOptionId: a.correctOptionId ?? "",
          })),
        }}
      />
    );
  if (!attempt || !current || attempt.state === "COMPLETED")
    return (
      <section className="individual-exam">
        <h1>Seu treino</h1>
        <p className="error" role="alert">
          {error || "Não foi possível recuperar o treino."}
        </p>
        <button
          className="individual-secondary"
          onClick={() => setRefresh((v) => v + 1)}
        >
          Tentar novamente
        </button>
        <button
          className="individual-link"
          onClick={() => navigate(catalogPath)}
        >
          Voltar às questões
        </button>
      </section>
    );
  return (
    <section className="individual-exam practice-study">
      <div className="individual-topline">
        <span className="individual-eyebrow">
          {review ? "REVISÃO DE QUESTÕES" : "TREINO POR QUESTÕES"}
        </span>
        <button
          className="individual-link"
          disabled={busy}
          onClick={() => navigate(catalogPath)}
        >
          ← Sair e continuar depois
        </button>
      </div>
      <h1>{shortName(attempt.discipline)}</h1>
      {review && (
        <p className="individual-notice">
          Revisão: uma nova resposta, sem alterar o resultado da atividade
          original ou seu nível.
        </p>
      )}
      <p className="individual-subtitle">
        {answered} de {attempt.questions.length} respostas confirmadas ·
        Correção a cada questão
      </p>
      {attempt.provisional && <ProvisionalNotice />}
      <nav
        className="practice-question-map"
        aria-label={review ? "Questões da revisão" : "Questões do treino"}
      >
        {attempt.questions.map((q, i) => (
          <button
            key={q.id}
            disabled={busy}
            className={`${q.selectedOptionId ? "is-answered" : ""} ${i === index ? "is-current" : ""}`}
            aria-current={i === index ? "step" : undefined}
            aria-label={`Questão ${i + 1}, ${q.selectedOptionId ? "confirmada" : "pendente"}`}
            onClick={() => goTo(i)}
          >
            {i + 1}
            {q.selectedOptionId ? " ✓" : ""}
          </button>
        ))}
      </nav>
      <article className="individual-question">
        <div className="individual-question-meta">
          <span className="individual-question-number">
            QUESTÃO {String(index + 1).padStart(2, "0")}{" "}
            <small>/ {attempt.questions.length}</small>
          </span>
          <span className="individual-discipline">
            {feedback ? "Resposta confirmada" : "Escolha e confirme"}
          </span>
        </div>
        <p className="individual-topic">{current.topic}</p>
        <h2 ref={questionTitle} tabIndex={-1}>
          {current.statement}
        </h2>
        <fieldset className="individual-options">
          <legend>
            {feedback
              ? "Confira a alternativa correta"
              : "Selecione uma alternativa"}
          </legend>
          {current.alternatives.map((a) => (
            <label
              key={a.id}
              className={
                feedback
                  ? a.id === feedback.correctOptionId
                    ? "is-correct"
                    : a.id === current.selectedOptionId
                      ? "is-incorrect"
                      : ""
                  : selection === a.id
                    ? "is-selected"
                    : ""
              }
            >
              <input
                type="radio"
                name="practice-answer"
                disabled={busy || Boolean(feedback)}
                checked={
                  (feedback ? current.selectedOptionId : selection) === a.id
                }
                onChange={() => setSelection(a.id)}
              />
              <b>{a.letter}</b>
              <span>
                {a.text}
                {feedback && a.id === feedback.correctOptionId && (
                  <small className="practice-option-caption">
                    Resposta correta
                  </small>
                )}
                {feedback && a.id === current.selectedOptionId && (
                  <small className="practice-option-caption">
                    Sua resposta
                  </small>
                )}
              </span>
              <i aria-hidden="true">
                {feedback && a.id === feedback.correctOptionId ? "✓" : ""}
              </i>
            </label>
          ))}
        </fieldset>
        {feedback ? (
          <div
            className={`practice-feedback ${feedback.correct ? "is-correct" : "is-incorrect"}`}
            role="status"
          >
            <strong>
              {feedback.correct ? "✓ Resposta correta" : "Resposta incorreta"}
            </strong>
            <h3>Entenda a resposta</h3>
            <p>{feedback.explanation}</p>
          </div>
        ) : (
          <p className="individual-save-status" role="status">
            {busy
              ? "Confirmando sua resposta…"
              : selection
                ? "Seleção ainda não enviada. Confirme para salvar e ver a correção."
                : "A correção aparece depois de confirmar. Você pode escolher outra alternativa antes de enviar."}
          </p>
        )}
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
          {index + 1} de {attempt.questions.length}
        </span>
        {!feedback ? (
          <button
            className="individual-primary"
            disabled={busy || !selection}
            onClick={() => void confirmAnswer()}
          >
            Confirmar resposta
          </button>
        ) : answered === attempt.questions.length ? (
          <button
            className="individual-primary"
            disabled={busy}
            onClick={() => void finalize()}
          >
            {busy
              ? "Concluindo…"
              : review
                ? "Ver resultado da revisão →"
                : "Ver resultado do treino →"}
          </button>
        ) : (
          <button
            className="individual-primary"
            disabled={busy}
            onClick={() => {
              const next = attempt.questions.findIndex(
                (q, i) => i > index && !q.selectedOptionId,
              );
              goTo(
                next < 0
                  ? attempt.questions.findIndex((q) => !q.selectedOptionId)
                  : next,
              );
            }}
          >
            Próxima pendente →
          </button>
        )}
      </div>
    </section>
  );
}
