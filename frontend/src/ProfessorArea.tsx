import { useEffect, useMemo, useState } from "react";
import { decodeUserId } from "./jwt";
import { Brand, SettingsModal } from "./shell";

const api = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

type Nivel = "BASICO" | "INTERMEDIARIO" | "AVANCADO";
type Alternativa = { id?: string; texto: string; correta: boolean };
type Questao = {
  id: string;
  enunciado: string;
  disciplina: string;
  assunto: string;
  nivel: Nivel;
  fundamentacaoJuridica: string;
  publica: boolean;
  autorId: string;
  createdAt?: string;
  alternativas: Alternativa[];
};
type DadosQuestao = Omit<Questao, "id" | "autorId" | "createdAt">;
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

// Sugestões para o campo Disciplina (o professor pode digitar outra).
const disciplinasOab = [
  "Direito Administrativo",
  "Direito Civil",
  "Direito Constitucional",
  "Direito do Trabalho",
  "Direito Empresarial",
  "Direito Penal",
  "Direito Processual Civil",
  "Direito Processual Penal",
  "Direito Processual do Trabalho",
  "Direito Tributário",
  "Direitos Humanos",
  "Ética Profissional",
];

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${api}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionStorage.getItem("jurissim_token") ?? ""}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor. Verifique se o backend está rodando.");
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const mensagem = typeof body.erro === "string" ? body.erro : body.message;
    throw new Error(mensagem ?? "Não foi possível concluir a operação.");
  }
  return body as T;
}

const letra = (index: number) => String.fromCharCode(65 + index);

