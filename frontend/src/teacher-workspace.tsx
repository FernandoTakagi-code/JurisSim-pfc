import type { Session } from './auth-session';
import { usePath, navigate } from './navigation';
import { ClassesPage, ClassStudents, ExamsPage } from './class-exams';
import { TeacherReports, StudentClassReport } from './goals-reports';
import { ProfessorArea } from './ProfessorArea';
import { TeacherDashboard } from './teacher-dashboard';
import {TeacherActivities} from './teacher-activities';
import './teacher-dashboard.css';

// Academic navigation must not mount the question module or fetch its catalog.
export function TeacherWorkspace({ session, onSair }: { session: Session; onSair: () => void }) {
  const path = usePath();
  const academic=(page:React.ReactNode)=><div className="teacher-workspace">{page}</div>;
  if (path === '/professor' || path === '/professor/') return <TeacherDashboard session={session} />;
  if (path === '/professor/turmas') return academic(<ClassesPage teacher />);
  if (path === '/professor/alunos') return academic(<ClassStudents />);
  if (path === '/professor/simulados') return academic(<ExamsPage teacher />);
  if (path === '/professor/atividades') return academic(<TeacherActivities/>);
  const roster = /^\/professor\/turmas\/([^/]+)\/alunos$/.exec(path);
  if (roster) return academic(<ClassStudents key={roster[1]} classId={roster[1]} />);
  const individual = /^\/professor\/relatorios\/turmas\/([^/]+)\/alunos\/([^/]+)$/.exec(path);
  if (individual) return academic(<StudentClassReport key={individual[1] + ':' + individual[2]} classId={individual[1]} studentId={individual[2]} />);
  const report = /^\/professor\/(relatorios|desempenho)(?:\/turmas\/([^/]+))?$/.exec(path);
  if (report) return academic(<TeacherReports key={report[1] + ':' + (report[2] ?? '')} classId={report[2]} mode={report[1] === 'desempenho' ? 'performance' : 'reports'} />);
  if (path === '/professor/questoes' || path === '/professor/questoes/nova' || /^\/professor\/questoes\/[^/]+\/editar$/.test(path)) {
    const { user } = session;
    return <ProfessorArea userId={user.id} nome={user.nome} email={user.email} role={user.role} onSair={onSair} />;
  }
  return <section className="page"><h1>Página do Professor não encontrada</h1><button onClick={() => navigate('/professor')}>Voltar ao dashboard</button></section>;
}
