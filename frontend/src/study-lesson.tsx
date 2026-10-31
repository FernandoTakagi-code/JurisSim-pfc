import { useEffect, useState } from "react";
import type { StudyModule } from "./study-content";
import { activityMetrics, clearReviewAnswer, emptyExerciseProgress, exerciseStorageKey, questionsForReview, recordExerciseAnswer, type ExerciseProgress } from "./study-exercise-progress";
import "./study-lesson.css";

type Status = "Não iniciado" | "Em andamento" | "Concluído";
const statusClass = (status: Status) => status === "Concluído" ? "concluido" : status === "Em andamento" ? "em-andamento" : "nao-iniciado";
function readExerciseState(key: string, exercises: NonNullable<StudyModule["lesson"]>["exercises"]): ExerciseProgress {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved || typeof saved !== "object") return emptyExerciseProgress();
    const valid = new Map(exercises.map(item => [item.id, new Set(item.options.map(option => option.label))]));
    const filterAnswers = (value: unknown) => value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([id, label]) => valid.has(id) && typeof label === "string" && valid.get(id)!.has(label))) : {};
    return { answers: filterAnswers(saved.answers), reviewAnswers: filterAnswers(saved.reviewAnswers) };
  } catch { return emptyExerciseProgress(); }
}

export function StudyLessonView({ module, userId, status, openedSections, onOpenSection, onOpenIndex, onComplete, onQuestions }: {
  module: StudyModule;
  userId: string;
  status: Status;
  openedSections: string[];
  onOpenSection: (sectionId: string, isOpen: boolean) => void;
  onOpenIndex: (sectionId: string) => void;
  onComplete: () => void;
  onQuestions: () => void;
}) {
  const lesson = module.lesson;
  const key = exerciseStorageKey(userId, module.id);
  const [exerciseState, setExerciseState] = useState<ExerciseProgress>(() => readExerciseState(key, lesson?.exercises ?? []));
  const [reviewMode, setReviewMode] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(exerciseState)); } catch { /* Exercise results remain available for this session. */ }
  }, [exerciseState, key]);
  if (!lesson) return null;
  const totalSections = lesson.sections.length + 4;
  const openedCount = openedSections.length;
  const readingPercent = Math.round((openedCount / totalSections) * 100);
  const metrics = activityMetrics(lesson.exercises, exerciseState);
  const displayedExercises = reviewMode ? questionsForReview(lesson.exercises, exerciseState) : lesson.exercises;

  return <div className="study-lesson">
    <div className="study-lesson-status"><span className={`study-status-badge ${statusClass(status)}`}>{status}</span><span>Leitura e autoavaliação são registros separados. Esta tela não comprova domínio do conteúdo.</span></div>

    <nav className="study-lesson-index" aria-label="Índice da aula">
      <h3>Índice da aula</h3>
      <div>{lesson.sections.map((section, index) => <button key={section.id} type="button" onClick={() => onOpenIndex(section.id)}>{String(index + 1).padStart(2, "0")} · {section.title.replace(/^\d+\.\s*/, "")}</button>)}<button type="button" onClick={() => onOpenIndex("resumo")}>Resumo de revisão</button><button type="button" onClick={() => onOpenIndex("revisao")}>Perguntas comentadas</button><button type="button" onClick={() => onOpenIndex("exercicios")}>Exercícios autorais</button><button type="button" onClick={() => onOpenIndex("fontes")}>Fontes oficiais</button></div>
    </nav>

    <section className="study-lesson-reading-progress" aria-label="Progresso de navegação pela aula">
      <div><strong>Seções exploradas</strong><span>{openedCount} de {totalSections} seções abertas</span></div>
      <div className="study-module-progress" role="progressbar" aria-label="Seções abertas nesta navegação, salvas neste navegador" aria-valuemin={0} aria-valuemax={totalSections} aria-valuenow={openedCount}><i style={{ width: `${readingPercent}%` }} /></div>
      <small>Abertura de seção é apenas um indicador de navegação; não confirma leitura nem domínio.</small>
    </section>

    <div className="study-lesson-sections">{lesson.sections.map(section => <details key={section.id} id={`lesson-section-${section.id}`} onToggle={event => onOpenSection(section.id, event.currentTarget.open)}>
      <summary>{section.title}</summary>
      <div className="study-lesson-section-content">
        {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {section.points && <ul>{section.points.map(point => <li key={point}>{point}</li>)}</ul>}
        {section.table && <div className="study-lesson-table-wrap"><table><thead><tr>{section.table.headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{section.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>}
        {section.example && <aside className="study-lesson-example"><strong>{section.example.title}</strong><p><b>Fatos:</b> {section.example.facts}</p><p><b>Análise:</b> {section.example.analysis}</p></aside>}
      </div>
    </details>)}</div>

    <details id="lesson-section-resumo" className="study-lesson-sources" onToggle={event => onOpenSection("resumo", event.currentTarget.open)}><summary>Resumo para revisão rápida</summary><div className="study-lesson-section-content"><ul>{(lesson.summary ?? module.summary).map(item => <li key={item}>{item}</li>)}</ul></div></details>

    <details id="lesson-section-revisao" className="study-review study-lesson-review" onToggle={event => onOpenSection("revisao", event.currentTarget.open)}>
      <summary>Revisão: perguntas autorais comentadas — não são questões oficiais da OAB</summary>
      <div className="study-lesson-section-content"><p className="muted">Formule sua resposta antes de abrir cada pergunta. A solução e o comentário jurídico aparecem ao expandi-la; são material autoral de revisão, não uma avaliação validada de domínio.</p><ol>{lesson.reviewQuestions.map((item, index) => <li key={index}><details><summary>{item.question}<span className="study-reveal-hint">Tentar responder e revelar comentário</span></summary><div><p><strong>Resposta:</strong> {item.answer}</p><p><strong>Comentário:</strong> {item.explanation}</p><p><strong>Fundamento:</strong> {item.basis}</p></div></details></li>)}</ol></div>
    </details>

    <details id="lesson-section-exercicios" className="study-lesson-exercises" onToggle={event => onOpenSection("exercicios", event.currentTarget.open)}>
      <summary>Exercícios autorais de revisão <span>Não são questões oficiais da OAB nem pertencem ao Diagnóstico Inicial.</span></summary>
      <div className="study-lesson-section-content">
        <div className="study-exercise-intro"><p>Responda para ver a correção imediata. Cada alternativa tem um comentário e a fundamentação constitucional. Seu desempenho fica salvo somente neste navegador, separado da leitura e dos resultados oficiais.</p><div className="study-exercise-metrics" aria-live="polite"><span><strong>{metrics.answered}</strong> respondidas</span><span><strong>{metrics.correct}</strong> acertos</span><span><strong>{metrics.incorrect}</strong> erros</span></div></div>
        <div className="study-exercise-controls"><button type="button" className={reviewMode ? "outline-button" : "primary"} disabled={!reviewMode && metrics.reviewable === 0} onClick={() => setReviewMode(value => !value)}>{reviewMode ? "Voltar a todos os exercícios" : `Revisar meus erros (${metrics.reviewable})`}</button>{reviewMode && <span aria-live="polite">{metrics.reviewed} de {metrics.reviewable} questões refeitas · o resultado original foi preservado</span>}</div>
        {reviewMode && metrics.reviewable === 0 ? <p className="study-exercise-empty">Ainda não há erros para revisar. Responda aos exercícios primeiro.</p> : <ol className="study-exercise-list">{displayedExercises.map((item, index) => {
          const chosen = reviewMode ? exerciseState.reviewAnswers[item.id] : exerciseState.answers[item.id];
          const isCorrect = chosen === item.correctLabel;
          return <li key={item.id} className="study-exercise-card"><div className="study-exercise-question"><span>{reviewMode ? "REVISÃO DE ERRO" : `EXERCÍCIO ${String(index + 1).padStart(2, "0")}`}</span><h4>{item.prompt}</h4></div><div className="study-exercise-options" role="group" aria-label={`Alternativas do exercício ${index + 1}`}>{item.options.map(option => {
            const feedbackVisible = Boolean(chosen);
            const correct = option.label === item.correctLabel;
            const selectedOption = option.label === chosen;
            return <div key={option.label} className={`study-exercise-option ${feedbackVisible && correct ? "is-correct" : ""} ${feedbackVisible && selectedOption && !correct ? "is-incorrect" : ""}`}>
              <button type="button" disabled={feedbackVisible} aria-pressed={selectedOption} onClick={() => setExerciseState(current => recordExerciseAnswer(current, item.id, option.label, reviewMode))}><b>{option.label}</b><span>{option.text}</span>{feedbackVisible && <span className="study-exercise-mark">{correct ? "Correta" : selectedOption ? "Sua resposta" : "Incorreta"}</span>}</button>
              {feedbackVisible && <p>{option.explanation}</p>}
            </div>;
          })}</div>{chosen && <div className={`study-exercise-feedback ${isCorrect ? "is-correct" : "is-incorrect"}`} role="status"><strong>{isCorrect ? "Resposta correta" : "Resposta incorreta"}</strong><p>Fundamento: {item.basis}</p>{reviewMode && !isCorrect && <button type="button" className="study-retry-button" onClick={() => setExerciseState(current => clearReviewAnswer(current, item.id))}>Tentar novamente</button>}</div>}</li>;
        })}</ol>}
        <p className="study-practice-note">Esta atividade é independente do Diagnóstico Inicial, de simulados e de avaliações de turma. O histórico local não é enviado ao servidor e não certifica domínio.</p>
      </div>
    </details>

    <details id="lesson-section-fontes" className="study-lesson-sources" onToggle={event => onOpenSection("fontes", event.currentTarget.open)}>
      <summary>Fontes oficiais e referências complementares</summary>
      <div className="study-lesson-section-content"><p>{module.discipline === "Direito Constitucional" ? "Consulte a redação constitucional vigente." : `Confira os textos legislativos vigentes indicados para ${module.discipline}.`} Esta aula está pendente de revisão jurídica e pedagógica.</p><ul className="study-sources">{(lesson.sources ?? module.sources).map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}<span aria-hidden="true"> ↗</span></a></li>)}</ul>{module.discipline === "Direito Constitucional" && <p><a href="https://www25.senado.leg.br/web/atividade/legislacao/constituicao-federal" target="_blank" rel="noreferrer">Senado Federal — Constituição Federal</a></p>}<small>Os links são referências para conferência do texto oficial; não substituem a leitura dos dispositivos aplicáveis.</small></div>
    </details>

    <div className="study-module-actions"><button className="primary" type="button" onClick={onComplete}>{status === "Concluído" ? "Leitura marcada como concluída" : "Marcar leitura como concluída"}</button><button className="outline-button" type="button" onClick={onQuestions}>Ir ao banco de questões</button></div>
    <p className="study-practice-note">A conclusão registra apenas sua declaração de leitura neste navegador. Ela não significa que o conteúdo foi dominado ou validado.</p>
  </div>;
}
