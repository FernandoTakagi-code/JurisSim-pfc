import { useEffect, useState } from "react";
import { apiRequest } from "./api";
import { navigate } from "./navigation";
import "./goals-reports.css";

type Page<T> = { items: T[]; page: number; hasMore: boolean };
type Goal = {
  id: string;
  date: string;
  targetQuestions: number;
  resolvedQuestions: number;
  completed: boolean;
  canComplete: boolean;
  progressPercentage: number;
};
type Class = { id: string; nome: string; archivedAt: string | null };
type Point = {
  id: string;
  title: string;
  meanPercentage: number;
  publishedAt: string;
};
type Summary = {
  enrolledStudents: number;
  publishedExams: number;
  participants: number;
  startedAttempts: number;
  completedAttempts: number;
  inProgressAttempts: number;
  expiredAttempts: number;
  participationPercentage: number | null;
  meanPercentage: number | null;
  meanIncorrectPercentage: number | null;
  meanUnansweredPercentage: number | null;
  meanCorrectAnswers: number | null;
  meanIncorrectAnswers: number | null;
  correctAnswers: number;
  incorrectAnswers: number;
  unansweredQuestions: number;
};
type ExamReport = Omit<Point, "meanPercentage"> & {
  meanPercentage: number | null;
  started: number;
  completed: number;
  inProgress: number;
  expired: number;
  meanIncorrectPercentage: number | null;
  meanUnansweredPercentage: number | null;
  meanCorrectAnswers: number | null;
  meanIncorrectAnswers: number | null;
};
type ClassReport = {
  turma: Class;
  summary: Summary;
  exams: Page<ExamReport>;
  students: Page<{
    id: string;
    name: string;
    started: number;
    completed: number;
    meanPercentage: number | null;
  }>;
  evolution: Point[];
};
type Individual = {
  turma: Class;
  student: { id: string; nome: string };
  summary: Summary;
  evolution: Point[];
  attempts: Page<{
    id: string;
    examId: string;
    title: string;
    startedAt: string;
    finalizedAt: string | null;
    status: string;
    percentage: number | null;
    correctAnswers: number | null;
    incorrectAnswers: number | null;
    unansweredQuestions: number | null;
  }>;
};
const textError = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "Não foi possível carregar os dados.";
const percent = (value: number | null) =>
  value === null ? "Sem resultado" : `${value}%`;
const decimal = (value: number | null) =>
  value === null
    ? "Sem resultado"
    : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const calendar = (date: string) => date.split("-").reverse().join("/");
const timestamp = (date: string) =>
  new Date(date).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

