import type {Summary} from './institution/types';
import {initials,statusNames} from './institution/format';
import {Dialog,ModalTheme} from './institution/dialog';
import {Overview} from './institution/overview';
import {InstitutionCard} from './institution/details';
import {Teachers,TeacherAssignment} from './institution/teachers';
import {InvitationsTable,InvitationForm} from './institution/invitations';
import {ReadOnlyClasses,CreateClass} from './institution/classes';
import {Notifications} from './institution/notifications';
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "./auth-session";
import { navigate } from "./navigation";
import {
  useResource,
  ResourceState,
  AuditPanel,
} from "./administration";
import { ClassesPage, ClassStudents, ExamsPage } from "./class-exams";
import { TeacherReports, StudentClassReport } from "./goals-reports";
import { PhotoProvider, ProfileAvatar } from "./profile-photo";
import { Icon } from "./ui-icon";
import {
  institutionSections,
  institutionNavigate,
  useInstitutionLocation,
  canViewInstitution,
  resolveInstitutionSection,
  type InstitutionSection,
} from "./institution-navigation";
import "./institution-dashboard.css";

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="panel side-note">
      <h2>{title}</h2>
      <p>{children}</p>
    </article>
  );
}

function ReadOnlyNotice({ title, text }: { title: string; text: string }) {
  return <article className="panel institution-readonly-card"><h2>{title}</h2><p>{text}</p></article>;
}

export function InstitutionDashboard({
  id,
  session,
  onSair,
  readOnly = false,
}: {
  id: string;
  session: Session;
  onSair: () => void;
  readOnly?: boolean;
}) {
  const availability = useResource<{ enabled: boolean; teacherInvitationReason?: string; capabilities?: { teacherManagement?: boolean; teacherInvitations?: boolean; examManagement?: boolean } }>(
    "/institutions/availability",
  );
  const authorized = canViewInstitution(session, id);
  if (!authorized)
    return (
      <main className="page">
        <h1>Acesso institucional não autorizado</h1>
      </main>
    );
  return (
    <PhotoProvider>
      <InstitutionWorkspace id={id} session={session} onSair={onSair} readOnly={readOnly || availability.data?.enabled !== true} explicitReadOnly={readOnly} teacherManagementAvailable={availability.data?.capabilities?.teacherManagement === true} examManagementAvailable={availability.data?.capabilities?.examManagement === true} teacherInvitationsAvailable={availability.data?.capabilities?.teacherInvitations === true} teacherInvitationReason={availability.data?.teacherInvitationReason} />
    </PhotoProvider>
  );
}

