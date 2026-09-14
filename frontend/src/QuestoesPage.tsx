import { useEffect, useState } from "react";

const api = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

type Alternativa = { id: string; texto: string; correta?: boolean };
type Questao = {
  id: string;
  enunciado: string;
  disciplina: string;
  assunto: string;
  nivel: "BASICO" | "INTERMEDIARIO" | "AVANCADO";
  fundamentacaoJuridica: string;
  publica: boolean;
  alternativas: Alternativa[];
};

const nivelLabel: Record<string, string> = {
  BASICO: "Básico",
  INTERMEDIARIO: "Intermediário",
  AVANCADO: "Avançado",
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionStorage.getItem("jurissim_token") ?? ""}`,
      ...init?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.erro ?? body.message ?? "Não foi possível concluir a operação.");
  return body as T;
}

export function QuestoesPage({ role }: { role: string | null }) {
  const [questoes, setQuestoes] = useState<Questao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

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
    carregar();
  }, []);

  const podeCriar = role === "PROFESSOR" || role === "ADMIN";

  return (
    <section className="page">
      <p className="gold">BANCO DE QUESTÕES</p>
      <div className="heading">
        <div>
          <h1>Questões cadastradas</h1>
          <p>{questoes.length} questão(ões) disponível(is) para você.</p>
        </div>
        {podeCriar && (
          <button className="primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Fechar" : "Nova questão"} <b>+</b>
          </button>
        )}
      </div>

      {showForm && podeCriar && (
        <NovaQuestaoForm onCriada={() => { setShowForm(false); carregar(); }} />
      )}

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Carregando questões...</p>
      ) : (
        <div className="panel">
          {questoes.length === 0 && <p className="muted">Nenhuma questão cadastrada ainda.</p>}
          {questoes.map((questao) => (
            <article key={questao.id} className="question-item">
              <p className="gold">
                {questao.disciplina} · {questao.assunto} · {nivelLabel[questao.nivel]}
              </p>
              <h3>{questao.enunciado}</h3>
              <ul>
                {questao.alternativas.map((alternativa, index) => (
                  <li key={alternativa.id} className={alternativa.correta ? "correta" : ""}>
                    <b>{String.fromCharCode(65 + index)}</b> {alternativa.texto}
                    {alternativa.correta && <span className="tag">correta</span>}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function NovaQuestaoForm({ onCriada }: { onCriada: () => void }) {
  const [enunciado, setEnunciado] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [assunto, setAssunto] = useState("");
  const [nivel, setNivel] = useState<"BASICO" | "INTERMEDIARIO" | "AVANCADO">("BASICO");
  const [fundamentacaoJuridica, setFundamentacaoJuridica] = useState("");
  const [publica, setPublica] = useState(true);
  const [alternativas, setAlternativas] = useState([
    { texto: "", correta: true },
    { texto: "", correta: false },
    { texto: "", correta: false },
    { texto: "", correta: false },
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const atualizarTexto = (index: number, texto: string) =>
    setAlternativas((atual) => atual.map((a, i) => (i === index ? { ...a, texto } : a)));

  const marcarCorreta = (index: number) =>
    setAlternativas((atual) => atual.map((a, i) => ({ ...a, correta: i === index })));

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      await call("/questoes", {
        method: "POST",
        body: JSON.stringify({ enunciado, disciplina, assunto, nivel, fundamentacaoJuridica, publica, alternativas }),
      });
      onCriada();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <article className="panel new-question-form">
      <h2>Nova questão</h2>
      <label>
        Enunciado
        <textarea value={enunciado} onChange={(e) => setEnunciado(e.target.value)} rows={3} />
      </label>
      <div className="form-row">
        <label>
          Disciplina
          <input value={disciplina} onChange={(e) => setDisciplina(e.target.value)} />
        </label>
        <label>
          Assunto
          <input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Nível
          <select value={nivel} onChange={(e) => setNivel(e.target.value as typeof nivel)}>
            <option value="BASICO">Básico</option>
            <option value="INTERMEDIARIO">Intermediário</option>
            <option value="AVANCADO">Avançado</option>
          </select>
        </label>
        <label>
          Fundamentação jurídica
          <input value={fundamentacaoJuridica} onChange={(e) => setFundamentacaoJuridica(e.target.value)} />
        </label>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={publica} onChange={(e) => setPublica(e.target.checked)} />
        Disponível no banco público (visível para todas as turmas)
      </label>
      <h3>Alternativas</h3>
      {alternativas.map((alt, index) => (
        <div className="alternative-row" key={index}>
          <input type="radio" checked={alt.correta} onChange={() => marcarCorreta(index)} aria-label="Marcar como correta" />
          <input
            placeholder={`Alternativa ${String.fromCharCode(65 + index)}`}
            value={alt.texto}
            onChange={(e) => atualizarTexto(index, e.target.value)}
          />
        </div>
      ))}
      <button className="primary" disabled={loading} onClick={submit}>
        {loading ? "Salvando..." : "Salvar questão"} <b>→</b>
      </button>
      {error && <small className="error">{error}</small>}
    </article>
  );
}