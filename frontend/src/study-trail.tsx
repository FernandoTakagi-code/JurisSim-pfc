import { useEffect, useMemo, useState } from "react";
import { navigate } from "./navigation";
import { studyDisciplines, studyModules, type StudyLesson, type StudyModule } from "./study-content";
import { StudyLessonView } from "./study-lesson";
import "./study-trail.css";

type StudyResult = {
  performances?: { tipo: string; disciplina: string; percentual: number }[];
  trail?: { disciplinaPrioritaria: string; assuntoPrioritario: string | null; nivelRecomendado: string } | null;
};
type LearningState = { completed: string[]; inProgress: string[]; openedSections: Record<string, string[]> };
const storageKey = (userId: string) => `jurissim-learning-progress:${encodeURIComponent(userId)}`;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const canonicalDiscipline = (value: string) => studyDisciplines.find(item => normalize(item).includes(normalize(value)) || normalize(value).includes(normalize(item)));
const statusClass = (status: "Não iniciado" | "Em andamento" | "Concluído") => status === "Concluído" ? "concluido" : status === "Em andamento" ? "em-andamento" : "nao-iniciado";

function readState(userId: string): LearningState {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) || "null");
    if (parsed && Array.isArray(parsed.completed)) {
      const known = new Set(studyModules.map(module => module.id));
      const completed = parsed.completed.filter((id: unknown): id is string => typeof id === "string" && known.has(id));
      const inProgress = Array.isArray(parsed.inProgress) ? parsed.inProgress.filter((id: unknown): id is string => typeof id === "string" && known.has(id) && !completed.includes(id)) : [];
      const storedSections = parsed.openedSections && typeof parsed.openedSections === "object" ? parsed.openedSections as Record<string, unknown> : {};
      const openedSections = Object.fromEntries(Object.entries(storedSections).flatMap(([moduleId, ids]) => {
        const module = studyModules.find(item => item.id === moduleId);
        if (!module || !Array.isArray(ids)) return [];
        const validIds = module.lesson ? new Set([...module.lesson.sections.map(section => section.id), "resumo", "revisao", "exercicios", "fontes"]) : null;
        const lessonSectionPrefix = module.discipline !== "Direito Constitucional" ? `${module.id}-topico-` : null;
        const isValidSection = (id: unknown): id is string => {
          if (typeof id !== "string") return false;
          if (validIds?.has(id)) return true;
          if (!lessonSectionPrefix) return false;
          if (["resumo", "revisao", "exercicios", "fontes"].includes(id)) return true;
          const suffix = id.slice(lessonSectionPrefix.length);
          return id.startsWith(lessonSectionPrefix) && /^\d+$/.test(suffix);
        };
        return [[moduleId, ids.filter(isValidSection)]];
      }));
      return { completed, inProgress, openedSections };
    }
  } catch { /* Local progress is optional and never blocks studying. */ }
  return { completed: [], inProgress: [], openedSections: {} };
}

function loadLessonChunk(discipline: string): Promise<Partial<Record<string, StudyLesson>>> {
  if (discipline === "Direito Constitucional") return Promise.resolve({});
  if (discipline === "Direito Civil") return import("./civil-lessons").then(module => module.civilLessons);
  if (discipline === "Direito Penal") return import("./penal-lessons").then(module => module.penalLessons);
  if (discipline === "Direito Administrativo") return import("./administrative-lessons").then(module => module.administrativeLessons);
  return import("./labor-lessons").then(module => module.laborLessons);
}

