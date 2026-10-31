import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "./api";
import { navigate } from "./navigation";
import "./class-exams.css";

type Page<T> = { items: T[]; page: number; hasMore: boolean };
type Class = {
  id: string;
  nome: string;
  archivedAt: string | null;
  _count: { alunos: number };
};
type Exam = {
  id: string;
  titulo: string;
  descricao: string;
  duracaoSegundos: number | null;
  publishedAt: string | null;
  questoes?: { questaoId: string; posicao: number }[];
  turmas?: { id: string; nome: string; archivedAt: string | null }[];
  _count: { tentativas?: number; questoes?: number };
  tentativas?: { id: string; finalizadoEm: string | null }[];
};
type Question = {
  id: string;
  enunciado: string;
  disciplina: string;
  publica: boolean;
};
const message = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "Não foi possível concluir a operação.";
const json = (method: string, value?: unknown) => ({
  method,
  ...(value === undefined ? {} : { body: JSON.stringify(value) }),
});

function usePage<T>(endpoint: string) {
  const [page, setPage] = useState(1),
    [data, setData] = useState<Page<T>>();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(undefined);
    void apiRequest<Page<T>>(`${endpoint}?page=${page}`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint, page, revision]);
  return { page, setPage, data, loading, error, reload };
}
function Feedback({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return (
    <>
      {loading && <p role="status">Carregando...</p>}
      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          <button className="outline-button" onClick={retry}>
            Tentar novamente
          </button>
        </div>
      )}
    </>
  );
}
function Pagination({
  page,
  hasMore,
  change,
}: {
  page: number;
  hasMore?: boolean;
  change: (page: number) => void;
}) {
  return (
    <div className="study-pagination">
      <button
        className="outline-button"
        disabled={page === 1}
        onClick={() => change(page - 1)}
      >
        Anterior
      </button>
      <span>Página {page}</span>
      <button
        className="outline-button"
        disabled={!hasMore}
        onClick={() => change(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}

export function ClassesPage({ teacher }: { teacher: boolean }) {
  const list = usePage<Class>("/turmas");
  const [name, setName] = useState(""),
    [editing, setEditing] = useState<string>(),
    [code, setCode] = useState("");
  const [invite, setInvite] = useState<{
    inviteCode: string;
    expiresAt: string;
  }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [archiving, setArchiving] = useState<string>();
  const action = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await work();
      setNotice(typeof result === "string" ? result : success);
      list.reload();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    void action(
      async () => {
        if (teacher) {
          if (editing)
            await apiRequest(
              `/turmas/${editing}`,
              json("PATCH", { nome: name }),
            );
          else
            setInvite(
              await apiRequest("/turmas", json("POST", { nome: name })),
            );
          setName("");
          setEditing(undefined);
        } else {
          const result = await apiRequest<{ message: string }>(
            "/turmas/join",
            json("POST", { code }),
          );
          setCode("");
          return result.message;
        }
      },
      teacher ? "Turma salva." : "Matrícula realizada.",
    );
  };
  return (
    <section className="page class-exams-page">
      <p className="gold">TURMAS</p>
      <h1>{teacher ? "Gestão de turmas" : "Minhas turmas"}</h1>
      <p className="muted">
        {teacher
          ? "Gerencie suas turmas e matrículas. Turmas arquivadas permanecem disponíveis para consulta."
          : "Ingresse com o convite fornecido pelo professor para acessar os simulados da turma."}
      </p>
      <form className="panel class-form" onSubmit={save}>
        <h2>
          {teacher
            ? editing
              ? "Editar turma"
              : "Criar turma"
            : "Ingressar em turma"}
        </h2>
        <label htmlFor="class-input">
          {teacher ? "Nome da turma" : "Código de convite"}
        </label>
        <input
          id="class-input"
          name={teacher ? "class-name" : "invite-code"}
          value={teacher ? name : code}
          onChange={(event) =>
            teacher ? setName(event.target.value) : setCode(event.target.value)
          }
          required
          minLength={teacher ? 2 : 32}
          maxLength={teacher ? 150 : 32}
          autoComplete="off"
          disabled={busy}
        />
        <div className="class-actions">
          <button className="primary" disabled={busy}>
            {busy
              ? "Salvando..."
              : teacher
                ? editing
                  ? "Salvar turma"
                  : "Criar turma"
                : "Ingressar"}
          </button>
          {editing && (
            <button
              type="button"
              className="outline-button"
              onClick={() => {
                setEditing(undefined);
                setName("");
              }}
            >
              Cancelar edição
            </button>
          )}
        </div>
      </form>
      {invite && teacher && (
        <article className="panel class-invite">
          <h2>Convite gerado</h2>
          <p>
            Compartilhe somente com os alunos desta turma. O código é exibido
            apenas agora; um novo convite invalida o anterior.
          </p>
          <label htmlFor="new-invite">Código</label>
          <input
            id="new-invite"
            readOnly
            value={invite.inviteCode}
            onFocus={(event) => event.target.select()}
          />
          <p>
            Válido até {new Date(invite.expiresAt).toLocaleString("pt-BR")}.
          </p>
          <button
            className="outline-button"
            onClick={() => setInvite(undefined)}
          >
            Ocultar convite
          </button>
        </article>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <Feedback loading={list.loading} error={list.error} retry={list.reload} />
      {list.data?.items.length === 0 && (
        <article className="panel">
          <h2>Nenhuma turma encontrada</h2>
          <p className="muted">
            {teacher
              ? "Crie sua primeira turma."
              : "Use um convite válido para se matricular."}
          </p>
        </article>
      )}
      <div className="class-list">
        {list.data?.items.map((turma) => (
          <article className="panel" key={turma.id}>
            <h2>{turma.nome}</h2>
            <p className="muted">
              {turma.archivedAt ? "Arquivada" : "Ativa"} · {turma._count.alunos}{" "}
              alunos matriculados
            </p>
            {teacher && (
              <div className="class-actions">
                <button
                  className="outline-button"
                  onClick={() =>
                    navigate(`/professor/turmas/${turma.id}/alunos`)
                  }
                >
                  Ver alunos
                </button>
                {!turma.archivedAt && (
                  <>
                    <button
                      className="outline-button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(turma.id);
                        setName(turma.nome);
                      }}
                    >
                      Editar turma
                    </button>
                    <button
                      className="outline-button"
                      disabled={busy}
                      onClick={() =>
                        void action(
                          async () =>
                            setInvite(
                              await apiRequest(
                                `/turmas/${turma.id}/invite`,
                                json("POST"),
                              ),
                            ),
                          "Novo convite gerado.",
                        )
                      }
                    >
                      Gerar novo convite
                    </button>
                    <button
                      className="outline-button danger"
                      disabled={busy}
                      onClick={() => setArchiving(turma.id)}
                    >
                      Arquivar turma
                    </button>
                  </>
                )}
              </div>
            )}
            {archiving === turma.id && (
              <div className="class-confirm" role="alert">
                <p>
                  Arquivar impede novas matrículas e novos inícios de simulados.
                  Os registros existentes serão preservados.
                </p>
                <button
                  className="outline-button danger"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await apiRequest(
                        `/turmas/${turma.id}`,
                        json("PATCH", { archived: true }),
                      );
                      setArchiving(undefined);
                      setInvite(undefined);
                    }, "Turma arquivada.")
                  }
                >
                  Confirmar arquivamento
                </button>
                <button
                  className="outline-button"
                  onClick={() => setArchiving(undefined)}
                >
                  Cancelar
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {list.data && (
        <Pagination
          page={list.page}
          hasMore={list.data.hasMore}
          change={list.setPage}
        />
      )}
    </section>
  );
}

export function ClassStudents({ classId }: { classId?: string }) {
  const list = usePage<{ id: string; nome: string; email: string }>(
    classId
      ? `/turmas/${encodeURIComponent(classId)}/students`
      : "/turmas/students",
  );
  return (
    <section className="page class-exams-page">
      <p className="gold">MATRÍCULAS</p>
      <h1>Alunos matriculados</h1>
      <p className="muted">
        Somente alunos das turmas que você está autorizado a gerenciar.
      </p>
      <Feedback loading={list.loading} error={list.error} retry={list.reload} />
      {list.data && (
        <article className="panel">
          <h2>
            {list.data.items.length ? "Alunos" : "Nenhum aluno matriculado"}
          </h2>
          <ul className="class-students">
            {list.data.items.map((student) => (
              <li key={student.id}>
                <strong>{student.nome}</strong>
                <span>{student.email}</span>
              </li>
            ))}
          </ul>
          <Pagination
            page={list.page}
            hasMore={list.data.hasMore}
            change={list.setPage}
          />
        </article>
      )}
      <button
        className="outline-button"
        onClick={() => navigate("/professor/turmas")}
      >
        Voltar às turmas
      </button>
    </section>
  );
}

export function ExamsPage({ teacher }: { teacher: boolean }) {
  const list = usePage<Exam>("/avaliacoes");
  const [editing, setEditing] = useState<Exam | "new">(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const publish = async (exam: Exam) => {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/avaliacoes/${exam.id}/publish`, json("POST"));
      list.reload();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  const start = async (exam: Exam) => {
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ id: string }>(
        `/avaliacoes/${exam.id}/attempts`,
        json("POST"),
      );
      navigate(`/simulados/tentativas/${result.id}`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="page class-exams-page">
      <p className="gold">SIMULADOS</p>
      <h1>
        {teacher ? "Simulados do professor" : "Simulados"}
      </h1>
      <p className="muted">
        {teacher
          ? "Selecione questões autorizadas e publique para suas turmas. Publicados ficam bloqueados para edição."
          : "Somente simulados publicados para turmas em que você está matriculado."}
      </p>
      {!teacher && <section className="panel individual-exams-section" aria-labelledby="individual-exams-title">
        <p className="gold">PREPARAÇÃO INDIVIDUAL</p>
        <h2 id="individual-exams-title">Simulados individuais da OAB</h2>
        <p className="muted">O catálogo de provas oficiais ainda não está disponível. Você pode praticar por disciplina com questões elegíveis.</p>
        <div className="class-actions"><button className="primary" onClick={() => navigate('/questoes')}>Praticar por disciplina</button><span className="muted">Nenhum simulado oficial publicado no momento.</span></div>
      </section>}
      {!teacher && <div className="class-section-heading"><p className="gold">AVALIAÇÕES DE TURMA</p><h2>Simulados das minhas turmas</h2><p className="muted">Somente avaliações publicadas nas turmas em que você está matriculado.</p></div>}
      {teacher && !editing && (
        <button className="primary" onClick={() => setEditing("new")}>
          Criar simulado
        </button>
      )}
      {editing && teacher && (
        <ExamForm
          key={editing === "new" ? "new" : editing.id}
          exam={editing === "new" ? undefined : editing}
          onCancel={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            list.reload();
          }}
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Feedback loading={list.loading} error={list.error} retry={list.reload} />
      {list.data?.items.length === 0 && (
        <article className="panel">
          <h2>Nenhum simulado disponível</h2>
          <p className="muted">
            {teacher
              ? "Crie uma turma e prepare seu primeiro simulado."
              : "Os simulados aparecerão após publicação pelo professor para suas turmas ativas."}
          </p>
        </article>
      )}
      <div className="class-list">
        {list.data?.items.map((exam) => (
          <article className="panel exam-card" key={exam.id}>
            <h2>{exam.titulo}</h2>
            <p>{exam.descricao}</p>
            <p className="muted">
              {teacher ? exam.questoes?.length : exam._count.questoes} questões
              ·{" "}
              {exam.duracaoSegundos
                ? `${exam.duracaoSegundos / 60} minutos`
                : "Sem limite de tempo"}{" "}
              · {exam.publishedAt ? "Publicado" : "Rascunho"}
            </p>
            {teacher ? (
              <>
                <p className="muted">
                  Turmas: {exam.turmas?.map((t) => t.nome).join(", ")} ·{" "}
                  {exam._count.tentativas} tentativas
                </p>
                <div className="class-actions">
                  <button
                    className="outline-button"
                    disabled={busy || !!exam.publishedAt}
                    onClick={() => setEditing(exam)}
                  >
                    Editar simulado
                  </button>
                  <button
                    className="primary"
                    disabled={busy || !!exam.publishedAt}
                    onClick={() => void publish(exam)}
                  >
                    {exam.publishedAt ? "Publicado" : "Publicar simulado"}
                  </button>
                </div>
              </>
            ) : (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void start(exam)}
              >
                {exam.tentativas?.[0]?.finalizadoEm
                  ? "Ver resultado"
                  : exam.tentativas?.length
                    ? "Continuar simulado"
                    : "Realizar simulado"}
              </button>
            )}
          </article>
        ))}
      </div>
      {list.data && (
        <Pagination
          page={list.page}
          hasMore={list.data.hasMore}
          change={list.setPage}
        />
      )}
    </section>
  );
}

function ExamForm({
  exam,
  onCancel,
  onSaved,
}: {
  exam?: Exam;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const classes = usePage<Class>("/turmas");
  const [questions, setQuestions] = useState<Question[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [title, setTitle] = useState(exam?.titulo ?? ""),
    [description, setDescription] = useState(exam?.descricao ?? "");
  const [minutes, setMinutes] = useState(
    exam?.duracaoSegundos ? String(exam.duracaoSegundos / 60) : "",
  );
  const [selectedClasses, setSelectedClasses] = useState(
    exam?.turmas?.map((t) => t.id) ?? [],
  );
  const [selectedQuestions, setSelectedQuestions] = useState(
    exam?.questoes?.map((q) => q.questaoId) ?? [],
  );
  const [quantity, setQuantity] = useState(exam?.questoes?.length ?? 1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    void apiRequest<Question[]>("/questoes")
      .then((items) => {
        if (active) setQuestions(items);
      })
      .catch((cause) => {
        if (active) setLoadError(message(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const toggle = (items: string[], id: string) =>
    items.includes(id) ? items.filter((value) => value !== id) : [...items, id];
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (selectedQuestions.length !== quantity) {
      setError("Selecione exatamente a quantidade de questões configurada.");
      return;
    }
    if (!selectedClasses.length) {
      setError("Selecione ao menos uma turma ativa.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest(
        exam ? `/avaliacoes/${exam.id}` : "/avaliacoes",
        json(exam ? "PUT" : "POST", {
          titulo: title,
          descricao: description,
          duracaoSegundos: minutes ? Number(minutes) * 60 : null,
          turmaIds: selectedClasses,
          questaoIds: selectedQuestions,
        }),
      );
      onSaved();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="panel class-form exam-form" onSubmit={save}>
      <h2>{exam ? "Editar rascunho" : "Novo simulado"}</h2>
      <label htmlFor="exam-title">Título</label>
      <input
        id="exam-title"
        required
        minLength={2}
        maxLength={150}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={busy}
      />
      <label htmlFor="exam-description">Descrição</label>
      <textarea
        id="exam-description"
        maxLength={3000}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        disabled={busy}
      />
      <div className="exam-form-row">
        <label>
          Quantidade de questões
          <input
            id="exam-quantity"
            type="number"
            min={1}
            max={80}
            required
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            disabled={busy}
          />
        </label>
        <label>
          Duração em minutos (opcional)
          <input
            id="exam-duration"
            type="number"
            min={1}
            max={1440}
            step={1}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            disabled={busy}
          />
        </label>
      </div>
      <fieldset disabled={busy}>
        <legend>Turmas ativas ({selectedClasses.length} selecionadas)</legend>
        <Feedback
          loading={classes.loading}
          error={classes.error}
          retry={classes.reload}
        />
        <div className="exam-choices">
          {classes.data?.items
            .filter((t) => !t.archivedAt)
            .map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={selectedClasses.includes(t.id)}
                  onChange={() =>
                    setSelectedClasses(toggle(selectedClasses, t.id))
                  }
                />
                {t.nome}
              </label>
            ))}
        </div>
        {classes.data?.items.length === 0 && (
          <p className="muted">Crie uma turma para publicar simulados.</p>
        )}
        {classes.data && (
          <Pagination
            page={classes.page}
            hasMore={classes.data.hasMore}
            change={classes.setPage}
          />
        )}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>
          Questões do banco autorizado ({selectedQuestions.length}/{quantity})
        </legend>
        <Feedback
          loading={loading}
          error={loadError}
          retry={() => setRevision((value) => value + 1)}
        />
        <p className="muted">
          Questões privadas vinculadas a uma turma só podem ser publicadas para
          essa mesma turma.
        </p>
        <div className="exam-choices">
          {questions.map((q) => (
            <label key={q.id}>
              <input
                type="checkbox"
                checked={selectedQuestions.includes(q.id)}
                onChange={() =>
                  setSelectedQuestions(toggle(selectedQuestions, q.id))
                }
              />
              <span>
                {q.disciplina} · {q.enunciado}
                {!q.publica && " · Privada"}
              </span>
            </label>
          ))}
        </div>
        {!loading && !questions.length && (
          <p className="muted">
            Nenhuma questão disponível. Cadastre questões no banco existente.
          </p>
        )}
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="class-actions">
        <button
          className="primary"
          disabled={
            busy || loading || !!loadError || classes.loading || !!classes.error
          }
        >
          {busy ? "Salvando..." : "Salvar rascunho"}
        </button>
        <button
          type="button"
          className="outline-button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

type Attempt = {
  id: string;
  titulo: string;
  serverTime: string;
  deadline: string | null;
  status: "IN_PROGRESS" | "EXPIRED" | "COMPLETED";
  questions: {
    id: string;
    statement: string;
    discipline: string;
    selectedOptionId: string | null;
    alternatives: { id: string; text: string }[];
  }[];
  result: {
    overallPercentage: number;
    correctAnswers: number;
    totalQuestions: number;
    incorrectAnswers: number;
    unansweredQuestions: number;
  } | null;
};
export function ClassExamAttempt({
  id,
  onCompleted,
}: {
  id: string;
  onCompleted?: () => void;
}) {
  const [data, setData] = useState<Attempt>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [clock, setClock] = useState(Date.now()),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(undefined);
    void apiRequest<Attempt>(`/avaliacoes/attempts/${encodeURIComponent(id)}`)
      .then((value) => {
        if (active) {
          setData(value);
          setOffset(new Date(value.serverTime).getTime() - Date.now());
        }
      })
      .catch((cause) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, revision]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = data?.deadline
    ? Math.max(
        0,
        Math.ceil((new Date(data.deadline).getTime() - clock - offset) / 1000),
      )
    : null;
  const expired = data?.status === "EXPIRED" || seconds === 0;
  const answer = async (questionId: string, option: string) => {
    setBusy(true);
    setError("");
    try {
      await apiRequest(
        `/avaliacoes/attempts/${id}/answers/${questionId}`,
        json("PUT", { selectedOptionId: option }),
      );
      setData((current) =>
        current
          ? {
              ...current,
              questions: current.questions.map((q) =>
                q.id === questionId ? { ...q, selectedOptionId: option } : q,
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
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/avaliacoes/attempts/${id}/finalize`, json("POST"));
      onCompleted?.();
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="page class-exams-page exam-attempt">
      <p className="gold">SIMULADO DA TURMA</p>
      <h1>{data?.titulo ?? "Simulado"}</h1>
      <Feedback
        loading={loading}
        error={!data ? error : ""}
        retry={() => setRevision((value) => value + 1)}
      />
      {data && (
        <>
          {data.result ? (
            <article className="panel exam-result">
              <h2>Resultado registrado</h2>
              <strong>{data.result.overallPercentage}%</strong>
              <p>
                {data.result.correctAnswers} acertos de{" "}
                {data.result.totalQuestions} questões ·{" "}
                {data.result.incorrectAnswers} respostas erradas ·{" "}
                {data.result.unansweredQuestions} não respondidas.
              </p>
            </article>
          ) : (
            <>
              <p role="status">
                {seconds === null
                  ? "Sem limite de tempo"
                  : expired
                    ? "Tempo encerrado. Conclua para registrar seu resultado."
                    : `Tempo restante: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
              </p>
              <p className="muted">
                As respostas são salvas ao selecionar uma alternativa. Você pode
                alterá-las até finalizar ou encerrar o tempo.
              </p>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {data.questions.map((q, index) => (
            <article className="panel exam-question" key={q.id}>
              <p className="gold">
                QUESTÃO {index + 1} · {q.discipline}
              </p>
              <h2>{q.statement}</h2>
              <div className="answers">
                {q.alternatives.map((a, i) => (
                  <label
                    key={a.id}
                    className={q.selectedOptionId === a.id ? "picked" : ""}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={q.selectedOptionId === a.id}
                      disabled={busy || expired || !!data.result}
                      onChange={() => void answer(q.id, a.id)}
                    />
                    <b>{String.fromCharCode(65 + i)}</b>
                    <span>{a.text}</span>
                  </label>
                ))}
              </div>
            </article>
          ))}
          {!data.result && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void finalize()}
            >
              {busy ? "Salvando..." : "Finalizar simulado"}
            </button>
          )}
        </>
      )}
      <button className="outline-button" onClick={() => navigate("/simulados")}>
        Voltar aos simulados
      </button>
    </section>
  );
}
