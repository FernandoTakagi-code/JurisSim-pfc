import type { Session } from './auth-session';
import { navigate } from './navigation';
import { ResourceState, useResource } from './administration';
import { teacherAccess } from './teacher-access';
import {Icon} from './ui-icon';
import './teacher-dashboard.css';

type Page<T> = { items: T[]; page: number; hasMore: boolean };
type Class = { id: string; nome: string; archivedAt?: string | null; _count?: { alunos: number } };
type Exam = { id: string; titulo: string; status?: string };
type Overview = { classes: number; activeClasses: number; students: number; publishedExams: number };

// Home is independent of the question editor/bank. Data remains protected by
// the existing class/exam APIs and the validated institution context.
export function TeacherDashboard({ session }: { session: Session }) {
  const access = teacherAccess(session, sessionStorage.getItem('jurissim_institution'));
  const classes = useResource<Page<Class>>(access.canLoadAcademicData ? '/turmas?page=1' : null);
  const overview = useResource<Overview>(access.canLoadAcademicData ? '/reports/overview' : null);
  const exams = useResource<Page<Exam>>(access.canLoadAcademicData ? '/avaliacoes?page=1' : null);
  const institution = access.memberships.find(m => m.institutionId === access.institutionId);
  const shortcuts=[['atividades','Atividades','book','Tarefas com prazo e pontuação'],['simulados','Simulados','file','Avaliações para suas turmas'],['questoes','Banco de questões','book','Consulte e prepare o acervo'],['desempenho','Desempenho','chart','Resultados da turma e dos alunos']];
  return <section className="page teacher-dashboard teacher-workspace" data-testid="teacher-dashboard">
    <header className="teacher-welcome"><div><span className="teacher-eyebrow">Seu espaço de ensino</span><h1>Bom trabalho, {session.user.nome.split(" ")[0]}.</h1><p>Prepare as próximas aulas e acompanhe suas turmas em um só lugar.</p>{institution&&<p className="teacher-institution"><Icon name="building"/>Instituição de trabalho: <strong>{institution.institution.name}</strong></p>}</div>{access.canLoadAcademicData&&<div className="teacher-hero-actions"><button className="primary" onClick={()=>navigate("/professor/simulados?acao=novo")}><Icon name="plus"/>Preparar simulado</button><button onClick={()=>navigate("/professor/turmas?acao=nova")}><Icon name="plus"/>Nova turma</button></div>}</header>
    {access.pendingLink ? <article className="panel" role="status"><h2>Vínculo institucional pendente</h2><p>Sua conta e seu histórico foram preservados. Solicite um convite ao responsável pela instituição para liberar turmas, alunos e relatórios.</p><p>Se você já recebeu um convite, abra o link original e aceite com esta conta.</p><button onClick={() => navigate('/professor/perfil')}>Meu perfil</button></article> : access.needsSelection ? <article className="panel" role="status"><h2>Selecione sua instituição de trabalho</h2><p>Escolha uma instituição acima para carregar somente as turmas e os simulados desse vínculo.</p></article> : <>
      <section className="teacher-overview" aria-label="Indicadores das turmas autorizadas"><ResourceState resource={overview} />
        {overview.data && <dl className="teacher-indicators">
          <div><Icon name="book"/><dt>Turmas ativas</dt><dd>{overview.data.activeClasses}</dd><span>Disponíveis para acompanhamento</span></div>
          <div><Icon name="user"/><dt>Alunos matriculados</dt><dd>{overview.data.students}</dd><span>Alunos contados uma única vez</span></div>
          <div><Icon name="file"/><dt>Avaliações publicadas</dt><dd>{overview.data.publishedExams}</dd><span>Simulados e atividades das suas turmas</span></div>
        </dl>}
        <p className="teacher-caption">Dados das suas turmas autorizadas, sem duplicar alunos ou simulados.</p>
      </section>
      <section><h2>O que você quer preparar?</h2><nav className="teacher-shortcuts" aria-label="Atalhos do professor">{shortcuts.map(([path,title,icon,description])=><button key={path} onClick={()=>navigate('/professor/'+path)}><span className="teacher-shortcut-icon"><Icon name={icon}/></span><span><strong>{title}</strong><small>{description}</small></span><Icon name="right"/></button>)}</nav></section>
      <div className="teacher-recent-grid">
      <article className="panel"><div className="teacher-section-heading"><h2>Suas turmas</h2><button className="text-button" onClick={()=>navigate("/professor/turmas")}>Ver todas</button></div><ResourceState resource={classes} />
        {classes.data?.items.length === 0 && <p>Nenhuma turma disponível neste contexto. Solicite a designação à instituição.</p>}
        {classes.data?.items.slice(0, 5).map(turma => <div className="teacher-recent-class" key={turma.id}><h3>{turma.nome}</h3><p>{turma.archivedAt ? 'Arquivada' : 'Ativa'}{turma._count ? ` · ${turma._count.alunos} ${turma._count.alunos === 1 ? "aluno" : "alunos"}` : ''}</p><button onClick={() => navigate(`/professor/turmas/${encodeURIComponent(turma.id)}/alunos`)}>Consultar alunos</button></div>)}
      </article>
      <article className="panel"><div className="teacher-section-heading"><h2>Seus simulados</h2><button className="text-button" onClick={()=>navigate("/professor/simulados")}>Ver todos</button></div><ResourceState resource={exams} />
        {exams.data?.items.length === 0 && <p>Nenhum simulado disponível neste contexto.</p>}
        {exams.data?.items.slice(0, 5).map(exam => <p key={exam.id}>{exam.titulo}</p>)}
      </article>
      </div>
    </>}
  </section>;
}
