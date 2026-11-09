import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api";
import { refreshSession, useSession, type Session } from "./auth-session";
import { navigate, usePath } from "./navigation";
import {
  adminSection,
  adminSections,
  type AdminSectionId,
} from "./admin-navigation";
import "./administration.css";
import {
  administrativeCapability,
  registrationAvailable,
  type AdministrationAvailability,
  type AdministrativeCapability,
} from "./administration-availability";

type Page<T> = { items: T[]; page: number; hasMore: boolean };
type Institution = {
  id: string;
  name: string;
  status: string;
  email: string;
  responsibleName: string;
  registrationNumber?: string;
  phone: string;
  description: string;
  decisionReason?: string;
};
type Member = {
  id: string;
  userId: string;
  active: boolean;
  user?: { nome: string; email: string };
};
type Invitation = {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  sentAt: string | null;
};
type AdminUser = {
  id: string;
  nome: string;
  email: string;
  role: string;
  suspended: boolean;
  emailVerifiedAt?: string | null;
  memberships: {
    role: string;
    active: boolean;
    institution: { name: string; status: string };
  }[];
};
type Event = {
  id: string;
  occurredAt: string;
  event: string;
  actorId?: string;
  institutionId?: string;
  resourceId?: string;
  result: string;
  severity: string;
};
type PlatformAuditEvent = {
  id: string;
  occurredAt: string;
  action: string;
  userId: string | null;
  resourceId: string | null;
  termsVersion: string | null;
  privacyVersion: string | null;
};
const platformAuditActions = [
  "ACEITE_TERMOS_E_PRIVACIDADE",
  "USUARIO_CADASTRADO",
  "LOGIN_SUCESSO",
  "LOGIN_FALHA",
  "DIAGNOSTICO_INICIADO",
  "DIAGNOSTICO_FINALIZADO",
  "QUESTAO_CRIADA",
  "QUESTAO_ATUALIZADA",
  "QUESTAO_EXCLUIDA",
  "PASSWORD_RECOVERY_REQUESTED",
  "PASSWORD_RECOVERY_COMPLETED",
  "EMAIL_CONFIRMADO",
  "SENHA_REDEFINIDA",
  "CONTA_EXCLUIDA",
  "RECUPERACAO_SENHA_SOLICITADA",
] as const;
const sectionDescriptions: Record<AdminSectionId, string> = {
  overview:
    "Consulte os eventos reais da plataforma e os indicadores disponíveis para sua conta administrativa.",
  institutions:
    "Consulte instituições cadastradas, seus responsáveis e decisões de aprovação ou suspensão.",
  requests:
    "Analise solicitações institucionais e registre decisões com justificativa.",
  users:
    "Consulte contas, vínculos e permissões. Alterações dependem das proteções do servidor.",
  teachers:
    "Consulte contas de professores e seus vínculos institucionais, sem alterar o histórico acadêmico.",
  classes:
    "A gestão pedagógica pertence à instituição e aos professores com vínculo autorizado; não integra as permissões globais.",
  audit:
    "Consulte a auditoria da plataforma e, quando disponível, os eventos administrativos institucionais.",
  security:
    "Confira a segurança da sua conta e consulte os eventos de autenticação registrados.",
  notifications:
    "Consulte notificações institucionais destinadas à sua conta, quando o recurso estiver disponível.",
  settings:
    "Acesse seu perfil e as preferências pessoais. Configurações globais não possuem API de edição.",
};
const institutionalUnavailable: Partial<
  Record<AdminSectionId, { endpoint: string; message: string }>