function InstitutionWorkspace({
  id,
  session,
  onSair,
  readOnly,
  explicitReadOnly,
  examManagementAvailable,
  teacherManagementAvailable,
  teacherInvitationsAvailable,
  teacherInvitationReason,
}: {
  id: string;
  session: Session;
  onSair: () => void;
  readOnly: boolean;
  explicitReadOnly: boolean;
  examManagementAvailable: boolean;
  teacherManagementAvailable: boolean;
  teacherInvitationsAvailable: boolean;
  teacherInvitationReason?: string;
}) {
  const location = useInstitutionLocation();
  const params = new URL(location, window.location.origin).searchParams;
  const current = resolveInstitutionSection(params.get("secao"));
  const section = current.id;
  useEffect(() => {
    if (params.get("secao") === "activities") institutionNavigate(id, "overview");
    if (params.get("secao") === "reports") institutionNavigate(id, "performance", {
      ...(params.get("turma") ? {turma: params.get("turma")!} : {}),
      ...(params.get("aluno") ? {aluno: params.get("aluno")!} : {}),
    });
  }, [location, id]);
  const [page, setPage] = useState(1);
  const [classRevision, setClassRevision] = useState(0);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [invitationNotice, setInvitationNotice] = useState("");
  useEffect(() => {
    if (section !== "teachers" && section !== "invitations") setInvitationNotice("");
  }, [section]);
  const summary = useResource<Summary>(
    `/institutions/${id}/summary?page=${page}`,
  );
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    const saved = localStorage.getItem("jurissim-theme");
    return saved === "dark" || saved === "light" ? saved : "system";
  });
  const [dark, setDark] = useState(false),
    [collapsed, setCollapsed] = useState(
      () => localStorage.getItem("jurissim-sidebar-collapsed") === "true",
    );
  const [mobile, setMobile] = useState(false),
    [profile, setProfile] = useState(false),
    [dialog, setDialog] = useState<"invite" | "class" | undefined>();
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      setDark(theme === "dark" || (theme === "system" && media.matches));
    update();
    media.addEventListener("change", update);
    localStorage.setItem("jurissim-theme", theme);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("jurissim-sidebar-collapsed", String(collapsed));
  }, [collapsed]);
  useEffect(() => {
    setMobile(false);
    setProfile(false);
    setDialog(undefined);
  }, [location]);
  useEffect(() => {
    if (!mobile) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [mobile]);
  const go = (target: InstitutionSection, extra: Record<string, string> = {}) =>
    institutionNavigate(id, target, extra);
  const personal = () =>
    navigate(session.user.role === "PROFESSOR" ? "/professor" : "/dashboard");
  const institution = summary.data?.institution;
  return (
    <ModalTheme.Provider value={dark}><div
      className={`institution-workspace ${dark ? "dark-mode" : ""}`}
      data-testid="institution-dashboard"
    >
      {mobile && (
        <button
          className="institution-menu-overlay"
          aria-label="Fechar menu institucional"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={`sidebar ${collapsed ? "collapsed" : ""} ${mobile ? "mobile-open" : ""}`}
      >
        <div className="sidebar-top">
          <div className="brand">
            <img
              className="official-brand"
              src="/brand/jurissim-logo.png"
              alt="JurisSim — Educação Jurídica"
            />
            {!collapsed && (
              <div>
                <strong>JurisSim</strong>
                <span>Educação Jurídica</span>
              </div>
            )}
          </div>
          <button
            className="icon-button sidebar-close"
            onClick={() => setMobile(false)}
            aria-label="Fechar menu"
          >
            <Icon name="close" />
          </button>
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <Icon name="menu" />
          </button>
        </div>
        <div className="institution-switch">
          <div className="institution-logo">
            {initials(institution?.name ?? "Instituição")}
          </div>
          {!collapsed && (
            <div>
              <strong>{institution?.name ?? "Carregando instituição…"}</strong>
              <span>
                {institution
                  ? (statusNames[institution.status] ?? institution.status)
                  : "Validando acesso"}
              </span>
            </div>
          )}
        </div>
        <nav className="nav-groups" aria-label="Administração institucional">
          {["Gestão", "Acompanhamento", "Sistema"].map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-label">{group}</span>
              {institutionSections
                .filter((s) => s.group === group)
                .map((s) => (
                  <button
                    key={s.id}
                    aria-label={s.label}
                    className={`nav-item ${section === s.id ? "active" : ""}`}
                    aria-current={section === s.id ? "page" : undefined}
                    title={collapsed ? s.label : undefined}
                    onClick={() => go(s.id)}
                  >
                    <Icon name={s.icon} />
                    <span>{s.label}</span>
                    {s.id === "invitations" &&
                      !collapsed &&
                      typeof summary.data?.indicators.pendingInvitations ===
                        "number" && (
                        <b>{summary.data.indicators.pendingInvitations}</b>
                      )}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className="nav-item"
            onClick={() => navigate("/instituicoes")}
          >
            <Icon name="users" />
            <span>Trocar instituição / acompanhamento</span>
          </button>
          <button className="nav-item" onClick={onSair}>
            <Icon name="logout" />
            <span>Sair</span>
          </button>
          {!collapsed && (
            <div className="user-mini">
              <ProfileAvatar name={session.user.nome} />
              <div>
                <strong>{session.user.nome}</strong>
                <span>Responsável institucional</span>
              </div>
            </div>
          )}
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir menu"
            aria-expanded={mobile}
            onClick={() => setMobile(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            <span>Painel Institucional</span>
            <Icon name="right" />
            <strong>{current?.label ?? "Seção indisponível"}</strong>
          </div>
          <div className="top-actions">
            <button
              className="icon-button notification-button"
              aria-label="Notificações"
              onClick={() => go("notifications")}
            >
              <Icon name="bell" />
            </button>
            <button
              className="theme-toggle"
              aria-label="Alternar tema"
              onClick={() => setTheme(dark ? "light" : "dark")}
            >
              <Icon name={dark ? "sun" : "moon"} />
            </button>
            <button
              className="top-profile"
              aria-label="Abrir perfil institucional"
              aria-expanded={profile}
              onClick={() => setProfile(!profile)}
            >
              <ProfileAvatar name={session.user.nome} />
              <div>
                <strong>{session.user.nome}</strong>
                <span>Instituição</span>
              </div>
              <Icon name="chevron" />
            </button>
            {profile && (
              <div className="institution-profile-menu">
                <button onClick={() => navigate("/perfil")}>
                  Perfil e configurações
                </button>
                <button onClick={personal}>Voltar ao contexto pessoal</button>
                <button onClick={onSair}>Sair</button>
              </div>
            )}
          </div>
        </header>
        <div className="page-body">
          <ResourceState resource={summary} />
          {summary.data && (
              <>
                {section !== "overview" && section !== "settings" && section !== "exams" && (
                  <div className={`welcome-row section-title${section === "teachers" || section === "invitations" ? " teacher-management-heading" : ""}`}>
                    <div>
                      <div className="section-icon">
                        <Icon name={current.icon} />
                      </div>
                      <h1>{current.label}</h1>
                      <p>{descriptions[section]}</p>
                    </div>
                    <div className="header-actions">
                      {(section === "teachers" || section === "invitations") && (
                        <button
                          className="primary-button institution-invite-button"
                          disabled={!teacherInvitationsAvailable}
                          title={!teacherInvitationsAvailable ? teacherInvitationReason : undefined}
                          onClick={event => { event.currentTarget.focus(); setInvitationNotice(""); setDialog("invite"); }}
                        >
                          <Icon name="plus" />
                          Convidar professor
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {(section === "teachers" || section === "invitations") && !teacherInvitationsAvailable && <p className="institution-teacher-status" role="status">{teacherInvitationReason ?? "Os convites de professores ainda não estão disponíveis neste ambiente."}</p>}
                {invitationNotice && (section === "teachers" || section === "invitations") && <p className="institution-invite-success" role="status">{invitationNotice}</p>}
                {section === "overview" && (
                  <Overview
                    id={id}
                    summary={summary.data}
                    go={go}
                    open={setDialog}
                    readOnly={readOnly}
                    teacherManagementAvailable={teacherManagementAvailable}
                    teacherInvitationsAvailable={teacherInvitationsAvailable}
                    teacherInvitationReason={teacherInvitationReason}
                  />
                )}
                {section === "institution" && (
                  <InstitutionCard
                    institution={summary.data.institution}
                    reload={summary.reload}
                    readOnly={readOnly}
                  />
                )}
                {section === "teachers" && (
                  <Teachers
                    id={id}
                    summary={summary.data}
                    page={page}
                    setPage={setPage}
                    reload={summary.reload}
                    canManageTeachers={teacherManagementAvailable}
                  />
                )}
                {section === "invitations" && (
                  <InvitationsTable
                    id={id}
                    revision={dialog ? "open" : "closed"}
                    canManageTeachers={teacherManagementAvailable}
                  />
                )}
                {section === "classes" && (
                  readOnly ? <ReadOnlyClasses classes={summary.data?.classes.items ?? []} onStudentsSelected={classId => go("students", { turma: classId })} /> : <ClassesPage
                    key={classRevision}
                    teacher
                    onStudentsSelected={(turma) => go("students", { turma })}
                    management={(turma, reload) => (
                      <TeacherAssignment
                        id={id}
                        turma={turma}
                        reload={reload}
                      />
                    )}
                  />
                )}
                {section === "students" && (
                  <ClassStudents institutional key={params.get("turma") ?? "all"} classId={params.get("turma") ?? undefined} onBack={() => go("classes")} />
                )}
                {section === "performance" &&
                  (params.get("turma") && params.get("aluno") ? (
                    <StudentClassReport
                      key={params.get("turma")! + params.get("aluno")!}
                      classId={params.get("turma")!}
                      studentId={params.get("aluno")!}
                      onBack={() =>
                        go(section, { turma: params.get("turma")! })
                      }
                    />
                  ) : (
                    <TeacherReports
                      classId={params.get("turma") ?? undefined}
                      mode="performance"
                      onClassSelected={(turma) => go(section, { turma })}
                      onStudentSelected={(turma, aluno) =>
                        go(section, { turma, aluno })
                      }
                    />
                  ))}
                {section === "exams" && <ExamsPage teacher institutional readOnly={explicitReadOnly || !examManagementAvailable} />}
                {section === "notifications" && <Notifications />}
                {section === "settings" && <AuditPanel institutionId={id} />}
              </>
          )}
        </div>
      </main>
      {dialog && (dialog === "invite" ? teacherInvitationsAvailable : !readOnly) && (
        <Dialog
          busy={dialogBusy}
          title={
            dialog === "invite" ? "Convidar professor" : "Criar nova turma"
          }
          subtitle={dialog === "invite" ? "Convide um profissional para integrar sua instituição." : undefined}
          icon={dialog === "invite" ? "mail" : undefined}
          className={dialog === "invite" ? "institution-invitation-dialog" : undefined}
          footer={dialog === "invite" ? <>
            <button type="button" className="outline-button" disabled={dialogBusy} onClick={() => setDialog(undefined)}>Cancelar</button>
            <button type="submit" form="institution-teacher-invitation-form" className="primary-button institution-invite-submit" disabled={dialogBusy || !teacherInvitationsAvailable}>
              {dialogBusy ? <><span className="institution-invite-spinner" aria-hidden="true" />Enviando convite…</> : <><Icon name="mail" />Enviar convite</>}
            </button>
          </> : undefined}
          close={() => setDialog(undefined)}
        >
          {dialog === "invite" ? (
            <InvitationForm
              id={id}
              institutionName={institution?.name ?? ""}
              classes={summary.data?.classes.items ?? []}
              restricted={session.administration?.restricted === true}
              onBusyChange={setDialogBusy}
              done={() => {
                setInvitationNotice("Convite enviado ao serviço de e-mail. A lista de convites foi atualizada.");
                summary.reload();
                setDialog(undefined);
                if (section === "teachers") go("invitations");
              }}
            />
          ) : (
            <CreateClass
              done={() => {
                setClassRevision(value => value + 1);
                summary.reload();
                setDialog(undefined);
                go("classes");
              }}
            />
          )}
        </Dialog>
      )}
    </div></ModalTheme.Provider>
  );
}
const descriptions: Record<InstitutionSection, string> = {
  overview: "Acompanhe sua instituição.",
  institution: "Gerencie os dados autorizados da sua instituição.",
  teachers: "Acompanhe os profissionais vinculados à sua instituição.",
  invitations: "Convide professores e acompanhe suas ativações.",
  classes: "Organize turmas, delegações docentes e matrículas.",
  students: "Consulte alunos das turmas autorizadas da instituição.",
  performance: "Acompanhe os resultados por turma, disciplina e avaliação e consulte os relatórios individuais dos alunos.",
  exams: "Crie e acompanhe avaliações das turmas da instituição.",
  notifications: "Consulte mensagens reais destinadas à sua conta.",
  settings: "Consulte a auditoria institucional.",
};