function useRemote<T>(path: string) {
  const [data, setData] = useState<T>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setLoading(true);
    setError("");
    void apiRequest<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active) setError(textError(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return {
    data,
    loading,
    error,
    reload: () => setRevision((value) => value + 1),
  };
}
function State({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return (
    <>
      {loading && <p role="status">Carregando registros...</p>}
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          <button className="outline-button" onClick={reload}>
            Tentar novamente
          </button>
        </div>
      )}
    </>
  );
}
function Pager({
  page,
  hasMore,
  onChange,
}: {
  page: number;
  hasMore: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <div className="study-pagination">
      <button
        className="outline-button"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        Anterior
      </button>
      <span>Página {page}</span>
      <button
        className="outline-button"
        disabled={!hasMore}
        onClick={() => onChange(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
function today() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) =>
    parts.find((value) => value.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function GoalsPage() {
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState("all");
  const remote = useRemote<Page<Goal>>(
    `/goals?page=${page}${filter === "all" ? "" : "&status=" + filter}`,
  );
  const [editing, setEditing] = useState<Goal>(),
    [date, setDate] = useState(today),
    [target, setTarget] = useState(10);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(editing ? `/goals/${editing.id}` : "/goals", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ date, targetQuestions: target }),
      });
      setEditing(undefined);
      setNotice("Meta salva.");
      remote.reload();
    } catch (cause) {
      setError(textError(cause));
    } finally {
      setBusy(false);
    }
  };
  const complete = async (goal: Goal) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/goals/${goal.id}/complete`, {
        method: "POST",
        body: "{}",
      });
      setNotice("Meta concluída com o progresso registrado.");
      remote.reload();
    } catch (cause) {
      setError(textError(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="page goals-reports-page goals-page">
      <p className="gold">ORGANIZAÇÃO DOS ESTUDOS</p>
      <h1>Metas de estudo</h1>
      <p className="muted">
        Defina sua quantidade diária de questões. O progresso usa respostas
        salvas na data escolhida, no horário de Brasília. Metas da mesma data
        acompanham as mesmas respostas.
      </p>
      <form className="panel goal-form" onSubmit={save}>
        <h2>{editing ? "Editar meta" : "Criar meta diária"}</h2>
        <div className="goal-form-fields">
          <label htmlFor="goal-date">
            Data
            <input
              id="goal-date"
              type="date"
              required
              min="2000-01-01"
              max="2100-12-31"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={busy}
            />
          </label>
          <label htmlFor="goal-target">
            Questões para responder
            <input
              id="goal-target"
              type="number"
              required
              min={1}
              max={1000}
              step={1}
              value={target}
              onChange={(event) => setTarget(Number(event.target.value))}
              disabled={busy}
            />
          </label>
        </div>
        <div className="class-actions">
          <button className="primary" disabled={busy}>
            {busy ? "Salvando..." : editing ? "Salvar meta" : "Criar meta"}
          </button>
          {editing && (
            <button
              type="button"
              className="outline-button"
              onClick={() => {
                setEditing(undefined);
                setDate(today());
                setTarget(10);
              }}
            >
              Cancelar edição
            </button>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <nav className="v0-tabs" aria-label="Filtrar metas">
        {[
          ["all", "Todas"],
          ["pending", "Pendentes"],
          ["completed", "Concluídas"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <State {...remote} />
      {remote.data?.items.length === 0 && (
        <article className="panel">
          <h2>Nenhuma meta encontrada</h2>
          <p className="muted">
            Crie uma meta ou escolha outro filtro para acompanhar seus estudos.
          </p>
        </article>
      )}
      <div className="goals-grid">
        {remote.data?.items.map((goal) => (
          <article className="panel goal-card" key={goal.id}>
            <div className="goal-card-heading">
              <div>
                <p className="gold">
                  {goal.completed ? "CONCLUÍDA" : "PENDENTE"}
                </p>
                <h2>{calendar(goal.date)}</h2>
              </div>
              <span
                className="goal-ring"
                style={{
                  background: `conic-gradient(#bd9652 ${goal.progressPercentage}%, var(--v0-border, #e5e8ed) 0)`,
                }}
              >
                <strong>{goal.progressPercentage}%</strong>
              </span>
            </div>
            <p>
              {goal.resolvedQuestions} de {goal.targetQuestions} questões
              respondidas.
            </p>
            <progress
              value={Math.min(goal.resolvedQuestions, goal.targetQuestions)}
              max={goal.targetQuestions}
              aria-label={`Progresso da meta de ${calendar(goal.date)}`}
            />
            <p className="muted">
              {goal.completed
                ? "Progresso verificado e gravado na conclusão. Esta meta permanece para consulta."
                : goal.canComplete
                  ? "Quantidade atingida. Você já pode concluir esta meta."
                  : "Responda questões no diagnóstico, trilhas ou simulados para avançar."}
            </p>
            {!goal.completed && (
              <div className="class-actions">
                <button
                  className="outline-button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(goal);
                    setDate(goal.date);
                    setTarget(goal.targetQuestions);
                  }}
                >
                  Editar meta
                </button>
                <button
                  className="primary"
                  disabled={busy || !goal.canComplete}
                  onClick={() => void complete(goal)}
                >
                  Concluir meta
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {remote.data && (
        <Pager page={page} hasMore={remote.data.hasMore} onChange={setPage} />
      )}
    </section>
  );
}