export function ProfessorArea({ nome, email, role, onSair }: { nome: string; email: string; role: string; onSair: () => void }) {
  const userId = decodeUserId(sessionStorage.getItem("jurissim_token") ?? "");
  const [tela, setTela] = useState<Tela>({ nome: "painel" });
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    if (window.location.pathname !== "/professor") window.history.replaceState({}, "", "/professor");
    carregar();
  }, []);

  const podeAlterar = (questao: Questao) => role === "ADMIN" || questao.autorId === userId;
  const minhas = useMemo(() => questoes.filter((q) => q.autorId === userId), [questoes, userId]);

  const irPara = (destino: Tela) => {
    setAviso("");
    setTela(destino);
    window.scrollTo?.(0, 0);
  };

  const aposSalvar = (mensagem: string) => {
    setAviso(mensagem);
    setTela({ nome: "questoes" });
    carregar();
  };

  const primeiroNome = nome.trim().split(/\s+/)[0] || "professor";
  const titulos: Record<Tela["nome"], string> = {
    painel: "Início",
    questoes: "Banco de questões",
    nova: "Nova questão",
    editar: "Editar questão",
  };

  return (
    <div className="shell professor-shell">
      <aside>
        <Brand />
        <p className="area-tag">ÁREA DO PROFESSOR</p>
        <nav>
          <button className={tela.nome === "painel" ? "active" : ""} onClick={() => irPara({ nome: "painel" })}><i>⌂</i>Início</button>
          <button className={tela.nome === "questoes" ? "active" : ""} onClick={() => irPara({ nome: "questoes" })}><i>?</i>Banco de questões</button>
          <button className={tela.nome === "nova" || tela.nome === "editar" ? "active" : ""} onClick={() => irPara({ nome: "nova" })}><i>+</i>Cadastrar questão</button>
          <button disabled title="Em breve"><i>♟</i>Turmas <span className="soon">em breve</span></button>
          <button disabled title="Em breve"><i>▥</i>Desempenho <span className="soon">em breve</span></button>
        </nav>
        <div className="nav-bottom">
          <button onClick={() => setSettingsOpen(true)}><i>⚙</i>Configurações</button>
          <hr />
          <button onClick={onSair}><i>⇥</i>Sair</button>
        </div>
      </aside>
      <main className="content">
        <header>
          <span>{titulos[tela.nome]}</span>
          <b>Olá, prof. {primeiroNome}</b>
        </header>
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
      {settingsOpen && <SettingsModal nome={nome} email={email} role={role} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
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

const alternativasIniciais = (): Alternativa[] => [
  { texto: "", correta: true },
  { texto: "", correta: false },
  { texto: "", correta: false },
  { texto: "", correta: false },
];

function QuestaoForm({
  questao,
  disciplinasExistentes,
  onCancelar,
  onSalva,
}: {
  questao?: Questao;
  disciplinasExistentes: string[];
  onCancelar: () => void;
  onSalva: () => void;
}) {
  const [dados, setDados] = useState<DadosQuestao>(() => ({
    enunciado: questao?.enunciado ?? "",
    disciplina: questao?.disciplina ?? "",
    assunto: questao?.assunto ?? "",
    nivel: questao?.nivel ?? "BASICO",
    fundamentacaoJuridica: questao?.fundamentacaoJuridica ?? "",
    publica: questao?.publica ?? true,
    alternativas: questao?.alternativas.map(({ texto, correta }) => ({ texto, correta: Boolean(correta) })) ?? alternativasIniciais(),
  }));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tentouSalvar, setTentouSalvar] = useState(false);

  const campo = <K extends keyof DadosQuestao>(chave: K, valor: DadosQuestao[K]) =>
    setDados((atual) => ({ ...atual, [chave]: valor }));
  const setAlternativas = (fn: (atual: Alternativa[]) => Alternativa[]) =>
    setDados((atual) => ({ ...atual, alternativas: fn(atual.alternativas) }));

  const problemas: string[] = [];
  if (dados.enunciado.trim().length < 10) problemas.push("O enunciado precisa ter pelo menos 10 caracteres.");
  if (!dados.disciplina.trim()) problemas.push("Informe a disciplina.");
  if (!dados.assunto.trim()) problemas.push("Informe o assunto.");
  if (!dados.fundamentacaoJuridica.trim()) problemas.push("Informe a fundamentação jurídica.");
  if (dados.alternativas.some((a) => !a.texto.trim())) problemas.push("Preencha o texto de todas as alternativas.");
  if (dados.alternativas.filter((a) => a.correta).length !== 1) problemas.push("Marque exatamente uma alternativa correta.");

  const sugestoes = [...new Set([...disciplinasOab, ...disciplinasExistentes])].sort();

  const submit = async () => {
    setTentouSalvar(true);
    if (problemas.length) return;
    setLoading(true);
    setError("");
    const corpo = {
      ...dados,
      enunciado: dados.enunciado.trim(),
      disciplina: dados.disciplina.trim(),
      assunto: dados.assunto.trim(),
      fundamentacaoJuridica: dados.fundamentacaoJuridica.trim(),
      alternativas: dados.alternativas.map((a) => ({ texto: a.texto.trim(), correta: a.correta })),
    };
    try {
      await call(questao ? `/questoes/${questao.id}` : "/questoes", {
        method: questao ? "PUT" : "POST",
        body: JSON.stringify(corpo),
      });
      onSalva();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="page professor-page">
      <p className="gold">{questao ? "EDITAR QUESTÃO" : "CADASTRO DE QUESTÃO"}</p>
      <h1>{questao ? "Editar questão" : "Nova questão"}</h1>
      <p className="muted">Questões já usadas em simulados não podem ser editadas nem excluídas, para preservar o histórico dos alunos.</p>
      <article className="panel question-form">
        <label>
          Enunciado
          <textarea rows={5} value={dados.enunciado} onChange={(e) => campo("enunciado", e.target.value)} placeholder="Ex.: João, servidor público federal, ..." />
        </label>
        <div className="form-row">
          <label>
            Disciplina
            <input list="disciplinas-oab" value={dados.disciplina} onChange={(e) => campo("disciplina", e.target.value)} placeholder="Ex.: Direito Civil" />
            <datalist id="disciplinas-oab">{sugestoes.map((d) => <option key={d} value={d} />)}</datalist>
          </label>
          <label>
            Assunto
            <input value={dados.assunto} onChange={(e) => campo("assunto", e.target.value)} placeholder="Ex.: Contratos" />
          </label>
        </div>
        <div className="form-row">
          <label>
            Nível
            <select value={dados.nivel} onChange={(e) => campo("nivel", e.target.value as Nivel)}>
              <option value="BASICO">Básico</option>
              <option value="INTERMEDIARIO">Intermediário</option>
              <option value="AVANCADO">Avançado</option>
            </select>
          </label>
          <label>
            Fundamentação jurídica
            <input value={dados.fundamentacaoJuridica} onChange={(e) => campo("fundamentacaoJuridica", e.target.value)} placeholder="Ex.: Art. 421 do Código Civil" />
          </label>
        </div>
        <fieldset>
          <legend>Alternativas <small>marque a correta</small></legend>
          {dados.alternativas.map((alt, index) => (
            <div className={`alternative-row${alt.correta ? " is-correct" : ""}`} key={index}>
              <label className="alt-radio" title="Marcar como correta">
                <input
                  type="radio"
                  name="alternativa-correta"
                  checked={alt.correta}
                  onChange={() => setAlternativas((atual) => atual.map((a, i) => ({ ...a, correta: i === index })))}
                  aria-label={`Marcar alternativa ${letra(index)} como correta`}
                />
                <b>{letra(index)}</b>
              </label>
              <textarea
                rows={2}
                placeholder={`Texto da alternativa ${letra(index)}`}
                value={alt.texto}
                onChange={(e) => setAlternativas((atual) => atual.map((a, i) => (i === index ? { ...a, texto: e.target.value } : a)))}
              />
              <button
                type="button"
                className="icon-button"
                disabled={dados.alternativas.length <= 2}
                aria-label={`Remover alternativa ${letra(index)}`}
                onClick={() => setAlternativas((atual) => {
                  const restantes = atual.filter((_, i) => i !== index);
                  return restantes.some((a) => a.correta) ? restantes : restantes.map((a, i) => ({ ...a, correta: i === 0 }));
                })}
              >×</button>
            </div>
          ))}
          {dados.alternativas.length < 5 && (
            <button type="button" className="text-button" onClick={() => setAlternativas((atual) => [...atual, { texto: "", correta: false }])}>
              + Adicionar alternativa
            </button>
          )}
        </fieldset>
        <label className="checkbox-row">
          <input type="checkbox" checked={dados.publica} onChange={(e) => campo("publica", e.target.checked)} />
          Disponível no banco público (usada nos simulados de todos os alunos)
        </label>
        {tentouSalvar && problemas.length > 0 && (
          <ul className="form-problems">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="outline-button" onClick={onCancelar} disabled={loading}>Cancelar</button>
          <button type="button" className="primary" disabled={loading} onClick={submit}>
            {loading ? "Salvando..." : questao ? "Salvar alterações" : "Cadastrar questão"} <b>→</b>
          </button>
        </div>
      </article>
    </section>
  );
}
