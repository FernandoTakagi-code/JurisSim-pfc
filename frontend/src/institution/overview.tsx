import {Icon} from '../ui-icon';
import type {InstitutionSection} from '../institution-navigation';
import type {Summary} from './types';
import {Notifications} from './notifications';

export function Overview({
  id,
  summary,
  go,
  open,
  readOnly = false,
  teacherManagementAvailable = false,
  teacherInvitationsAvailable = false,
  teacherInvitationReason,
}: {
  id: string;
  summary: Summary;
  go: (section: InstitutionSection, extra?: Record<string, string>) => void;
  open: (dialog: "invite" | "class") => void;
  readOnly?: boolean;
  teacherManagementAvailable?: boolean;
  teacherInvitationsAvailable?: boolean;
  teacherInvitationReason?: string;
}) {
  const metrics: [string, number | string | null | undefined, string][] = [
    ["Professores ativos", summary.indicators.activeTeachers, "graduation"],
    ["Turmas em andamento", summary.indicators.activeClasses, "book"],
    ["Alunos vinculados", summary.indicators.students, "users"],
    ["Simulados publicados", summary.indicators.publishedExams, "file"],
  ];
  return (
    <div className="institution-overview" data-institution-id={id}>
      <div className="welcome-row overview-hero">
        <div><p className="eyebrow">PAINEL INSTITUCIONAL</p><h1>{summary.institution.name}</h1><p>Equipe, turmas e acompanhamento da sua instituição.</p></div>
        <span className={`status ${readOnly ? "warning" : "success"}`}><i />{readOnly ? teacherManagementAvailable ? "Gestão de professores ativa" : "Acompanhamento institucional" : "Operações disponíveis"}</span>
      </div>
      <div className="metric-grid institution-key-metrics">
        {metrics.map(([label, value, icon]) => (
          <div className="metric-card" key={label}>
            <div className="metric-icon gold"><Icon name={icon} /></div>
            <div className="metric-copy"><span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString("pt-BR") : value ?? "—"}</strong></div>
          </div>
        ))}
      </div>
      <section className="panel institution-actions">
        <div><p className="eyebrow">AÇÕES ESSENCIAIS</p><h2>Gerenciar instituição</h2><p>Use somente recursos autorizados para esta instituição.</p></div>
        <div className="header-actions">
          <button className="primary-button" disabled={!teacherInvitationsAvailable} title={!teacherInvitationsAvailable ? teacherInvitationReason : undefined} onClick={() => open("invite")}>Convidar professor</button>
          <button className="outline-button" onClick={() => open("class")}>Criar nova turma</button>
          <button className="outline-button" onClick={() => go("teachers")}>Meus professores</button>
          <button className="outline-button" onClick={() => go("institution")}>Configurações da instituição</button>
          <button className="outline-button" onClick={() => go("students")}>Alunos matriculados</button>
          <button className="outline-button" onClick={() => go("exams")}>Simulados</button>
          <button className="text-button" onClick={() => go("performance")}>Relatórios</button>
        </div>
      </section>
      <Notifications recent />
    </div>
  );
}
