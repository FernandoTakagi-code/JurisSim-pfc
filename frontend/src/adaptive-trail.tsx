import { navigate } from "./navigation";
import { Evolution, ProgressStatus, type useStudentProgress } from "./student-progress";
import { TrailLaunchButton } from "./trail-launch";
import "./adaptive-trail.css";

const levels: Record<string, string> = { BASICO: "Básico", INTERMEDIARIO: "Intermediário", AVANCADO: "Avançado" };

export function AdaptiveTrail({ progress }: { progress: ReturnType<typeof useStudentProgress> }) {
  const available = !progress.loading && !progress.error;
  const result = available && !progress.resultError ? progress.latestResult : undefined;
  const trail = result?.trail;
  const data = available ? progress.data : undefined;
  const attempts = data?.learning?.trailProgress ?? [];
  const diagnosticPath = data?.latestDiagnosticId
    ? `/resultados/${data.latestDiagnosticInitial ? "diagnostico-inicial" : "diagnostico"}/${encodeURIComponent(data.latestDiagnosticId)}`
    : undefined;
  return <section className="page adaptive-trail-page" aria-labelledby="adaptive-trail-title">
    <div className="dashboard-heading">
      <div><p className="gold">SEU PLANO PERSONALIZADO</p><h1 id="adaptive-trail-title">Minha Trilha Adaptativa</h1><p className="muted">Prioridades do diagnóstico, exercícios e resultados registrados na sua conta.</p></div>
      <button className="outline-button" onClick={() => navigate("/estudar")}>Estudar conteúdos</button>
    </div>
    <ProgressStatus loading={progress.loading} error={progress.error} refresh={() => void progress.refreshAcademic()} />
    {progress.resultError && <div role="alert" className="study-notice"><p>Não foi possível carregar a recomendação do diagnóstico: {progress.resultError}</p><button className="outline-button" onClick={() => void progress.refreshAcademic()}>Tentar novamente</button></div>}
    {available && <>
      <article className="panel adaptive-recommendation">
        <p className="gold">{trail ? "RECOMENDAÇÃO DO DIAGNÓSTICO" : "PRÓXIMO PASSO"}</p>
        {trail ? <>
          <h2>{trail.disciplinaPrioritaria}</h2>
          <p>{trail.assuntoPrioritario ?? "Conteúdos gerais da disciplina"}</p>
          <p className="muted">Nível recomendado: {levels[trail.nivelRecomendado] ?? trail.nivelRecomendado} · Até {trail.quantidadeRecomendada} questões, conforme disponibilidade.</p>
          <p>{trail.justificativa || result?.recommendation}</p>
          <TrailLaunchButton trail={trail} />
        </> : <>
          <h2>{progress.resultError ? "Recomendação indisponível" : "Nenhuma recomendação disponível"}</h2>
          <p className="muted">{progress.resultError ? "Tente carregar o resultado novamente. Seu histórico permanece disponível abaixo." : "Conclua um diagnóstico para receber prioridades baseadas nas suas respostas. Você pode estudar os conteúdos enquanto isso."}</p>
          {!progress.resultError && <button className="primary" onClick={() => navigate("/diagnostico-inicial")}>Abrir diagnóstico inicial</button>}
        </>}
        {result && diagnosticPath && <button className="text-button" onClick={() => navigate(diagnosticPath)}>Ver resultado do diagnóstico</button>}
      </article>
      <div className="adaptive-trail-grid">
        <article className="panel">
          <h2>Exercícios da sua trilha</h2>
          {attempts.length ? <ul className="adaptive-attempts">{attempts.map(item => <li key={item.id}>
            <div><h3>{item.discipline}</h3><p className="muted">{item.topic ?? "Conteúdos gerais"}</p><p>{item.answered} de {item.total} respostas registradas · {item.completed ? "Concluída" : "Em andamento"}</p><progress aria-label={`Respostas registradas em ${item.discipline}`} max={Math.max(1, item.total)} value={item.answered} /></div>
            <TrailLaunchButton trail={{ id: item.id }} generated completed={item.completed} />
          </li>)}</ul> : <p className="muted">Nenhuma trilha de exercícios gerada. Use a recomendação acima quando estiver disponível.</p>}
        </article>
        <article className="panel"><h2>Evolução nos diagnósticos</h2><Evolution items={data?.evolution} /><button className="text-button" onClick={() => navigate("/desempenho")}>Ver meu desempenho</button></article>
      </div>
      <div className="adaptive-trail-actions"><button className="outline-button" onClick={() => navigate("/historico")}>Histórico e outras tentativas</button><button className="outline-button" onClick={() => navigate("/metas")}>Acompanhar metas</button></div>
    </>}
    <p className="muted adaptive-storage-note">As respostas e os resultados desta área ficam na sua conta. Leituras e autoavaliações das aulas continuam em Estudar, com progresso salvo neste navegador.</p>
  </section>;
}
