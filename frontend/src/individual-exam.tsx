import { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { navigate } from './navigation';

const enabled = import.meta.env.VITE_INDIVIDUAL_EXAM_UI_ENABLED === 'true';
type Option = { id: string; letter: string; text: string };
type Question = { id: string; position: number; statement: string; discipline: string; topic: string; selectedOptionId: string | null; alternatives: Option[] };
type Attempt = { id: string; state: 'IN_PROGRESS' | 'COMPLETED'; quantity: number; questions: Question[] };
type Availability = { quantity: number; canStart: boolean; activeAttemptId: string | null; disciplines: { discipline: string; available: number; required: number; missing: number }[] };
type Result = { total: number; correct: number; percentage: number; disciplines: { discipline: string; total: number; correct: number }[]; answers: { id: string; statement: string; discipline: string; selectedOptionId: string | null; correctOptionId: string; correct: boolean; explanation: string; alternatives: Option[] }[] };
const message = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a solicitação.';

export function IndividualExamLobby() {
  const [data, setData] = useState<Availability>();
  const [busy, setBusy] = useState(enabled);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setBusy(true); setError(''); setData(undefined);
    void apiRequest<Availability>('/individual-exams/availability').then(value => { if (active) setData(value); })
      .catch(cause => { if (active) setError(message(cause)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [refresh]);
  const start = async () => {
    if (!data || busy) return;
    if (data.activeAttemptId) { navigate(`/simulados/individual/${data.activeAttemptId}`); return; }
    if (!data.canStart) return;
    setBusy(true); setError('');
    try {
      const response = await apiRequest<{ attempt: Attempt }>('/individual-exams', { method: 'POST', body: '{}' });
      navigate(`/simulados/individual/${response.attempt.id}`);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  return <section className="panel individual-exams-section" aria-labelledby="individual-exams-title">
    <p className="gold">PREPARAÇÃO INDIVIDUAL</p>
    <h2 id="individual-exams-title">{enabled ? 'Simulado individual de 30 questões' : 'Simulados individuais em preparação'}</h2>
    <p className="muted">Seis questões por disciplina, com correção somente ao entregar. Você poderá sair e retomar as respostas salvas. Sem limite de tempo nesta versão.</p>
    <p className="muted">Este recorte de cinco disciplinas não é uma prova completa ou oficial da OAB. Em Questões, o treino é por disciplina ou assunto, com correção a cada resposta.</p>
    {!enabled && <p className="muted" role="status">Estamos preparando o fluxo e o acervo liberado, separado das questões já respondidas no diagnóstico. O simulado individual ainda não está disponível.</p>}
    {enabled && busy && <p role="status">Consultando disponibilidade…</p>}
    {data && <><ul>{data.disciplines.map(d => <li key={d.discipline}>{d.discipline}: {d.available} inéditas disponíveis · necessárias {d.required}{d.missing > 0 ? ` · faltam ${d.missing}` : ''}</li>)}</ul>
      {data.activeAttemptId ? <p className="muted">Você tem um simulado em andamento. Continue para concluí-lo.</p> : !data.canStart && <p className="muted" role="status">Ainda não há seis questões inéditas liberadas em cada disciplina. Aguarde a ampliação do acervo.</p>}
      <button className="primary" disabled={busy || (!data.canStart && !data.activeAttemptId)} onClick={() => void start()}>{data.activeAttemptId ? 'Continuar simulado' : 'Iniciar simulado de 30 questões'}</button>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    {enabled && <button className="outline-button" disabled={busy} onClick={() => setRefresh(v => v + 1)}>Atualizar disponibilidade</button>}
    <button className="outline-button" onClick={() => navigate('/questoes')}>Ver treinos por disciplina</button>
  </section>;
}

export function IndividualExamPage({ id }: { id: string }) {
  const [attempt, setAttempt] = useState<Attempt>();
  const [result, setResult] = useState<Result>();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(enabled);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setBusy(true); setError(''); setAttempt(undefined); setResult(undefined);
    void apiRequest<{ attempt: Attempt }>(`/individual-exams/${id}`).then(async ({ attempt: value }) => {
      if (!active) return;
      setAttempt(value);
      setIndex(Math.max(0, value.questions.findIndex(q => !q.selectedOptionId)));
      if (value.state === 'COMPLETED') {
        const response = await apiRequest<{ result: Result }>(`/individual-exams/${id}/result`);
        if (active) setResult(response.result);
      }
    }).catch(cause => { if (active) setError(message(cause)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [id, refresh]);
  const save = async (question: Question, alternativeId: string) => {
    if (busy || !attempt || attempt.state !== 'IN_PROGRESS') return;
    setBusy(true); setError('');
    try {
      await apiRequest(`/individual-exams/${id}/answers/${question.id}`, { method: 'PUT', body: JSON.stringify({ alternativeId }) });
      setAttempt(current => current ? { ...current, questions: current.questions.map(q => q.id === question.id ? { ...q, selectedOptionId: alternativeId } : q) } : current);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const finalize = async () => {
    if (busy || !attempt || attempt.questions.some(q => !q.selectedOptionId)) return;
    setBusy(true); setError('');
    try {
      const response = await apiRequest<{ result: Result }>(`/individual-exams/${id}/finalize`, { method: 'POST', body: '{}' });
      setResult(response.result); setAttempt({ ...attempt, state: 'COMPLETED' });
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const back = <button className="outline-button" disabled={busy} onClick={() => navigate('/simulados')}>Voltar aos simulados</button>;
  if (!enabled) return <section className="page"><h1>Simulado individual em preparação</h1><p>A funcionalidade ainda não está disponível.</p>{back}</section>;
  if (busy && !attempt) return <section className="page"><p role="status">Carregando simulado…</p></section>;
  if (result) return <section className="page practice-page"><p className="gold">SIMULADO INDIVIDUAL · RESULTADO</p><h1>{result.correct} de {result.total} acertos · {result.percentage}%</h1>
    <p className="muted">Resultado deste conjunto de questões; não representa nota oficial da OAB nem altera seu diagnóstico inicial.</p>
    <ul>{result.disciplines.map(d => <li key={d.discipline}>{d.discipline}: {d.correct}/{d.total}</li>)}</ul>
    {result.answers.map((answer, i) => <article className="panel" key={answer.id}><p className="gold">QUESTÃO {i + 1} · {answer.discipline}</p><h2>{answer.statement}</h2>
      {answer.alternatives.map(a => <p key={a.id} className={a.id === answer.correctOptionId ? 'practice-correct' : a.id === answer.selectedOptionId ? 'practice-incorrect' : ''}><b>{a.letter}</b> {a.text}{a.id === answer.correctOptionId ? ' · Correta' : ''}{a.id === answer.selectedOptionId ? ' · Sua resposta' : ''}</p>)}<p className="muted">{answer.explanation}</p></article>)}{back}</section>;
  const current = attempt?.questions[index];
  if (!attempt || !current || attempt.state === 'COMPLETED') return <section className="page"><h1>Simulado individual</h1><p className="error" role="alert">{error || 'Não foi possível carregar a correção.'}</p><button className="outline-button" disabled={busy} onClick={() => setRefresh(v => v + 1)}>Tentar novamente</button>{back}</section>;
  const answered = attempt.questions.filter(q => q.selectedOptionId).length;
  return <section className="page practice-page"><p className="gold">SIMULADO INDIVIDUAL · QUESTÃO {index + 1} DE {attempt.quantity}</p><h1>{current.discipline}</h1>
    <p className="muted" role="status">{answered} de {attempt.quantity} respostas salvas. A correção será exibida somente na entrega. {busy ? 'Salvando…' : ''}</p>
    <nav aria-label="Navegação das questões">{attempt.questions.map((q, i) => <button className="outline-button" key={q.id} disabled={busy} aria-current={i === index ? 'step' : undefined} aria-label={`Questão ${i + 1}${q.selectedOptionId ? ', respondida' : ', pendente'}`} onClick={() => setIndex(i)}>{i + 1}{q.selectedOptionId ? ' ✓' : ''}</button>)}</nav>
    <article className="panel practice-question"><p className="muted">{current.topic}</p><h2>{current.statement}</h2><div className="practice-options">{current.alternatives.map(a => <label key={a.id} className={current.selectedOptionId === a.id ? 'picked' : ''}><input type="radio" name="exam-answer" disabled={busy} checked={current.selectedOptionId === a.id} onChange={() => void save(current, a.id)} /><b>{a.letter}</b><span>{a.text}</span></label>)}</div></article>
    {error && <p className="error" role="alert">{error}</p>}
    <footer><button className="outline-button" disabled={busy || index === 0} onClick={() => setIndex(i => i - 1)}>Anterior</button><button className="outline-button" disabled={busy || index + 1 === attempt.quantity} onClick={() => setIndex(i => i + 1)}>Próxima</button>{back}</footer>
    <p className="muted">Você pode alterar respostas antes de entregar. Depois da entrega, elas ficam bloqueadas.</p><button className="primary" disabled={busy || answered !== attempt.quantity} onClick={() => void finalize()}>Entregar e ver correção</button>
  </section>;
}
