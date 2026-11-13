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
  const shortcuts=[['turmas','Minhas turmas','users','Organização e matrículas'],['alunos','Alunos','user','Alunos das turmas autorizadas'],['atividades','Atividades','book','Disponibilidade e contexto das turmas'],['simulados','Simulados','file','Rascunhos e publicações'],['desempenho','Desempenho','chart','Resultados por turma'],['relatorios','Relatórios','target','Acompanhamento individual']];
  return <section className="page teacher-dashboard teacher-workspace" data-testid="teacher-dashboard">
    <header className="teacher-welcome"><div><span className="teacher-eyebrow">Dashboard do Professor</span><h1>Olá, {session.user.nome}.</h1><p>Acompanhe suas turmas, prepare simulados e consulte os resultados dos seus alunos.</p>{institution&&<p className="teacher-institution"><Icon name="building"/>Instituição de trabalho: <strong>{institution.institution.name}</strong></p>}</div><span className="teacher-role"><Icon name="graduation"/>Professor</span></header>
    {access.pendingLink ? <article className="panel" role="status"><h2>Vínculo institucional pendente</h2><p>Sua conta e seu histórico foram preservados. Solicite um convite ao responsável pela instituição para liberar turmas, alunos e relatórios.</p><p>Se você já recebeu um convite, abra o link original e aceite com esta conta.</p><button onClick={() => navigate('/professor/perfil')}>Meu perfil</button><button onClick={() => navigate('/instituicoes')}>Acompanhamento institucional</button></article> : access.needsSelection ? <article className="panel" role="status"><h2>Selecione sua instituição de trabalho</h2><p>Escolha uma instituição acima para carregar somente as turmas e os simulados desse vínculo.</p></article> : <>
      <section className="teacher-overview" aria-label="Indicadores das turmas autorizadas"><ResourceState resource={overview} />
        {overview.data && <dl className="teacher-indicators">
          <div><Icon name="users"/><dt>Turmas</dt><dd>{overview.data.classes}</dd><span>Todos os registros autorizados</span></div>
          <div><Icon name="book"/><dt>Turmas ativas</dt><dd>{overview.data.activeClasses}</dd><span>Disponíveis para acompanhamento</span></div>
          <div><Icon name="user"/><dt>Alunos distintos matriculados</dt><dd>{overview.data.students}</dd><span>Sem duplicar matrículas compartilhadas</span></div>
          <div><Icon name="file"/><dt>Simulados publicados</dt><dd>{overview.data.publishedExams}</dd><span>Publicações das turmas autorizadas</span></div>
        </dl>}
        <p className="teacher-caption">Contagens de todas as páginas do contexto atual, com alunos e simulados contados uma única vez.</p>
      </section>
      <section><h2>Seu espaço de trabalho</h2><nav className="teacher-shortcuts" aria-label="Atalhos do professor">{shortcuts.map(([path,title,icon,description])=><button key={path} onClick={()=>navigate('/professor/'+path)}><span className="teacher-shortcut-icon"><Icon name={icon}/></span><span><strong>{title}</strong><small>{description}</small></span><Icon name="right"/></button>)}</nav></section>
      <div className="teacher-recent-grid">
      <article className="panel"><h2>Turmas</h2><ResourceState resource={classes} />
        {classes.data?.items.length === 0 && <p>Nenhuma turma disponível neste contexto. Solicite a designação à instituição.</p>}
        {classes.data?.items.slice(0, 5).map(turma => <div key={turma.id}><h3>{turma.nome}</h3><p>{turma.archivedAt ? 'Arquivada' : 'Ativa'}{turma._count ? ` · ${turma._count.alunos} aluno(s)` : ''}</p><button onClick={() => navigate(`/professor/turmas/${encodeURIComponent(turma.id)}/alunos`)}>Consultar alunos</button></div>)}
        {!!classes.data?.items.length && <button onClick={() => navigate('/professor/turmas')}>Ver todas as turmas</button>}
      </article>
      <article className="panel"><h2>Simulados</h2><ResourceState resource={exams} />
        {exams.data?.items.length === 0 && <p>Nenhum simulado disponível neste contexto.</p>}
        {exams.data?.items.slice(0, 5).map(exam => <p key={exam.id}>{exam.titulo}</p>)}
        {!!exams.data?.items.length && <button onClick={() => navigate('/professor/simulados')}>Gerenciar simulados</button>}
      </article>
      </div>
    </>}
  </section>;
}
