import { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { clampDiagnosticReviewIndex, diagnosticReviewStatus } from '../../backend/src/services/diagnostic-review-navigation';
import './diagnostic-review.css';

type ReviewAlternative = { id: string; letter: 'A' | 'B' | 'C' | 'D' | null; text: string; correct: boolean };
type ReviewQuestion = {
  questionId: string;
  position: number;
  statement: string;
  discipline: string;
  topic: string;
  difficulty: string;
  alternatives: ReviewAlternative[];
  selectedAlternativeId: string | null;
  correct: boolean | null;
  explanation: string | null;
  snapshotAvailable: boolean;
};
type ReviewData = { attemptId: string; total: number; correct: number; incorrect: number; unanswered: number; questions: ReviewQuestion[] };

const letters = ['A', 'B', 'C', 'D'] as const;

export function DiagnosticReview({ attemptId, onBack }: { attemptId: string; onBack: () => void }) {
  const [data, setData] = useState<ReviewData>();
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void apiRequest<ReviewData>(`/diagnostics/${encodeURIComponent(attemptId)}/review`)
      .then(value => { if (active) setData(value); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a correção.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attemptId]);

  if (loading) return <section className="diagnostic-review" aria-busy="true"><p role="status">Carregando correção…</p></section>;
  if (error || !data?.questions.length) return <section className="diagnostic-review"><button className="outline-button" onClick={onBack}>Voltar ao resultado</button><p role="alert">{error || 'A correção não está disponível para esta tentativa.'}</p></section>;

  const question = data.questions[index];
  const status = diagnosticReviewStatus(question);
  const statusLabel = status === 'correct' ? 'Acerto' : status === 'incorrect' ? 'Erro' : 'Não respondida';
  const byLetter = new Map(question.alternatives.map((alternative, alternativeIndex) => [alternative.letter ?? letters[alternativeIndex], alternative]));

  return <section className="diagnostic-review" aria-labelledby="diagnostic-review-title">
    <header className="diagnostic-review-header">
      <div><p className="gold">DIAGNÓSTICO FINALIZADO</p><h1 id="diagnostic-review-title">Correção completa</h1><p>Questões na ordem em que apareceram no diagnóstico.</p></div>
      <button className="outline-button" onClick={onBack}>Voltar ao resultado</button>
    </header>
    <div className="diagnostic-review-summary" aria-label="Resumo da correção">
      <div className="review-summary-correct"><strong>{data.correct}</strong><span>acertos</span></div>
      <div className="review-summary-incorrect"><strong>{data.incorrect}</strong><span>erros</span></div>
      <div className="review-summary-unanswered"><strong>{data.unanswered}</strong><span>não respondidas</span></div>
    </div>
    <nav className="diagnostic-review-nav" aria-label="Navegar entre questões">
      {data.questions.map((item, itemIndex) => <button key={item.questionId} type="button" aria-current={itemIndex === index ? 'step' : undefined}
        className={`review-nav-${item.selectedAlternativeId === null ? 'unanswered' : item.correct ? 'correct' : 'incorrect'}${itemIndex === index ? ' is-current' : ''}`}
        onClick={() => setIndex(itemIndex)} aria-label={`Questão ${item.position}: ${item.selectedAlternativeId === null ? 'não respondida' : item.correct ? 'acerto' : 'erro'}`}>
        {item.position}
      </button>)}
    </nav>
    <article className={`diagnostic-review-question is-${status}`}>
      <div className="diagnostic-review-question-heading"><div><p>{question.discipline} · {question.topic}</p><h2>Questão {question.position} de {data.total}</h2></div><strong className={`review-status is-${status}`}>{statusLabel}</strong></div>
      {!question.snapshotAvailable && <p className="diagnostic-review-legacy-note">Esta tentativa é anterior ao registro de versões. O enunciado, alternativas e gabarito exibidos vêm da versão atualmente associada; o conteúdo original não foi congelado no momento da resposta.</p>}
      <p className="diagnostic-review-statement">{question.statement || 'Enunciado indisponível no registro desta tentativa.'}</p>
      <ul className="diagnostic-review-options" aria-label="Alternativas e correção">
        {letters.map(letter => {
          const alternative = byLetter.get(letter);
          if (!alternative) return <li key={letter} className="review-option is-unavailable"><b>{letter}</b><span>Alternativa não disponível nesta versão.</span></li>;
          const selected = alternative.id === question.selectedAlternativeId;
          return <li key={alternative.id} className={`review-option${selected ? ' is-selected' : ''}${alternative.correct ? ' is-answer' : ''}${selected && !alternative.correct ? ' is-wrong-selection' : ''}`}>
            <b>{letter}</b><span>{alternative.text}</span>
            <small>{selected && alternative.correct ? 'Sua resposta · correta' : selected ? 'Sua resposta · incorreta' : alternative.correct ? 'Resposta correta' : ''}</small>
          </li>;
        })}
      </ul>
      <section className="diagnostic-review-explanation" aria-label="Justificativa e fundamentação jurídica">
        <h3>Justificativa e fundamentação jurídica</h3>
        {question.explanation ? <p>{question.explanation}</p> : <p className="muted">Não há justificativa ou fundamentação registrada para esta questão.</p>}
      </section>
      <footer className="diagnostic-review-controls">
        <button className="outline-button" disabled={index === 0} onClick={() => setIndex(value => clampDiagnosticReviewIndex(value - 1, data.questions.length))}>Questão anterior</button>
        <span aria-live="polite">{index + 1} / {data.total} · {statusLabel}</span>
        <button className="primary" disabled={index === data.questions.length - 1} onClick={() => setIndex(value => clampDiagnosticReviewIndex(value + 1, data.questions.length))}>Próxima questão</button>
      </footer>
    </article>
  </section>;
}
