import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "./api";
import { navigate } from "./navigation";
import "./student-progress.css";

export type StudyResult = {
  id: string;
  overallPercentage: number;
  level: string;
  recommendation: string;
  correctAnswers: number;
  totalQuestions: number;
  answeredQuestions?: number;
  incorrectAnswers?: number;
  unansweredQuestions?: number;
  performances: { tipo: string; disciplina: string; percentual: number }[];
  trail: {
    id: string;
    disciplinaPrioritaria: string;
    assuntoPrioritario: string | null;
    nivelRecomendado: string;
    quantidadeRecomendada: number;
    justificativa: string;
    simuladoGeradoId?: string | null;
  } | null;
};
type Activity = {
  id: string;
  type: "DIAGNOSTICO" | "PERSONALIZADO" | "AVALIACAO" | "PRATICA";
  startedAt: string;
  finalizedAt: string | null;
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number | null;
  incorrectAnswers: number | null;
  unansweredQuestions: number;
  overallPercentage: number | null;
};
type Overview = {
  totals: {
    completedActivities: number;
    completedDiagnostics: number;
    completedTrails: number;
    completedExams?: number;
    completedPractices?: number;
    totalQuestions: number;
    answeredQuestions: number;
    correctAnswers: number;
    incorrectAnswers: number;
    unansweredQuestions: number;
  };
  evolution: Activity[];
  recentActivities: Activity[];
  latestDiagnosticId: string | null;
};
const formatDate = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
const typeLabel = (type: Activity["type"]) =>
  type === "DIAGNOSTICO" ? "Diagnóstico" : type === "AVALIACAO" ? "Simulado de turma" : type === "PRATICA" ? "Prática individual" : "Trilha de exercícios";
const resultPath = (item: Activity) => item.type === "AVALIACAO" ? `/simulados/tentativas/${item.id}` : item.type === "PRATICA" ? `/questoes/pratica/${item.id}` : `/resultados/${item.type === "DIAGNOSTICO" ? "diagnostico" : "trilha"}/${item.id}`;
const errorMessage = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "Não foi possível carregar os dados.";

export function useStudentProgress() {
  const [data, setData] = useState<Overview>();
  const [latestResult, setLatestResult] = useState<StudyResult>();
  const latest = useRef<StudyResult | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resultError, setResultError] = useState("");
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    setLoading(true);
    setError("");
    setResultError("");
    let overview: Overview;
    try {
      overview = await apiRequest<Overview>("/students/me/overview");
    } catch (cause) {
      if (current === revision.current) setError(errorMessage(cause));
      if (current === revision.current) setLoading(false);
      return;
    }
    if (current !== revision.current) return;
    setData(overview);
    let result: StudyResult | undefined;
    try {
      result = overview.latestDiagnosticId
        ? latest.current?.id === overview.latestDiagnosticId
          ? latest.current
          : await apiRequest<StudyResult>(
              `/diagnostics/${overview.latestDiagnosticId}/result`,
            )
        : undefined;
      if (current !== revision.current) return;
      latest.current = result;
      setLatestResult(result);
    } catch (cause) {
      if (current === revision.current) {
        latest.current = undefined;
        setLatestResult(undefined);
        setResultError(errorMessage(cause));
      }
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      revision.current++;
    };
  }, [refresh]);
  return { data, latestResult, loading, error, resultError, refresh };
}

export function ProgressStatus({
  loading,
  error,
  refresh,
}: {
  loading: boolean;
  error: string;
  refresh: () => void;
}) {
  if (error)
    return (
      <div className="study-notice" role="alert">
        <p>{error}</p>
        <button className="outline-button" onClick={refresh}>
          Tentar carregar novamente
        </button>
      </div>
    );
  return loading ? (
    <p className="study-notice muted" role="status">
      Carregando seu histórico...
    </p>
  ) : null;
}