function ReportMetrics({
  data,
  individual = false,
}: {
  data: Summary;
  individual?: boolean;
}) {
  const cards = individual
    ? [
        ["Simulados publicados na turma", data.publishedExams],
        ["Tentativas iniciadas", data.startedAttempts],
        ["Tentativas concluídas", data.completedAttempts],
        ["Média de acertos", percent(data.meanPercentage)],
      ]
    : [
        ["Alunos matriculados", data.enrolledStudents],
        ["Simulados publicados", data.publishedExams],
        ["Alunos participantes", data.participants],
        [
          "Participação",
          data.participationPercentage === null
            ? "Sem oportunidades"
            : percent(data.participationPercentage),
        ],
      ];
  return (
    <>
      <dl className="report-metrics">
        {cards.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="report-details">
        <div className="panel">
          <h2>Tentativas registradas</h2>
          <dl>
            <div>
              <dt>Concluídas</dt>
              <dd>{data.completedAttempts}</dd>
            </div>
            <div>
              <dt>Em andamento</dt>
              <dd>{data.inProgressAttempts}</dd>
            </div>
            <div>
              <dt>Tempo encerrado, sem finalizar</dt>
              <dd>{data.expiredAttempts}</dd>
            </div>
          </dl>
        </div>
        <div className="panel">
          <h2>Médias dos resultados concluídos</h2>
          <dl>
            <div>
              <dt>Acertos</dt>
              <dd>{percent(data.meanPercentage)}</dd>
            </div>
            <div>
              <dt>Respostas erradas</dt>
              <dd>{percent(data.meanIncorrectPercentage)}</dd>
            </div>
            <div>
              <dt>Não respondidas</dt>
              <dd>{percent(data.meanUnansweredPercentage)}</dd>
            </div>
            <div>
              <dt>Quantidade média de acertos</dt>
              <dd>{decimal(data.meanCorrectAnswers)}</dd>
            </div>
            <div>
              <dt>Quantidade média de erros</dt>
              <dd>{decimal(data.meanIncorrectAnswers)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </>
  );
}

function ScoreBar({
  correct,
  incorrect,
  unanswered,
  label,
}: {
  correct: number | null;
  incorrect: number | null;
  unanswered: number | null;
  label: string;
}) {
  if (correct === null)
    return <p className="muted">Sem resultados concluídos.</p>;
  return (
    <div
      className="report-score-bar"
      role="img"
      aria-label={`${label}: ${correct}% acertos, ${incorrect}% erros, ${unanswered}% não respondidas`}
    >
      <span
        className="score-correct"
        style={{ width: `${correct}%` }}
        title={`Acertos: ${correct}%`}
      />
      <span
        className="score-incorrect"
        style={{ width: `${incorrect ?? 0}%` }}
        title={`Erros: ${incorrect}%`}
      />
      <span
        className="score-unanswered"
        style={{ width: `${unanswered ?? 0}%` }}
        title={`Não respondidas: ${unanswered}%`}
      />
    </div>
  );
}
function EvolutionChart({
  points,
  individual = false,
}: {
  points: Point[];
  individual?: boolean;
}) {
  if (points.length < 2)
    return (
      <div className="report-chart-empty">
        <p>
          A evolução requer pelo menos dois simulados com resultados concluídos.
        </p>
      </div>
    );
  const x = (index: number) => 96 + (index * 636) / (points.length - 1);
  const y = (score: number) => 218 - score * 1.8;
  const delta = Number(
    (
      points[points.length - 1].meanPercentage - points[0].meanPercentage
    ).toFixed(2),
  );
  return (
    <>
      <div className="report-chart">
        <svg
          viewBox="0 0 780 258"
          role="img"
          aria-label={
            individual
              ? "Evolução do aluno nos simulados da turma"
              : "Média de acertos por simulado publicado"
          }
        >
          {[0, 25, 50, 75, 100].map((score) => (
            <g key={score}>
              <line
                x1="96"
                y1={y(score)}
                x2="744"
                y2={y(score)}
                className="chart-grid"
              />
              <text x="80" textAnchor="end" y={y(score) + 4}>
                {score}%
              </text>
            </g>
          ))}
          <polyline
            points={points
              .map((p, index) => `${x(index)},${y(p.meanPercentage)}`)
              .join(" ")}
            fill="none"
            stroke="#bd9652"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {points.map((point, index) => (
            <g key={point.id}>
              <circle
                tabIndex={0}
                aria-label={`${point.title}: ${point.meanPercentage}%`}
                cx={x(index)}
                cy={y(point.meanPercentage)}
                r="5"
                fill="#bd9652"
              >
                <title>
                  {point.title}: {point.meanPercentage}% ·{" "}
                  {timestamp(point.publishedAt)}
                </title>
              </circle>
              {(index === 0 || index === points.length - 1) && (
                <text x={x(index)} y="246" textAnchor={index ? "end" : "start"}>
                  {new Date(point.publishedAt).toLocaleDateString("pt-BR")}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <p className="muted">
        Variação entre primeiro e último dos {points.length} pontos exibidos:{" "}
        {delta > 0 ? "+" : ""}
        {delta} pontos percentuais.{" "}
        {individual
          ? "Os pontos usam a data de conclusão."
          : "Os pontos seguem a publicação; as questões e os participantes podem variar entre simulados."}
      </p>
      <details className="report-chart-data">
        <summary>Ver valores do gráfico</summary>
        <ul>
          {points.map((p) => (
            <li key={p.id}>
              <span>{p.title}</span>
              <strong>{p.meanPercentage}%</strong>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

export function TeacherReports({
  classId,
  mode,
}: {
  classId?: string;
  mode: "performance" | "reports";
}) {
  const [classesPage, setClassesPage] = useState(1);
  const classes = useRemote<Page<Class>>(
    `/reports/classes?page=${classesPage}`,
  );
  const base =
    mode === "performance" ? "/professor/desempenho" : "/professor/relatorios";
  return (
    <section className="page goals-reports-page teacher-reports">
      <p className="gold">DADOS DAS TURMAS AUTORIZADAS</p>
      <h1>
        {mode === "performance"
          ? "Desempenho por turma"
          : "Relatórios por turma"}
      </h1>
      <p className="muted">
        Participação e resultados nos simulados publicados para as matrículas
        atuais de cada turma.
      </p>
      <State {...classes} />
      <article className="panel report-class-selector">
        <h2>Selecione uma turma</h2>
        {classes.data?.items.length === 0 && (
          <p className="muted">
            Nenhuma turma sob sua responsabilidade para exibir relatórios.
          </p>
        )}
        <div className="report-class-buttons">
          {classes.data?.items.map((turma) => (
            <button
              key={turma.id}
              className="outline-button"
              aria-pressed={classId === turma.id}
              onClick={() => navigate(`${base}/turmas/${turma.id}`)}
            >
              {turma.nome}
              {turma.archivedAt ? " · Arquivada" : ""}
            </button>
          ))}
        </div>
        {classes.data && (
          <Pager
            page={classesPage}
            hasMore={classes.data.hasMore}
            onChange={setClassesPage}
          />
        )}
      </article>
      {classId ? (
        <ClassReportContent key={classId} classId={classId} />
      ) : (
        <p className="report-selection-empty muted">
          Escolha uma turma para consultar seus registros.
        </p>
      )}
    </section>
  );
}
function ClassReportContent({ classId }: { classId: string }) {
  const [page, setPage] = useState(1),
    [examPage, setExamPage] = useState(1);
  const remote = useRemote<ClassReport>(
    `/reports/classes/${encodeURIComponent(classId)}?page=${page}&examPage=${examPage}`,
  );
  const data = remote.data;
  return (
    <div className="class-report-content">
      <State {...remote} />
      {data && (
        <>
          <h2>{data.turma.nome}</h2>
          <ReportMetrics data={data.summary} />
          <article className="panel">
            <h2>Evolução das médias por simulado</h2>
            <EvolutionChart points={data.evolution} />
          </article>
          <article className="panel report-exams">
            <h2>Participação nos simulados</h2>
            <div className="report-legend">
              <span className="legend-correct">Acertos</span>
              <span className="legend-incorrect">Erros</span>
              <span className="legend-unanswered">Não respondidas</span>
            </div>
            {data.exams.items.length === 0 && (
              <p className="muted">
                Nenhum simulado publicado para esta turma.
              </p>
            )}
            {data.exams.items.map((exam) => (
              <div className="report-exam" key={exam.id}>
                <h3>{exam.title}</h3>
                <p className="muted">
                  {exam.started} tentativas iniciadas · {exam.completed}{" "}
                  concluídas · {exam.inProgress} em andamento · {exam.expired}{" "}
                  com tempo encerrado
                </p>
                <ScoreBar
                  correct={exam.meanPercentage}
                  incorrect={exam.meanIncorrectPercentage}
                  unanswered={exam.meanUnansweredPercentage}
                  label={exam.title}
                />
                <p>
                  Média: {percent(exam.meanPercentage)} ·{" "}
                  {decimal(exam.meanCorrectAnswers)} acertos e{" "}
                  {decimal(exam.meanIncorrectAnswers)} erros por tentativa
                  concluída.
                </p>
              </div>
            ))}
            <Pager
              page={examPage}
              hasMore={data.exams.hasMore}
              onChange={setExamPage}
            />
          </article>
          <article className="panel report-students">
            <h2>Desempenho individual</h2>
            {data.students.items.length === 0 && (
              <p className="muted">Nenhum aluno matriculado nesta turma.</p>
            )}
            <ul>
              {data.students.items.map((student) => (
                <li key={student.id}>
                  <div>
                    <strong>{student.name}</strong>
                    <p className="muted">
                      {student.started} tentativas · {student.completed}{" "}
                      concluídas · Média: {percent(student.meanPercentage)}
                    </p>
                  </div>
                  <button
                    className="outline-button"
                    onClick={() =>
                      navigate(
                        `/professor/relatorios/turmas/${classId}/alunos/${student.id}`,
                      )
                    }
                  >
                    Consultar aluno
                  </button>
                </li>
              ))}
            </ul>
            <Pager
              page={page}
              hasMore={data.students.hasMore}
              onChange={setPage}
            />
          </article>
        </>
      )}
    </div>
  );
}
export function StudentClassReport({
  classId,
  studentId,
}: {
  classId: string;
  studentId: string;
}) {
  const [page, setPage] = useState(1);
  const remote = useRemote<Individual>(
    `/reports/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}?page=${page}`,
  );
  const data = remote.data;
  return (
    <section className="page goals-reports-page individual-report">
      <p className="gold">RELATÓRIO INDIVIDUAL DA TURMA</p>
      <h1>{data?.student.nome ?? "Desempenho individual"}</h1>
      <State {...remote} />
      {data && (
        <>
          <p className="muted">
            {data.turma.nome} · Somente simulados publicados para esta turma.
          </p>
          <ReportMetrics data={data.summary} individual />
          <article className="panel">
            <h2>Evolução nos simulados</h2>
            <EvolutionChart points={data.evolution} individual />
          </article>
          <article className="panel">
            <h2>Tentativas do aluno nesta turma</h2>
            {data.attempts.items.length === 0 && (
              <p className="muted">
                O aluno ainda não iniciou simulados desta turma.
              </p>
            )}
            <ul className="report-attempts">
              {data.attempts.items.map((attempt) => (
                <li key={attempt.id}>
                  <h3>{attempt.title}</h3>
                  <p className="muted">
                    Início: {timestamp(attempt.startedAt)} ·{" "}
                    {attempt.status === "COMPLETED"
                      ? "Concluída"
                      : attempt.status === "EXPIRED"
                        ? "Tempo encerrado"
                        : "Em andamento"}
                  </p>
                  {attempt.status === "COMPLETED" ? (
                    <p>
                      {percent(attempt.percentage)} · {attempt.correctAnswers}{" "}
                      acertos · {attempt.incorrectAnswers} erros ·{" "}
                      {attempt.unansweredQuestions} não respondidas
                    </p>
                  ) : (
                    <p className="muted">
                      Resultado disponível após conclusão.
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <Pager
              page={page}
              hasMore={data.attempts.hasMore}
              onChange={setPage}
            />
          </article>
        </>
      )}
      <button
        className="outline-button"
        onClick={() => navigate(`/professor/relatorios/turmas/${classId}`)}
      >
        Voltar ao relatório da turma
      </button>
    </section>
  );
}
