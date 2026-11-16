import {useState} from 'react';
import {apiRequest as call} from './api';
import {QUESTION_LETTERS,questionAlternativesError} from '../../backend/src/question-alternatives';
export type Nivel = "BASICO" | "INTERMEDIARIO" | "AVANCADO";
type Alternativa = { id?: string; letra?: string | null; texto: string; correta: boolean };
export type Questao = {
  id: string;
  enunciado: string;
  disciplina: string;
  assunto: string;
  nivel: Nivel;
  fundamentacaoJuridica: string;
  publica: boolean;
  turmaId?: string;
  autorId: string;
  canManage?:boolean;
  createdAt?: string;
  alternativas: Alternativa[];
};
type DadosQuestao = Omit<Questao, "id" | "autorId" | "createdAt" | 'canManage'>;

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


const letra=(index:number)=>String.fromCharCode(65+index);
const alternativasIniciais = (): Alternativa[] => [
  { texto: "", correta: false },
  { texto: "", correta: false },
  { texto: "", correta: false },
  { texto: "", correta: false },
];

export function QuestaoForm({
  questao,
  turma,
  disciplinasExistentes,
  onCancelar,
  onSalva,
  embedded = false,
}: {
  questao?: Questao;
  turma?: { id: string; nome: string };
  disciplinasExistentes: string[];
  onCancelar: () => void;
  onSalva: (questao: Questao) => void;
  embedded?: boolean;
}) {
  const [dados, setDados] = useState<DadosQuestao>(() => ({
    enunciado: questao?.enunciado ?? "",
    disciplina: questao?.disciplina ?? "",
    assunto: questao?.assunto ?? "",
    nivel: questao?.nivel ?? "BASICO",
    fundamentacaoJuridica: questao?.fundamentacaoJuridica ?? "",
    publica: false,
    turmaId: turma?.id ?? questao?.turmaId,
    alternativas: questao ? (() => {
      const existing = [...questao.alternativas];
      if (existing.every(a => a.letra && QUESTION_LETTERS.includes(a.letra as typeof QUESTION_LETTERS[number]))) {
        existing.sort((a, b) => a.letra!.localeCompare(b.letra!));
      }
      const editable = existing.map(({ texto, correta }) => ({ texto, correta: Boolean(correta) }));
      while (editable.length < QUESTION_LETTERS.length) editable.push({ texto: '', correta: false });
      return editable;
    })() : alternativasIniciais(),
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
  const alternativeError = questionAlternativesError(dados.alternativas);
  if (alternativeError) problemas.push(alternativeError);

  const sugestoes = [...new Set([...disciplinasOab, ...disciplinasExistentes])].sort();

  const submit = async () => {
    if (loading) return;
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
      const saved = await call<Questao>(questao ? `/questoes/${questao.id}` : "/questoes", {
        method: questao ? "PUT" : "POST",
        body: JSON.stringify(corpo),
      });
      onSalva(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={embedded ? "activity-inline-question" : "page professor-page"}>
      {!embedded && <p className="gold">{questao ? "EDITAR QUESTÃO" : "CADASTRO DE QUESTÃO"}</p>}
      {embedded ? <h3>Escreva a questão</h3> : <h1>{questao ? "Editar questão" : "Nova questão"}</h1>}
      {turma && !embedded && <h2>Turma: {turma.nome}</h2>}
      <p className="muted">{embedded ? "Preencha o enunciado, as quatro alternativas e marque a resposta correta. A questão será salva para esta turma e adicionada à atividade." : "Questões já usadas em simulados não podem ser editadas nem excluídas, para preservar o histórico dos alunos."}</p>
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
          <legend>Alternativas A–D <small>preencha as quatro e marque uma correta</small></legend>
          {dados.alternativas.length > QUESTION_LETTERS.length && <p role="alert">Esta questão antiga tem mais de quatro alternativas. Remova explicitamente as excedentes e confira o gabarito antes de salvar.</p>}
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
                aria-label={`Texto da alternativa ${letra(index)}`}
                value={alt.texto}
                onChange={(e) => setAlternativas((atual) => atual.map((a, i) => (i === index ? { ...a, texto: e.target.value } : a)))}
              />
              {dados.alternativas.length > QUESTION_LETTERS.length && <button
                type="button"
                className="icon-button"
                aria-label={`Remover alternativa ${letra(index)}`}
                onClick={() => setAlternativas((atual) => {
                  const restantes = atual.filter((_, i) => i !== index);
                  return restantes;
                })}
              >×</button>}
            </div>
          ))}
        </fieldset>
        <p className="muted">Questão privada da turma, disponível somente nas atividades e simulados autorizados. Não será publicada no banco global.</p>
        {tentouSalvar && problemas.length > 0 && (
          <ul className="form-problems">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="outline-button" onClick={onCancelar} disabled={loading}>{embedded ? "Voltar sem adicionar" : "Cancelar"}</button>
          <button type="button" className="primary" disabled={loading} onClick={submit}>
            {loading ? "Salvando..." : questao ? "Salvar alterações" : embedded ? "Salvar questão e adicionar" : "Cadastrar questão"} <b>→</b>
          </button>
        </div>
      </article>
    </section>
  );
}
