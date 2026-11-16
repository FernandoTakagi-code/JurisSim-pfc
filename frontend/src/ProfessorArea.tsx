import { apiRequest } from './api';
import { useResource, ResourceState, Pages } from './administration';
import { useEffect, useMemo, useState } from "react";

import { navigate, usePath } from "./navigation";
import { ClassesPage, ExamsPage, ClassStudents } from "./class-exams";
import { TeacherReports, StudentClassReport } from "./goals-reports";
import {QuestaoForm,type Nivel,type Questao} from './question-form';


type Tela =
  | { nome: "painel" }
  | { nome: "questoes" }
  | { nome: "nova" }
  | { nome: "editar"; questao: Questao };

const nivelLabel: Record<Nivel, string> = {
  BASICO: "Básico",
  INTERMEDIARIO: "Intermediário",
  AVANCADO: "Avançado",
};

const call = apiRequest;

const letra = (index: number) => String.fromCharCode(65 + index);

export function ProfessorArea({ userId, nome, email, role, onSair }: { userId: string; nome: string; email: string; role: string; onSair: () => void }) {
  const path = usePath();
  const classCreation = /^\/professor\/turmas\/([^/]+)\/questoes\/nova$/.exec(path)?.[1];

  const [questoes, setQuestoes] = useState<Questao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const carregar = async () => {
    setLoading(true);
    setError("");
    try {
      setQuestoes(await call<Questao[]>("/questoes"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!classCreation && path !== '/professor/questoes/nova') carregar();
  }, [classCreation,path]);

  useEffect(() => {
    if (!path.startsWith("/professor")) navigate("/professor", true);
  }, [path]);
  const editId = /^\/professor\/questoes\/([^/]+)\/editar$/.exec(path)?.[1];
  const editQuestion = questoes.find(question => question.id === editId);
  const tela: Tela = path === "/professor/questoes/nova" ? { nome: "nova" }
    : editQuestion ? { nome: "editar", questao: editQuestion }
    : path === "/professor/questoes" ? { nome: "questoes" } : { nome: "painel" };

  const podeAlterar = (questao: Questao) => questao.autorId === userId && questao.canManage===true;
  const minhas = useMemo(() => questoes.filter((q) => q.autorId === userId), [questoes, userId]);

  const irPara = (destino: Tela) => {
    setAviso("");
    navigate(destino.nome === "painel" ? "/professor" : destino.nome === "nova" ? "/professor/questoes/nova" : destino.nome === "editar" ? `/professor/questoes/${destino.questao.id}/editar` : "/professor/questoes");
    window.scrollTo?.(0, 0);
  };

  const aposSalvar = (mensagem: string) => {
    setAviso(mensagem);
    navigate("/professor/questoes");
    carregar();
  };

  const primeiroNome = nome.trim().split(/\s+/)[0] || "professor";
  const titulos: Record<Tela["nome"], string> = {
    painel: "Início",
    questoes: "Banco de questões",
    nova: "Nova questão",
    editar: "Editar questão",
  };

  const individualReport = /^\/professor\/relatorios\/turmas\/([^/]+)\/alunos\/([^/]+)$/.exec(path);
  if (classCreation) return <ClassQuestionCreation key={classCreation} classId={classCreation} />;
  if (path === '/professor/questoes/nova') return <QuestionClassPicker />;
  const reportRoute = /^\/professor\/(relatorios|desempenho)(?:\/turmas\/([^/]+))?$/.exec(path);
  if (individualReport) return <StudentClassReport key={individualReport[1] + individualReport[2]} classId={individualReport[1]} studentId={individualReport[2]} />;
  if (reportRoute) return <TeacherReports classId={reportRoute[2]} mode={reportRoute[1] === "desempenho" ? "performance" : "reports"} />;
  const rosterRoute = /^\/professor\/turmas\/([^/]+)\/alunos$/.exec(path);
  if (path === "/professor/turmas") return <ClassesPage teacher />;
  if (path === "/professor/simulados") return <ExamsPage teacher />;
  if (path === "/professor/alunos") return <ClassStudents />;
  if (rosterRoute) return <ClassStudents classId={rosterRoute[1]} />;

  if (editId && (!editQuestion || !podeAlterar(editQuestion))) return <section className="page"><h1>{loading ? "Carregando questão..." : "Questão indisponível para edição"}</h1><p className="muted">{error || "A edição exige autoria e gestão atual da turma, verificadas também pelo backend."}</p><button onClick={() => navigate("/professor/questoes")}>Voltar ao banco de questões</button></section>;

  return (
    <div className="shell professor-shell">
      <main className="content">
        {tela.nome === "painel" && (
          <Painel
            questoes={questoes}
            minhas={minhas}
            loading={loading}
            error={error}
            onNova={() => irPara({ nome: "nova" })}
            onVerBanco={() => irPara({ nome: "questoes" })}
            onEditar={(questao) => irPara({ nome: "editar", questao })}
          />
        )}
        {tela.nome === "questoes" && (
          <BancoQuestoes
            questoes={questoes}
            loading={loading}
            error={error}
            aviso={aviso}
            userId={userId}
            podeAlterar={podeAlterar}
            onNova={() => irPara({ nome: "nova" })}
            onEditar={(questao) => irPara({ nome: "editar", questao })}
            onExcluida={() => { setAviso("Questão excluída."); carregar(); }}
          />
        )}
        {tela.nome === "nova" && (
          <QuestaoForm
            key="nova"
            disciplinasExistentes={questoes.map((q) => q.disciplina)}
            onCancelar={() => irPara({ nome: "questoes" })}
            onSalva={() => aposSalvar("Questão cadastrada com sucesso.")}
          />
        )}
        {tela.nome === "editar" && (
          <QuestaoForm
            key={tela.questao.id}
            questao={tela.questao}
            disciplinasExistentes={questoes.map((q) => q.disciplina)}
            onCancelar={() => irPara({ nome: "questoes" })}
            onSalva={() => aposSalvar("Questão atualizada com sucesso.")}
          />
        )}
      </main>

    </div>
  );
}

function QuestionClassPicker() {
  const [page,setPage] = useState(1);
  const classes = useResource<{items:{id:string;nome:string;archivedAt?:string|null}[];hasMore:boolean}>(`/turmas?page=${page}`);
  const active = classes.data?.items.filter(turma=>!turma.archivedAt) ?? [];
  return <section className="page"><p className="teacher-eyebrow">Nova questão · primeiro passo</p><h1>Escolha a turma da questão</h1><p>As novas questões são privadas da turma. Você poderá usá-las nas atividades e nos simulados dessa mesma turma.</p><ResourceState resource={classes}/><div className="teacher-class-choices">{active.map(turma=><button key={turma.id} onClick={()=>navigate(`/professor/turmas/${encodeURIComponent(turma.id)}/questoes/nova`)}><strong>{turma.nome}</strong><span>Cadastrar questão nesta turma →</span></button>)}</div>{classes.data && !active.length && <article className="teacher-empty-state"><h2>Nenhuma turma ativa nesta página</h2><p>Consulte as outras páginas ou crie uma turma antes de cadastrar a questão.</p><button onClick={()=>navigate('/professor/turmas?acao=nova')}>Nova turma</button></article>}{classes.data && (page>1||classes.data.hasMore) && <Pages page={page} hasMore={classes.data.hasMore} change={setPage}/>}<button className="outline-button" onClick={()=>navigate('/professor/questoes')}>Voltar ao banco de questões</button></section>;
}

function Painel({
  questoes,
  minhas,
  loading,
  error,
  onNova,
  onVerBanco,
  onEditar,
}: {
  questoes: Questao[];
  minhas: Questao[];
  loading: boolean;
  error: string;
  onNova: () => void;
  onVerBanco: () => void;
  onEditar: (questao: Questao) => void;
}) {
  const porNivel = (["BASICO", "INTERMEDIARIO", "AVANCADO"] as Nivel[]).map((nivel) => ({
    nivel,
    total: minhas.filter((q) => q.nivel === nivel).length,
  }));
  const porDisciplina = Object.entries(
    minhas.reduce<Record<string, number>>((acc, q) => ({ ...acc, [q.disciplina]: (acc[q.disciplina] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const maxDisciplina = Math.max(1, ...porDisciplina.map(([, total]) => total));
  const privadas = minhas.filter((q) => !q.publica).length;

  return (
    <section className="page dashboard-page">
      <div className="dashboard-heading">
        <div>
          <p className="gold">JURISSIM · PROFESSOR</p>
          <h1>Seu painel</h1>
          <p className="muted">Cadastre questões e acompanhe o banco que seus alunos vão resolver.</p>
        </div>
        <button className="primary" onClick={onNova}>Cadastrar questão <b>+</b></button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="dashboard-stats">
        <article><span>Questões criadas por você</span><strong>{loading ? "…" : minhas.length}</strong><small>{privadas} privada(s)</small></article>
        <article><span>Questões no banco</span><strong>{loading ? "…" : questoes.length}</strong><small>Visíveis para você</small></article>
        <article><span>Disciplinas cobertas</span><strong>{loading ? "…" : porDisciplina.length}</strong><small>Nas suas questões</small></article>
      </div>
      <div className="dashboard-grid">
        <article className="panel dashboard-panel">
          <div className="dashboard-panel-heading">
            <div><p className="gold">POR DISCIPLINA</p><h2>Suas questões</h2></div>
            <button className="text-button" onClick={onVerBanco}>Ver banco</button>
          </div>
          {porDisciplina.length ? porDisciplina.map(([disciplina, total]) => (
            <div className="metric" key={disciplina}>
              <span>{disciplina}</span>
              <div><i style={{ width: `${(total / maxDisciplina) * 100}%` }} /></div>
              <b>{total}</b>
            </div>
          )) : <p className="empty-dashboard">Você ainda não cadastrou questões. Comece pela primeira!</p>}
        </article>
        <article className="panel dashboard-panel">
          <div className="dashboard-panel-heading"><div><p className="gold">POR NÍVEL</p><h2>Dificuldade</h2></div></div>
          {porNivel.map(({ nivel, total }) => (
            <div className="metric" key={nivel}>
              <span>{nivelLabel[nivel]}</span>
              <div><i style={{ width: `${minhas.length ? (total / minhas.length) * 100 : 0}%` }} /></div>
              <b>{total}</b>
            </div>
          ))}
        </article>
        <article className="panel dashboard-panel dashboard-activity">
          <div className="dashboard-panel-heading"><div><p className="gold">RECENTES</p><h2>Últimas questões cadastradas</h2></div></div>
          {minhas.length === 0 && <p className="empty-dashboard">Nenhuma questão sua ainda.</p>}
          {minhas.slice(0, 5).map((q) => (
            <button key={q.id} className="recent-question" onClick={() => onEditar(q)}>
              <span className="gold">{q.disciplina} · {nivelLabel[q.nivel]}</span>
              <strong>{q.enunciado}</strong>
            </button>
          ))}
        </article>
      </div>
    </section>
  );
}

function BancoQuestoes({
  questoes,
  loading,
  error,
  aviso,
  userId,
  podeAlterar,
  onNova,
  onEditar,
  onExcluida,
}: {
  questoes: Questao[];
  loading: boolean;
  error: string;
  aviso: string;
  userId: string | null;
  podeAlterar: (questao: Questao) => boolean;
  onNova: () => void;
  onEditar: (questao: Questao) => void;
  onExcluida: () => void;
}) {
  const [aba, setAba] = useState<"minhas" | "todas">("minhas");
  const [busca, setBusca] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [nivel, setNivel] = useState<"" | Nivel>("");
  const [aberta, setAberta] = useState<string>();
  const [confirmando, setConfirmando] = useState<string>();
  const [excluindo, setExcluindo] = useState(false);
  const [erroAcao, setErroAcao] = useState("");

  const disciplinas = [...new Set(questoes.map((q) => q.disciplina))].sort();
  const termo = busca.trim().toLowerCase();
  const visiveis = questoes.filter((q) =>
    (aba === "todas" || q.autorId === userId) &&
    (!disciplina || q.disciplina === disciplina) &&
    (!nivel || q.nivel === nivel) &&
    (!termo || `${q.enunciado} ${q.assunto} ${q.fundamentacaoJuridica}`.toLowerCase().includes(termo)),
  );

  const excluir = async (id: string) => {
    setExcluindo(true);
    setErroAcao("");
    try {
      await call(`/questoes/${id}`, { method: "DELETE" });
      setConfirmando(undefined);
      onExcluida();
    } catch (cause) {
      setErroAcao(cause instanceof Error ? cause.message : "Erro inesperado.");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <section className="page professor-page">
      <div className="heading">
        <div>
          <p className="gold">BANCO DE QUESTÕES</p>
          <h1>Questões</h1>
          <p>{visiveis.length} questão(ões) encontrada(s).</p>
        </div>
        <button className="primary" onClick={onNova}>Nova questão <b>+</b></button>
      </div>
      {aviso && <p className="recovery-notice" role="status">{aviso}</p>}
      {error && <p className="error">{error}</p>}
      <div className="question-toolbar">
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={aba === "minhas"} className={aba === "minhas" ? "active" : ""} onClick={() => setAba("minhas")}>Minhas questões</button>
          <button role="tab" aria-selected={aba === "todas"} className={aba === "todas" ? "active" : ""} onClick={() => setAba("todas")}>Banco completo</button>
        </div>
        <input type="search" placeholder="Buscar no enunciado, assunto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)} aria-label="Filtrar por disciplina">
          <option value="">Todas as disciplinas</option>
          {disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={nivel} onChange={(e) => setNivel(e.target.value as "" | Nivel)} aria-label="Filtrar por nível">
          <option value="">Todos os níveis</option>
          <option value="BASICO">Básico</option>
          <option value="INTERMEDIARIO">Intermediário</option>
          <option value="AVANCADO">Avançado</option>
        </select>
      </div>
      {loading ? <p className="muted">Carregando questões...</p> : (
        <div className="question-list">
          {visiveis.length === 0 && (
            <div className="panel empty-state">
              <p>{aba === "minhas" && !termo && !disciplina && !nivel ? "Você ainda não cadastrou nenhuma questão." : "Nenhuma questão corresponde aos filtros."}</p>
              {aba === "minhas" && <button className="primary" onClick={onNova}>Cadastrar a primeira <b>+</b></button>}
            </div>
          )}
          {visiveis.map((q) => {
            const expandida = aberta === q.id;
            return (
              <article key={q.id} className="panel question-card">
                <div className="question-card-top">
                  <p className="gold">{q.disciplina} · {q.assunto}</p>
                  <div className="badges">
                    <span className={`badge nivel-${q.nivel.toLowerCase()}`}>{nivelLabel[q.nivel]}</span>
                    <span className="badge">{q.publica ? "Pública" : "Privada"}</span>
                    {q.autorId === userId && <span className="badge mine">Sua</span>}
                  </div>
                </div>
                <h3 className={expandida ? "" : "clamp"}>{q.enunciado}</h3>
                {expandida && (
                  <>
                    <ul className="alt-list">
                      {q.alternativas.map((a, i) => (
                        <li key={a.id ?? i} className={a.correta ? "correta" : ""}>
                          <b>{letra(i)}</b> {a.texto}
                          {a.correta && <span className="tag">correta</span>}
                        </li>
                      ))}
                    </ul>
                    <p className="fundamentacao"><b>Fundamentação:</b> {q.fundamentacaoJuridica}</p>
                  </>
                )}
                <footer className="question-card-actions">
                  <button className="text-button" onClick={() => setAberta(expandida ? undefined : q.id)}>
                    {expandida ? "Recolher" : "Ver alternativas"}
                  </button>
                  {podeAlterar(q) && confirmando !== q.id && (
                    <span>
                      <button className="outline-button" onClick={() => onEditar(q)}>Editar</button>
                      <button className="outline-button danger" onClick={() => { setErroAcao(""); setConfirmando(q.id); }}>Excluir</button>
                    </span>
                  )}
                  {confirmando === q.id && (
                    <span className="confirm-delete">
                      Excluir esta questão?
                      <button className="outline-button danger" disabled={excluindo} onClick={() => excluir(q.id)}>{excluindo ? "Excluindo..." : "Sim, excluir"}</button>
                      <button className="outline-button" disabled={excluindo} onClick={() => setConfirmando(undefined)}>Cancelar</button>
                    </span>
                  )}
                </footer>
                {confirmando === q.id && erroAcao && <small className="error">{erroAcao}</small>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ClassQuestionCreation({ classId }: { classId: string }) {
  const [turma, setTurma] = useState<{ id: string; nome: string }>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [sequence, setSequence] = useState(0);
  useEffect(() => {
    let active = true;
    call<{ id: string; nome: string }>(`/questoes/turmas/${encodeURIComponent(classId)}/contexto`)
      .then(data => { if (active) setTurma(data); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a turma.'); });
    return () => { active = false; };
  }, [classId]);
  if (!turma) return <section className="page professor-page"><h1>Cadastrar questões da turma</h1><p role={error ? 'alert' : 'status'}>{error || 'Verificando autorização da turma…'}</p><button onClick={() => navigate('/professor/turmas')}>Voltar para turmas</button></section>;
  if (saved) return <section className="page professor-page"><h1>{turma.nome}</h1><article className="panel"><h2 role="status">Questão cadastrada com sucesso</h2><p>A questão foi vinculada exclusivamente a esta turma.</p><div className="form-actions"><button className="primary" onClick={() => { setSequence(n => n + 1); setSaved(false); }}>Cadastrar outra questão</button><button className="outline-button" onClick={() => navigate('/professor/turmas')}>Voltar para turmas</button></div></article></section>;
  return <QuestaoForm key={sequence} turma={turma} disciplinasExistentes={[]} onCancelar={() => navigate('/professor/turmas')} onSalva={() => setSaved(true)} />;
}
