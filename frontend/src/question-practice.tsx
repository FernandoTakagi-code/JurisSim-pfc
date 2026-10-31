import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from './api';
import { navigate } from './navigation';

type Option = { id: string; letter: string; text: string };
type Question = { id: string; position: number; statement: string; discipline: string; topic: string; level: string; selectedOptionId: string | null; alternatives: Option[] };
type Attempt = { id: string; state: 'IN_PROGRESS' | 'COMPLETED'; discipline: string; topic: string | null; questions: Question[] };
type Result = { total: number; correct: number; incorrect: number; percentage: number; consistency: number | null; recommendation: string; answers: { questionId: string; statement: string; discipline: string; selectedOptionId: string | null; correctOptionId: string | null; correct: boolean; explanation: string; alternatives: Option[] }[] };
const disciplines = ['Direito Constitucional', 'Direito Civil', 'Direito Penal', 'Direito Administrativo', 'Direito do Trabalho'];
const quantities = [5, 10, 20] as const;
const featureEnabled = import.meta.env.VITE_QUESTION_PRACTICE_UI_ENABLED === 'true';

export function QuestionPracticePage({ attemptId, initialDiscipline }: { attemptId?: string; initialDiscipline?: string }) {
  const [discipline, setDiscipline] = useState(() => disciplines.includes(initialDiscipline ?? "") ? initialDiscipline! : disciplines[0]);
  const [quantity, setQuantity] = useState<number>(5);
  const [topic, setTopic] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ correct: boolean; explanation: string; answeredCount: number; totalQuestions: number; consistency: number | null; recommendation: string }>();
  const [attempt, setAttempt] = useState<Attempt>();
  const [result, setResult] = useState<Result>();
  const [index, setIndex] = useState(0);
  const [selection, setSelection] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!attemptId && initialDiscipline && disciplines.includes(initialDiscipline)) setDiscipline(initialDiscipline);
  }, [attemptId, initialDiscipline]);

  useEffect(() => {
    if (attemptId) return;
    let active = true;
    setTopic(''); setTopics([]);
    void apiRequest<{ topics: string[] }>(`/question-practice/catalog/${encodeURIComponent(discipline)}/topics`)
      .then(result => { if (active) setTopics(result.topics); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os assuntos.'); });
    return () => { active = false; };
  }, [attemptId, discipline]);

  useEffect(() => {
    if (!attemptId) return;
    let active = true;
    setBusy(true); setError('');
    void apiRequest<{ attempt: Attempt }>(`/question-practice/${attemptId}`)
      .then(async response => {
        if (!active) return;
        setAttempt(response.attempt);
        if (response.attempt.state === 'COMPLETED') {
          const completed = await apiRequest<{ result: Result }>(`/question-practice/${attemptId}/result`);
          if (active) setResult(completed.result);
        } else {
          const unanswered = response.attempt.questions.findIndex(question => !question.selectedOptionId);
          const nextIndex = unanswered < 0 ? 0 : unanswered;
          setIndex(nextIndex);
          setSelection(response.attempt.questions[nextIndex]?.selectedOptionId ?? '');
        }
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a prática.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [attemptId]);

  const current = attempt?.questions[index];
  const answeredCount = useMemo(() => attempt?.questions.filter(question => question.selectedOptionId).length ?? 0, [attempt]);
  const start = async () => {
    setBusy(true); setError('');
    try {
      const response = await apiRequest<{ attempt: Attempt }>('/question-practice', { method: 'POST', body: JSON.stringify({ discipline, quantity, topic: topic || null }) });
      navigate(`/questoes/pratica/${response.attempt.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar a prática.'); }
    finally { setBusy(false); }
  };
  const saveAnswer = async () => {
    if (!attempt || !current || !selection) return;
    setBusy(true); setError('');
    try {
      const confirmation = await apiRequest<{ correct: boolean; explanation: string; answeredCount: number; totalQuestions: number; consistency: number | null; recommendation: string }>(`/question-practice/${attempt.id}/answers/${current.id}`, { method: 'PUT', body: JSON.stringify({ alternativeId: selection }) });
      setFeedback(confirmation);
      const saved = { ...current, selectedOptionId: selection };
      const questions = attempt.questions.map(question => question.id === current.id ? saved : question);
      const updated = { ...attempt, questions };
      setAttempt(updated);
      if (index + 1 === questions.length) {
        const finalized = await apiRequest<{ result: Result }>(`/question-practice/${attempt.id}/finalize`, { method: 'POST' });
        setResult(finalized.result);
        setAttempt({ ...updated, state: 'COMPLETED' });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'A resposta não foi confirmada pelo servidor.'); }
    finally { setBusy(false); }
  };
  const advance = () => {
    if (!attempt || !feedback || index + 1 >= attempt.questions.length) return;
    setFeedback(undefined);
    setIndex(index + 1);
    setSelection(attempt.questions[index + 1].selectedOptionId ?? '');
  };

  if (!attemptId) return <section className="page practice-page">
    <p className="gold">PRÁTICA INDIVIDUAL</p><h1>O que você quer estudar hoje?</h1>
    <p className="muted">Escolha uma disciplina e o tamanho da prática. Serão usadas somente questões públicas elegíveis, revisadas e com direitos documentados quando aplicável.</p>
    <div className="panel practice-picker">
      <label htmlFor="practice-discipline">Disciplina</label>
      <select id="practice-discipline" value={discipline} onChange={event => setDiscipline(event.target.value)}>{disciplines.map(item => <option key={item}>{item}</option>)}</select>
      <label htmlFor="practice-topic">Assunto (opcional)</label>
      <select id="practice-topic" value={topic} onChange={event => setTopic(event.target.value)}><option value="">Todos os assuntos</option>{topics.map(item => <option key={item} value={item}>{item}</option>)}</select>
      <fieldset><legend>Quantidade de questões</legend>{quantities.map(value => <label key={value} className="practice-quantity"><input type="radio" name="practice-quantity" checked={quantity === value} onChange={() => setQuantity(value)} />{value}</label>)}</fieldset>
      <button className="primary" disabled={!featureEnabled || busy} onClick={() => void start()}>{busy ? 'Preparando prática…' : 'Iniciar prática'}</button>
      {!featureEnabled && <p className="muted" role="status">A prática individual está preparada, mas indisponível até a validação da migration e do acervo elegível.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  </section>;

  if (busy && !attempt) return <section className="page"><p role="status">Carregando sua prática…</p></section>;
  if (error && !attempt) return <section className="page"><p className="error" role="alert">{error}</p><button className="outline-button" onClick={() => navigate('/questoes')}>Voltar às questões</button></section>;
  if (result) return <section className="page practice-page">
    <p className="gold">RESULTADO DA PRÁTICA</p><h1>{result.correct} de {result.total} acertos · {result.percentage}%</h1>
    <p className="muted">{result.incorrect} questões incorretas. Consistência: {result.consistency === null ? 'dados insuficientes (menos de 3 respostas)' : `${result.consistency}%`}. {result.recommendation}</p>
    <div className="practice-results">{result.answers.map((answer, answerIndex) => <article className="panel" key={answer.questionId}><p className="gold">QUESTÃO {answerIndex + 1} · {answer.discipline}</p><h2>{answer.statement}</h2>{answer.alternatives.map(option => <p className={option.id === answer.correctOptionId ? 'practice-correct' : option.id === answer.selectedOptionId ? 'practice-incorrect' : ''} key={option.id}><b>{option.letter}</b> {option.text} {option.id === answer.correctOptionId ? '· Correta' : option.id === answer.selectedOptionId ? '· Sua resposta' : ''}</p>)}<p className="muted">{answer.explanation}</p></article>)}</div>
    <button className="primary" onClick={() => navigate('/questoes')}>Nova prática</button>
  </section>;
  if (!attempt || !current) return <section className="page"><p className="error" role="alert">Não foi possível recuperar esta prática.</p><button className="outline-button" onClick={() => navigate('/questoes')}>Voltar às questões</button></section>;

  return <section className="page practice-page">
    <p className="gold">{attempt.discipline} · QUESTÃO {index + 1} DE {attempt.questions.length}</p>
    <div className="progress" role="progressbar" aria-label="Progresso da prática" aria-valuemin={0} aria-valuemax={attempt.questions.length} aria-valuenow={answeredCount}><i style={{ width: `${(answeredCount / attempt.questions.length) * 100}%` }} /></div>
    <article className="panel practice-question"><p className="muted">{current.topic} · {current.level}</p><h1>{current.statement}</h1><div className="practice-options">{current.alternatives.map(option => <label className={selection === option.id ? 'picked' : ''} key={option.id}><input type="radio" name="practice-answer" checked={selection === option.id} onChange={() => { setFeedback(undefined); setSelection(option.id); }} /><b>{option.letter}</b><span>{option.text}</span></label>)}</div>
      {feedback && <div className={`study-exercise-feedback ${feedback.correct ? '' : 'is-incorrect'}`} role="status"><strong>{feedback.correct ? 'Resposta correta' : 'Resposta incorreta'}</strong><p>{feedback.explanation}</p><small>{feedback.answeredCount} de {feedback.totalQuestions} respondidas. Consistência: {feedback.consistency === null ? 'dados insuficientes' : `${feedback.consistency}%`}. {feedback.recommendation}</small></div>}
      {error && <p className="error" role="alert">{error}</p>}
      <footer><button className="outline-button" onClick={() => navigate('/questoes')}>Sair da prática</button>{feedback && index + 1 < attempt.questions.length ? <button className="primary" onClick={advance}>Próxima questão</button> : <button className="primary" disabled={!selection || busy || Boolean(feedback)} onClick={() => void saveAnswer()}>{busy ? 'Salvando…' : index + 1 === attempt.questions.length ? 'Salvar e finalizar' : 'Confirmar resposta'}</button>}</footer>
    </article>
  </section>;
}
