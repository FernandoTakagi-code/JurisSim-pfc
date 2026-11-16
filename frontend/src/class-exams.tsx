import { useCallback, useEffect, useRef, useState,useSyncExternalStore,type ReactNode } from "react";
import { apiRequest, ApiError } from "./api";
import { navigate } from "./navigation";
import "./class-exams.css";
import { ClassMembershipManager, RemoveStudent, useResource, useMutation,ResourceState } from './administration';
import { IndividualExamLobby } from './individual-exam';
import { Icon } from './ui-icon';
import { StudentActivities } from './teacher-activities';
import {AssessmentDetails} from './assessment-details';

type Page<T> = { items: T[]; page: number; hasMore: boolean; summary?:{drafts:number;published:number;closed:number;archived:number;settingsAvailable?:boolean}; class?:{id:string;nome:string;archivedAt:string|null} };
type Class = {
  id: string;
  nome: string;
  archivedAt: string | null;
  canDelete?: boolean;
  deletionAvailable?: boolean;
  _count: { alunos: number };
  professores?:{id:string;nome:string}[];
};
type Exam = {
  settings?:{expectedQuestions:number;closedAt:string|null;archivedAt:string|null}|null;
  id: string;
  titulo: string;
  descricao: string;
  createdAt?: string;
  duracaoSegundos: number | null;
  publishedAt: string | null;
  autorId?: string;
  participants?: number;
  questoes?: { questaoId: string; posicao: number }[];
  turmas?: { id: string; nome: string; archivedAt: string | null }[];
  _count: { tentativas?: number; questoes?: number };
  tentativas?: { id: string; finalizadoEm: string | null }[];
};
type Question = {
  id: string;
  enunciado: string;
  disciplina: string;
  assunto?:string;
  nivel?:string;
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
  const loadedKey=useRef('');
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const key=`${endpoint}:${page}`;
    if(loadedKey.current!==key)setData(undefined);
    loadedKey.current=key;
    void apiRequest<Page<T>>(`${endpoint}${endpoint.includes('?')?'&':'?'}page=${page}`)
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
          <button type="button" className="outline-button" onClick={retry}>
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
        type="button"
        className="outline-button"
        disabled={page === 1}
        onClick={() => change(page - 1)}
      >
        Anterior
      </button>
      <span>Página {page}</span>
      <button
        type="button"
        className="outline-button"
        disabled={!hasMore}
        onClick={() => change(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}

export function ClassesPage({ teacher,management,onStudentsSelected }: { teacher: boolean;management?:(turma:Class,reload:()=>void)=>ReactNode;onStudentsSelected?:(classId:string)=>void }) {
  const list = usePage<Class>("/turmas");
  const [showCreate,setShowCreate] = useState(()=>new URLSearchParams(window.location.search).get("acao")==="nova");
  const [name, setName] = useState(""),
    [editing, setEditing] = useState<string>(),
    [code, setCode] = useState("");
  const [invite, setInvite] = useState<{
    inviteCode: string;
    expiresAt: string;
    className: string;
  }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [archiving, setArchiving] = useState<string>();
  const [openingClass, setOpeningClass] = useState<string>();
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
            setInvite({ ...await apiRequest<{inviteCode:string;expiresAt:string}>("/turmas", json("POST", { nome: name })), className:name });
          setName("");
          setEditing(undefined);
          setShowCreate(false);
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
      {!teacher && <ClassMembershipManager key={notice} teacher={false} />}
      <p className="muted">
        {teacher
          ? "Gerencie suas turmas e matrículas. Turmas arquivadas permanecem disponíveis para consulta."
          : "Ingresse com o convite fornecido pelo professor para acessar os simulados da turma."}
      </p>
      {teacher && !showCreate && !editing && <button className="primary" onClick={()=>setShowCreate(true)}><Icon name="plus"/>Nova turma</button>}
      {(!teacher || showCreate || editing) && <form className="panel class-form" onSubmit={save}>
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
          autoFocus={teacher}
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
        {teacher && !editing && <button type="button" className="outline-button" onClick={()=>{setShowCreate(false);setName("");}}>Cancelar</button>}
      </form>}
      {invite && teacher && (
        <article className="panel class-invite">
          <h2>Convite gerado</h2>
          <p><strong>Turma: {invite.className}</strong></p>
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
      {!editing && list.data?.items.length === 0 && (
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
          <article className={`panel${teacher ? '' : ' student-class-card'}`} key={turma.id}>
            {teacher ? <h2>{turma.nome}</h2> : <div className="student-class-info">
              <div className="student-class-heading"><h2>{turma.nome}</h2><span className={`student-class-status${turma.archivedAt ? ' is-archived' : ''}`}><span aria-hidden="true" />{turma.archivedAt ? 'Arquivada' : 'Ativa'}</span></div>
              <p className="student-class-enrollment"><strong>{turma._count.alunos}</strong> {turma._count.alunos === 1 ? 'aluno matriculado' : 'alunos matriculados'}</p>
            </div>}
            {!teacher && <button type="button" className="primary class-access-button" aria-label={`Acessar turma ${turma.nome}`} aria-busy={openingClass === turma.id} disabled={Boolean(openingClass)} onClick={() => {
              if (openingClass) return;
              setOpeningClass(turma.id);
              navigate(`/turmas/${encodeURIComponent(turma.id)}`);
            }}>{openingClass === turma.id ? 'Abrindo turma…' : 'Acessar turma'}<Icon name="right" /></button>}
            {management?.(turma,list.reload)}
            {teacher && management && <ClassMembershipManager teacher classId={turma.id} />}
            {teacher && <p className="muted">
              {turma.archivedAt ? "Arquivada" : "Ativa"} · {turma._count.alunos}{" "}
              {turma._count.alunos === 1 ? "aluno matriculado" : "alunos matriculados"}
            </p>}
            {teacher && (
              <div className="class-actions">
                <button
                  className="outline-button"
                  onClick={() =>
                    onStudentsSelected?onStudentsSelected(turma.id):navigate(`/professor/turmas/${turma.id}/alunos`)
                  }
                >
                  Ver alunos
                </button>
                {!management&&<button className="outline-button" onClick={()=>navigate(`/professor/atividades?turma=${encodeURIComponent(turma.id)}`)}>Atividades da turma</button>}
                {!management&&<button className="outline-button" onClick={()=>navigate(`/professor/simulados?turma=${encodeURIComponent(turma.id)}`)}>Simulados da turma</button>}
                {!management && <button className="outline-button" disabled={Boolean(turma.archivedAt)} onClick={() => navigate(`/professor/turmas/${encodeURIComponent(turma.id)}/questoes/nova`)}>Cadastrar questões</button>}
                {!management && <details className="class-more-actions"><summary>Mais ações</summary><div className="class-actions">
                  <button className="outline-button" disabled={Boolean(turma.archivedAt)} onClick={()=>navigate(`/professor/turmas/${turma.id}/alunos?acao=adicionar`)}>Adicionar aluno</button>
                  <button className="outline-button" onClick={()=>navigate(`/professor/turmas/${turma.id}/alunos`)}>Gerenciar matrículas</button>
                  <button className="outline-button" disabled={busy||Boolean(turma.archivedAt)} onClick={()=>{setEditing(turma.id);setName(turma.nome);}}>Editar turma</button>
                  {!turma.archivedAt && <details className="class-invite-actions"><summary>Gerenciar convite</summary><button className="outline-button" disabled={busy} onClick={()=>void action(async()=>setInvite({...await apiRequest<{inviteCode:string;expiresAt:string}>(`/turmas/${turma.id}/invite`,json('POST')),className:turma.nome}),'Novo convite gerado.')}>Gerar novo convite</button><button className="outline-button" disabled={busy} onClick={()=>void action(()=>apiRequest(`/turmas/${turma.id}/invite`,json('DELETE')),'Código desativado.')}>Desativar código</button></details>}
                  <button className="outline-button" disabled={busy||Boolean(turma.archivedAt)} onClick={()=>setArchiving(turma.id)}>Arquivar turma</button>
                  <DeleteClass turma={turma} disabled={busy} onDeleted={text=>{setNotice(text);list.reload();}} />
                </div></details>}
                {management && !turma.archivedAt && (
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
                            setInvite({ ...await apiRequest<{inviteCode:string;expiresAt:string}>(
                                `/turmas/${turma.id}/invite`,
                                json("POST"),
                              ), className:turma.nome }),
                          "Novo convite gerado.",
                        )
                      }
                    >
                      Gerar novo convite
                    </button>
                    <button className="outline-button" disabled={busy} onClick={() => void action(() => apiRequest(`/turmas/${turma.id}/invite`, json('DELETE')), 'Código desativado.')}>Desativar código</button>
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

type StudentClassDetails = {
  page: number; hasMore: boolean;
  id: string; nome: string; createdAt: string; archivedAt: string | null;
  enrollment: { status: string; since: string | null; decidedAt: string | null };
  professors: { id: string; nome: string }[];
  exams: { id: string; titulo: string; descricao: string; duracaoSegundos: number | null; createdAt: string; publishedAt: string;
    questionCount: number; attempt: null | { id: string; startedAt: string; finalizedAt: string | null; status: 'IN_PROGRESS' | 'EXPIRED' | 'COMPLETED';
      result: null | { overallPercentage: number; correctAnswers: number; totalQuestions: number; incorrectAnswers: number; unansweredQuestions: number } } }[];
};

export function StudentClassDetailsPage({ classId }: { classId: string }) {
  const [data, setData] = useState<StudentClassDetails>(), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(''), [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setData(undefined);
    void apiRequest<StudentClassDetails>(`/turmas/${encodeURIComponent(classId)}?page=${page}`)
      .then(result => { if (active) setData(result); })
      .catch(cause => { if (active) setError(message(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [classId, revision, page]);
  const openAttempt = async (examId: string, existingAttemptId?: string) => {
    setBusy(examId); setError('');
    try {
      if (existingAttemptId) {
        navigate(`/simulados/tentativas/${encodeURIComponent(existingAttemptId)}`);
        return;
      }
      const attempt = await apiRequest<{ id: string }>(`/avaliacoes/${encodeURIComponent(examId)}/attempts`, json('POST'));
      navigate(`/simulados/tentativas/${encodeURIComponent(attempt.id)}`);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(''); }
  };
  const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '—';
  const completedCount = data?.exams.filter(exam => exam.attempt?.status === 'COMPLETED').length ?? 0;
  const inProgressCount = data?.exams.filter(exam => exam.attempt?.status === 'IN_PROGRESS').length ?? 0;
  return <section className="page class-exams-page class-detail-page">
    <header className="class-detail-heading">
      <div><p className="gold">MINHAS TURMAS</p><h1>{data?.nome ?? 'Detalhes da turma'}</h1><p className="muted">Consulte as avaliações publicadas para esta turma e acompanhe seu progresso.</p></div>
      <button type="button" className="outline-button" onClick={() => navigate('/turmas')}>← Minhas turmas</button>
    </header>
    <Feedback loading={loading} error={error} retry={() => setRevision(value => value + 1)} />
    {data && <>
      <article className="panel class-detail-summary">
        <div className="class-detail-summary-heading"><div><p className="gold">VISÃO GERAL</p><h2>Informações da turma</h2></div><span className={`class-detail-badge ${data.archivedAt ? 'is-muted' : 'is-active'}`}>{data.archivedAt ? 'Arquivada' : 'Ativa'}</span></div>
        <div className="class-detail-meta">
          <div><span>Matrícula</span><strong>{data.enrollment.status === 'APPROVED' || data.enrollment.status === 'MATRICULADO' ? 'Matriculado' : data.enrollment.status}</strong></div>
          <div><span>Desde</span><strong>{date(data.enrollment.since ?? data.createdAt)}</strong></div>
          <div className="class-detail-professors"><span>Professor responsável</span><strong>{data.professors.length ? data.professors.map(person => person.nome).join(', ') : 'Não informado'}</strong></div>
        </div>
      </article>
      <section className="class-detail-exams" aria-labelledby="class-detail-exams-title">
        <div className="class-detail-section-heading"><div><p className="gold">ATIVIDADES E RESULTADOS</p><h2 id="class-detail-exams-title">Simulados da turma</h2><p className="muted">Atividades publicadas e histórico dos seus resultados nesta página.</p></div><span>{data.exams.length} {data.exams.length === 1 ? 'simulado' : 'simulados'} nesta página</span></div>
        <div className="class-detail-stats" aria-label="Resumo dos simulados"><article><span>Publicados</span><strong>{data.exams.length}</strong></article><article><span>Em andamento</span><strong>{inProgressCount}</strong></article><article><span>Concluídos</span><strong>{completedCount}</strong></article></div>
        {data.exams.length === 0 ? <article className="panel class-detail-empty"><span aria-hidden="true">▤</span><h3>Nenhum simulado publicado</h3><p className="muted">Quando o professor publicar uma avaliação para esta turma, ela aparecerá aqui.</p></article> : <div className="class-detail-exam-list">
          {data.exams.map(exam => <article className="panel class-detail-exam" key={exam.id}>
            <div className="class-detail-exam-header"><div><p className="gold">SIMULADO DA TURMA</p><h3>{exam.titulo}</h3></div><span className={`class-detail-badge ${!exam.attempt ? 'is-ready' : exam.attempt.status === 'COMPLETED' ? 'is-complete' : exam.attempt.status === 'EXPIRED' ? 'is-muted' : 'is-progress'}`}>{!exam.attempt ? 'Disponível' : exam.attempt.status === 'COMPLETED' ? 'Concluído' : exam.attempt.status === 'EXPIRED' ? 'Tempo encerrado' : 'Em andamento'}</span></div>
            {exam.descricao && <p className="class-detail-description">{exam.descricao}</p>}
            <div className="class-detail-exam-meta"><span><b>{exam.questionCount}</b> questões</span><span>{exam.duracaoSegundos ? `${Math.ceil(exam.duracaoSegundos / 60)} min` : 'Sem limite de tempo'}</span><span>Publicado {date(exam.publishedAt)}</span></div>
            {exam.attempt && <div className="class-detail-attempt-info"><p>{exam.attempt.status === 'COMPLETED' ? `Concluído em ${date(exam.attempt.finalizedAt)}` : `Iniciado em ${date(exam.attempt.startedAt)}`}</p>{exam.attempt.result && <strong>{exam.attempt.result.overallPercentage}% <small>· {exam.attempt.result.correctAnswers}/{exam.attempt.result.totalQuestions} acertos · {exam.attempt.result.incorrectAnswers} erros · {exam.attempt.result.unansweredQuestions} sem resposta</small></strong>}</div>}
            <button type="button" className="primary" disabled={!!busy || (!!data.archivedAt && !exam.attempt)} onClick={() => void openAttempt(exam.id, exam.attempt?.id)}>
              {busy === exam.id ? 'Abrindo...' : exam.attempt?.status === 'COMPLETED' ? 'Ver resultado' : exam.attempt ? 'Continuar simulado' : data.archivedAt ? 'Turma arquivada' : 'Iniciar simulado'} <span aria-hidden="true">→</span>
            </button>
          </article>)}
        </div>}
        <Pagination page={page} hasMore={data.hasMore} change={setPage} />
      </section>
      <StudentActivities classId={classId}/>
    </>}
    <button type="button" className="outline-button class-detail-back-bottom" onClick={() => navigate('/turmas')}>Voltar para Minhas Turmas</button>
  </section>;
}

export function ClassStudents(props: { classId?: string;onBack?:()=>void;institutional?:boolean }) {
  return props.institutional ? <ClassStudentsReadOnly {...props} /> : <TeacherClassStudents key={props.classId??'select'} classId={props.classId} />;
}

function TeacherClassStudents({classId}:{classId?:string}) {
  const classes = usePage<Class>('/turmas');
  const [selected,setSelected]=useState(classId??'');
  return <section className="page class-exams-page teacher-enrollments"><p className="gold">MATRÍCULAS</p><h1>Gestão de alunos</h1><p className="muted">Selecione uma turma autorizada para consultar e gerenciar suas matrículas. Contas e históricos são preservados.</p><article className="panel"><label>Turma<select aria-label="Turma para gerenciar matrículas" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecione uma turma</option>{selected&&!classes.data?.items.some(c=>c.id===selected)&&<option value={selected}>Turma selecionada</option>}{classes.data?.items.map(c=><option key={c.id} value={c.id}>{c.nome}{c.archivedAt?' (arquivada)':''}</option>)}</select></label><Feedback loading={classes.loading} error={classes.error} retry={classes.reload}/><Pagination page={classes.page} hasMore={classes.data?.hasMore} change={classes.setPage}/></article>{selected?<TeacherRoster key={selected} classId={selected}/>:<p role="status">Selecione a turma antes de gerenciar alunos.</p>}<button className="outline-button" onClick={()=>navigate('/professor/turmas')}>Voltar às turmas</button></section>;
}

type EnrolledStudent={id:string;nome:string;email:string;turmasComoAluno?:{id:string;nome:string}[]};
function TeacherRoster({classId}:{classId:string}) {
  const roster=usePage<EnrolledStudent>(`/turmas/${encodeURIComponent(classId)}/students`);
  const action=useMutation(()=>{roster.reload();});
  const turma=roster.data?.class;
  return <><Feedback loading={roster.loading} error={roster.error} retry={roster.reload}/>{turma&&<><h2>{turma.nome}</h2>{turma.archivedAt?<p role="status">Turma arquivada. Consulte as matrículas registradas.</p>:<><EnrollmentSearch classId={classId} onChanged={roster.reload}/><ClassMembershipManager teacher classId={classId} requestsOnly /></>}</>}{action.feedback}{roster.data&&<article className="panel"><h2>Alunos matriculados</h2>{!roster.data.items.length&&<p>Nenhum aluno matriculado nesta turma.</p>}<ul className="class-students">{roster.data.items.map(s=><li key={s.id}><div><strong>{s.nome}</strong><span>{s.email}</span><small>Turma: {turma?.nome??s.turmasComoAluno?.find(c=>c.id===classId)?.nome??'Turma selecionada'}</small></div>{turma&&!turma.archivedAt&&<RemoveStudent classId={classId} studentId={s.id} busy={action.busy} remove={()=>action.run(`/turmas/${classId}/students/${s.id}`,'DELETE')}/>}</li>)}</ul><Pagination page={roster.page} hasMore={roster.data.hasMore} change={roster.setPage}/></article>}</>;
}

function EnrollmentSearch({classId,onChanged}:{classId:string;onChanged:()=>void}) {
  const [text,setText]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1);
  const results=useResource<Page<EnrolledStudent&{enrolled:boolean}>>(query?`/turmas/${classId}/student-search?q=${encodeURIComponent(query)}&page=${page}`:null);
  const action=useMutation(()=>{results.reload();onChanged();});
  const searchRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(new URLSearchParams(location.search).get('acao')==='adicionar')searchRef.current?.focus();},[]);
  return <article className="panel enrollment-search"><h2>Adicionar aluno</h2><form className="class-actions" onSubmit={e=>{e.preventDefault();setPage(1);setQuery(text.trim());}}><label>Pesquisar por nome ou e-mail<input ref={searchRef} type="search" minLength={3} maxLength={100} required value={text} onChange={e=>setText(e.target.value)} placeholder="Digite ao menos três caracteres"/></label><button className="primary" disabled={action.busy}>Pesquisar alunos</button></form>{action.feedback}<Feedback loading={Boolean(query)&&results.loading} error={results.error} retry={results.reload}/>{results.data&&<><ul className="class-students">{results.data.items.map(s=><li key={s.id}><div><strong>{s.nome}</strong><span>{s.email}</span></div><button className="outline-button" disabled={action.busy||s.enrolled} onClick={()=>void action.run(`/turmas/${classId}/students`,'POST',{email:s.email})}>{s.enrolled?'Já matriculado':'Adicionar à turma'}</button></li>)}</ul>{!results.data.items.length&&<p>Nenhum aluno confirmado encontrado.</p>}<Pagination page={page} hasMore={results.data.hasMore} change={setPage}/></>}</article>;
}

function DeleteClass({turma,disabled,onDeleted}:{turma:Class;disabled:boolean;onDeleted:(message:string)=>void}) {
  const ref=useRef<HTMLDialogElement>(null),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [notice,setNotice]=useState('');
  return <><button className="outline-button danger" disabled={disabled||!turma.canDelete} title={!turma.deletionAvailable?'Exclusão aguarda a migração segura de ciclo de vida.':!turma.canDelete?'A exclusão exige autoria comprovada e autorização atual.':undefined} onClick={()=>{setName('');setError('');ref.current?.showModal();}}>Excluir turma</button>{!turma.canDelete&&<small>{!turma.deletionAvailable?'Exclusão aguarda atualização segura do banco.':'Exclusão exige comprovação do professor criador.'}</small>}{notice&&<p role="status">{notice}</p>}<dialog className="class-delete-dialog" ref={ref} aria-labelledby={`delete-${turma.id}`} onCancel={e=>{if(busy)e.preventDefault();}}><h2 id={`delete-${turma.id}`}>Excluir turma “{turma.nome}”?</h2><p>A turma sairá da gestão ativa. Se houver matrículas, questões, simulados ou histórico, os registros serão preservados por exclusão lógica. Uma turma comprovadamente vazia poderá ser excluída definitivamente. Contas de alunos não serão excluídas.</p><form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{const result=await apiRequest<{message:string}>(`/turmas/${turma.id}`,json('DELETE',{confirmationName:name}));setNotice(result.message);ref.current?.close();onDeleted(result.message);}catch(cause){setError(message(cause));}finally{setBusy(false);}}}><label>Digite o nome da turma para confirmar<input autoComplete="off" value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label>{error&&<p role="alert" className="error">{error}</p>}<div className="class-actions"><button type="button" className="outline-button" disabled={busy} onClick={()=>ref.current?.close()}>Cancelar</button><button className="outline-button danger" disabled={busy||name!==turma.nome}>{busy?'Excluindo…':'Confirmar exclusão da turma'}</button></div></form></dialog></>;
}

function ClassStudentsReadOnly({ classId,onBack,institutional=false }: { classId?: string;onBack?:()=>void;institutional?:boolean }) {
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
        {institutional ? 'Esta consulta mostra matrículas nas turmas autorizadas da instituição. Ter uma conta cadastrada no JurisSim não significa estar matriculado aqui.' : 'Somente alunos das turmas que você está autorizado a gerenciar.'}
      </p>
      {institutional && <p className="muted">A pesquisa global de contas pertence ao ADMIN geral. Para vincular um aluno já cadastrado e confirmado, abra Turmas e use “Vincular aluno” na turma correspondente, informando o e-mail exato. A autorização será verificada pelo servidor.</p>}
      <Feedback loading={list.loading} error={list.error} retry={list.reload} />
      {list.data && (
        <article className="panel">
          <h2>
            {list.data.items.length ? "Alunos" : "Nenhum aluno matriculado"}
          </h2>
          {institutional && list.data.items.length === 0 && <p>Nenhuma matrícula acessível neste contexto. Isso não informa se a pessoa possui cadastro global. Vá para turmas para consultar as matrículas ou solicitar uma vinculação autorizada.</p>}
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
        onClick={() => onBack?onBack():navigate("/professor/turmas")}
      >
        {institutional ? 'Ir para turmas' : 'Voltar às turmas'}
      </button>
    </section>
  );
}

export function ExamsPage({ teacher, institutional = false, readOnly = false }: { teacher: boolean; institutional?: boolean; readOnly?: boolean }) {
  const query = useSyncExternalStore(
    (listener) => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); },
    () => location.search,
  );
  const selectedClass = teacher ? new URLSearchParams(query).get("turma") : null;
  const premium = teacher;
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState<"ALL" | "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED">("ALL");
  const [classId, setClassId] = useState(selectedClass ?? "");
  const [classPage, setClassPage] = useState(1);
  useEffect(() => setClassId(selectedClass ?? ""), [selectedClass]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [search]);
  const classOptions = useResource<Page<Class>>(premium ? `/turmas?page=${classPage}` : null);
  const listQuery = premium
    ? `/avaliacoes?archived=${status === "ARCHIVED"}&status=${status}${classId ? `&turmaId=${encodeURIComponent(classId)}` : ""}${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ""}`
    : `/avaliacoes?archived=${includeArchived}${selectedClass ? `&turmaId=${encodeURIComponent(selectedClass)}` : ""}`;
  const list = usePage<Exam>(listQuery);
  useEffect(() => { list.setPage(1); }, [classId, status, searchTerm, list.setPage]);
  const [details, setDetails] = useState<{ id: string; section: "summary" | "questions" | "results" }>();
  const management = useMutation(list.reload);
  const [editing, setEditing] = useState<Exam | "new" | undefined>(() => new URLSearchParams(query).get("acao") === "novo" && !readOnly ? "new" : undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const publish = async (exam: Exam) => {
    setBusy(true); setError("");
    try { await apiRequest(`/avaliacoes/${exam.id}/publish`, json("POST")); list.reload(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const start = async (exam: Exam) => {
    setBusy(true); setError("");
    try {
      const result = await apiRequest<{ id: string }>(`/avaliacoes/${exam.id}/attempts`, json("POST"));
      navigate(`/simulados/tentativas/${result.id}`);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const summary = list.data?.summary;
  return (
    <section className={`page class-exams-page${premium ? " teacher-exams-premium" : ""}`}>
      {premium ? (
        <header className="teacher-exams-header">
          <div><p className="gold">{institutional ? "PAINEL INSTITUCIONAL" : "ÁREA DOCENTE"}</p><h1>Simulados</h1><p className="muted">{institutional ? "Organize avaliações, turmas e resultados em um só lugar." : "Crie avaliações para suas turmas e gerencie os simulados de sua autoria."}</p></div>
          {!editing && !readOnly && <button type="button" className="teacher-exams-create" onClick={() => setEditing("new")}><Icon name="plus"/>Criar simulado</button>}
        </header>
      ) : (
        <><p className="gold">SIMULADOS</p><h1>{teacher ? institutional ? "Simulados da instituição" : "Simulados do professor" : "Simulados"}</h1><p className="muted">{teacher ? "Selecione questões autorizadas e publique para suas turmas. Publicados ficam bloqueados para edição." : "Escolha seu simulado individual ou acesse as avaliações das suas turmas."}</p></>
      )}
      {!teacher && <IndividualExamLobby/>}
      {teacher && !premium && <><label className="checkbox-row"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)}/>Incluir simulados arquivados</label>{selectedClass && <p>Simulados da turma selecionada. <button className="outline-button" onClick={() => navigate("/professor/simulados")}>Ver todas as turmas</button></p>}{management.feedback}</>}
      {!teacher && <div className="class-section-heading"><p className="gold">AVALIAÇÕES DE TURMA</p><h2>Simulados das minhas turmas</h2><p className="muted">Somente avaliações publicadas nas turmas em que você está matriculado.</p></div>}
      {teacher && !premium && !readOnly && !editing && <button className="primary" onClick={() => setEditing("new")}>Criar simulado</button>}
      {premium && !editing && <>
        <div className="teacher-exams-stats" aria-label="Resumo dos simulados">
          {([["published", "Publicados"], ["drafts", "Rascunhos"], ["closed", "Encerrados"], ["archived", "Arquivados"]] as const).map(([key, label]) => <article key={key}><span>{label}</span><strong>{typeof summary?.[key] === "number" ? summary[key].toLocaleString("pt-BR") : "—"}</strong></article>)}
        </div>
        <section className="teacher-exams-toolbar" aria-label="Pesquisa e filtros de simulados">
          <label className="teacher-exams-search"><span>Pesquisar simulado</span><div><Icon name="search"/><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome do simulado"/></div></label>
          <label><span>Turma</span><select value={classId} onChange={(event) => { setClassId(event.target.value); list.setPage(1); }}><option value="">Todas as turmas</option>{classOptions.data?.items.map((turma) => <option key={turma.id} value={turma.id}>{turma.nome}{turma.archivedAt ? " · Arquivada" : ""}</option>)}</select></label>
          <label><span>Situação</span><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); list.setPage(1); }}><option value="ALL">Todos</option><option value="DRAFT">Rascunhos</option><option value="PUBLISHED">Publicados</option><option value="CLOSED">Encerrados</option><option value="ARCHIVED">Arquivados</option></select></label>
        </section>
        {(classOptions.data?.hasMore || classPage > 1) && <div className="teacher-class-picker-pages"><span>Opções de turmas · página {classPage}</span><button type="button" className="outline-button" disabled={classPage <= 1} onClick={() => setClassPage((value) => Math.max(1, value - 1))}>Anterior</button><button type="button" className="outline-button" disabled={!classOptions.data?.hasMore} onClick={() => setClassPage((value) => value + 1)}>Mais turmas</button></div>}
        <Feedback loading={classOptions.loading} error={classOptions.error} retry={classOptions.reload}/>
        {classOptions.data && !classOptions.data.items.length && !classOptions.loading && !classOptions.error && <p className="teacher-exams-inline-empty">Nenhuma turma autorizada foi encontrada.</p>}
      </>}
      {editing && teacher && !readOnly && <ExamForm key={editing === "new" ? "new" : editing.id} exam={editing === "new" ? undefined : editing} institutional={institutional} initialClassId={selectedClass ?? undefined} settingsAvailable={list.data?.summary?.settingsAvailable === true} onCancel={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); list.reload(); }}/>}
      {details && teacher && <AssessmentDetails key={details.id + details.section} id={details.id} section={details.section} onClose={() => setDetails(undefined)}/>}
      {error && <p className="error" role="alert">{error}</p>}
      <Feedback loading={list.loading} error={list.error} retry={list.reload}/>
      {!editing && list.data?.items.length === 0 && (premium
        ? <article className="panel teacher-exams-empty"><div className="teacher-exams-empty-icon"><Icon name="file"/></div><h2>{searchTerm || classId || status !== "ALL" ? "Nenhum resultado para estes filtros" : "Nenhum simulado cadastrado"}</h2><p className="muted">{searchTerm || classId || status !== "ALL" ? "Ajuste a pesquisa ou os filtros para ver outros simulados." : "Crie um simulado para acompanhar avaliações e resultados."}</p>{!readOnly && !searchTerm && !classId && status === "ALL" && <button type="button" className="teacher-exams-create" onClick={() => setEditing("new")}><Icon name="plus"/>Criar simulado</button>}</article>
        : <article className="panel"><h2>Nenhum simulado disponível</h2><p className="muted">{teacher ? "Crie uma turma e prepare seu primeiro simulado." : "Os simulados aparecerão após publicação pelo professor para suas turmas ativas."}</p></article>)}
      <div hidden={Boolean(editing)} className={premium ? "teacher-exams-grid" : "class-list"}>
        {list.data?.items.map((exam) => <article className={`panel exam-card${premium ? " teacher-exam-card" : ""}`} key={exam.id}>
          {premium ? <>
            <div className="teacher-exam-title-row"><div><span className="teacher-exam-kicker">AVALIA&Ccedil;&Atilde;O</span><h2>{exam.titulo}</h2></div><span className={`teacher-exam-status is-${exam.settings?.archivedAt ? "archived" : exam.settings?.closedAt ? "closed" : exam.publishedAt ? "published" : "draft"}`}>{exam.settings?.archivedAt ? "Arquivado" : exam.settings?.closedAt ? "Encerrado" : exam.publishedAt ? "Publicado" : "Rascunho"}</span></div>
            <p className="teacher-exam-description" title={exam.descricao}>{exam.descricao || "Sem descrição informada."}</p>
            {institutional && (() => { const declared = /(\d{1,3})\s+quest(?:ões|oes|ão|ao)\b/i.exec(exam.descricao); const actual = exam._count.questoes ?? exam.questoes?.length ?? 0; return declared && Number(declared[1]) !== actual ? <p className="institution-exam-question-mismatch" role="note">A descrição menciona {declared[1]} questões; o cadastro contém {actual}. A quantidade exibida considera os vínculos reais.</p> : null; })()}
            <div className="teacher-exam-class"><Icon name="building"/><span>{exam.turmas?.length ? exam.turmas.map((turma) => turma.nome).join(", ") : "Turma não informada"}</span></div>
            <div className="teacher-exam-metrics">
              <div><Icon name="file"/><span>Quest&otilde;es</span><strong>{exam._count.questoes ?? exam.questoes?.length ?? 0}</strong></div>
              <div><Icon name="chart"/><span>Duração</span><strong>{exam.duracaoSegundos ? `${Math.round(exam.duracaoSegundos / 60)} min` : "Sem limite"}</strong></div>
              <div><Icon name="right"/><span>Tentativas</span><strong>{exam._count.tentativas ?? 0}</strong></div>
              <div><Icon name="users"/><span>Participantes</span><strong>{typeof exam.participants === "number" ? exam.participants : "—"}</strong></div>
            </div>
            <div className="teacher-exam-published-date">{exam.publishedAt ? <><Icon name="file"/><span>Publicado em {new Date(exam.publishedAt).toLocaleDateString("pt-BR")}</span></> : <span>Criado em {exam.createdAt ? new Date(exam.createdAt).toLocaleDateString("pt-BR") : "data indisponível"}</span>}</div>
            {exam.publishedAt && <p className="teacher-exam-lock-note"><Icon name="lock"/>Conte&uacute;do publicado bloqueado para edi&ccedil;&atilde;o.</p>}
            <div className="teacher-exam-actions"><div className="teacher-exam-primary-actions"><button type="button" onClick={() => setDetails({ id: exam.id, section: "summary" })}>Ver detalhes</button><button type="button" onClick={() => setDetails({ id: exam.id, section: "questions" })}>Ver quest&otilde;es</button><button type="button" onClick={() => setDetails({ id: exam.id, section: "results" })}>Ver resultados</button></div>
              {!readOnly && (!exam.publishedAt || (list.data?.summary?.settingsAvailable && (!exam.settings?.closedAt || !exam.settings?.archivedAt))) && <details className="teacher-exam-more"><summary>Mais ações</summary><div className="teacher-exam-more-menu">
                {!exam.publishedAt && <button type="button" disabled={busy} onClick={() => setEditing(exam)}>Editar rascunho</button>}
                {!exam.publishedAt && <button type="button" className="is-danger" disabled={management.busy} onClick={() => { if (window.confirm("Excluir este rascunho? Questões e históricos serão preservados.")) void management.run(`/avaliacoes/${exam.id}`, "DELETE"); }}>Excluir rascunho</button>}
                {exam.publishedAt && list.data?.summary?.settingsAvailable && !exam.settings?.closedAt && <button type="button" disabled={management.busy} onClick={() => { if (window.confirm("Encerrar novos inícios? Tentativas iniciadas e resultados serão preservados.")) void management.run(`/avaliacoes/${exam.id}/close`, "POST"); }}>Encerrar simulado</button>}
                {exam.publishedAt && list.data?.summary?.settingsAvailable && !exam.settings?.archivedAt && <button type="button" className="is-danger" disabled={management.busy} onClick={() => { if (window.confirm("Arquivar este simulado? Registros e resultados serão preservados.")) void management.run(`/avaliacoes/${exam.id}/archive`, "POST"); }}>Arquivar simulado</button>}
                {!exam.publishedAt && <button type="button" disabled={busy} onClick={() => { if (window.confirm("Publicar este simulado para os alunos matriculados?")) void publish(exam); }}>Publicar simulado</button>}
              </div></details>}
            </div>
            {exam.publishedAt && !list.data?.summary?.settingsAvailable && <p className="teacher-exam-lock-note">Encerramento e arquivamento aguardam a estrutura segura de ciclo de vida dos simulados.</p>}
          </> : <>
            <h2>{exam.titulo}</h2><p>{exam.descricao}</p><p className="muted">{exam._count.questoes ?? exam.questoes?.length ?? 0} questões  ? {exam.duracaoSegundos ? `${exam.duracaoSegundos / 60} minutos` : "Sem limite de tempo"} ? {exam.publishedAt ? "Publicado" : "Rascunho"}</p>
            <button className="primary" disabled={busy} onClick={() => void start(exam)}>{exam.tentativas?.[0]?.finalizadoEm ? "Ver resultado" : exam.tentativas?.length ? "Continuar simulado" : "Realizar simulado"}</button>
          </>}
        </article>)}
      </div>
      {list.data && !editing && (list.page>1 || list.data.hasMore) && <Pagination page={list.page} hasMore={list.data.hasMore} change={list.setPage}/>}
    </section>
  );
}

function ExamForm({
  exam,
  institutional = false,
  settingsAvailable = false,
  initialClassId,
  onCancel,
  onSaved,
}: {
  exam?: Exam;
  institutional?: boolean;
  settingsAvailable?: boolean;
  initialClassId?: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const classes = usePage<Class>("/turmas");
  const [step,setStep]=useState(1),[pageSize,setPageSize]=useState(10);
  const [filters,setFilters]=useState({q:'',disciplina:'',assunto:'',nivel:''}),[appliedFilters,setAppliedFilters]=useState(filters);
  const [selectedCatalog,setSelectedCatalog]=useState<Record<string,Question>>({});
  const [previewId,setPreviewId]=useState('');
  const savedId=useRef(exam?.id),publishAfter=useRef(false);
  useEffect(()=>{const timer=setTimeout(()=>{setAppliedFilters(filters);setQuestionPage(1);},250);return()=>clearTimeout(timer);},[filters]);
  useEffect(()=>{if(exam)void apiRequest<{questions:Question[]}>(`/avaliacoes/${exam.id}/details?page=1`).then(data=>setSelectedCatalog(Object.fromEntries(data.questions.map(q=>[q.id,q])))).catch(()=>{});},[exam?.id]);
  const [questions, setQuestions] = useState<Question[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [questionPage,setQuestionPage]=useState(1),[hasMoreQuestions,setHasMoreQuestions]=useState(false),[loadedKey,setLoadedKey]=useState('');
  const [questionFailure,setQuestionFailure]=useState<number|'network'>();
  const [catalog,setCatalog]=useState<{key:string;pages:Record<number,Question[]>;last?:number}>({key:'',pages:{}});
  const [title, setTitle] = useState(exam?.titulo ?? ""),
    [description, setDescription] = useState(exam?.descricao ?? "");
  const [minutes, setMinutes] = useState(
    exam?.duracaoSegundos ? String(exam.duracaoSegundos / 60) : "",
  );
  const [selectedClasses, setSelectedClasses] = useState(
    exam?.turmas?.map((t) => t.id) ?? (initialClassId ? [initialClassId] : []),
  );
  const [classCatalog, setClassCatalog] = useState<Record<string, Class>>({});
  const [responsibleTeacherId, setResponsibleTeacherId] = useState(exam?.autorId ?? "");
  useEffect(() => {
    if (classes.data) setClassCatalog(previous => ({ ...previous, ...Object.fromEntries(classes.data!.items.map(item => [item.id, item])) }));
  }, [classes.data]);
  const [selectedQuestions, setSelectedQuestions] = useState(
    exam?.questoes?.map((q) => q.questaoId) ?? [],
  );
  const [quantity, setQuantity] = useState(exam?.settings?.expectedQuestions ?? exam?.questoes?.length ?? 1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pendingSave=useRef(false);
  const filterQuery=new URLSearchParams(Object.fromEntries(Object.entries(appliedFilters).filter(([,value])=>value.trim()))).toString();
  const classKey=[...selectedClasses].sort().join(','),catalogKey=classKey+'|'+revision+'|'+filterQuery+'|'+pageSize,requestKey=catalogKey+'|'+questionPage;
  const selectedClassRows = selectedClasses.map(id => classCatalog[id]);
  const responsibleTeachers = selectedClassRows.length && selectedClassRows.every(Boolean)
    ? (selectedClassRows[0].professores ?? []).filter(teacher => selectedClassRows.every(row => row.professores?.some(item => item.id === teacher.id)))
    : [];
  useEffect(() => {
    if (responsibleTeacherId && !responsibleTeachers.some(teacher => teacher.id === responsibleTeacherId)) setResponsibleTeacherId("");
  }, [classKey, responsibleTeachers.map(teacher => teacher.id).join(",")]);
  const preview=useResource<{enunciado:string;alternativas:{texto:string;correta:boolean}[]}>(previewId && classKey ? `/avaliacoes/eligible-questions/${previewId}?turmaIds=${encodeURIComponent(classKey)}` : null);
  const previousClasses=useRef(classKey);
  useEffect(()=>{if(previousClasses.current!==classKey){previousClasses.current=classKey;setQuestionPage(1);setSelectedQuestions([]);setSelectedCatalog({});}},[classKey]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setQuestionFailure(undefined);setQuestions([]);
    if(!classKey){setLoading(false);setLoadedKey(requestKey);return;}
    void apiRequest<Page<Question>>(`/avaliacoes/eligible-questions?turmaIds=${encodeURIComponent(classKey)}&page=${questionPage}&pageSize=${pageSize}${filterQuery?'&'+filterQuery:''}`)
      .then((result) => {
        if (active){setQuestions(result.items);setSelectedCatalog(previous=>({...previous,...Object.fromEntries(result.items.map(q=>[q.id,q]))}));setHasMoreQuestions(result.hasMore);setLoadedKey(requestKey);setCatalog(previous=>({key:catalogKey,pages:{...(previous.key===catalogKey?previous.pages:{}),[questionPage]:result.items},last:!result.hasMore?questionPage:previous.key===catalogKey?previous.last:undefined}));}
      })
      .catch((cause) => {
        if (active){setQuestionFailure(cause instanceof ApiError?cause.status:'network');setLoadError(cause instanceof ApiError&&cause.status===403?'Você não tem acesso às questões dessas turmas. Verifique seu vínculo e a instituição selecionada.':cause instanceof ApiError&&cause.status>=500?'Não foi possível consultar o acervo agora. Tente novamente.':message(cause));setLoadedKey(requestKey);}
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision,classKey,questionPage,pageSize,filterQuery]);
  const questionsLoading=!!classKey&&(loading||loadedKey!==requestKey);
  const visibleQuestions=loadedKey===requestKey?questions:[];
  const allPagesKnown=catalog.key===catalogKey&&catalog.last!==undefined&&Array.from({length:catalog.last},(_,i)=>i+1).every(page=>catalog.pages[page]!==undefined);
  const knownQuestions=allPagesKnown?Object.values(catalog.pages).flat():undefined;
  const insufficient=!filterQuery&&knownQuestions!==undefined&&knownQuestions.length<quantity;
  const invalidSelection=false;
  const toggle = (items: string[], id: string) =>
    items.includes(id) ? items.filter((value) => value !== id) : [...items, id];
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if(pendingSave.current)return;
    setError("");
    if (!selectedQuestions.length || selectedQuestions.length > quantity || (publishAfter.current&&selectedQuestions.length!==quantity)) {
      setError("Selecione exatamente a quantidade de questões configurada.");
      return;
    }
    if (!settingsAvailable && !publishAfter.current && selectedQuestions.length !== quantity) {
      setError("Rascunhos com seleção parcial dependem da estrutura segura de ciclo de vida. Selecione a quantidade completa para salvar neste ambiente.");
      return;
    }
    if (!selectedClasses.length) {
      setError("Selecione ao menos uma turma ativa.");
      return;
    }
    if(questionsLoading||loadError||invalidSelection||!Number.isInteger(quantity)||quantity<1||quantity>80)return;
    pendingSave.current=true;
    setBusy(true);
    try {
      const saved=await apiRequest<{id:string}>(
        savedId.current ? `/avaliacoes/${savedId.current}` : "/avaliacoes",
        json(savedId.current ? "PUT" : "POST", {
          titulo: title,
          descricao: description,
          duracaoSegundos: minutes ? Number(minutes) * 60 : null,
          turmaIds: selectedClasses,
          questaoIds: selectedQuestions,
          expectedQuestions:quantity,
          ...(institutional && responsibleTeachers.some(teacher => teacher.id === responsibleTeacherId) ? { responsibleTeacherId } : {}),
        }),
      );
      savedId.current=saved.id;
      if(publishAfter.current)await apiRequest(`/avaliacoes/${saved.id}/publish`,json('POST'));
      onSaved();
    } catch (cause) {
      setError(message(cause));
    } finally {
      pendingSave.current=false;
      setBusy(false);
    }
  };
  return (
    <form className="panel class-form exam-form" onSubmit={save}>
      <h2>{exam ? "Editar rascunho" : "Novo simulado"}</h2>
      <nav className="exam-steps" aria-label="Etapas do simulado">{['Informações gerais','Seleção das turmas','Seleção das questões','Revisão e publicação'].map((label,index)=><button key={label} type="button" className={step===index+1?'primary':'outline-button'} aria-current={step===index+1?'step':undefined} disabled={busy||index+1>step} onClick={()=>setStep(index+1)}>{index+1}. {label}</button>)}</nav>
      <div hidden={step!==1}>
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
      </div>
      <fieldset hidden={step!==2} disabled={busy}>
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
        {institutional && selectedClasses.length > 0 && <label className="exam-responsible-teacher">Professor responsável (opcional)
          <select value={responsibleTeacherId} onChange={event => setResponsibleTeacherId(event.target.value)}>
            <option value="">Responsável institucional</option>
            {responsibleTeachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.nome}</option>)}
          </select>
          <small>Somente professores ativos designados em todas as turmas selecionadas podem ser responsáveis.</small>
        </label>}
      </fieldset>
      <fieldset hidden={step !== 3} disabled={busy}>
        <legend>
          Questões do banco autorizado ({selectedQuestions.length}/{quantity})
        </legend>
        <Feedback
          loading={false}
          error={loadError}
          retry={() => setRevision((value) => value + 1)}
        />
        {questionsLoading&&<p role="status">Carregando questões elegíveis…</p>}
        {classKey&&<button type="button" className="outline-button" disabled={busy||questionsLoading} onClick={()=>{setQuestionPage(1);setRevision(value=>value+1);}}>Atualizar questões</button>}
        {questionFailure&&<p className="muted">{questionFailure===403?'Acesso negado':questionFailure==='network'?'Falha de comunicação':questionFailure>=500?'Falha interna do serviço':'Consulta recusada'}. Nenhuma conclusão sobre a quantidade do acervo foi feita.</p>}
        {!classKey&&<p role="status">Selecione ao menos uma turma ativa para consultar questões elegíveis.</p>}
        <p className="muted">
          Questões privadas vinculadas a uma turma só podem ser publicadas para
          essa mesma turma.
        </p>
        <div className="exam-catalog-filters"><label>Pesquisar questões<input type="search" value={filters.q} onChange={e=>setFilters(old=>({...old,q:e.target.value}))}/></label><label>Disciplina<input value={filters.disciplina} onChange={e=>setFilters(old=>({...old,disciplina:e.target.value}))}/></label><label>Assunto<input value={filters.assunto} onChange={e=>setFilters(old=>({...old,assunto:e.target.value}))}/></label><label>Dificuldade<select value={filters.nivel} onChange={e=>setFilters(old=>({...old,nivel:e.target.value}))}><option value="">Todas</option><option value="BASICO">Básico</option><option value="INTERMEDIARIO">Intermediário</option><option value="AVANCADO">Avançado</option></select></label><label>Questões por página<select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setQuestionPage(1);}}><option value={10}>10</option><option value={20}>20</option></select></label></div>
        <p role="status">{selectedQuestions.length} de {quantity} questões selecionadas{selectedQuestions.length<quantity?` — faltam ${quantity-selectedQuestions.length}`:''}</p>
        <div className="exam-choices exam-question-catalog">
          {visibleQuestions.map((q) => (
            <div key={q.id} className="exam-question-option"><label>
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
            </label><button type="button" className="outline-button" onClick={()=>setPreviewId(q.id)}>Ver alternativas</button></div>
          ))}
        </div>
        {!questionsLoading&&!loadError&&visibleQuestions.length>0&&<p role="status">{visibleQuestions.length} questões elegíveis nesta página. Selecione exatamente {quantity} para o rascunho.</p>}
        {classKey&&!questionsLoading&&!loadError&&knownQuestions?.length===0 && (
          <p className="muted">
            Nenhuma questão elegível para as turmas selecionadas. Consulte o responsável pelo acervo autorizado.
          </p>
        )}
        {classKey&&!questionsLoading&&!loadError&&visibleQuestions.length===0&&!allPagesKnown&&<p>Nenhuma questão elegível nesta página. Consulte as outras páginas disponíveis.</p>}
        {!loadError&&insufficient&&knownQuestions!.length>0&&<p role="status">Questões insuficientes: {knownQuestions!.length} elegíveis para a quantidade {quantity}. Ajuste a quantidade ou a seleção de turmas.</p>}
        {!settingsAvailable && selectedQuestions.length > 0 && selectedQuestions.length < quantity && <p role="status">Neste ambiente, rascunhos precisam conter a quantidade completa de questões. A publicação parcial não é permitida.</p>}
        {invalidSelection&&<p role="alert">Há questões selecionadas que não estão mais elegíveis. Revise a seleção antes de salvar.</p>}
        {classKey&&loadedKey===requestKey&&!loadError&&(questionPage>1||hasMoreQuestions)&&<Pagination page={questionPage} hasMore={hasMoreQuestions} change={setQuestionPage}/>}
      </fieldset>
      {step===3&&previewId&&<article className="panel exam-question-preview"><button type="button" className="outline-button" onClick={()=>setPreviewId('')}>Fechar alternativas</button><ResourceState resource={preview}/>{preview.data&&<><p>{preview.data.enunciado}</p><ol type="A">{preview.data.alternativas.map((a,i)=><li key={i}>{a.texto}{a.correta?' · Correta':''}</li>)}</ol></>}</article>}
      {step===4&&<article className="exam-review"><h3>Revisar simulado</h3><p><strong>{title}</strong></p><p>{description}</p><p>{minutes?minutes+' minutos':'Sem limite de tempo'} · {selectedClasses.length} turma(s)</p><p role="status">{selectedQuestions.length} de {quantity} questões selecionadas{selectedQuestions.length<quantity?` — faltam ${quantity-selectedQuestions.length}`:''}</p><p>{settingsAvailable ? 'Rascunhos incompletos podem ser salvos; a publicação exige a quantidade configurada.' : 'Neste ambiente, selecione a quantidade completa de questões para salvar. Rascunhos parciais dependem da atualização segura do banco.'}</p></article>}
      {step>=3&&<details className="exam-selection-summary" open={step===4}><summary>Resumo das questões selecionadas ({selectedQuestions.length})</summary>{selectedQuestions.map(id=><div key={id}><span>{selectedCatalog[id]?.disciplina??'Questão selecionada'} · {selectedCatalog[id]?.enunciado??'Detalhes disponíveis no catálogo autorizado.'}</span><button type="button" className="outline-button" disabled={busy} onClick={()=>setSelectedQuestions(old=>old.filter(value=>value!==id))}>Remover questão</button></div>)}</details>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="class-actions">
        {step>1&&<button type="button" className="outline-button" disabled={busy} onClick={()=>setStep(old=>old-1)}>Etapa anterior</button>}
        {step<4&&<button type="button" className="primary" disabled={busy||(step===1&&(!title.trim()||title.trim().length<2||!Number.isInteger(quantity)||quantity<1||quantity>80||(minutes!==''&&(!Number.isInteger(Number(minutes))||Number(minutes)<1||Number(minutes)>1440))))||(step===2&&(!selectedClasses.length||classes.loading||Boolean(classes.error)))||(step===3&&(!selectedQuestions.length||selectedQuestions.length>quantity||questionsLoading||Boolean(loadError)))} onClick={()=>setStep(old=>old+1)}>Próxima etapa</button>}
        <button
          type="submit"
          hidden={step!==4}
          onClick={()=>{publishAfter.current=false;}}
          className="primary"
          disabled={
            busy || questionsLoading || !!loadError || classes.loading || !!classes.error || !selectedClasses.length || !selectedQuestions.length || selectedQuestions.length>quantity || (!settingsAvailable && selectedQuestions.length!==quantity) || invalidSelection || !Number.isInteger(quantity) || quantity<1 || quantity>80
          }
        >
          {busy ? "Salvando..." : "Salvar rascunho"}
        </button>
        {step===4&&<button type="submit" className="primary" disabled={busy||questionsLoading||Boolean(loadError)||selectedQuestions.length!==quantity} onClick={()=>{publishAfter.current=true;}}>Salvar e publicar</button>}
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
  kind?: 'ACTIVITY'|'EXAM';
  classId?: string;
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
    points?:number;
    maxPoints?:number;
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
      <p className="gold">{data?.kind==='ACTIVITY'?'ATIVIDADE DA TURMA':'SIMULADO DA TURMA'}</p>
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
              {data.result.points!==undefined&&<p>{data.result.points} de {data.result.maxPoints} pontos</p>}
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
              {busy ? "Salvando..." : data?.kind==='ACTIVITY'?"Finalizar atividade":"Finalizar simulado"}
            </button>
          )}
        </>
      )}
      <button className="outline-button" onClick={() => navigate(data?.kind==='ACTIVITY'&&data.classId?`/turmas/${data.classId}`:"/simulados")}>
        {data?.kind==='ACTIVITY'?'Voltar à turma':'Voltar aos simulados'}
      </button>
    </section>
  );
}
