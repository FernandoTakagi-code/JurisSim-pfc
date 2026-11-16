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
import {QuestaoForm} from './question-form';

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
        <p>Monte uma lista de exercícios para a turma, escolha a pontuação e defina um prazo opcional.</p>
        <p className="muted">Atividades não têm cronômetro. Para uma avaliação com tempo de duração, use Simulados.</p>
      </header>
      <article className="panel">
        <h2>Escolha a turma</h2>
        <ResourceState resource={resource} />
        {resource.data && (
          <>
            <label>
              Turma de trabalho
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
                <option value="">Selecione uma turma</option>
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
            {(page > 1 || resource.data.hasMore) && <Pages
              page={page}
              hasMore={resource.data.hasMore}
              change={setPage}
            />}
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
                  `/professor/desempenho/turmas/${encodeURIComponent(turma.id)}`,
                )
              }
            >
              <Icon name="chart" />
              Desempenho da turma
            </button>
          </div>
        )}
      </article>
      {!turma && !resource.loading && !resource.error && <article className="teacher-empty-state"><span className="teacher-empty-icon"><Icon name="book"/></span><h2>Uma turma, todas as atividades</h2><p>Selecione a turma acima para criar uma atividade com questões, pontuação e prazo opcional ou consultar as entregas.</p></article>}
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
  const [statusFilter,setStatusFilter] = useState<Activity["status"]|"ALL">("ALL");
  const [detailsId,setDetailsId]=useState('');
  const activities = useResource<ActivityPage>(
    `/atividades?classId=${encodeURIComponent(classId)}&page=${page}`,
  );
  const action = useMutation(()=>{setNotice("");activities.reload();});
  return (
    <div className="teacher-activity-manager">
      <div className="class-actions teacher-section-heading"><div><h2>Atividades da turma</h2><p>Salve um rascunho, revise e publique quando estiver pronto.</p></div>
        <button
          className="primary"
          hidden={Boolean(editing)}
          disabled={archived || Boolean(activities.error) || activities.loading}
          onClick={() => setEditing("new")}
        >
          Criar atividade
        </button>
        {archived && (
          <p role="status">
            Turma arquivada. Consulte as atividades registradas.
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
      {activities.data && !editing && (
        <>
          <div className="teacher-status-filters" role="group" aria-label="Situação das atividades">{(['ALL',...Object.keys(labels)] as const).map(status=><button key={status} aria-pressed={statusFilter===status} onClick={()=>setStatusFilter(status as Activity['status']|'ALL')}>{status==='ALL'?'Todas':labels[status as keyof typeof labels]}</button>)}</div>
          {!activities.data.items.some(a=>statusFilter==='ALL'||a.status===statusFilter)&&<article className="teacher-empty-state"><span className="teacher-empty-icon"><Icon name="book"/></span><h3>{statusFilter==='ALL'?'Sua turma ainda não tem atividades nesta página':'Nenhuma atividade neste filtro'}</h3><p>{statusFilter==='ALL'?'Comece em Criar atividade. Você poderá revisar antes de publicar.':'Escolha outra situação para consultar as atividades desta página.'}</p></article>}
          {(Object.keys(labels) as Array<keyof typeof labels>).filter(status=>(statusFilter==='ALL'||status===statusFilter)&&activities.data!.items.some(a=>a.status===status)).map((status) => (
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
                    <span className="teacher-state-badge">{({DRAFT:"Rascunho",PUBLISHED:"Publicada",CLOSED:"Encerrada",CANCELLED:"Cancelada"})[a.status]}</span><h3>{a.titulo}</h3>
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
          {(page > 1 || activities.data.hasMore) && <Pages
            page={page}
            hasMore={activities.data.hasMore}
            change={setPage}
          />}
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
  const [questionSearch,setQuestionSearch] = useState("");
  const [writingQuestion,setWritingQuestion] = useState(false);
  type QuestionOption = {id:string;enunciado:string;disciplina:string;publica:boolean;pilot?:boolean};
  const [createdQuestions,setCreatedQuestions] = useState<QuestionOption[]>([]);
  const [questionNotice,setQuestionNotice] = useState("");
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
      pilot?: boolean;
    }[];
    hasMore: boolean;
  }>(
    `/atividades/questions?classId=${encodeURIComponent(classId)}&page=${page}`,
  );
  const options = [...new Map([...createdQuestions,...(questions.data?.items??[])].map(q=>[q.id,q])).values()];
  const matching = options.filter(q=>!questionSearch.trim()||`${q.enunciado} ${q.disciplina}`.toLocaleLowerCase('pt-BR').includes(questionSearch.trim().toLocaleLowerCase('pt-BR')));
  return (
    <article className="panel activity-editor">
      <h2>{activity ? "Editar atividade" : "Nova atividade"}</h2>
      <p>
        Dê um nome à lista, adicione as questões e salve. Você poderá revisar o rascunho antes de publicar para a turma.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || writingQuestion || !selected.length || selected.length > 80) return;
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
        <h3 className="activity-step">1. Informações da atividade</h3>
        <label>
          Título da atividade
          <input
            autoFocus
            required
            minLength={2}
            maxLength={150}
            value={title}
            placeholder="Ex.: Exercícios de revisão — atos administrativos"
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Orientações para os alunos (opcional)
          <textarea
            maxLength={3000}
            rows={4}
            value={description}
            placeholder="Explique o objetivo e o que os alunos devem fazer."
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
          Sem prazo, os alunos podem iniciar enquanto a atividade estiver aberta. O prazo limita novos inícios; quem já começou pode concluir.
        </p>
        <fieldset className="activity-question-picker" disabled={busy}>
          <legend>2. Questões da atividade <span className="teacher-state-badge">{selected.length} de 80 selecionadas</span></legend>
          <p>Escolha questões já cadastradas ou escreva uma nova aqui. Cada questão terá quatro alternativas e uma resposta correta.</p>
          <div className="activity-question-actions">
            <button type="button" className={!writingQuestion ? "primary" : "outline-button"} aria-pressed={!writingQuestion} onClick={()=>setWritingQuestion(false)}>Escolher questões</button>
            <button type="button" className={writingQuestion ? "primary" : "outline-button"} aria-pressed={writingQuestion} onClick={()=>{setWritingQuestion(true);setQuestionNotice("");}}>Escrever nova questão</button>
            {!writingQuestion && <button type="button" className="outline-button" disabled={questions.loading} onClick={questions.reload}>Atualizar banco</button>}
          </div>
          {questionNotice && <p className="recovery-notice" role="status">{questionNotice}</p>}
          {writingQuestion ? <QuestaoForm embedded turma={{id:classId,nome:"Turma desta atividade"}} disciplinasExistentes={options.map(q=>q.disciplina)}
            onCancelar={()=>setWritingQuestion(false)}
            onSalva={question=>{
              setCreatedQuestions(old=>[question,...old.filter(q=>q.id!==question.id)]);
              setSelected(old=>[...new Set([...old,question.id])]);
              setQuestionSearch("");setWritingQuestion(false);
              setQuestionNotice("Questão salva para a turma e adicionada à atividade. Você pode adicionar outras ou salvar o rascunho.");
              questions.reload();
            }}/>:<>
            <ResourceState resource={questions}/>
            {options.some(q=>q.pilot) && <p className="activity-pilot-notice" role="note">Acervo piloto disponível: estas questões ainda aguardam revisão humana. As atividades que as utilizarem serão identificadas como piloto, com gabarito e resultados provisórios.</p>}
            {options.length>0 && <label className="activity-question-search">Buscar questões já cadastradas nesta página<input type="search" value={questionSearch} onChange={e=>setQuestionSearch(e.target.value)} placeholder="Digite parte do enunciado ou o nome da disciplina"/><small>A busca filtra a lista abaixo. Para cadastrar, use Escrever nova questão.</small></label>}
            <div className="activity-question-list">
              {matching.map(q=><label className={"activity-question"+(selected.includes(q.id)?" is-selected":"")} key={q.id}>
                <input type="checkbox" checked={selected.includes(q.id)} disabled={!selected.includes(q.id)&&selected.length>=80} onChange={e=>setSelected(old=>e.target.checked?[...new Set([...old,q.id])]:old.filter(id=>id!==q.id))}/>
                <span><strong>{q.disciplina}</strong> · {q.pilot?"Piloto · em revisão":q.publica?"Banco revisado":"Questão da turma"}<span>{q.enunciado}</span></span>
              </label>)}
            </div>
            {options.length>0 && !matching.length && <div className="activity-question-empty" role="status"><p>Nenhuma questão encontrada nesta página.</p><button type="button" className="outline-button" onClick={()=>setQuestionSearch("")}>Limpar busca</button></div>}
            {questions.data && !options.length && !questions.loading && !questions.error && <div className="activity-question-empty">
              <Icon name="book"/><h3>Vamos adicionar a primeira questão?</h3><p>Esta página ainda não tem questões disponíveis. Escreva uma questão para esta turma, com enunciado, alternativas e gabarito.</p>
              <button type="button" className="primary" onClick={()=>setWritingQuestion(true)}>Escrever a primeira questão</button>
              <details><summary>Por que não aparecem questões do banco global?</summary><p>As questões globais precisam estar revisadas e liberadas para uso em atividades. Questões privadas da turma também podem ser utilizadas.</p></details>
            </div>}
            {(page>1||questions.data?.hasMore) && <Pages page={page} hasMore={questions.data?.hasMore} change={next=>{setPage(next);setQuestionSearch("");}}/>}
          </>}
        </fieldset>
        <div className="activity-review" role="status"><h3>3. Revisar e salvar</h3><p>{selected.length ? selected.length+" questão(ões) selecionada(s) · "+maxPoints+" pontos no total" : "Adicione pelo menos uma questão para salvar a atividade."}</p><p>Salvar não publica: os alunos só terão acesso depois que você clicar em Publicar.</p></div>
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
            disabled={busy || writingQuestion || !selected.length || selected.length > 80}
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
