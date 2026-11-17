import { useEffect, useRef, useState } from 'react';
import { apiRequest } from './api';
import { navigate } from './navigation';
import './question-editorial.css';

type Item = { id: string; discipline: string; topic: string; private: boolean; classScoped: boolean; complete: boolean; legalReviewed: boolean; pedagogicalReviewed: boolean; released: boolean; issues: string[] };
type Detail = { digest: string; writesEnabled: boolean; issues: string[];
  question: { id: string; enunciado: string; disciplina: string; assunto: string; fundamentacaoJuridica: string; origem: string | null;
    fonteNome: string | null; fonteReferencia: string | null; licencaOuAutorizacao: string | null;
    revisaoJuridicaEm: string | null; revisaoPedagogicaEm: string | null; liberadaAcervoEm: string | null;
    alternativas: { id: string; letra: string | null; texto: string; correta: boolean }[] };
  history: { id: string; event: string; occurredAt: string; actorId: string | null; result: string }[] };
const disciplines = ['Direito Constitucional','Direito Civil','Direito Penal','Direito Administrativo','Direito do Trabalho'];
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível consultar o acervo.';
export function QuestionEditorialPage() {
  const [page, setPage] = useState(1), [discipline, setDiscipline] = useState(''), [search, setSearch] = useState(''), [term, setTerm] = useState('');
  const [list, setList] = useState<{ items: Item[]; hasMore: boolean }>(), [detail, setDetail] = useState<Detail>();
  const [selected, setSelected] = useState(''), [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [source, setSource] = useState({ sourceName: '', sourceReference: '', license: '', origin: '' });
  const [evidence, setEvidence] = useState(''), [confirmed, setConfirmed] = useState(false), [consent, setConsent] = useState('');
  const pending = useRef(false);
  useEffect(() => { const timer = window.setTimeout(() => { setTerm(search.trim()); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setList(undefined);
    const query = new URLSearchParams({ page: String(page), ...(discipline ? { discipline } : {}), ...(term ? { search: term } : {}) });
    apiRequest<{ items: Item[]; hasMore: boolean }>(`/question-editorial?${query}`)
      .then(data => { if (active) setList(data); }).catch(e => { if (active) setError(errorText(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, discipline, term, revision]);
  useEffect(() => {
    let active = true; setDetail(undefined); setEvidence(''); setConsent(''); setConfirmed(false);
    if (selected) apiRequest<Detail>(`/question-editorial/${selected}`).then(data => {
      if (!active) return; setDetail(data); setSource({ sourceName: data.question.fonteNome ?? '', sourceReference: data.question.fonteReferencia ?? '', license: data.question.licencaOuAutorizacao ?? '', origin: data.question.origem ?? '' });
    }).catch(e => { if (active) setError(errorText(e)); });
    return () => { active = false; };
  }, [selected, revision]);
  async function action(kind: 'metadata' | 'legal' | 'pedagogical' | 'release') {
    if (!detail?.writesEnabled || pending.current) return;
    pending.current = true;
    setBusy(true); setError(''); setNotice('');
    const expectedDigest = detail.digest;
    const body = kind === 'metadata' ? { expectedDigest, evidenceRef: evidence, sourceName: source.sourceName, sourceReference: source.sourceReference, license: source.license, ...(source.origin ? { origin: source.origin } : {}) }
      : { expectedDigest, evidenceRef: evidence, confirmed, ...(kind === 'release' ? { consentEvidence: consent } : {}) };
    const endpoint = kind === 'metadata' ? 'metadata' : kind === 'release' ? 'release' : `reviews/${kind}`;
    try {
      const result = await apiRequest<{ message: string }>(`/question-editorial/${detail.question.id}/${endpoint}`, { method: kind === 'metadata' ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      setNotice(result.message); setRevision(n => n + 1);
    } catch (e) { setError(errorText(e)); }
    finally { pending.current = false; setBusy(false); setConfirmed(false); }
  }
  const disabled = busy || !detail?.writesEnabled || Boolean(detail.question.liberadaAcervoEm);
  const canAttest = !disabled && detail?.issues.length === 0 && confirmed && evidence.trim().length >= 8;
  return <section className="page editorial-page">
    <header><div><p className="gold">ACERVO · ADMINISTRAÇÃO</p><h1>Revisão editorial</h1><p>Confira conteúdo, evidências e responsáveis antes de liberar uma questão.</p></div><button className="outline-button" onClick={() => navigate('/administracao')}>Voltar à administração</button></header>
    <div className="panel editorial-filters"><label>Disciplina<select value={discipline} onChange={e => { setDiscipline(e.target.value); setPage(1); }}><option value="">Todas</option>{disciplines.map(d => <option key={d}>{d}</option>)}</select></label><label>Pesquisar assunto ou enunciado<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
    {loading && <p role="status">Consultando o acervo…</p>}
    {error && <div role="alert" className="error"><p>{error}</p><button onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></div>}
    {notice && <p role="status">{notice}</p>}
    <div className="editorial-grid"><section className="panel"><h2>Questões cadastradas</h2>{list && !list.items.length && <p>Nenhuma questão neste filtro.</p>}
      {list?.items.map(q => <article className="editorial-item" key={q.id}><strong>{q.discipline} · {q.topic}</strong><p>{q.complete ? 'Conteúdo completo' : 'Conteúdo incompleto'} · {q.private ? 'Privada' : 'Pública'}{q.classScoped ? ' de turma' : ''}</p><p>{q.released ? 'Liberação registrada' : 'Liberação pendente'} · {q.legalReviewed ? 'Registro jurídico existente' : 'Revisão jurídica pendente'}</p><button className="outline-button" onClick={() => { setSelected(q.id); setNotice(''); setError(''); }}>Analisar questão</button></article>)}
      {list && <nav className="editorial-actions" aria-label="Paginação editorial"><button disabled={page === 1} onClick={() => setPage(n => n - 1)}>Anterior</button><span>Página {page}</span><button disabled={!list.hasMore} onClick={() => setPage(n => n + 1)}>Próxima</button></nav>}
    </section><section className="panel editorial-detail" aria-live="polite"><h2>Conferência e revisão</h2>{!selected ? <p>Selecione uma questão para conferir o conteúdo e a documentação.</p> : !detail ? <p>Consultando os detalhes…</p> : <>
      {!detail.writesEnabled && <p className="editorial-notice" role="status">Consulta disponível. Registrar revisões ou liberar questões depende de autorização de escrita editorial neste ambiente.</p>}
      <h3>{detail.question.disciplina} · {detail.question.assunto}</h3><p>{detail.question.enunciado}</p><ol>{detail.question.alternativas.map(a => <li key={a.id}>{a.letra ?? 'Sem letra'} — {a.texto}{a.correta ? ' · Gabarito cadastrado' : ''}</li>)}</ol><h3>Justificativa cadastrada</h3><p>{detail.question.fundamentacaoJuridica}</p>
      <h3>Pendências</h3>{detail.issues.length ? <ul>{detail.issues.map(i => <li key={i}>{i}</li>)}</ul> : <p>Integridade estrutural conferida. A revisão humana continua obrigatória.</p>}
      <fieldset disabled={disabled}><legend>Documentação da fonte e autorização</legend><label>Origem<select value={source.origin} onChange={e => setSource(s => ({ ...s, origin: e.target.value }))}><option value="">Não identificada</option><option value="IA">Autoral assistida por IA</option><option value="OAB_OFICIAL">OAB oficial</option></select></label>
        {([['sourceName','Fonte'],['sourceReference','Referência'],['license','Licença ou autorização documentada']] as const).map(([key,label]) => <label key={key}>{label}<textarea value={source[key]} onChange={e => setSource(s => ({ ...s, [key]: e.target.value }))} /></label>)}
        <p>Alterar a documentação invalida revisões anteriores. Questões já liberadas não são editadas neste fluxo.</p>
      </fieldset>
      <label>Evidência da operação realizada<input value={evidence} onChange={e => setEvidence(e.target.value)} disabled={disabled} placeholder="Referência ao documento ou parecer efetivamente conferido" /></label>
      <button disabled={disabled || evidence.trim().length < 8} onClick={() => void action('metadata')}>Registrar correção documental</button>
      <label className="editorial-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={disabled} /><span>Confirmo que realizei efetivamente a revisão indicada e conferi a evidência informada.</span></label>
      <div className="editorial-actions"><button disabled={!canAttest} onClick={() => void action('legal')}>Registrar revisão jurídica</button><button disabled={!canAttest} onClick={() => void action('pedagogical')}>Registrar revisão pedagógica</button></div>
      <label>Evidência da autorização para publicação no acervo global<input value={consent} onChange={e => setConsent(e.target.value)} disabled={disabled} /></label>
      <button className="primary" disabled={!canAttest || consent.trim().length < 8 || !detail.question.revisaoJuridicaEm || !detail.question.revisaoPedagogicaEm} onClick={() => { if (window.confirm('Confirmar a liberação desta versão revisada no acervo público?')) void action('release'); }}>Liberar versão revisada no acervo público</button>
      <h3>Auditoria</h3>{!detail.history.length ? <p>Nenhuma operação deste fluxo registrada.</p> : detail.history.map(h => <details key={h.id}><summary>{h.event} · {new Date(h.occurredAt).toLocaleString('pt-BR')}</summary><p>Responsável: {h.actorId ?? 'Não identificado'}</p><pre>{h.result}</pre></details>)}
    </>}</section></div>
  </section>;
}
