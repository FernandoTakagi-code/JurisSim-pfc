import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from 'react-dom';
import { apiRequest } from "./api";
import type { Session } from "./auth-session";
import { navigate } from "./navigation";
import {
  useResource,
  useMutation,
  ResourceState,
  Pages,
  ClassMembershipManager,
  AuditPanel,
} from "./administration";
import { ClassesPage, ClassStudents, ExamsPage } from "./class-exams";
import { TeacherReports, StudentClassReport } from "./goals-reports";
import { AuthorizedContext } from "./integration-shell";
import { PhotoProvider, ProfileAvatar } from "./profile-photo";
import { Icon } from "./ui-icon";
import {
  institutionSections,
  institutionNavigate,
  useInstitutionLocation,
  canManageInstitution,
  type InstitutionSection,
} from "./institution-navigation";
import "./institution-dashboard.css";
const ModalTheme = createContext(false);

type Page<T> = { items: T[]; page: number; hasMore: boolean };
type Institution = {
  id: string;
  name: string;
  responsibleName: string;
  email: string;
  phone: string;
  description: string;
  status: string;
  registrationNumber?: string;
  createdAt?: string;
};
type Member = {
  id: string;
  userId: string;
  active: boolean;
  user?: { id: string; nome: string; email: string };
};
type Class = {
  id: string;
  nome: string;
  archivedAt?: string | null;
  professores?: { id: string; nome: string }[];
  _count: { alunos: number };
};
type Summary = {
  institution: Institution;
  teachers: Page<Member>;
  classes: Page<Class>;
  indicators: {
    students: number;
    classes: number;
    completedAttempts: number;
    activeTeachers?: number;
    pendingInvitations?: number;
    activeClasses?: number;
  };
};
type Invitation = {
  id: string;
  invitedName?: string;
  email: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  sentAt?: string;
  deliveryState?: 'ACCEPTED_BY_PROVIDER' | 'UNCONFIRMED' | 'NOT_PENDING';
};
type Event = { id: string; event: string; occurredAt: string; result: string };
const statusNames: Record<string, string> = {
  ACTIVE: "Ativa",
  PENDING: "Pendente",
  ACCEPTED: "Aceito",
  DECLINED: "Recusado",
  CANCELLED: "Revogado",
  EXPIRED: "Expirado",
  SUSPENDED: "Suspensa",
  SUCCESS: "Sucesso",
};
const date = (value?: string) =>
  value ? new Date(value).toLocaleString("pt-BR") : "Não disponível";
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="panel side-note">
      <h2>{title}</h2>
      <p>{children}</p>
    </article>
  );
}

export function InstitutionDashboard({
  id,
  session,
  onSair,
}: {
  id: string;
  session: Session;
  onSair: () => void;
}) {
  const availability = useResource<{ enabled: boolean }>(
    "/institutions/availability",
  );
  const authorized = canManageInstitution(session, id);
  if (!authorized)
    return (
      <main className="page">
        <h1>Acesso institucional não autorizado</h1>
      </main>
    );
  if (!availability.data?.enabled)
    return (
      <main className="page">
        <h1>Administração institucional</h1>
        <ResourceState resource={availability} />
        {availability.data && (
          <p>
            Operações institucionais aguardam ativação autorizada. O cadastro e
            acompanhamento permanecem separados.
          </p>
        )}
        <button onClick={() => navigate("/instituicoes")}>
          Voltar ao acompanhamento
        </button>
      </main>
    );
  return (
    <PhotoProvider>
      <InstitutionWorkspace id={id} session={session} onSair={onSair} />
    </PhotoProvider>
  );
}