export function StudyTrail({ userId, result, onQuestions, mode = "trail" }: { userId: string; result?: StudyResult; onQuestions: (discipline: string) => void; mode?: "study" | "trail" }) {
  const [discipline, setDiscipline] = useState<string>(studyDisciplines[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<LearningState>(() => readState(userId));
  const [lazyLessons, setLazyLessons] = useState<Partial<Record<string, StudyLesson>>>({});
  const [lessonLoadError, setLessonLoadError] = useState<string | null>(null);
  const [loadingModuleId, setLoadingModuleId] = useState<string | null>(null);
  const modules = useMemo(() => studyModules.filter(module => module.discipline === discipline), [discipline]);
  const selected: StudyModule | undefined = studyModules.find(module => module.id === selectedId);
  const selectedLesson = selected?.lesson ?? (selected ? lazyLessons[selected.id] : undefined);
  const metrics = result?.performances?.filter(metric => metric.tipo === "DISCIPLINA") ?? [];
  const weakest = metrics.length ? [...metrics].sort((a, b) => a.percentual - b.percentual)[0] : undefined;
  const priorityDiscipline = result?.trail?.disciplinaPrioritaria || weakest?.disciplina;
  const priorityDisciplineCanonical = priorityDiscipline ? canonicalDiscipline(priorityDiscipline) : undefined;
  const priorityModule = result?.trail?.assuntoPrioritario
    ? studyModules.find(module => module.discipline === priorityDisciplineCanonical && normalize(module.title).includes(normalize(result.trail!.assuntoPrioritario!)))
    : undefined;
  const completedCount = progress.completed.length;
  const percent = Math.round((completedCount / studyModules.length) * 100);

  useEffect(() => {
    setProgress(readState(userId));
    setSelectedId(null);
  }, [userId]);
  useEffect(() => {
    try { localStorage.setItem(storageKey(userId), JSON.stringify(progress)); } catch { /* Progress remains usable in this session. */ }
  }, [progress, userId]);
  function chooseDiscipline(value: string) {
    setDiscipline(canonicalDiscipline(value) ?? value);
    setSelectedId(null);
  }
  function statusFor(moduleId: string): "Não iniciado" | "Em andamento" | "Concluído" {
    if (progress.completed.includes(moduleId)) return "Concluído";
    if (progress.inProgress.includes(moduleId)) return "Em andamento";
    return "Não iniciado";
  }
  function openModule(module: StudyModule) {
    if (!progress.completed.includes(module.id)) setProgress(current => ({ ...current, inProgress: current.inProgress.includes(module.id) ? current.inProgress : [...current.inProgress, module.id] }));
    if (!module.lesson && !lazyLessons[module.id]) {
      setLoadingModuleId(module.id);
      setLessonLoadError(null);
      loadLessonChunk(module.discipline).then(lessons => {
        setLazyLessons(current => ({ ...current, ...lessons }));
        setLessonLoadError(null);
        setSelectedId(module.id);
      }).catch(() => {
        setLessonLoadError(module.id);
        setSelectedId(module.id);
      }).finally(() => setLoadingModuleId(null));
      return;
    }
    setSelectedId(module.id);
  }
  function markCompleted(module: StudyModule) {
    setProgress(current => ({ ...current, completed: current.completed.includes(module.id) ? current.completed : [...current.completed, module.id], inProgress: current.inProgress.filter(id => id !== module.id) }));
  }
  function recordSection(module: StudyModule, sectionId: string, isOpen: boolean) {
    if (!isOpen) return;
    setProgress(current => {
      const currentIds = current.openedSections[module.id] ?? [];
      if (currentIds.includes(sectionId)) return current;
      return { ...current, inProgress: current.completed.includes(module.id) || current.inProgress.includes(module.id) ? current.inProgress : [...current.inProgress, module.id], openedSections: { ...current.openedSections, [module.id]: [...currentIds, sectionId] } };
    });
  }
  function openLessonSection(sectionId: string) {
    const element = document.getElementById(`lesson-section-${sectionId}`);
    if (element instanceof HTMLDetailsElement) {
      element.open = true;
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      element.querySelector("summary")?.focus({ preventScroll: true });
    }
  }

  return <section className={`page study-trail-page ${selectedLesson ? "has-interactive-lesson" : ""}`} aria-labelledby="study-trail-title">
    <div className="study-trail-heading">
      <div><p className="gold">{mode === "study" ? "CONTEÚDO DE ESTUDO" : "SUA JORNADA DE APRENDIZAGEM"}</p><h1 id="study-trail-title">{mode === "study" ? "Estudar" : "Minha Trilha de Estudos"}</h1><p className="muted">{mode === "study" ? "Escolha uma disciplina e abra um módulo para estudar explicações, conceitos, exemplos, resumos, revisões e referências legislativas." : "Aprenda os fundamentos, revise e avance no seu ritmo. Esta estrutura inicial não representa cobertura completa do edital da OAB."}</p><div className="study-route-links"><button type="button" className="outline-button" onClick={() => navigate(mode === "study" ? "/trilha" : "/estudar")}>{mode === "study" ? "Abrir Minha Trilha de Estudos" : "Voltar à área Estudar"}</button></div></div>
      <div className="study-progress-card" aria-label={`${completedCount} de ${studyModules.length} leituras marcadas como concluídas`}><span>Leitura concluída</span><strong>{completedCount}<small> / {studyModules.length} módulos</small></strong><div className="study-trail-progress" role="progressbar" aria-label="Leituras marcadas como concluídas" aria-valuemin={0} aria-valuemax={studyModules.length} aria-valuenow={completedCount}><i style={{ width: `${percent}%` }} /></div><small>{percent}% · registro local; não mede domínio</small></div>
    </div>

    {priorityDiscipline ? <aside className="study-adaptive-note" aria-label="Recomendação baseada no diagnóstico existente"><span aria-hidden="true">✦</span><div><strong>Prioridade sugerida pelo seu resultado disponível</strong><p>{priorityDisciplineCanonical ?? priorityDiscipline}{weakest ? ` · ${weakest.percentual}% de acertos no resultado carregado` : ""}{result?.trail?.nivelRecomendado ? ` · nível recomendado: ${result.trail.nivelRecomendado}` : ""}</p><small>O diagnóstico original permanece intacto. A recomendação não altera sua avaliação.</small></div>{priorityDisciplineCanonical && <button className="outline-button" onClick={() => chooseDiscipline(priorityDisciplineCanonical)}>Estudar esta disciplina</button>}</aside> : <aside className="study-adaptive-note study-adaptive-note--initial"><span aria-hidden="true">✦</span><div><strong>Trilha inicial organizada por matéria</strong><p>Não há dados suficientes de diagnóstico carregados para recomendar uma dificuldade. Você pode escolher qualquer disciplina.</p></div></aside>}

    <div className="study-trail-layout">
      <aside className="study-discipline-panel" aria-label="Disciplinas"><p className="gold">DISCIPLINAS</p><div role="list">{studyDisciplines.map((item, index) => {
        const count = studyModules.filter(module => module.discipline === item).length;
        const metric = metrics.find(entry => canonicalDiscipline(entry.disciplina) === item);
        return <button role="listitem" key={item} className={discipline === item ? "active" : ""} disabled={Boolean(loadingModuleId)} aria-pressed={discipline === item} onClick={() => chooseDiscipline(item)}><span className="study-discipline-number">0{index + 1}</span><span className="study-discipline-copy"><strong>{item}</strong><small>{count} módulos{metric ? ` · ${metric.percentual}% no diagnóstico` : ""}</small></span><span aria-hidden="true">›</span></button>;
      })}</div></aside>

      <div className="study-module-area">
        {selected ? <article className="study-module-detail"><button className="study-back-link" onClick={() => setSelectedId(null)}>← Voltar aos módulos de {discipline}</button><p className="gold">{selected.discipline.toLocaleUpperCase("pt-BR")} · MÓDULO DE ESTUDO</p><h2>{selected.title}</h2>
          <div className="study-draft-banner" role="note"><strong>Rascunho educativo · revisão jurídica e pedagógica pendente</strong><span>Material introdutório original. Ainda não foi validado como material jurídico ou pedagógico; confira a legislação vigente.</span></div>
          {selected.discipline !== "Direito Constitucional" && !selectedLesson ? lessonLoadError === selected.id ? <div role="alert" className="study-lesson-load-error"><p>Não foi possível carregar esta aula agora.</p><button type="button" className="outline-button" disabled={loadingModuleId === selected.id} onClick={() => openModule(selected)}>{loadingModuleId === selected.id ? "Carregando aula…" : "Tentar novamente"}</button></div> : <p className="study-lesson-loading" role="status" aria-live="polite">Carregando aula…</p> : selectedLesson ? <StudyLessonView key={`${userId}:${selected.id}`} module={selected.lesson ? selected : { ...selected, lesson: selectedLesson }} userId={userId} status={statusFor(selected.id)} openedSections={progress.openedSections[selected.id] ?? []} onOpenSection={(sectionId, isOpen) => recordSection(selected, sectionId, isOpen)} onOpenIndex={openLessonSection} onComplete={() => markCompleted(selected)} onQuestions={() => onQuestions(selected.discipline)} /> : <>
            <section><h3>Objetivos de aprendizagem</h3><ul>{selected.objectives.map(item => <li key={item}>{item}</li>)}</ul></section>
            <section><h3>Entenda o conteúdo</h3>{selected.theory.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>
            <section><h3>Conceitos fundamentais</h3><ul className="study-concepts">{selected.concepts.map(item => <li key={item}>{item}</li>)}</ul></section>
            <section className="study-example"><h3>Exemplo de aplicação</h3><p>{selected.example}</p></section>
            <section><h3>Resumo para revisão</h3><ul>{selected.summary.map(item => <li key={item}>{item}</li>)}</ul></section>
            <details className="study-review"><summary>Revisar: perguntas para testar sua compreensão</summary><ol>{selected.review.map(item => <li key={item}>{item}</li>)}</ol><p className="muted">Responda com suas palavras e volte aos conceitos se precisar. São perguntas autorais de revisão, não questões oficiais da OAB.</p></details>
            <section><h3>Fontes legislativas</h3><p className="muted">Textos oficiais para conferência. A legislação pode ser alterada após a preparação deste rascunho.</p><ul className="study-sources">{selected.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}<span aria-hidden="true"> ↗</span></a></li>)}</ul></section>
            <div className="study-module-actions"><button className="primary" onClick={() => markCompleted(selected)}>{progress.completed.includes(selected.id) ? "Leitura marcada como concluída" : "Marcar leitura como concluída"}</button><button className="outline-button" onClick={() => onQuestions(selected.discipline)}>Ir ao banco de questões</button></div><p className="study-practice-note">A prática usa somente o acervo elegível disponível. Questões não são inventadas para completar o conteúdo.</p>
          </>}
        </article> : <>
          <div className="study-module-heading"><div><p className="gold">{discipline.toLocaleUpperCase("pt-BR")}</p><h2>Escolha um módulo</h2><p className="muted">Estude a teoria, revise os conceitos e registre seu avanço.</p></div><span className="study-module-count">{modules.filter(module => progress.completed.includes(module.id)).length}/{modules.length} leituras concluídas</span></div>
          <div className="study-module-list">{modules.map((module, index) => {
            const done = progress.completed.includes(module.id);
            const priority = module.id === priorityModule?.id || (!priorityModule && priorityDiscipline === module.discipline && index === 0);
            const status = statusFor(module.id);
        return <button key={module.id} className={`study-module-card ${done ? "is-done" : ""}`} disabled={Boolean(loadingModuleId)} aria-busy={loadingModuleId === module.id} onClick={() => openModule(module)}><span className="study-module-card-index">{done ? "✓" : String(index + 1).padStart(2, "0")}</span><span className="study-module-card-copy"><span className="study-module-label">{priority ? "PRIORIDADE DO DIAGNÓSTICO" : "MÓDULO DE APRENDIZAGEM"}</span><strong>{module.title}</strong><small>{loadingModuleId === module.id ? "Carregando aula…" : module.objectives[0]}</small></span><span className={`study-status-badge ${statusClass(status)}`}>{status}</span><span className="study-module-arrow" aria-hidden="true">→</span></button>;
          })}</div>
          <div className="study-questions-cta"><div><strong>Pronto para praticar?</strong><p>Abra a área de questões. Questões não são inventadas para completar o conteúdo.</p></div><button className="outline-button" onClick={() => onQuestions(discipline)}>Acessar questões</button></div>
        </>}
      </div>
    </div>
    <p className="study-scope-note">Escopo inicial de estudo · 27 módulos em 5 disciplinas. Todo o conteúdo teórico está identificado como rascunho e precisa de revisão especializada.</p>
  </section>;
}
