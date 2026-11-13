import {useEffect,useState,useSyncExternalStore} from 'react';
import {useResource,ResourceState,Pages} from './administration';
import {navigate} from './navigation';
import {Icon} from './ui-icon';

type Class={id:string;nome:string;archivedAt?:string|null};
type Page={items:Class[];page:number;hasMore:boolean};
// No activity persistence contract exists. Never disguise exams as activities.
export function TeacherActivities(){
  const [page,setPage]=useState(1);
  const resource=useResource<Page>(`/turmas?page=${page}`);
  const query=useSyncExternalStore(listener=>{window.addEventListener('popstate',listener);return()=>window.removeEventListener('popstate',listener);},()=>location.search);
  const requested=new URLSearchParams(query).get('turma');
  const [selected,setSelected]=useState(requested??'');
  useEffect(()=>setSelected(requested??''),[requested]);
  const turma=resource.data?.items.find(row=>row.id===selected);
  return <section className="page teacher-activities">
    <header><span className="teacher-eyebrow">ÁREA DOCENTE</span><h1>Atividades</h1><p>Organize o acompanhamento das suas turmas autorizadas.</p></header>
    <article className="panel teacher-availability" role="status"><Icon name="book"/><div><h2>Criação de atividades ainda indisponível</h2><p>A criação, o envio, os prazos e a correção de atividades ainda não estão disponíveis. Nenhuma atividade foi criada ou publicada.</p><p>Para aplicar questões agora, utilize Simulados, com seleção do acervo autorizado e publicação explícita.</p></div></article>
    <article className="panel"><h2>Contexto da turma</h2><ResourceState resource={resource}/>
      {resource.data&&<><label>Turma autorizada<select value={turma?selected:''} onChange={event=>{setSelected(event.target.value);navigate('/professor/atividades'+(event.target.value?'?turma='+encodeURIComponent(event.target.value):''));}}><option value="">Selecione uma turma desta página</option>{resource.data.items.map(row=><option key={row.id} value={row.id}>{row.nome}{row.archivedAt?' · Arquivada':''}</option>)}</select></label>
      {selected&&!turma&&<p role="status">A turma solicitada não está nesta página autorizada. Consulte as outras páginas ou selecione uma turma; nenhum dado externo foi carregado.</p>}
      {!resource.data.items.length&&<p>Nenhuma turma autorizada disponível.</p>}
      <Pages page={page} hasMore={resource.data.hasMore} change={setPage}/></>}
      {turma&&<div className="class-actions"><button onClick={()=>navigate(`/professor/turmas/${encodeURIComponent(turma.id)}/alunos`)}><Icon name="users"/>Ver alunos</button><button onClick={()=>navigate(`/professor/relatorios/turmas/${encodeURIComponent(turma.id)}`)}><Icon name="chart"/>Relatório da turma</button></div>}
    </article>
    <div className="class-actions"><button onClick={()=>navigate('/professor/turmas')}>Minhas turmas</button><button className="primary" onClick={()=>navigate('/professor/simulados')}>Ir para Simulados</button></div>
  </section>;
}