function InstitutionWorkspace({
  id,
  session,
  onSair,
}: {
  id: string;
  session: Session;
  onSair: () => void;
}) {
  const location = useInstitutionLocation();
  const params = new URL(location, window.location.origin).searchParams;
  const current = institutionSections.find(
    (s) => s.id === (params.get("secao") ?? "overview"),
  );
  const section = current?.id ?? "overview";
  const [page, setPage] = useState(1);
  const [classRevision, setClassRevision] = useState(0);
  const [dialogBusy, setDialogBusy] = useState(false);
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
              <AuthorizedContext session={session} compact />
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
          {!current ? (
            <Notice title="Seção não encontrada">
              Escolha um dos onze módulos no menu.
            </Notice>
          ) : (
            summary.data && (
              <>
                {section !== "overview" && section !== "settings" && (
                  <div className="welcome-row section-title">
                    <div>
                      <div className="section-icon">
                        <Icon name={current.icon} />
                      </div>
                      <h1>{current.label}</h1>
                      <p>{descriptions[section]}</p>
                    </div>
                    <div className="header-actions">
                      {(section === "teachers" ||
                        section === "invitations") && (
                        <button
                          className="primary-button"
                          onClick={event => { event.currentTarget.focus(); setDialog("invite"); }}
                        >
                          <Icon name="plus" />
                          Convidar professor
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {section === "overview" && (
                  <Overview
                    id={id}
                    summary={summary.data}
                    go={go}
                    open={setDialog}
                  />
                )}
                {section === "institution" && (
                  <InstitutionCard
                    institution={summary.data.institution}
                    reload={summary.reload}
                  />
                )}
                {section === "teachers" && (
                  <Teachers
                    id={id}
                    summary={summary.data}
                    page={page}
                    setPage={setPage}
                    reload={summary.reload}
                  />
                )}
                {section === "invitations" && (
                  <InvitationsTable
                    id={id}
                    revision={dialog ? "open" : "closed"}
                  />
                )}
                {section === "classes" && (
                  <ClassesPage
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
                {(section === "performance" || section === "reports") &&
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
                      mode={
                        section === "performance" ? "performance" : "reports"
                      }
                      onClassSelected={(turma) => go(section, { turma })}
                      onStudentSelected={(turma, aluno) =>
                        go(section, { turma, aluno })
                      }
                    />
                  ))}
                {section === "exams" && <ExamsPage teacher institutional />}
                {section === "notifications" && <Notifications />}
                {section === "settings" && (
                  <AuditPanel institutionId={id} />
                )}
              </>
            )
          )}
        </div>
      </main>
      {dialog && (
        <Dialog
          busy={dialogBusy}
          title={
            dialog === "invite" ? "Convidar professor" : "Criar nova turma"
          }
          close={() => setDialog(undefined)}
        >
          {dialog === "invite" ? (
            <InvitationForm
              id={id}
              restricted={session.administration?.restricted === true}
              onBusyChange={setDialogBusy}
              done={() => {
                summary.reload();
                setDialog(undefined);
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
  performance: "Consulte resultados reais por turma, disciplina e avaliação.",
  exams: "Crie e acompanhe avaliações das turmas da instituição.",
  reports: "Acesse os relatórios das turmas e de seus alunos autorizados.",
  notifications: "Consulte mensagens reais destinadas à sua conta.",
  settings: "Consulte a auditoria institucional.",
};

function Overview({id,summary,go,open}:{id:string;summary:Summary;go:(section:InstitutionSection,extra?:Record<string,string>)=>void;open:(dialog:"invite"|"class")=>void}) {
  return <div className="institution-overview" data-institution-id={id}>
    <div className="welcome-row overview-hero"><div><p className="eyebrow">PAINEL INSTITUCIONAL</p><h1>{summary.institution.name}</h1><p>Equipe, turmas e acompanhamento da sua instituição.</p></div><span className="status success"><i />Operações disponíveis</span></div>
    <div className="metric-grid institution-key-metrics">{[
      ['Professores ativos',summary.indicators.activeTeachers,'graduation'],['Turmas em andamento',summary.indicators.activeClasses,'book'],['Alunos vinculados',summary.indicators.students,'users']
    ].map(([label,value,icon])=><div className="metric-card" key={String(label)}><div className="metric-icon gold"><Icon name={String(icon)} /></div><div className="metric-copy"><span>{label}</span><strong>{typeof value==='number'?value.toLocaleString('pt-BR'):'—'}</strong></div></div>)}</div>
    <section className="panel institution-actions"><div><p className="eyebrow">AÇÕES ESSENCIAIS</p><h2>Gerenciar instituição</h2><p>Use somente recursos autorizados para esta instituição.</p></div><div className="header-actions"><button className="primary-button" onClick={()=>open('invite')}>Convidar professor</button><button className="outline-button" onClick={()=>open('class')}>Criar nova turma</button><button className="text-button" onClick={()=>go('reports')}>Consultar relatórios</button></div></section>
    <Notifications recent/>
  </div>;
}

function InstitutionCard({
  institution,
  reload,
}: {
  institution: Institution;
  reload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const action = useMutation(reload);
  return (
    <div className="institution-profile-page">
      <header className="institution-page-hero">
        <div><p className="eyebrow">IDENTIDADE INSTITUCIONAL</p><h1>Minha instituição</h1><p>Dados cadastrais, situação atual e informações autorizadas para gestão.</p></div>
        <div className="institution-statuses" aria-label="Situação institucional"><span className="status success"><i />Cadastro {statusNames[institution.status] ?? institution.status}</span><span className="status success"><i />Operacional neste painel</span></div>
      </header>
      <div className="institution-layout">
      <section className="panel profile-card">
        <div className="profile-hero">
          <div className="large-institution">{initials(institution.name)}</div>
          <div>
            <h2>{institution.name}</h2>
            <span>Instituição cadastrada</span>
          </div>
        </div>
        <div className="info-grid">
          <div>
            <span>Identificador institucional</span>
            <strong className="institution-id">{institution.id}</strong>
          </div>
          <div>
            <span>E-mail do responsável</span>
            <strong>{institution.email}</strong>
          </div>
          <div>
            <span>Telefone</span>
            <strong>{institution.phone}</strong>
          </div>
          <div>
            <span>Data de cadastro</span>
            <strong>{date(institution.createdAt)}</strong>
          </div>
          <div className="wide">
            <span>Informações institucionais</span>
            <strong>{institution.description}</strong>
          </div>
          <div>
            <span>CNPJ</span>
            <strong>{institution.registrationNumber ?? "Não informado"}</strong>
          </div>
        </div>
        <button className="primary-button" aria-label="Editar dados autorizados" onClick={() => setEditing(!editing)}>
          {editing ? "Cancelar edição" : "Administrar instituição"}
        </button>
        {action.feedback}
        {editing && (
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void action
                .run(`/institutions/${institution.id}`, "PATCH", {
                  name: data.get("name"),
                  phone: data.get("phone"),
                  description: data.get("description"),
                })
                .then((ok) => {
                  if (ok) setEditing(false);
                });
            }}
          >
            <label>
              Nome
              <input
                name="name"
                defaultValue={institution.name}
                required
                minLength={2}
                maxLength={180}
              />
            </label>
            <label>
              Telefone
              <input
                name="phone"
                defaultValue={institution.phone}
                required
                minLength={8}
                maxLength={25}
              />
            </label>
            <label>
              Informações
              <textarea
                name="description"
                defaultValue={institution.description}
                required
                minLength={10}
                maxLength={2000}
              />
            </label>
            <button className="primary-button" disabled={action.busy}>
              Salvar dados
            </button>
          </form>
        )}
      </section>
      <aside className="panel contact-card">
        <p className="eyebrow">RESPONSÁVEL</p>
        <h2>Responsável institucional</h2>
        <div className="person-cell">
          <div className="avatar">{initials(institution.responsibleName)}</div>
          <div>
            <strong>{institution.responsibleName}</strong>
            <span>Responsável cadastrado</span>
          </div>
        </div>
        <div className="contact-row">
          <Icon name="file" />
          {institution.email}
        </div>
        <div className="contact-row">
          <Icon name="user" />
          Vínculo administrativo validado
        </div>
        <div className="analysis-note"><strong>Análise cadastral</strong><span>As informações apresentadas refletem o cadastro aprovado. A operação depende das autorizações válidas deste contexto.</span></div>
      </aside>
      </div>
    </div>
  );
}

function Teachers({
  id,
  summary,
  page,
  setPage,
  reload,
}: {
  id: string;
  summary: Summary;
  page: number;
  setPage: (page: number) => void;
  reload: () => void;
}) {
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Member>();
  const action = useMutation(reload);
  const teachers = summary.teachers.items.filter((m) =>
    `${m.user?.nome ?? ""} ${m.user?.email ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="panel table-panel">
      <div className="table-toolbar">
        <div className="search-box">
          <Icon name="search" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar professor nesta página…"
            aria-label="Buscar professor nesta página"
          />
        </div>
      </div>
      {action.feedback}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Professor</th>
              <th>Situação</th>
              <th>Gestão das turmas</th>
              <th>Última atividade</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((member) => (
              <tr key={member.id}>
                <td>
                  <div className="person-cell">
                    <div className="avatar soft">
                      {initials(member.user?.nome ?? "Professor")}
                    </div>
                    <div>
                      <strong>
                        {member.user?.nome ?? "Conta indisponível"}
                      </strong>
                      <span>{member.user?.email ?? "E-mail indisponível"}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span
                    className={`status ${member.active ? "success" : "neutral"}`}
                  >
                    <i />
                    {member.active ? "Ativo" : "Desvinculado"}
                  </span>
                </td>
                <td>Designação pela instituição</td>
                <td>Não informada</td>
                <td>
                  {member.active && (
                    <button
                      className="outline-button"
                      disabled={action.busy}
                      onClick={() => setSelected(member)}
                    >
                      Desvincular
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {teachers.length === 0 && <p>Nenhum professor nesta página ou filtro.</p>}
      <Pages page={page} hasMore={summary.teachers.hasMore} change={setPage} />
      {selected && (
        <Dialog
          title="Desvincular professor"
          close={() => setSelected(undefined)}
        >
          <p>
            O professor perde a gestão das turmas desta instituição. Contas,
            questões, simulados e históricos serão preservados.
          </p>
          <button
            className="primary-button"
            disabled={action.busy}
            onClick={() =>
              void action
                .run(
                  `/institutions/${id}/teachers/${selected.userId}`,
                  "DELETE",
                )
                .then((ok) => {
                  if (ok) setSelected(undefined);
                })
            }
          >
            Confirmar desvinculação
          </button>
        </Dialog>
      )}
    </div>
  );
}

function InvitationsTable({ id, revision }: { id: string; revision: string }) {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [cancel, setCancel] = useState<Invitation>();
  const resource = useResource<Page<Invitation>>(
    `/institutions/${id}/invitations?page=${page}${status ? `&status=${status}` : ""}`,
  );
  useEffect(() => {
    resource.reload();
  }, [revision]);
  const action = useMutation(resource.reload);
  return (
    <div className="panel table-panel">
      <div className="invite-head">
        <div>
          <div className="eyebrow">CONVITES INSTITUCIONAIS</div>
          <h2>Acompanhe suas solicitações</h2>
          <p>Tokens seguros, uso único e validade informada em cada convite.</p>
        </div>
        <label>
          Estado
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {["PENDING", "ACCEPTED", "EXPIRED", "CANCELLED", "DECLINED"].map(
              (s) => (
                <option key={s} value={s}>
                  {statusNames[s]}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      {action.feedback}
      <ResourceState resource={resource} />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Professor</th>
              <th>Criado em</th>
              <th>Expira em</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {resource.data?.items.map((invite) => (
              <tr key={invite.id}>
                <td>
                  <div className="person-cell">
                    <div className="avatar soft">
                      {initials(invite.invitedName ?? invite.email)}
                    </div>
                    <div>
                      <strong>
                        {invite.invitedName ?? "Professor convidado"}
                      </strong>
                      <span>{invite.email}</span>
                    </div>
                  </div>
                </td>
                <td>{date(invite.createdAt)}</td>
                <td>{date(invite.expiresAt)}</td>
                <td>
                  <span
                    className={`status ${invite.status === "ACCEPTED" ? "success" : invite.status === "PENDING" ? "warning" : "neutral"}`}
                  >
                    <i />
                    {statusNames[invite.status] ?? invite.status}
                  </span>
                  {invite.status === 'PENDING' && invite.deliveryState === 'UNCONFIRMED' && <p role="status">Envio não confirmado. Verifique a entrega antes de reenviar.</p>}
                </td>
                <td>
                  {["PENDING", "EXPIRED", "CANCELLED"].includes(invite.status) && (
                    <>
                      <button
                        className="outline-button"
                        disabled={action.busy || (invite.status === 'PENDING' && invite.deliveryState === 'UNCONFIRMED')}
                        onClick={() =>
                          void action.run(
                            `/institutions/${id}/invitations/${invite.id}/resend`,
                            "POST",
                          )
                        }
                      >
                        Reenviar
                      </button>
                      {invite.status !== 'CANCELLED' && <button
                        className="outline-button"
                        disabled={action.busy}
                        onClick={() => setCancel(invite)}
                      >
                        Cancelar
                      </button>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resource.data?.items.length === 0 && <p>Nenhum convite neste filtro.</p>}
      <Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />
      {cancel && (
        <Dialog title="Cancelar convite" close={() => setCancel(undefined)}>
          <p>O link enviado deixará de permitir ativação.</p>
          <button
            className="primary-button"
            disabled={action.busy}
            onClick={() =>
              void action
                .run(`/institutions/${id}/invitations/${cancel.id}`, "DELETE")
                .then((ok) => {
                  if (ok) setCancel(undefined);
                })
            }
          >
            Confirmar cancelamento
          </button>
        </Dialog>
      )}
    </div>
  );
}

function InvitationForm({ id, done, restricted, onBusyChange }: { id: string; done: () => void; restricted: boolean; onBusyChange: (busy: boolean) => void }) {
  const [page, setPage] = useState(1);
  const [selectedClass, setSelectedClass] = useState<{ id: string; nome: string }>();
  const pending = useRef(false);
  const classes = useResource<Page<Class>>(`/turmas?page=${page}`);
  const action = useMutation(done);
  return (
    <form
      className="admin-form institution-invitation-form"
      aria-busy={action.busy}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending.current) return;
        const data = new FormData(e.currentTarget);
        pending.current = true; onBusyChange(true);
        void action.run(`/institutions/${id}/invitations`, "POST", {
          name: data.get("name"),
          email: data.get("email"),
          classIds: selectedClass ? [selectedClass.id] : [],
        }).finally(() => { pending.current = false; onBusyChange(false); });
      }}
    >
      <p>
        Uma conta já cadastrada como Aluno pode receber convite. O envio não altera a conta; ao aceitar, ela passa a Professor e preserva seu histórico. Para manter o perfil Aluno separado, use outra conta.
      </p>
      {restricted && <p className="institution-invitation-scope" role="note">Neste ambiente de testes, os convites dependem de autorização prévia. Se não puder convidar uma pessoa, procure o responsável pela homologação.</p>}
      {!restricted && <p>Para quem ainda não tem conta, o link oferece primeiro acesso protegido por token e aceite dos termos. O cadastro público não atribui o papel Professor.</p>}
      <label>
        Nome completo
        <input name="name" data-dialog-autofocus disabled={action.busy} required minLength={2} maxLength={120} />
      </label>
      <label>
        E-mail profissional
        <input type="email" name="email" disabled={action.busy} required maxLength={254} />
      </label>
      <label>
        Turma inicial (opcional)
        <select name="classId" value={selectedClass?.id ?? ''} disabled={action.busy || classes.loading || !!classes.error} onChange={event => setSelectedClass(classes.data?.items.find(turma => turma.id === event.target.value))}>
          <option value="">Sem designação inicial</option>
          {selectedClass && !classes.data?.items.some(turma => turma.id === selectedClass.id) && <option value={selectedClass.id}>{selectedClass.nome} (selecionada)</option>}
          {classes.data?.items
            .filter((c) => !c.archivedAt)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
        </select>
      </label>
      <ResourceState resource={classes} />
      {(page > 1 || classes.data?.hasMore) && <nav className="institution-class-pagination" aria-label="Páginas das turmas disponíveis"><button type="button" className="outline-button" disabled={action.busy || classes.loading || page <= 1} onClick={() => setPage(value => value - 1)}>Turmas anteriores</button><span>Página {page}</span><button type="button" className="outline-button" disabled={action.busy || classes.loading || !classes.data?.hasMore} onClick={() => setPage(value => value + 1)}>Mais turmas</button></nav>}
      {action.feedback}
      <button className="primary-button" disabled={action.busy}>
        {action.busy ? 'Enviando convite...' : 'Enviar convite'}
      </button>
    </form>
  );
}
function CreateClass({ done }: { done: () => void }) {
  const action = useMutation(done);
  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run("/turmas", "POST", {
          nome: new FormData(e.currentTarget).get("nome"),
        });
      }}
    >
      <label>
        Nome da turma
        <input name="nome" required minLength={2} maxLength={150} />
      </label>
      <p>
        A turma pertence à instituição. Designe professores autorizados após a
        criação.
      </p>
      {action.feedback}
      <button className="primary-button" disabled={action.busy}>
        Criar turma institucional
      </button>
    </form>
  );
}
function TeacherAssignment({
  id,
  turma,
  reload,
}: {
  id: string;
  turma: Class;
  reload: () => void;
}) {
  const [page, setPage] = useState(1),
    [teacher, setTeacher] = useState(""),
    [remove, setRemove] = useState<string>();
  const summary = useResource<Summary>(
    `/institutions/${id}/summary?page=${page}`,
  );
  const action = useMutation(reload);
  return (
    <section className="institution-delegation">
      <h3>Professores designados</h3>
      {turma.professores?.length === 0 && <p>Nenhum professor designado.</p>}
      {turma.professores?.map((p) => (
        <div key={p.id}>
          <span>{p.nome}</span>
          <button
            className="outline-button"
            disabled={action.busy}
            onClick={() => setRemove(p.id)}
          >
            Retirar designação
          </button>
        </div>
      ))}
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(`/turmas/${turma.id}/teachers/${teacher}`, "PUT", {
            assigned: true,
          });
        }}
      >
        <label>
          Professor com vínculo ativo
          <select
            required
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
          >
            <option value="">Selecione</option>
            {summary.data?.teachers.items
              .filter((t) => t.active && t.user)
              .map((t) => (
                <option key={t.id} value={t.userId}>
                  {t.user!.nome}
                </option>
              ))}
          </select>
        </label>
        <ResourceState resource={summary} />
        <Pages
          page={page}
          hasMore={summary.data?.teachers.hasMore}
          change={setPage}
        />
        <button
          className="outline-button"
          disabled={action.busy || !!turma.archivedAt}
        >
          Designar professor
        </button>
      </form>
      {action.feedback}
      {remove && (
        <Dialog title="Retirar delegação" close={() => setRemove(undefined)}>
          <p>
            A gestão desta turma será revogada sem apagar seus recursos ou
            históricos.
          </p>
          <button
            className="primary-button"
            disabled={action.busy}
            onClick={() =>
              void action
                .run(`/turmas/${turma.id}/teachers/${remove}`, "PUT", {
                  assigned: false,
                })
                .then((ok) => {
                  if (ok) setRemove(undefined);
                })
            }
          >
            Confirmar retirada
          </button>
        </Dialog>
      )}
    </section>
  );
}
function Notifications({recent=false}:{recent?:boolean}={}) {
  const [page, setPage] = useState(1);
  const resource = useResource<
    Page<{ id: string; message: string; createdAt: string }>
  >(`/institutions/notifications?page=${page}`);
  if(recent&&resource.data?.items.length===0)return null;
  return (
    <section className="panel">
      {recent&&<h2>Notificações recentes</h2>}
      <p>
        Mensagens destinadas à sua conta, incluindo suas instituições.
      </p>
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && <p>Nenhuma notificação.</p>}
      {resource.data?.items.map((n) => (
        <article className="institution-notification" key={n.id}>
          <h2>{n.message}</h2>
          <time>{date(n.createdAt)}</time>
        </article>
      ))}
      <Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />
    </section>
  );
}
function Dialog({
  title,
  close,
  children,
  busy = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const dark = useContext(ModalTheme);
  const dialog = useRef<HTMLDivElement>(null),
    closeRef = useRef(close);
  const busyRef = useRef(busy);
  closeRef.current = close;
  busyRef.current = busy;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const workspace = document.querySelector<HTMLElement>('.institution-workspace:not(.institution-dialog-layer)');
    const priorInert = workspace?.inert;
    const priorOverflow = document.body.style.overflow;
    if (workspace) workspace.inert = true;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ) ?? [],
      ).filter(element => element.getClientRects().length > 0);
    (dialog.current?.querySelector<HTMLElement>('[data-dialog-autofocus], input:not(:disabled)') ?? focusable()[0] ?? dialog.current)?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); if (!busyRef.current) closeRef.current(); }
      if (e.key === "Tab") {
        const nodes = focusable(),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (!nodes.length) { e.preventDefault(); dialog.current?.focus(); }
        else if (!dialog.current?.contains(document.activeElement)) { e.preventDefault(); first?.focus(); }
        else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("keydown", keyboard);
      if (workspace) workspace.inert = priorInert ?? false;
      document.body.style.overflow = priorOverflow;
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  return createPortal(
    <div className={`institution-workspace institution-dialog-layer${dark ? ' dark-mode' : ''}`}><div className="modal-backdrop" role="presentation">
      <div
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy}
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" disabled={busy} onClick={close}>
            <Icon name="close" />
          </button>
        </div>
        <div className="institution-dialog-body">{children}</div>
        <div className="modal-footer">
          {busy && <p role="status">Aguarde a confirmação do envio.</p>}
          <button type="button" className="outline-button" disabled={busy} onClick={close}>
            Fechar
          </button>
        </div>
      </div>
    </div></div>, document.body
  );
}
