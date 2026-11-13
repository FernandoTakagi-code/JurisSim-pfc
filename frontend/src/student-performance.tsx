import { useEffect, useState } from "react";
import { apiRequest } from "./api";
import { navigate } from "./navigation";
import "./student-performance.css";

type Counts = {
  assigned: number;
  answered: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  percentage: number | null;
};
type Topic = Counts & {
  discipline: string;
  topic: string;
  provisional: boolean;
  reviewCount: number;
};
type Summary = {
  kind: string;
  totals: Counts & { activities: number };
  modalities: { kind: string; activities: number }[];
  disciplines: (Counts & { discipline: string })[];
  topics: Topic[];
  provisional: boolean;
  reviewEnabled: boolean;
};
const modes = [
  { id: "all", name: "Todas" },
  { id: "diagnostic", name: "Diagnósticos" },
  { id: "practice", name: "Treinos" },
  { id: "individual", name: "Simulados individuais" },
  { id: "class", name: "Simulados de turma" },
  { id: "trail", name: "Trilhas" },
];
const shortName = (s: string) => s.replace(/^Direito (do )?/, "");
const percentage = (n: number | null) =>
  n === null ? "Sem respostas" : `${n.toLocaleString("pt-BR")}%`;
const countLabel = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;
function ReviewButton({ topic }: { topic: Topic }) {
  return topic.reviewCount > 0 &&
    import.meta.env.VITE_QUESTION_REVIEW_UI_ENABLED === "true" ? (
    <button
      className="performance-review"
      onClick={() =>
        navigate(
          `/questoes/revisao?${new URLSearchParams({ disciplina: topic.discipline, assunto: topic.topic })}`,
        )
      }
    >
      Revisar meus erros <span aria-hidden="true">→</span>
    </button>
  ) : null;
}
export function StudentPerformancePage() {
  const [kind, setKind] = useState("all");
  const [discipline, setDiscipline] = useState("all");
  const [topicLimit, setTopicLimit] = useState(8);
  const [data, setData] = useState<Summary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(undefined);
    apiRequest<Summary>(
      `/students/me/performance${kind === "all" ? "" : `?kind=${kind}`}`,
    )
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar seu desempenho.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, refresh]);
  const topics =
    data?.topics.filter(
      (t) => discipline === "all" || t.discipline === discipline,
    ) ?? [];
  const priority = topics.find((t) => t.incorrect > 0);
  return (
    <section
      className="page performance-page"
      aria-labelledby="performance-title"
    >
      <header className="performance-heading">
        <div>
          <p className="gold">SEU APRENDIZADO</p>
          <h1 id="performance-title">Meu desempenho</h1>
          <p>Entenda seus resultados e escolha o próximo foco de estudo.</p>
        </div>
        <button
          className="outline-button"
          disabled={loading}
          onClick={() => setRefresh((n) => n + 1)}
        >
          Atualizar dados
        </button>
      </header>
      <div
        className="performance-modes"
        role="group"
        aria-label="Tipo de atividade"
      >
        {modes.map((mode) => (
          <button
            key={mode.id}
            aria-pressed={kind === mode.id}
            onClick={() => {
              setKind(mode.id);
              setDiscipline("all");
              setTopicLimit(8);
            }}
          >
            {mode.name}
            {data && (
              <span>
                {mode.id === "all"
                  ? data.modalities.reduce((n, m) => n + m.activities, 0)
                  : (data.modalities.find((m) => m.kind === mode.id)
                      ?.activities ?? 0)}
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="performance-method">
        Somente atividades concluídas. Revisões ficam separadas. Os percentuais
        abaixo usam as respostas confirmadas; questões deixadas em branco
        aparecem à parte.
      </p>
      {loading && (
        <div className="performance-state" role="status">
          <h2>Carregando seus resultados…</h2>
          <p>Consultando as atividades concluídas da sua conta.</p>
        </div>
      )}
      {error && (
        <div className="performance-state" role="alert">
          <h2>Não foi possível carregar os resultados</h2>
          <p>{error}</p>
          <button className="primary" onClick={() => setRefresh((n) => n + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {data && !loading && !error && (
        <>
          {data.provisional && (
            <p className="performance-pilot">
              Piloto provisório · Este recorte inclui questões com revisão
              humana pendente. Os indicadores servem para orientar o estudo e
              não representam nota oficial da OAB.
            </p>
          )}
          <div className="performance-stats">
            <article>
              <p>Taxa de acerto</p>
              <strong>{percentage(data.totals.percentage)}</strong>
              <small>
                sobre{" "}
                {countLabel(
                  data.totals.answered,
                  "resposta confirmada",
                  "respostas confirmadas",
                )}
              </small>
            </article>
            <article>
              <p>Acertos</p>
              <strong>{data.totals.correct}</strong>
              <small>respostas corretas</small>
            </article>
            <article>
              <p>Erros</p>
              <strong>{data.totals.incorrect}</strong>
              <small>respostas incorretas</small>
            </article>
            <article>
              <p>Atividades concluídas</p>
              <strong>{data.totals.activities}</strong>
              <small>{data.totals.unanswered} questões em branco</small>
            </article>
          </div>
          {!data.totals.activities ? (
            <div className="performance-state">
              <span className="gold">SEU HISTÓRICO COMEÇA AQUI</span>
              <h2>Nenhuma atividade concluída neste filtro</h2>
              <p>
                Atividades em andamento entram nos indicadores depois da
                entrega. Você pode retomar uma pelo histórico.
              </p>
              <button
                className="primary"
                onClick={() => navigate("/historico")}
              >
                Abrir meu histórico →
              </button>
            </div>
          ) : (
            <>
              <div className="performance-section-heading">
                <div>
                  <h2>Por disciplina</h2>
                  <p>Selecione uma matéria para explorar seus assuntos.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => navigate("/historico")}
                >
                  Ver atividades →
                </button>
              </div>
              <div
                className="performance-disciplines"
                role="group"
                aria-label="Filtrar assuntos por disciplina"
              >
                <button
                  className="performance-discipline-all"
                  aria-pressed={discipline === "all"}
                  onClick={() => {
                    setDiscipline("all");
                    setTopicLimit(8);
                  }}
                >
                  Todas as disciplinas
                </button>
                {data.disciplines.map((d) => (
                  <button
                    key={d.discipline}
                    aria-pressed={discipline === d.discipline}
                    onClick={() => {
                      setDiscipline(d.discipline);
                      setTopicLimit(8);
                    }}
                  >
                    <span>{shortName(d.discipline)}</span>
                    <strong>{percentage(d.percentage)}</strong>
                    <progress
                      max={100}
                      value={d.percentage ?? 0}
                      aria-label={`Acertos em ${d.discipline}`}
                    />
                    <small>
                      {countLabel(d.correct, "acerto", "acertos")} ·{" "}
                      {countLabel(d.incorrect, "erro", "erros")} ·{" "}
                      {countLabel(d.answered, "resposta", "respostas")}
                    </small>
                  </button>
                ))}
              </div>
              {priority ? (
                <article className="performance-priority">
                  <div>
                    <p className="gold">SUGESTÃO DE FOCO</p>
                    <h2>{priority.topic}</h2>
                    <p>
                      {shortName(priority.discipline)} · {priority.incorrect}{" "}
                      {priority.incorrect === 1
                        ? "erro registrado"
                        : "erros registrados"}{" "}
                      neste recorte.
                    </p>
                    <small>
                      Prioridade pelo número de erros, com a taxa de acerto como
                      desempate. É uma orientação baseada no seu histórico.
                    </small>
                  </div>
                  <ReviewButton topic={priority} />
                </article>
              ) : (
                <p className="performance-positive">
                  Não há erros registrados nos assuntos deste recorte. Continue
                  praticando para ampliar seu histórico.
                </p>
              )}
              <div className="performance-section-heading">
                <div>
                  <h2>Assuntos para acompanhar</h2>
                  <p>
                    {discipline === "all" ? "Todas as disciplinas" : discipline}{" "}
                    · maior número de erros primeiro.
                  </p>
                </div>
                <span>
                  {topics.length} {topics.length === 1 ? "assunto" : "assuntos"}
                </span>
              </div>
              <div className="performance-topics">
                {topics.slice(0, topicLimit).map((t) => (
                  <article key={JSON.stringify([t.discipline, t.topic])}>
                    <div className="performance-topic-main">
                      <span>{shortName(t.discipline)}</span>
                      <h3>{t.topic}</h3>
                      <p>
                        {countLabel(t.correct, "acerto", "acertos")} ·{" "}
                        {countLabel(t.incorrect, "erro", "erros")} ·{" "}
                        {t.unanswered} em branco
                      </p>
                      {t.answered < 3 && (
                        <small>
                          Histórico pequeno: menos de 3 respostas neste assunto.
                        </small>
                      )}
                    </div>
                    <div className="performance-topic-result">
                      <strong>{percentage(t.percentage)}</strong>
                      <small>
                        {countLabel(
                          t.answered,
                          "resposta confirmada",
                          "respostas confirmadas",
                        )}
                      </small>
                      <ReviewButton topic={t} />
                    </div>
                  </article>
                ))}
              </div>
              {topics.length > topicLimit && (
                <button
                  className="outline-button performance-more"
                  onClick={() => setTopicLimit((n) => n + 8)}
                >
                  Mostrar mais assuntos ({topics.length - topicLimit})
                </button>
              )}
            </>
          )}
          <footer className="performance-notes">
            <p>
              Uma questão respondida em atividades diferentes conta uma vez em
              cada atividade. O conteúdo usa a cópia salva na tentativa, quando
              disponível.
            </p>
            <p>
              “Revisar meus erros” usa a última resposta de cada questão em
              todas as atividades concluídas, independentemente do filtro desta
              tela. Apenas questões compatíveis e ainda erradas nessa última
              resposta são oferecidas.
            </p>
          </footer>
        </>
      )}
    </section>
  );
}