> = {
  institutions: {
    endpoint: "/institutions/admin/institutions",
    message:
      "A consulta, aprovação, recusa e suspensão de instituições dependem da habilitação administrativa.",
  },
  requests: {
    endpoint: "/institutions/admin/institutions?status=PENDING",
    message:
      "A fila de solicitações e suas decisões permanecem bloqueadas. Nenhuma solicitação foi consultada ou alterada.",
  },
  users: {
    endpoint: "/institutions/admin/users",
    message:
      "A listagem global, os vínculos, a suspensão e as permissões de contas dependem da habilitação administrativa. Seu próprio perfil permanece acessível.",
  },
  teachers: {
    endpoint: "/institutions/admin/users?role=PROFESSOR",
    message:
      "A consulta de professores e vínculos está protegida pela capacidade administrativa. As contas existentes não são removidas nem regularizadas por esta tela.",
  },
  classes: {
    endpoint: "/institutions/admin/classes",
    message:
      "A consulta de turmas sem instituição e a operação de vínculo dependem da ativação institucional. Não há outra listagem global equivalente disponível.",
  },
  notifications: {
    endpoint: "/institutions/notifications",
    message:
      "Esta API retorna notificações destinadas ao usuário autenticado, mas depende da habilitação administrativa. Não existe uma rota independente GET /notifications neste backend.",
  },
};
const labels: Record<string, string> = {
  EMAIL_PENDING: "Aguardando confirmação de e-mail",
  PENDING: "Pendente",
  ACTIVE: "Ativa",
  REJECTED: "Recusada",
  SUSPENDED: "Suspensa",
  ACCEPTED: "Aceito",
  CANCELLED: "Cancelado",
  DECLINED: "Recusado",
  EXPIRED: "Expirado",
  APPROVED: "Aprovada",
  REMOVED: "Removido",
  ALUNO: "Aluno",
  PROFESSOR: "Professor",
  ADMIN: "Administrador geral",
  INSTITUTION_ADMIN: "Administrador institucional",
  TEACHER: "Professor",
};
const label = (value: string) => labels[value] ?? value;
const date = (value: string) => new Date(value).toLocaleString("pt-BR");
const json = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível concluir a operação.";

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError("");
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void apiRequest<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, error, loading, reload: () => setRevision((r) => r + 1) };
}
export function ResourceState({
  resource,
}: {
  resource: { loading: boolean; error: string; reload: () => void };
}) {
  return (
    <>
      {resource.loading && <p role="status">Carregando…</p>}
      {resource.error && (
        <div role="alert" className="error">
          <p>{resource.error}</p>
          <button onClick={resource.reload}>Tentar novamente</button>
        </div>
      )}
    </>
  );
}
export function Pages({
  page,
  hasMore,
  change,
}: {
  page: number;
  hasMore?: boolean;
  change: (n: number) => void;
}) {
  return (
    <div className="admin-actions">
      <button
        className="outline-button"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        Anterior
      </button>
      <span>Página {page}</span>
      <button
        className="outline-button"
        disabled={!hasMore}
        onClick={() => change(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
export function useMutation(reload: () => void) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  async function run(path: string, method: string, body?: unknown) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const result = await apiRequest<{ message?: string }>(
        path,
        json(method, body),
      );
      setNotice(result.message ?? "Operação concluída.");
      reload();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    run,
    feedback: (
      <>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </>
    ),
  };
}
export function InstitutionContext({ session }: { session: Session }) {
  const memberships =
    session.administration?.memberships.filter((m) => m.role === "TEACHER") ??
    [];
  const current =
    sessionStorage.getItem("jurissim_institution") ??
    (memberships.length === 1 ? memberships[0].institutionId : "");
  if (
    !session.administration || memberships.length===0 ||
    session.user.role !== "PROFESSOR"
  )
    return null;
  return (
    <div className="institution-context">
      <label>
        Instituição de trabalho
        <select
          value={current}
          onChange={(e) => {
            if (e.target.value)
              sessionStorage.setItem("jurissim_institution", e.target.value);
            else sessionStorage.removeItem("jurissim_institution");
            window.location.assign("/professor");
          }}
        >
          <option value="">Selecione a instituição</option>
          {memberships.map((m) => (
            <option key={m.institutionId} value={m.institutionId}>
              {m.institution.name}
            </option>
          ))}
        </select>
      </label>
      {!current && (
        <p>
          Escolha uma instituição para administrar suas turmas e relatórios.
        </p>
      )}
    </div>
  );
}
function Notifications() {
  const [page, setPage] = useState(1);
  const resource = useResource<
    Page<{ id: string; message: string; createdAt: string }>
  >(`/institutions/notifications?page=${page}`);
  return (
    <section>
      <h2>Notificações</h2>
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && <p>Nenhuma notificação.</p>}
      {resource.data?.items.map((n) => (
        <article className="panel" key={n.id}>
          <time>{date(n.createdAt)}</time>
          <p>{n.message}</p>
        </article>
      ))}
      <Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />
    </section>
  );
}
export function AuditPanel({
  institutionId,
  initialInstitutionId,
}: {
  institutionId?: string;
  initialInstitutionId?: string;
}) {
  const [page, setPage] = useState(1),
    [filters, setFilters] = useState<Record<string, string>>(
      initialInstitutionId ? { institutionId: initialInstitutionId } : {},
    ),
    [draft, setDraft] = useState<Record<string, string>>(
      initialInstitutionId ? { institutionId: initialInstitutionId } : {},
    );
  const query = new URLSearchParams({ page: String(page), ...filters });
  const resource = useResource<Page<Event>>(
    `/institutions/${institutionId ? `${institutionId}/logs` : "admin/logs"}?${query}`,
  );
  return (
    <section>
      <h2>Logs e Auditoria</h2>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setFilters(
            Object.fromEntries(Object.entries(draft).filter(([, v]) => v)),
          );
        }}
      >
        {["event", "actorId", ...(institutionId ? [] : ["institutionId"])].map(
          (field, i) => (
            <label key={field}>
              {["Evento", "ID do usuário", "ID da instituição"][i]}
              <input
                value={draft[field] ?? ""}
                maxLength={80}
                onChange={(e) =>
                  setDraft({ ...draft, [field]: e.target.value })
                }
              />
            </label>
          ),
        )}
        <label>
          Gravidade
          <select
            value={draft.severity ?? ""}
            onChange={(e) => setDraft({ ...draft, severity: e.target.value })}
          >
            <option value="">Todas</option>
            <option>INFO</option>
            <option>WARN</option>
            <option>ERROR</option>
          </select>
        </label>
        {["from", "to"].map((field, i) => (
          <label key={field}>
            {i ? "Até" : "Desde"}
            <input
              type="datetime-local"
              onChange={(e) =>
                setDraft({
                  ...draft,
                  [field]: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : "",
                })
              }
            />
          </label>
        ))}
        <button>Aplicar filtros</button>
      </form>
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && <p>Nenhum evento neste período.</p>}
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data e hora</th>
              <th>Evento</th>
              <th>Responsável</th>
              <th>Entidade / instituição</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {resource.data?.items.map((e) => (
              <tr key={e.id}>
                <td>{date(e.occurredAt)}</td>
                <td>
                  {e.event}
                  <small>{e.severity}</small>
                </td>
                <td>{e.actorId ?? "Não identificado"}</td>
                <td>
                  {e.resourceId ?? "—"}
                  <small>{e.institutionId}</small>
                </td>
                <td>{e.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />
    </section>
  );
}
function PlatformAuditPanel() {
  const [draft, setDraft] = useState({
    action: "",
    userId: "",
    from: "",
    to: "",
    limit: "25",
  });
  const [query, setQuery] = useState("limit=25");
  const [validation, setValidation] = useState("");
  const resource = useResource<PlatformAuditEvent[]>(`/audit-logs?${query}`);
  return (
    <section className="panel">
      <h2>Auditoria da plataforma</h2>
      <p>
        Registros de autenticação, contas e atividades. Esta consulta é
        independente do módulo institucional e exige ADMIN.
      </p>
      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            draft.from &&
            draft.to &&
            new Date(draft.from) > new Date(draft.to)
          ) {
            setValidation(
              "O início do período deve ser anterior ou igual ao fim.",
            );
            return;
          }
          setValidation("");
          const params = new URLSearchParams({ limit: draft.limit });
          if (draft.action) params.set("action", draft.action);
          if (draft.userId.trim()) params.set("userId", draft.userId.trim());
          if (draft.from)
            params.set("from", new Date(draft.from).toISOString());
          if (draft.to) params.set("to", new Date(draft.to).toISOString());
          const next = params.toString();
          if (next === query) resource.reload();
          else setQuery(next);
        }}
      >
        <label>
          Ação
          <select
            value={draft.action}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
          >
            <option value="">Todas</option>
            {platformAuditActions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label>
          ID do usuário
          <input
            value={draft.userId}
            maxLength={36}
            pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
            title="Identificador UUID do usuário"
            onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
          />
        </label>
        {(["from", "to"] as const).map((field) => (
          <label key={field}>
            {field === "from" ? "Desde" : "Até"}
            <input
              type="datetime-local"
              value={draft[field]}
              onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Limite de registros
          <select
            value={draft.limit}
            onChange={(e) => setDraft({ ...draft, limit: e.target.value })}
          >
            {[25, 50, 100].map((limit) => (
              <option key={limit} value={limit}>
                {limit}
              </option>
            ))}
          </select>
        </label>
        <button>Consultar registros</button>
      </form>
      {validation && (
        <p className="error" role="alert">
          {validation}
        </p>
      )}
      <ResourceState resource={resource} />
      {resource.data?.length === 0 && (
        <p>Nenhum registro de auditoria neste período.</p>
      )}
      {resource.data && (
        <p>
          Exibindo {resource.data.length} registro(s), até o limite de{" "}
          {new URLSearchParams(query).get("limit")}. A API não fornece total
          global nem paginação.
        </p>
      )}
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data e hora</th>
              <th>Ação</th>
              <th>ID do usuário</th>
              <th>Recurso</th>
              <th>Versões legais</th>
            </tr>
          </thead>
          <tbody>
            {resource.data?.map((event) => (
              <tr key={event.id}>
                <td>
                  <time dateTime={event.occurredAt}>
                    {date(event.occurredAt)}
                  </time>
                </td>
                <td>{event.action}</td>
                <td>{event.userId ?? "Não identificado"}</td>
                <td>{event.resourceId ?? "—"}</td>
                <td>
                  {event.termsVersion || event.privacyVersion
                    ? `Termos: ${event.termsVersion ?? "—"}; Privacidade: ${event.privacyVersion ?? "—"}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function AdministrationSecurity() {
  const user = useSession().session?.user;
  return (
    <section className="panel">
      <h2>Segurança da conta administrativa</h2>
      <dl>
        <dt>Conta autenticada</dt>
        <dd>{user?.email ?? "Indisponível"}</dd>
        <dt>Papel validado pelo servidor</dt>
        <dd>{user ? label(user.role) : "Indisponível"}</dd>
        <dt>E-mail confirmado</dt>
        <dd>{user?.emailVerificado ? "Sim" : "Não confirmado"}</dd>
      </dl>
      <p>
        Consulte LOGIN_SUCESSO e LOGIN_FALHA na auditoria da plataforma. Não há
        API para contagem global de ameaças ou sessões ativas.
      </p>
      <div className="admin-actions">
        <button onClick={() => navigate("/administracao/auditoria")}>
          Consultar auditoria
        </button>
        <button onClick={() => navigate("/administracao/perfil")}>
          Segurança e perfil pessoal
        </button>
      </div>
      <p>
        Alterações de permissões e suspensão de outras contas continuam sujeitas
        ao módulo institucional e às proteções do servidor.
      </p>
    </section>
  );
}
export function GeneralAdministration() {
  const current = adminSection(usePath());
  const availability = useResource<AdministrationAvailability>(
    "/institutions/availability",
  );
  const enabled = availability.data?.enabled === true;
  const can = (name: AdministrativeCapability) =>
    administrativeCapability(availability.data, name);
  const tab = current?.id;
  const setTab = (id: AdminSectionId) =>
    navigate(adminSections.find((section) => section.id === id)!.path);
  return (
    <section className="page dashboard-page admin-page admin-workspace admin-integrated">
      <div className="dashboard-heading">
        <div>
          <p className="gold">JURISSIM · ADMINISTRAÇÃO</p>
          <h1>
            {tab === "overview"
              ? "Seu painel administrativo"
              : (current?.label ?? "Página não encontrada")}
          </h1>
          <p className="muted">
            {current
              ? sectionDescriptions[current.id]
              : "Escolha uma seção no menu administrativo."}
          </p>
        </div>
      </div>
      {!current ? (
        <div className="panel" role="status">
          <p>Esta seção administrativa não existe.</p>
          <button onClick={() => setTab("overview")}>
            Voltar à visão geral
          </button>
        </div>
      ) : (
        <>
          <ResourceState resource={availability} />
          {availability.data &&
            tab &&
            tab !== 'classes' &&
            !can(tab as AdministrativeCapability) &&
            (tab === "overview" || (tab && institutionalUnavailable[tab])) && (
              <div className="panel admin-unavailable" role="status">
                <h2>Capacidade administrativa desativada</h2>
                <p>
                  {(tab && institutionalUnavailable[tab]?.message) ||
                    "Os indicadores globais dependem da habilitação administrativa. A auditoria da plataforma e as preferências pessoais continuam independentes."}
                </p>
                {tab && institutionalUnavailable[tab] && (
                  <p>
                    Recurso protegido:{" "}
                    <code>{institutionalUnavailable[tab]!.endpoint}</code>.
                  </p>
                )}
                {tab === "users" && (
                  <button onClick={() => navigate("/administracao/perfil")}>
                    Consultar meu perfil
                  </button>
                )}
              </div>
            )}
          {tab === "overview" ? (
            <>
              <article className="dashboard-recommendation">
                <div className="recommendation-icon" aria-hidden="true">
                  ✦
                </div>
                <div className="recommendation-copy">
                  <p className="gold">ACOMPANHAMENTO ADMINISTRATIVO</p>
                  <h2>Uma visão da plataforma</h2>
                  <p>
                    Indicadores atuais e eventos administrativos registrados.
                    Dados indisponíveis são identificados sem estimativas.
                  </p>
                </div>
                <button
                  className="outline-button"
                  onClick={() => setTab("audit")}
                >
                  Ver eventos
                </button>
              </article>
              <GlobalIndicators enabled={can("overview")} />
              <div className="dashboard-grid">
                <article className="panel dashboard-panel">
                  <div className="dashboard-panel-heading">
                    <div>
                      <p className="gold">EVOLUÇÃO</p>
                      <h2>Cadastros na plataforma</h2>
                    </div>
                  </div>
                  <div className="empty-chart">
                    <span aria-hidden="true">⌁</span>
                    <p>
                      Indisponível: a API atual não fornece séries históricas de
                      cadastros.
                    </p>
                  </div>
                </article>
                <article className="panel dashboard-panel">
                  <div className="dashboard-panel-heading">
                    <div>
                      <p className="gold">POR PERFIL</p>
                      <h2>Distribuição de usuários</h2>
                    </div>
                  </div>
                  <div className="empty-chart">
                    <p>
                      Indisponível: não há endpoint de distribuição global por
                      perfil.
                    </p>
                  </div>
                </article>
                <article className="panel dashboard-panel dashboard-activity">
                  <div className="dashboard-panel-heading">
                    <div>
                      <p className="gold">ATIVIDADE</p>
                      <h2>Movimentações recentes</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setTab("audit")}
                    >
                      Ver logs e auditoria
                    </button>
                  </div>
                  <RecentAdministrativeEvents enabled={can("audit")} />
                </article>
              </div>
            </>
          ) : tab === "settings" ? (
            <section className="panel">
              <h2>Configurações globais</h2>
              <p>
                Não há endpoint para alterar configurações globais neste painel.
                Preferências pessoais continuam disponíveis no menu do perfil.
              </p>
              <p>
                Altere tema e recolhimento do menu nas preferências locais.
                Nome, foto e segurança da sua própria conta usam os fluxos
                pessoais existentes, sem ativação institucional.
              </p>
              <button
                className="outline-button"
                onClick={() => navigate("/administracao/preferencias")}
              >
                Preferências pessoais
              </button>
            </section>
          ) : tab === 'classes' ? (
            <section className="panel"><h2>Gestão pedagógica institucional</h2><p>Turmas e alunos são gerenciados pelos responsáveis e professores autorizados da própria instituição. A administração geral não possui acesso pedagógico rotineiro.</p></section>
          ) : tab === "security" ? (
            <><AdministrationSecurity />{can('users')&&<UserAdministration permissionsOnly/>}</>
          ) : tab === "audit" ? (
            <>
              <PlatformAuditPanel />
              {can("audit") ? (
                <AuditPanel />
              ) : availability.data?.enabled === false ? (
                <section className="panel">
                  <h2>Auditoria institucional indisponível</h2>
                  <p>
                    Os eventos de instituições, convites e vínculos usam
                    /institutions/admin/logs e permanecem protegidos pela flag.
                    A consulta da plataforma acima continua disponível.
                  </p>
                </section>
              ) : null}
            </>
          ) : tab && can(tab as AdministrativeCapability) ? (
            <div className="admin-section-content" key={tab}>
              {tab === "institutions" ? (
                <InstitutionReview
                  initialStatus=""
                  canDecide={can("decisions")}
                />
              ) : tab === "requests" ? (
                <InstitutionReview
                  initialStatus="PENDING"
                  canDecide={can("decisions")}
                />
              ) : tab === "users" ? (
                <UserAdministration />
              ) : tab === "teachers" ? (
                <UserAdministration initialRole="PROFESSOR" />
              ) : tab === "notifications" ? (
                <Notifications />
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
function GlobalIndicators({ enabled }: { enabled: boolean }) {
  const resource = useResource<Record<string, number>>(
    enabled ? "/institutions/admin/summary" : null,
  );
  const titles: Record<string, string> = {
    users: "Usuários cadastrados",
    institutions: "Instituições cadastradas",
    pending: "Solicitações pendentes",
    teachers: "Vínculos de professores ativos",
    classes: "Turmas não arquivadas",
    errors: "Eventos de erro nas últimas 24 horas",
  };
  return (
    <>
      <ResourceState resource={resource} />
      <div className="dashboard-stats">
        {Object.entries(titles).map(([key, title]) => (
          <article key={key}>
            <span>{title}</span>
            <strong>
              {typeof resource.data?.[key] === "number"
                ? resource.data[key].toLocaleString("pt-BR")
                : "—"}
            </strong>
            <small>
              {!enabled
                ? "Módulo desativado"
                : resource.loading
                  ? "Carregando…"
                  : resource.error || !resource.data
                    ? "Informação indisponível"
                    : key === "teachers"
                      ? "Vínculos ativos em instituições ativas"
                      : key === "users"
                        ? "Contas não excluídas"
                        : "Registro atual da plataforma"}
            </small>
          </article>
        ))}
      </div>
    </>
  );
}
function RecentAdministrativeEvents({ enabled }: { enabled: boolean }) {
  const platform = useResource<PlatformAuditEvent[]>("/audit-logs?limit=5");
  const resource = useResource<Page<Event>>(
    enabled ? "/institutions/admin/logs?page=1" : null,
  );
  return (
    <>
      <h3>Atividade da plataforma</h3>
      <ResourceState resource={platform} />
      {platform.data?.length === 0 && (
        <p className="empty-dashboard">
          Nenhum registro recente de auditoria da plataforma.
        </p>
      )}
      {platform.data?.map((event) => (
        <div className="admin-event-row" key={event.id}>
          <div>
            <strong>{event.action}</strong>
            <p>{event.userId ?? "Usuário não identificado"}</p>
          </div>
          <time dateTime={event.occurredAt}>{date(event.occurredAt)}</time>
        </div>
      ))}
      <h3>Atividade institucional</h3>
      <ResourceState resource={resource} />
      {!enabled ? (
        <p className="empty-dashboard">
          Disponível após a ativação autorizada do módulo institucional.
        </p>
      ) : resource.data?.items.length === 0 ? (
        <p className="empty-dashboard">
          Nenhum evento administrativo registrado.
        </p>
      ) : (
        resource.data?.items.slice(0, 5).map((event) => (
          <div className="admin-event-row" key={event.id}>
            <div>
              <strong>{event.event}</strong>
              <p>
                {event.result} · {event.severity}
              </p>
            </div>
            <time dateTime={event.occurredAt}>{date(event.occurredAt)}</time>
          </div>
        ))
      )}
    </>
  );
}
function InstitutionReview({
  initialStatus = "PENDING",
  canDecide = true,
}: {
  initialStatus?: string;
  canDecide?: boolean;
}) {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(initialStatus),
    [selected, setSelected] = useState<{ id: string; status: string }>(),
    [reason, setReason] = useState("");
  const resource = useResource<Page<Institution>>(
      `/institutions/admin/institutions?page=${page}${status ? `&status=${status}` : ""}`,
    ),
    action = useMutation(resource.reload);
  const [historyId, setHistoryId] = useState<string>();
  return (
    <>
      <h2>Solicitações e instituições</h2>
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
          {["EMAIL_PENDING", "PENDING", "ACTIVE", "REJECTED", "SUSPENDED"].map(
            (s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ),
          )}
        </select>
      </label>
      {action.feedback}
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && (
        <p>Nenhuma instituição neste filtro.</p>
      )}
      {resource.data?.items.map((i) => (
        <article className="panel" key={i.id}>
          <h3>{i.name}</h3>
          <p>
            {label(i.status)} · {i.registrationNumber ?? "Sem CNPJ"}
          </p>
          <p>
            {i.responsibleName} · {i.email} · {i.phone}
          </p>
          <p>{i.description}</p>
          {canDecide && <AdministrativeInstitutionDetails institution={i} reload={resource.reload}/>}
          {i.decisionReason && <p>Última decisão: {i.decisionReason}</p>}
          <div className="admin-actions">
            {(i.status === "PENDING" ||
              i.status === "SUSPENDED" ||
              i.status === "REJECTED") && (
              <button
                disabled={!canDecide || action.busy}
                onClick={() => setSelected({ id: i.id, status: "ACTIVE" })}
              >
                Aprovar / reativar
              </button>
            )}
            {i.status === "PENDING" && (
              <button
                disabled={!canDecide || action.busy}
                onClick={() => setSelected({ id: i.id, status: "REJECTED" })}
              >
                Recusar
              </button>
            )}
            {i.status === "ACTIVE" && (
              <button
                disabled={!canDecide || action.busy}
                onClick={() => setSelected({ id: i.id, status: "SUSPENDED" })}
              >
                Suspender
              </button>
            )}
          </div>
          <button
            onClick={() => setHistoryId(historyId === i.id ? undefined : i.id)}
          >
            Histórico de decisões e eventos
          </button>
        </article>
      ))}
      {selected && (
        <form
          className="panel admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action
              .run(`/institutions/admin/institutions/${selected.id}`, "PATCH", {
                status: selected.status,
                reason,
              })
              .then((ok) => {
                if (ok) {
                  setSelected(undefined);
                  setReason("");
                }
              });
          }}
        >
          <h3>Confirmar decisão: {label(selected.status)}</h3>
          <label>
            Justificativa
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={!canDecide || action.busy}>Confirmar</button>
          <button type="button" onClick={() => setSelected(undefined)}>
            Cancelar
          </button>
        </form>
      )}
      <Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />
      {historyId && (
        <AuditPanel key={historyId} initialInstitutionId={historyId} />
      )}
    </>
  );
}
function UserAdministration({ initialRole = "",permissionsOnly=false }: { initialRole?: string;permissionsOnly?:boolean }) {
  const currentUserId = useSession().session?.user.id;
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [draft, setDraft] = useState(""),
    [role, setRole] = useState(initialRole);
  const [change, setChange] = useState<{
    id: string;
    body: object;
    title: string;
  }>();
  const resource = useResource<Page<AdminUser>>(
      `/institutions/admin/users?${new URLSearchParams({ page: String(page), ...(search ? { search } : {}), ...(role ? { role } : {}) })}`,
    ),
    action = useMutation(resource.reload);
  return (
    <>
      <h2>{permissionsOnly?'Permissões administrativas':'Contas e vínculos administrativos'}</h2>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft);
          setPage(1);
        }}
      >
        <label>
          Nome ou e-mail
          <input
            maxLength={120}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <label>
          Perfil
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {["ALUNO", "PROFESSOR", "ADMIN"].map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
        </label>
        <button>Pesquisar</button>
      </form>
      {action.feedback}
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && <p>Nenhuma conta encontrada.</p>}
      {resource.data?.items.map((u) => (
        <article className="panel" key={u.id}>
          <h3>{u.nome}</h3>
          <p>
            {u.email} · {label(u.role)} · {u.suspended ? "Suspenso" : "Ativo"}
          </p>
          {u.role === "PROFESSOR" && (
            <p>
              Transição:{" "}
              {u.emailVerifiedAt
                ? "e-mail confirmado"
                : "confirmação de e-mail pendente"}
              ;{" "}
              {u.memberships.some(
                (m) =>
                  m.role === "TEACHER" &&
                  m.active &&
                  m.institution.status === "ACTIVE",
              )
                ? "vínculo docente ativo"
                : "vínculo institucional docente pendente"}
              . A regularização exige confirmação pelo titular e vínculo
              legítimo autorizado; não é automática.
            </p>
          )}
          {u.memberships.map((m, index) => (
            <p key={index}>
              {m.institution.name}: {label(m.role)} (
              {m.active ? "vínculo ativo" : "desvinculado"}; instituição{" "}
              {label(m.institution.status)})
            </p>
          ))}
          <div className="admin-actions">
            {!permissionsOnly&&<button
              disabled={action.busy || u.id === currentUserId}
              onClick={() =>
                setChange({
                  id: u.id,
                  body: { suspended: !u.suspended },
                  title: u.suspended ? "Reativar conta" : "Suspender conta",
                })
              }
            >
              {u.suspended ? "Reativar" : "Suspender"}
            </button>}
            {permissionsOnly&&<button
              disabled={action.busy || u.id === currentUserId}
              onClick={() =>
                setChange({
                  id: u.id,
                  body: { globalAdmin: u.role !== "ADMIN" },
                  title:
                    u.role === "ADMIN"
                      ? "Revogar administração geral"
                      : "Conceder administração geral",
                })
              }
            >
              {u.role === "ADMIN"
                ? "Revogar administração geral"
                : "Conceder administração geral"}
            </button>}
          </div>
        </article>
      ))}
      {change && (
        <div className="panel" role="alert">
          <p>{change.title}? As sessões anteriores da conta serão revogadas.</p>
          <button
            disabled={action.busy}
            onClick={() => {
              void action
                .run(
                  `/institutions/admin/users/${change.id}`,
                  "PATCH",
                  change.body,
                )
                .then((ok) => {
                  if (ok) setChange(undefined);
                });
            }}
          >
            Confirmar alteração
          </button>
          <button onClick={() => setChange(undefined)}>Cancelar</button>
        </div>
      )}
      <Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />
    </>
  );
}
export function InstitutionsPortal({ session }: { session: Session }) {
  const availability = useResource<AdministrationAvailability>(
    "/institutions/availability",
  );
  const resource = useResource<Institution[]>(
    registrationAvailable(availability.data) ||
      availability.data?.administrationEnabled
      ? "/institutions/mine"
      : null,
  );
  const adminIds =
    session.administration?.memberships
      .filter((m) => m.role === "INSTITUTION_ADMIN")
      .map((m) => m.institutionId) ?? [];
  return (
    <section className="page admin-page">
      <p className="gold">INSTITUIÇÕES</p>
      <h1>Cadastro e acompanhamento institucional</h1>
      <p>
        Solicite o cadastro sem vínculo anterior. Sua solicitação será analisada
        pelo administrador geral; o envio não concede privilégios.
      </p>
      <button
        className="outline-button"
        onClick={() => {
          void refreshSession(true)
            .then(resource.reload)
            .catch(() => {});
        }}
      >
        Atualizar situação e permissões
      </button>
      <ResourceState resource={availability} />
      {availability.data &&
      !registrationAvailable(availability.data) &&
      !availability.data.administrationEnabled ? (
        <p>
          O recebimento de solicitações ainda não foi habilitado. Não é
          necessário vínculo prévio; quando autorizado, use sua conta individual
          para enviar e acompanhar a solicitação.
        </p>
      ) : (
        (registrationAvailable(availability.data) ||
          availability.data?.administrationEnabled) && (
          <>
            <ResourceState resource={resource} />
            {registrationAvailable(availability.data) && session.user.emailVerificado ? (
              <InstitutionRequest
                onCreated={resource.reload}
                contactEmail={session.user.email}
              />
            ) : (
              <p>
                Confirme seu e-mail antes de enviar uma nova solicitação. Se o recebimento estiver desabilitado, o acompanhamento das existentes permanece disponível.
              </p>
            )}
            <h2>Meus vínculos e solicitações</h2>
            {resource.data?.length === 0 && (
              <p>Nenhuma solicitação ou vínculo institucional.</p>
            )}
            {resource.data?.map((i) => (
              <article className="panel" key={i.id}>
                <h3>{i.name}</h3>
                <p>{label(i.status)}</p>
                {i.decisionReason && <p>{i.decisionReason}</p>}
                {!availability.data?.enabled && i.status === "ACTIVE" && (
                  <p>
                    Cadastro aprovado; operações institucionais aguardam
                    ativação separada.
                  </p>
                )}
                {availability.data?.enabled && adminIds.includes(i.id) && (
                  <button onClick={() => {sessionStorage.setItem('jurissim_administration_institution',i.id);window.history.replaceState({},'',`/instituicoes?instituicao=${encodeURIComponent(i.id)}`);window.dispatchEvent(new Event('jurissim-institution-context'));}}>
                    Administrar instituição
                  </button>
                )}
              </article>
            ))}

            {session.user.emailVerificado &&
              administrativeCapability(availability.data, "notifications") && (
                <Notifications />
              )}
          </>
        )
      )}
    </section>
  );
}
function InstitutionRequest({
  onCreated,
  contactEmail,
}: {
  onCreated: () => void;
  contactEmail: string;
}) {
  const action = useMutation(onCreated),
    [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  return (
    <>
      <button className="outline-button" onClick={() => setOpen(!open)}>
        {open ? "Fechar solicitação" : "Solicitar cadastro de instituição"}
      </button>
      {action.feedback}
      {submitted && (
        <p role="status">
          Solicitação enviada para análise. Acompanhe a situação abaixo; a
          aprovação exige confirmação do e-mail e decisão do administrador
          geral.
        </p>
      )}
      {open && (
        <form
          className="panel admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const body = Object.fromEntries(form.entries());
            if (!body.registrationNumber) delete body.registrationNumber;
            void action
              .run("/institutions/requests", "POST", body)
              .then((ok) => {
                if (ok) {
                  setSubmitted(true);
                  setOpen(false);
                }
              });
          }}
        >
          <h2>Solicitar cadastro</h2>
          <p>
            O e-mail da conta autenticada será o e-mail do responsável. A
            solicitação depende de análise do administrador geral.
          </p>
          <label>
            Tipo de instituição
            <select name="institutionType" required defaultValue="">
              <option value="" disabled>
                Selecione
              </option>
              <option value="ENSINO_SUPERIOR">
                Instituição de ensino superior
              </option>
              <option value="CURSO_PREPARATORIO">Curso preparatório</option>
              <option value="OUTRA_ORGANIZACAO">
                Outra organização educacional
              </option>
            </select>
          </label>
          <label>
            E-mail de contato da conta
            <input type="email" readOnly value={contactEmail} />
          </label>
          {[
            ["name", "Nome da instituição", 180],
            ["responsibleName", "Nome do responsável", 120],
            ["registrationNumber", "CNPJ (quando aplicável)", 18],
            ["phone", "Telefone", 25],
          ].map(([name, title, max]) => (
            <label key={name}>
              {title}
              <input
                name={String(name)}
                required={name !== "registrationNumber"}
                minLength={name === "phone" ? 8 : 2}
                maxLength={Number(max)}
                type={name === "phone" ? "tel" : "text"}
              />
            </label>
          ))}
          <label>
            Informações institucionais
            <textarea
              name="description"
              required
              minLength={10}
              maxLength={1900}
            />
          </label>
          <button disabled={action.busy}>Enviar solicitação</button>
        </form>
      )}
    </>
  );
}
function AdministrativeInstitutionDetails({institution,reload}:{institution:Institution;reload:()=>void}){
  const action=useMutation(reload);
  return <details><summary>Editar dados e responsável autorizado</summary>{action.feedback}<form className="admin-form" onSubmit={e=>{
    e.preventDefault();const data=new FormData(e.currentTarget);const responsibleEmail=String(data.get('responsibleEmail')??'').trim();
    void action.run('/institutions/admin/institutions/'+institution.id+'/details','PUT',{name:data.get('name'),phone:data.get('phone'),description:data.get('description'),reason:data.get('reason'),...(responsibleEmail?{responsibleEmail}: {})});
  }}><label>Nome<input name="name" required minLength={2} maxLength={180} defaultValue={institution.name}/></label><label>Telefone<input name="phone" required minLength={8} maxLength={25} defaultValue={institution.phone}/></label><label>Informações institucionais<textarea name="description" required minLength={10} maxLength={2000} defaultValue={institution.description}/></label><label>Novo responsável (opcional)<input name="responsibleEmail" type="email" maxLength={254}/></label><p>Use somente uma conta individual já confirmada e autorizada. A substituição revoga o vínculo administrativo anterior e suas sessões; não altera senhas nem dados acadêmicos.</p><label>Justificativa<input name="reason" required minLength={3} maxLength={500}/></label><button disabled={action.busy}>Salvar dados administrativos</button></form></details>;
}
export function ClassMembershipManager({
  classId,
  teacher,
}: {
  classId?: string;
  teacher: boolean;
}) {
  const [page, setPage] = useState(1);
  const [studentEmail,setStudentEmail]=useState('');
  const available = useResource<{ enabled: boolean }>(
    "/institutions/availability",
  );
  const resource = useResource<
    Page<{
      id: string;
      classId: string;
      className: string;
      studentName?: string;
      status: string;
      createdAt: string;
    }>
  >(
    available.data?.enabled
      ? `/turmas/${classId ? `${classId}/` : ""}requests?page=${page}`
      : null,
  );
  const students = useResource<Page<{ id: string; nome: string }>>(
    available.data?.enabled && teacher && classId
      ? `/turmas/${classId}/students?page=${page}`
      : null,
  );
  const action = useMutation(() => {
    resource.reload();
    students.reload();
  });
  if (!available.data?.enabled) return null;
  return (
    <section className="panel">
      <h3>
        {teacher ? "Solicitações de entrada" : "Minhas solicitações de entrada"}
      </h3>
      {action.feedback}
      {teacher&&classId&&<form className="admin-form" onSubmit={e=>{e.preventDefault();void action.run(`/turmas/${classId}/students`,'POST',{email:studentEmail}).then(ok=>{if(ok)setStudentEmail('');});}}><label>E-mail do aluno já cadastrado<input type="email" required maxLength={254} value={studentEmail} onChange={e=>setStudentEmail(e.target.value)}/></label><button disabled={action.busy}>Vincular aluno</button></form>}
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && <p>Nenhuma solicitação.</p>}
      {resource.data?.items.map((r) => (
        <article key={r.id}>
          <p>
            {teacher ? (r.studentName ?? "Aluno indisponível") : r.className} ·{" "}
            {label(r.status)} · {date(r.createdAt)}
          </p>
          {teacher && r.status === "PENDING" && (
            <div className="admin-actions">
              <button
                disabled={action.busy}
                onClick={() => {
                  void action.run(
                    `/turmas/${r.classId}/requests/${r.id}`,
                    "PATCH",
                    { approve: true },
                  );
                }}
              >
                Aprovar
              </button>
              <button
                disabled={action.busy}
                onClick={() => {
                  void action.run(
                    `/turmas/${r.classId}/requests/${r.id}`,
                    "PATCH",
                    { approve: false },
                  );
                }}
              >
                Recusar
              </button>
            </div>
          )}
        </article>
      ))}
      <Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />
      {teacher && (
        <>
          <h3>Alunos aprovados</h3>
          <ResourceState resource={students} />
          {students.data?.items.length === 0 && <p>Nenhum aluno aprovado.</p>}
          {students.data?.items.map((s) => (
            <article key={s.id}>
              <p>{s.nome}</p>
              <RemoveStudent
                classId={classId!}
                studentId={s.id}
                busy={action.busy}
                remove={() =>
                  action.run(`/turmas/${classId}/students/${s.id}`, "DELETE")
                }
              />
            </article>
          ))}
          <Pages
            page={page}
            hasMore={students.data?.hasMore}
            change={setPage}
          />
        </>
      )}
    </section>
  );
}
function RemoveStudent({
  busy,
  remove,
}: {
  classId: string;
  studentId: string;
  busy: boolean;
  remove: () => Promise<boolean>;
}) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div role="alert">
      <p>Remover o aluno da turma? O histórico individual será preservado.</p>
      <button
        disabled={busy}
        onClick={() => {
          void remove().then((ok) => {
            if (ok) setConfirm(false);
          });
        }}
      >
        Confirmar remoção
      </button>
      <button onClick={() => setConfirm(false)}>Cancelar</button>
    </div>
  ) : (
    <button disabled={busy} onClick={() => setConfirm(true)}>
      Remover da turma
    </button>
  );
}
