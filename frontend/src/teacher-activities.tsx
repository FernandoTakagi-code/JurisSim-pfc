import { useEffect, useState, useSyncExternalStore } from "react";
import {
  useResource,
  useMutation,
  ResourceState,
  Pages,
} from "./administration";
import { apiRequest } from "./api";
import {AssessmentDetails} from './assessment-details';
import { navigate } from "./navigation";
import { Icon } from "./ui-icon";

type Class = { id: string; nome: string; archivedAt?: string | null };
type Page = { items: Class[]; page: number; hasMore: boolean };
export function TeacherActivities({
  basePath = "/professor/atividades",
  onNavigate,
}: {
  basePath?: string;
  onNavigate?: (section: "activities" | "students" | "reports" | "classes" | "exams", classId?: string) => void;
} = {}) {
  const [page, setPage] = useState(1);
  const resource = useResource<Page>(`/turmas?page=${page}`);
  const query = useSyncExternalStore(
    (listener) => {
      window.addEventListener("popstate", listener);
      return () => window.removeEventListener("popstate", listener);
    },
    () => location.search,
  );
  const requested = new URLSearchParams(query).get("turma");
  const [selected, setSelected] = useState(requested ?? "");
  useEffect(() => setSelected(requested ?? ""), [requested]);
  const turma = resource.data?.items.find((row) => row.id === selected);
  return (
    <section className="page teacher-activities">
      <header>
        <span className="teacher-eyebrow">ÁREA DOCENTE</span>
        <h1>Atividades</h1>
        <p>Organize o acompanhamento das suas turmas autorizadas.</p>
      </header>
      <article className="panel">
        <h2>Contexto da turma</h2>
        <ResourceState resource={resource} />
        {resource.data && (
          <>
            <label>
              Turma autorizada
              <select
                value={turma ? selected : ""}
                onChange={(event) => {
                  setSelected(event.target.value);
                  if (onNavigate) onNavigate("activities", event.target.value || undefined);
                  else navigate(
                    basePath +
                      (event.target.value
                        ? "?turma=" + encodeURIComponent(event.target.value)
                        : ""),
                  );
                }}
              >
                <option value="">Selecione uma turma desta página</option>
                {resource.data.items.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.nome}
                    {row.archivedAt ? " · Arquivada" : ""}
                  </option>
                ))}
              </select>
            </label>
            {selected && !turma && (
              <p role="status">
                A turma solicitada não está nesta página autorizada. Consulte as
                outras páginas ou selecione uma turma; nenhum dado externo foi
                carregado.
              </p>
            )}
            {!resource.data.items.length && (
              <p>Nenhuma turma autorizada disponível.</p>
            )}
            <Pages
              page={page}
              hasMore={resource.data.hasMore}
              change={setPage}
            />
          </>
        )}
        {turma && (
          <div className="class-actions">
            <button
              onClick={() =>
                onNavigate ? onNavigate("students", turma.id) : navigate(
                  `/professor/turmas/${encodeURIComponent(turma.id)}/alunos`,
                )
              }
            >
              <Icon name="users" />
              Ver alunos
            </button>
            <button
              onClick={() =>
                onNavigate ? onNavigate("reports", turma.id) : navigate(
                  `/professor/relatorios/turmas/${encodeURIComponent(turma.id)}`,
                )
              }
            >
              <Icon name="chart" />
              Relatório da turma
            </button>
          </div>
        )}
      </article>
      {turma && (
        <ActivityManager
          key={turma.id}
          classId={turma.id}
          archived={Boolean(turma.archivedAt)}
        />
      )}
      <div className="class-actions">
        <button onClick={() => onNavigate ? onNavigate("classes") : navigate("/professor/turmas")}>
          Minhas turmas
        </button>
        <button
          className="primary"
          onClick={() => onNavigate ? onNavigate("exams") : navigate("/professor/simulados")}
        >
          Ir para Simulados
        </button>
      </div>
    </section>
  );
}