export function Evolution({ items }: { items?: Activity[] }) {
  if (!items?.length)
    return (
      <div className="empty-chart">
        <span>⌁</span>
        <p>Nenhum diagnóstico concluído para exibir evolução.</p>
      </div>
    );
  return (
    <ol
      className="study-evolution"
      aria-label="Evolução dos últimos diagnósticos concluídos"
    >
      {items.map((item) => (
        <li key={item.id}>
          <button
            onClick={() => navigate(`/resultados/diagnostico/${item.id}`)}
          >
            <span>{formatDate(item.finalizedAt!)}</span>
            <strong>
              {item.overallPercentage === null
                ? "Sem pontuação"
                : `${item.overallPercentage}%`}
            </strong>
          </button>
          <div className="study-bar">
            <i style={{ width: `${item.overallPercentage ?? 0}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function RecentActivities({ items }: { items?: Activity[] }) {
  if (!items?.length)
    return <p className="empty-dashboard">Nenhuma atividade registrada.</p>;
  return (
    <ul className="study-recent">
      {items.map((item) => (
        <li key={item.id}>
          <span>
            {typeLabel(item.type)} · {formatDate(item.startedAt)}
          </span>
          {item.finalizedAt ? (
            <button
              className="text-button"
              onClick={() =>
                navigate(
                  resultPath(item),
                )
              }
            >
              Ver resultado
            </button>
          ) : (
            <small>
              Em andamento · {item.answeredQuestions}/{item.totalQuestions}{" "}
              respondidas
            </small>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PerformanceIndicators({ data }: { data?: Overview }) {
  if (!data) return null;
  const totals = data.totals;
  if (!totals.completedActivities)
    return (
      <article className="panel">
        <h2>Sem atividades concluídas</h2>
        <p className="muted">
          Conclua um diagnóstico ou uma trilha para acompanhar seus indicadores.
        </p>
      </article>
    );
  const points = data.evolution.filter(
    (item) => item.overallPercentage !== null,
  );
  const delta =
    points.length > 1
      ? Number(
          (
            points[points.length - 1].overallPercentage! -
            points[0].overallPercentage!
          ).toFixed(2),
        )
      : null;
  return (
    <article className="panel study-indicators">
      <h2>Desempenho registrado</h2>
      <p className="muted">
        Diagnósticos, trilhas e simulados de turma concluídos. Percentuais usam todas as questões da
        tentativa, conforme a correção existente.
      </p>
      <dl>
        {[
          ["Atividades concluídas", totals.completedActivities],
          ["Diagnósticos concluídos", totals.completedDiagnostics],
          ["Trilhas concluídas", totals.completedTrails],
          ["Simulados de turma concluídos", totals.completedExams ?? 0],
          ["Respostas registradas", totals.answeredQuestions],
          ["Acertos", totals.correctAnswers],
          ["Respostas erradas", totals.incorrectAnswers],
          ["Não respondidas", totals.unansweredQuestions],
          [
            "Acertos sobre questões atribuídas",
            totals.totalQuestions
              ? `${Number(((100 * totals.correctAnswers) / totals.totalQuestions).toFixed(2))}%`
              : "Sem questões",
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">
        {delta === null
          ? "A evolução requer pelo menos dois diagnósticos concluídos com pontuação."
          : `Evolução entre o primeiro e o último dos ${points.length} diagnósticos exibidos: ${delta > 0 ? "+" : ""}${delta} pontos percentuais.`}
      </p>
      <Evolution items={data.evolution} />
    </article>
  );
}

export function StudentHistory() {
  const [filter, setFilter] = useState<"activities" | "diagnostics">(
    "activities",
  );
  const [cursor, setCursor] = useState<string>();
  const [previous, setPrevious] = useState<(string | undefined)[]>([]);
  const [page, setPage] = useState<{
    items: Activity[];
    nextCursor: string | null;
  }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPage(undefined);
    const query = new URLSearchParams({
      limit: "20",
      ...(cursor ? { cursor } : {}),
    });
    void apiRequest<{ items: Activity[]; nextCursor: string | null }>(
      `/students/me/${filter}?${query}`,
    )
      .then((value) => {
        if (active) setPage(value);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter, cursor, retry]);
  return (
    <section className="page study-history">
      <p className="gold">SUAS ATIVIDADES</p>
      <h1>Histórico de atividades</h1>
      <p className="muted">
        Tentativas registradas na sua conta, das mais recentes para as mais
        antigas.
      </p>
      <nav className="v0-tabs" aria-label="Filtrar histórico">
        {(
          [
            ["activities", "Todas as atividades"],
            ["diagnostics", "Diagnósticos"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={filter === value}
            className={filter === value ? "active" : ""}
            onClick={() => {
              setFilter(value);
              setCursor(undefined);
              setPrevious([]);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <ProgressStatus
        loading={loading}
        error={error}
        refresh={() => setRetry((value) => value + 1)}
      />
      {!loading && page?.items.length === 0 && (
        <article className="panel">
          <h2>Nenhuma atividade registrada</h2>
          <p className="muted">
            Seu histórico aparecerá aqui quando você iniciar um diagnóstico.
          </p>
          <button className="primary" onClick={() => navigate("/estudar")}>
            Estudar
          </button>
        </article>
      )}
      {!!page?.items.length && (
        <div className="panel">
          <ul className="study-history-list">
            {page.items.map((item) => (
              <li key={item.id}>
                <div>
                  <h2>{typeLabel(item.type)}</h2>
                  <p className="muted">
                    {formatDate(item.startedAt)} ·{" "}
                    {item.finalizedAt
                      ? `Concluído em ${formatDate(item.finalizedAt)}`
                      : "Em andamento"}
                  </p>
                  <p>
                    {item.answeredQuestions} de {item.totalQuestions}{" "}
                    respondidas · {item.unansweredQuestions} não respondidas
                    {item.finalizedAt && (
                      <>
                        {" "}
                        · {item.correctAnswers} acertos ·{" "}
                        {item.incorrectAnswers} respostas erradas
                      </>
                    )}
                  </p>
                </div>
                {item.finalizedAt && (
                  <div>
                    <strong>
                      {item.overallPercentage === null
                        ? "Sem pontuação"
                        : `${item.overallPercentage}%`}
                    </strong>
                    <button
                      className="outline-button"
                      onClick={() =>
                        navigate(
                          resultPath(item),
                        )
                      }
                    >
                      Ver resultado
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="study-pagination">
            <button
              className="outline-button"
              disabled={!previous.length || loading}
              onClick={() => {
                setCursor(previous[previous.length - 1]);
                setPrevious((value) => value.slice(0, -1));
              }}
            >
              Anterior
            </button>
            <span>Página {previous.length + 1}</span>
            <button
              className="outline-button"
              disabled={!page.nextCursor || loading}
              onClick={() => {
                setPrevious((value) => [...value, cursor]);
                setCursor(page.nextCursor!);
              }}
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function PersistedResult({
  type,
  id,
}: {
  type: "diagnostico" | "trilha";
  id: string;
}) {
  const [data, setData] = useState<StudyResult>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(undefined);
    const endpoint =
      type === "diagnostico"
        ? `/diagnostics/${encodeURIComponent(id)}/result`
        : `/trilhas/attempts/${encodeURIComponent(id)}/result`;
    void apiRequest<StudyResult>(endpoint)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [type, id, retry]);
  return (
    <section className="page result study-result">
      <p className="gold">RESULTADO REGISTRADO</p>
      <h1>
        {type === "diagnostico"
          ? "Resultado do diagnóstico"
          : "Resultado da trilha"}
      </h1>
      <ProgressStatus
        loading={loading}
        error={error}
        refresh={() => setRetry((value) => value + 1)}
      />
      {data && (
        <>
          <article className="summary">
            <div className="score">
              <b>{data.overallPercentage}%</b>
              <small>de acertos</small>
            </div>
            <div>
              <h2>
                {data.level === "BASICO"
                  ? "Básico"
                  : data.level === "INTERMEDIARIO"
                    ? "Intermediário"
                    : "Avançado"}
              </h2>
              <p>
                {data.correctAnswers} acertos de {data.totalQuestions} questões.
              </p>
              {typeof data.incorrectAnswers === "number" &&
                typeof data.unansweredQuestions === "number" && (
                  <p>
                    {data.incorrectAnswers} respostas erradas ·{" "}
                    {data.unansweredQuestions} não respondidas.
                  </p>
                )}
              <p>{data.recommendation}</p>
            </div>
          </article>
          <article className="panel">
            <h2>Desempenho por disciplina</h2>
            {data.performances
              .filter((metric) => metric.tipo === "DISCIPLINA")
              .map((metric) => (
                <div className="metric" key={metric.disciplina}>
                  <span>{metric.disciplina}</span>
                  <div>
                    <i style={{ width: `${metric.percentual}%` }} />
                  </div>
                  <b>{metric.percentual}%</b>
                </div>
              ))}
          </article>
        </>
      )}
      <div className="study-pagination">
        <button
          className="outline-button"
          onClick={() => navigate("/historico")}
        >
          Voltar ao histórico
        </button>
        <button
          className="outline-button"
          onClick={() => navigate("/dashboard")}
        >
          Ir para o Dashboard
        </button>
      </div>
    </section>
  );
}