type Activity = {
  id: string;
  classId: string;
  className: string;
  titulo: string;
  descricao: string;
  dueAt: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "CANCELLED";
  questionIds?: string[];
  questionCount: number;
  maxPoints:number;
  enrolledStudents?:number;
  deliveryCount?:number;
  closedAt?: string | null;
  cancelledAt?: string | null;
  attemptCount?: number;
  attempt?: { id: string; finalizadoEm: string | null } | null;
  canStart: boolean;
};
type ActivityPage = { items: Activity[]; page: number; hasMore: boolean };
const labels = {
  DRAFT: "Rascunhos",
  PUBLISHED: "Publicadas",
  CLOSED: "Encerradas",
  CANCELLED: "Canceladas",
};
function ActivityManager({
  classId,
  archived,
}: {
  classId: string;
  archived: boolean;
}) {
  const [page, setPage] = useState(1),
    [editing, setEditing] = useState<Activity | "new">(),
    [notice, setNotice] = useState("");
  const [detailsId,setDetailsId]=useState('');
  const activities = useResource<ActivityPage>(
    `/atividades?classId=${encodeURIComponent(classId)}&page=${page}`,
  );
  const action = useMutation(activities.reload);
  return (
    <div className="teacher-activity-manager">
      <div className="class-actions">
        <button
          className="primary"
          disabled={archived || Boolean(activities.error) || activities.loading}
          onClick={() => setEditing("new")}
        >
          Criar atividade
        </button>
        {archived && (
          <p role="status">
            Turma arquivada: atividades disponíveis somente para consulta.
          </p>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
      {detailsId&&<AssessmentDetails key={detailsId} id={detailsId} activity section="results" onClose={()=>setDetailsId('')}/>}
      {action.feedback}
      <ResourceState resource={activities} />
      {editing && (
        <ActivityEditor
          key={editing === "new" ? "new" : editing.id}
          classId={classId}
          activity={editing === "new" ? undefined : editing}
          onCancel={() => setEditing(undefined)}
          onSaved={() => {
            setNotice(
              "Atividade salva como rascunho. Publique para disponibilizar aos alunos.",
            );
            setEditing(undefined);
            activities.reload();
          }}
        />
      )}
      {activities.data && (
        <>
          {(Object.keys(labels) as Array<keyof typeof labels>).map((status) => (
            <section key={status} className="activity-status-group">
              <h2>{labels[status]}</h2>
              {!activities.data!.items.some((a) => a.status === status) && (
                <p className="muted">
                  Nenhuma atividade nesta seção da página.
                </p>
              )}
              {activities
                .data!.items.filter((a) => a.status === status)
                .map((a) => (
                  <article className="panel activity-card" key={a.id}>
                    <h3>{a.titulo}</h3>
                    <p className="activity-description">{a.descricao}</p>
                    <p>
                      {a.questionCount} questão(ões) · {a.attemptCount ?? 0}{" "}
                      tentativa(s)
                    </p>
                    <p>{a.enrolledStudents??0} aluno(s) matriculado(s) · {a.deliveryCount??0} entrega(s) concluída(s) · {a.maxPoints} pontos</p>
                    <p>
                      {a.dueAt
                        ? "Prazo para iniciar: " +
                          new Date(a.dueAt).toLocaleString("pt-BR")
                        : "Sem prazo para iniciar"}
                    </p>
                    <div className="class-actions">
                      <button className="outline-button" onClick={()=>setDetailsId(a.id)}>Ver entregas e resultados</button>
                      {!archived && !a.closedAt && !a.cancelledAt && (
                        <>
                          {!a.attemptCount && (
                            <>
                              <button
                                className="outline-button"
                                disabled={action.busy}
                                onClick={() => setEditing(a)}
                              >
                                Editar atividade
                              </button>
                              <button
                                className="outline-button danger"
                                disabled={action.busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Cancelar a atividade “${a.titulo}”?`,
                                    )
                                  )
                                    void action.run(
                                      `/atividades/${a.id}/cancel`,
                                      "POST",
                                    );
                                }}
                              >
                                Cancelar atividade
                              </button>
                            </>
                          )}
                          {a.status === "DRAFT" ? (
                            <button
                              className="primary"
                              disabled={action.busy}
                              onClick={() =>
                                void action.run(
                                  `/atividades/${a.id}/publish`,
                                  "POST",
                                )
                              }
                            >
                              Publicar atividade
                            </button>
                          ) : (
                            <button
                              className="outline-button"
                              disabled={action.busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Encerrar novos inícios? Tentativas já iniciadas e resultados serão preservados.",
                                  )
                                )
                                  void action.run(
                                    `/atividades/${a.id}/close`,
                                    "POST",
                                  );
                              }}
                            >
                              Encerrar novos inícios
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                ))}
            </section>
          ))}
          <Pages
            page={page}
            hasMore={activities.data.hasMore}
            change={setPage}
          />
        </>
      )}
    </div>
  );
}

function ActivityEditor({
  classId,
  activity,
  onSaved,
  onCancel,
}: {
  classId: string;
  activity?: Activity;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(activity?.titulo ?? ""),
    [description, setDescription] = useState(activity?.descricao ?? "");
  const [maxPoints,setMaxPoints]=useState(activity?.maxPoints??10);
  const [due, setDue] = useState(() =>
    activity?.dueAt
      ? new Date(
          new Date(activity.dueAt).getTime() -
            new Date(activity.dueAt).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "",
  );
  const [selected, setSelected] = useState(activity?.questionIds ?? []),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const questions = useResource<{
    items: {
      id: string;
      enunciado: string;
      disciplina: string;
      publica: boolean;
    }[];
    hasMore: boolean;
  }>(
    `/atividades/questions?classId=${encodeURIComponent(classId)}&page=${page}`,
  );
  return (
    <article className="panel activity-editor">
      <h2>{activity ? "Editar atividade" : "Nova atividade"}</h2>
      <p>
        Ao salvar, a atividade ficará como rascunho. Publique explicitamente
        para disponibilizar aos alunos.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !selected.length) return;
          setBusy(true);
          setError("");
          try {
            await apiRequest(
              activity ? `/atividades/${activity.id}` : "/atividades",
              {
                method: activity ? "PUT" : "POST",
                body: JSON.stringify({
                  classId,
                  titulo: title,
                  descricao: description,
                  questaoIds: selected,
                  maxPoints,
                  dueAt: due ? new Date(due).toISOString() : null,
                }),
              },
            );
            onSaved();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Não foi possível salvar a atividade.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Título da atividade
          <input
            autoFocus
            required
            minLength={2}
            maxLength={150}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Descrição
          <textarea
            maxLength={3000}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Pontuação máxima<input aria-label="Pontuação máxima" type="number" min="0.01" max="1000" step="0.01" required value={maxPoints} disabled={busy} onChange={e=>setMaxPoints(Number(e.target.value))}/>
        </label>
        <label>
          Prazo para iniciar (opcional)
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            disabled={busy}
          />
        </label>
        <p className="muted">
          O encerramento e o prazo impedem novos inícios; alunos que já
          iniciaram podem concluir sua tentativa.
        </p>
        <fieldset disabled={busy}>
          <legend>
            Questões autorizadas · {selected.length} selecionada(s)
          </legend>
          <ResourceState resource={questions} />
          {questions.data?.items.map((q) => (
            <label className="activity-question" key={q.id}>
              <input
                type="checkbox"
                checked={selected.includes(q.id)}
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked
                      ? [...old, q.id]
                      : old.filter((id) => id !== q.id),
                  )
                }
              />
              <span>
                <strong>{q.disciplina}</strong> ·{" "}
                {q.publica ? "Acervo global liberado" : "Privada da turma"}
                <span>{q.enunciado}</span>
              </span>
            </label>
          ))}
          {questions.data && !questions.data.items.length && (
            <p>
              Nenhuma questão elegível nesta página. Cadastre questões privadas
              da turma ou utilize o acervo efetivamente revisado e liberado.
            </p>
          )}
          <Pages
            page={page}
            hasMore={questions.data?.hasMore}
            change={setPage}
          />
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="class-actions">
          <button
            type="button"
            className="outline-button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar edição
          </button>
          <button
            className="primary"
            disabled={busy || !selected.length || selected.length > 80}
          >
            {busy ? "Salvando…" : "Salvar rascunho"}
          </button>
        </div>
      </form>
    </article>
  );
}

export function StudentActivities({ classId }: { classId: string }) {
  const [page, setPage] = useState(1),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const activities = useResource<ActivityPage>(
    `/atividades?classId=${encodeURIComponent(classId)}&page=${page}`,
  );
  return (
    <section className="class-detail-activities">
      <h2>Atividades da turma</h2>
      <ResourceState resource={activities} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {activities.data && !activities.data.items.length && (
        <p>Nenhuma atividade publicada nesta turma.</p>
      )}
      {activities.data?.items.map((a) => (
        <article className="panel activity-card" key={a.id}>
          <h3>{a.titulo}</h3>
          <p className="activity-description">{a.descricao}</p>
          <p>
            {a.questionCount} questão(ões) · {labels[a.status]}
          </p>
          {a.dueAt && (
            <p>
              Prazo para iniciar: {new Date(a.dueAt).toLocaleString("pt-BR")}
            </p>
          )}
          <button
            className="primary"
            disabled={Boolean(busy) || (!a.attempt && !a.canStart)}
            onClick={async () => {
              setBusy(a.id);
              setError("");
              try {
                const attempt =
                  a.attempt ??
                  (await apiRequest<{ id: string }>(
                    `/avaliacoes/${a.id}/attempts`,
                    { method: "POST" },
                  ));
                navigate(
                  `/simulados/tentativas/${encodeURIComponent(attempt.id)}`,
                );
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Não foi possível abrir a atividade.",
                );
              } finally {
                setBusy("");
              }
            }}
          >
            {busy === a.id
              ? "Abrindo…"
              : a.attempt?.finalizadoEm
                ? "Ver resultado da atividade"
                : a.attempt
                  ? "Continuar atividade"
                  : a.canStart
                    ? "Iniciar atividade"
                    : "Atividade encerrada"}
          </button>
        </article>
      ))}
      {activities.data && (
        <Pages page={page} hasMore={activities.data.hasMore} change={setPage} />
      )}
    </section>
  );
}
