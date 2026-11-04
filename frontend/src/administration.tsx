import { useEffect, useState } from "react";
import { apiRequest } from "./api";
import { refreshSession, type Session } from "./auth-session";
import { navigate } from "./navigation";
import { clearInvitation, pendingInvitation } from "./invitation-token";
import "./administration.css";

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
const labels: Record<string, string> = {
  EMAIL_PENDING: "Aguardando confirmação de e-mail",
  PENDING: "Pendente",
  ACTIVE: "Ativa",
  REJECTED: "Recusada",
  SUSPENDED: "Suspensa",
  ACCEPTED: "Aceito",
  CANCELLED: "Cancelado",
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

function useResource<T>(path: string | null) {
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
function ResourceState({
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
function Pages({
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
function useMutation(reload: () => void) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  async function run(path: string, method: string, body?: unknown) {
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
    !session.administration ||
    (session.user.role !== "PROFESSOR" &&
      !(session.user.role === "ADMIN" && memberships.length))
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
export function InvitationAcceptance() {
  const action = useMutation(() => {}),
    token = pendingInvitation();
  return (
    <section className="page admin-page">
      <h1>Convite para professor</h1>
      <p>
        O convite será vinculado à conta autenticada, cujo e-mail deve ser o
        mesmo que recebeu a mensagem.
      </p>
      {action.feedback}
      {token ? (
        <button
          disabled={action.busy}
          onClick={() => {
            void action
              .run("/institutions/invitations/accept", "POST", { token })
              .then(async (ok) => {
                if (ok) {
                  clearInvitation();
                  sessionStorage.removeItem("jurissim_institution");
                  await refreshSession(true);
                  navigate("/professor");
                }
              });
          }}
        >
          Aceitar convite institucional
        </button>
      ) : (
        <p role="alert">
          Abra o link recebido por e-mail novamente. Convites expiram em 48
          horas e só podem ser usados uma vez.
        </p>
      )}
      <button
        className="outline-button"
        onClick={() => navigate("/instituicoes")}
      >
        Minhas instituições
      </button>
    </section>
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
export function AuditPanel({ institutionId }: { institutionId?: string }) {
  const [page, setPage] = useState(1),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [draft, setDraft] = useState<Record<string, string>>({});
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
export function GeneralAdministration() {
  const [tab, setTab] = useState("overview");
  const availability = useResource<{ enabled: boolean }>(
    "/institutions/availability",
  );
  return (
    <section className="page admin-page">
      <p className="gold">ADMINISTRAÇÃO GERAL</p>
      <h1>Gestão do JurisSim</h1>
      <ResourceState resource={availability} />
      {availability.data?.enabled === false && (
        <p role="status">
          O módulo institucional aguarda aplicação autorizada da migration e
          ativação no servidor.
        </p>
      )}
      {availability.data?.enabled && (
        <>
          <nav className="admin-tabs" aria-label="Administração">
            {[
              ["overview", "Indicadores"],
              ["institutions", "Instituições"],
              ["users", "Usuários e professores"],
              ["audit", "Logs e Auditoria"],
              ["notifications", "Notificações"],
            ].map(([id, title]) => (
              <button
                key={id}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {title}
              </button>
            ))}
          </nav>
          {tab === "overview" ? (
            <GlobalIndicators />
          ) : tab === "institutions" ? (
            <InstitutionReview />
          ) : tab === "users" ? (
            <UserAdministration />
          ) : tab === "classes" ? (
            <ExistingClasses />
          ) : tab === "audit" ? (
            <AuditPanel />
          ) : (
            <Notifications />
          )}
        </>
      )}
    </section>
  );
}
function GlobalIndicators() {
  const resource = useResource<Record<string, number>>(
    "/institutions/admin/summary",
  );
  const titles: Record<string, string> = {
    users: "Usuários",
    institutions: "Instituições",
    pending: "Solicitações pendentes",
    teachers: "Vínculos de professores ativos",
    classes: "Turmas ativas",
    errors: "Erros nas últimas 24 horas",
  };
  return (
    <>
      <ResourceState resource={resource} />
      <div className="admin-indicators">
        {Object.entries(resource.data ?? {}).map(([key, count]) => (
          <article className="panel" key={key}>
            <h2>{titles[key]}</h2>
            <strong>{count}</strong>
          </article>
        ))}
      </div>
    </>
  );
}
function ExistingClasses() {
  const [page, setPage] = useState(1),
    [institutionPage, setInstitutionPage] = useState(1),
    [institutionId, setInstitutionId] = useState(""),
    [selectedClass, setSelectedClass] = useState<string>();
  const resource = useResource<
    Page<{
      id: string;
      nome: string;
      professores: { id: string; nome: string }[];
    }>
  >(`/institutions/admin/classes?page=${page}`);
  const institutions = useResource<Page<Institution>>(
    `/institutions/admin/institutions?status=ACTIVE&page=${institutionPage}`,
  );
  const action = useMutation(resource.reload);
  return (
    <section>
      <h2>Vincular turmas existentes</h2>
      <p>
        Preserva alunos, avaliações e histórico. Os professores devem aceitar
        previamente o convite da instituição escolhida.
      </p>
      <ResourceState resource={institutions} />
      <label>
        Instituição ativa
        <select
          value={institutionId}
          onChange={(e) => setInstitutionId(e.target.value)}
        >
          <option value="">Selecione</option>
          {institutions.data?.items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <Pages
        page={institutionPage}
        hasMore={institutions.data?.hasMore}
        change={(n) => {
          setInstitutionPage(n);
          setInstitutionId("");
        }}
      />
      {action.feedback}
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && (
        <p>Nenhuma turma sem instituição.</p>
      )}
      {resource.data?.items.map((c) => (
        <article className="panel" key={c.id}>
          <h3>{c.nome}</h3>
          <p>
            Professores:{" "}
            {c.professores.map((p) => p.nome).join(", ") || "Nenhum"}
          </p>
          <button
            disabled={!institutionId || action.busy}
            onClick={() => setSelectedClass(c.id)}
          >
            Vincular à instituição selecionada
          </button>
        </article>
      ))}
      {selectedClass && (
        <div className="panel" role="alert">
          <p>Confirmar o vínculo desta turma com a instituição selecionada?</p>
          <button
            disabled={action.busy || !institutionId}
            onClick={() => {
              void action
                .run(`/institutions/admin/classes/${selectedClass}`, "PATCH", {
                  institutionId,
                })
                .then((ok) => {
                  if (ok) setSelectedClass(undefined);
                });
            }}
          >
            Confirmar vínculo
          </button>
          <button onClick={() => setSelectedClass(undefined)}>Cancelar</button>
        </div>
      )}
      <Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />
    </section>
  );
}
function InstitutionReview() {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("PENDING"),
    [selected, setSelected] = useState<{ id: string; status: string }>(),
    [reason, setReason] = useState("");
  const resource = useResource<Page<Institution>>(
      `/institutions/admin/institutions?page=${page}${status ? `&status=${status}` : ""}`,
    ),
    action = useMutation(resource.reload);
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
          {i.decisionReason && <p>Última decisão: {i.decisionReason}</p>}
          <div className="admin-actions">
            {(i.status === "PENDING" ||
              i.status === "SUSPENDED" ||
              i.status === "REJECTED") && (
              <button
                disabled={action.busy}
                onClick={() => setSelected({ id: i.id, status: "ACTIVE" })}
              >
                Aprovar / reativar
              </button>
            )}
            {i.status === "PENDING" && (
              <button
                disabled={action.busy}
                onClick={() => setSelected({ id: i.id, status: "REJECTED" })}
              >
                Recusar
              </button>
            )}
            {i.status === "ACTIVE" && (
              <button
                disabled={action.busy}
                onClick={() => setSelected({ id: i.id, status: "SUSPENDED" })}
              >
                Suspender
              </button>
            )}
          </div>
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
          <button disabled={action.busy}>Confirmar</button>
          <button type="button" onClick={() => setSelected(undefined)}>
            Cancelar
          </button>
        </form>
      )}
      <Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />
    </>
  );
}
function UserAdministration() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [draft, setDraft] = useState(""),
    [role, setRole] = useState("");
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
      <h2>Usuários, professores e permissões</h2>
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
          {u.memberships.map((m, index) => (
            <p key={index}>
              {m.institution.name}: {label(m.role)} (
              {m.active ? "vínculo ativo" : "desvinculado"}; instituição{" "}
              {label(m.institution.status)})
            </p>
          ))}
          <div className="admin-actions">
            <button
              disabled={action.busy}
              onClick={() =>
                setChange({
                  id: u.id,
                  body: { suspended: !u.suspended },
                  title: u.suspended ? "Reativar conta" : "Suspender conta",
                })
              }
            >
              {u.suspended ? "Reativar" : "Suspender"}
            </button>
            <button
              disabled={action.busy}
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
            </button>
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
  const availability = useResource<{ enabled: boolean }>(
    "/institutions/availability",
  );
  const resource = useResource<Institution[]>(
    availability.data?.enabled ? "/institutions/mine" : null,
  );
  const [selected, setSelected] = useState("");
  const adminIds =
    session.administration?.memberships
      .filter((m) => m.role === "INSTITUTION_ADMIN")
      .map((m) => m.institutionId) ?? [];
  return (
    <section className="page admin-page">
      <p className="gold">INSTITUIÇÕES</p>
      <h1>Gestão institucional</h1>
      <button className="outline-button" onClick={() => { void refreshSession(true).then(resource.reload).catch(() => {}); }}>Atualizar situação e permissões</button>
      <ResourceState resource={availability} />
      {availability.data?.enabled === false ? (
        <p>O módulo aguarda aplicação autorizada da migration e ativação.</p>
      ) : (
        availability.data?.enabled && (
          <>
            <ResourceState resource={resource} />
            <InstitutionRequest onCreated={resource.reload} />
            <h2>Meus vínculos e solicitações</h2>
            {resource.data?.length === 0 && (
              <p>Nenhuma solicitação ou vínculo institucional.</p>
            )}
            {resource.data?.map((i) => (
              <article className="panel" key={i.id}>
                <h3>{i.name}</h3>
                <p>{label(i.status)}</p>
                {i.decisionReason && <p>{i.decisionReason}</p>}
                {adminIds.includes(i.id) && (
                  <button onClick={() => setSelected(i.id)}>
                    Administrar instituição
                  </button>
                )}
              </article>
            ))}
            {selected && adminIds.includes(selected) && (
              <InstitutionDashboard key={selected} id={selected} />
            )}
            {session.user.emailVerificado && <Notifications />}
          </>
        )
      )}
    </section>
  );
}
function InstitutionRequest({ onCreated }: { onCreated: () => void }) {
  const action = useMutation(onCreated),
    [open, setOpen] = useState(false);
  return (
    <>
      <button className="outline-button" onClick={() => setOpen(!open)}>
        {open ? "Fechar solicitação" : "Solicitar cadastro de instituição"}
      </button>
      {action.feedback}
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
                if (ok) setOpen(false);
              });
          }}
        >
          <h2>Solicitar cadastro</h2>
          <p>
            O e-mail da conta autenticada será o e-mail do responsável. A
            solicitação depende de análise do administrador geral.
          </p>
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
              maxLength={2000}
            />
          </label>
          <button disabled={action.busy}>Enviar solicitação</button>
        </form>
      )}
    </>
  );
}
function InstitutionDashboard({ id }: { id: string }) {
  const [page, setPage] = useState(1),
    [tab, setTab] = useState("teachers");
  const resource = useResource<{
    institution: Institution;
    teachers: Page<Member>;
    classes: Page<{ id: string; nome: string; _count: { alunos: number } }>;
    indicators: {
      classes: number;
      students: number;
      completedAttempts: number;
    };
  }>(`/institutions/${id}/summary?page=${page}`);
  const action = useMutation(resource.reload),
    [unlink, setUnlink] = useState<string>();
  return (
    <section>
      <h2>Administração da instituição</h2>
      <ResourceState resource={resource} />
      {action.feedback}
      {resource.data && (
        <>
          <h3>{resource.data.institution.name}</h3>
          <div className="admin-indicators">
            {[
              ["Turmas", resource.data.indicators.classes],
              ["Alunos vinculados", resource.data.indicators.students],
              [
                "Tentativas concluídas",
                resource.data.indicators.completedAttempts,
              ],
            ].map(([title, count]) => (
              <article className="panel" key={title}>
                <h3>{title}</h3>
                <strong>{count}</strong>
              </article>
            ))}
          </div>
          <nav className="admin-tabs">
            {[
              ["teachers", "Professores"],
              ["invitations", "Convites"],
              ["classes", "Turmas"],
              ["settings", "Dados institucionais"],
              ["audit", "Logs institucionais"],
            ].map(([key, title]) => (
              <button
                key={key}
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {title}
              </button>
            ))}
          </nav>
          {tab === "teachers" && (
            <>
              {resource.data.teachers.items.length === 0 && (
                <p>Nenhum professor vinculado.</p>
              )}
              {resource.data.teachers.items.map((m) => (
                <article className="panel" key={m.id}>
                  <h3>{m.user?.nome ?? "Conta indisponível"}</h3>
                  <p>
                    {m.user?.email} · {m.active ? "Ativo" : "Desvinculado"}
                  </p>
                  {m.active && (
                    <button
                      disabled={action.busy}
                      onClick={() => setUnlink(m.userId)}
                    >
                      Desvincular professor
                    </button>
                  )}
                </article>
              ))}
              {unlink && (
                <div role="alert">
                  <p>
                    Desvincular impede novos acessos às turmas desta
                    instituição. Confirmar?
                  </p>
                  <button
                    disabled={action.busy}
                    onClick={() => {
                      void action
                        .run(`/institutions/${id}/teachers/${unlink}`, "DELETE")
                        .then((ok) => {
                          if (ok) setUnlink(undefined);
                        });
                    }}
                  >
                    Confirmar
                  </button>
                  <button onClick={() => setUnlink(undefined)}>Cancelar</button>
                </div>
              )}
              <Pages
                page={page}
                hasMore={resource.data.teachers.hasMore}
                change={setPage}
              />
            </>
          )}
          {tab === "invitations" && <Invitations institutionId={id} />}
          {tab === "classes" && (
            <>
              {resource.data.classes.items.length === 0 && (
                <p>Nenhuma turma vinculada.</p>
              )}
              {resource.data.classes.items.map((c) => (
                <article className="panel" key={c.id}>
                  <h3>{c.nome}</h3>
                  <p>{c._count.alunos} aluno(s)</p>
                </article>
              ))}
              <Pages
                page={page}
                hasMore={resource.data.classes.hasMore}
                change={setPage}
              />
            </>
          )}
          {tab === "settings" && (
            <form
              className="admin-form panel"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(
                  `/institutions/${id}`,
                  "PATCH",
                  Object.fromEntries(new FormData(e.currentTarget)),
                );
              }}
            >
              <label>
                Nome
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={180}
                  defaultValue={resource.data.institution.name}
                />
              </label>
              <label>
                Telefone
                <input
                  name="phone"
                  required
                  minLength={8}
                  maxLength={25}
                  defaultValue={resource.data.institution.phone}
                />
              </label>
              <label>
                Descrição
                <textarea
                  name="description"
                  required
                  minLength={10}
                  maxLength={2000}
                  defaultValue={resource.data.institution.description}
                />
              </label>
              <button disabled={action.busy}>Salvar dados</button>
            </form>
          )}
          {tab === "audit" && <AuditPanel institutionId={id} />}
        </>
      )}
    </section>
  );
}
function Invitations({ institutionId: id }: { institutionId: string }) {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [email, setEmail] = useState("");
  const resource = useResource<Page<Invitation>>(
      `/institutions/${id}/invitations?page=${page}${status ? `&status=${status}` : ""}`,
    ),
    action = useMutation(resource.reload);
  return (
    <section>
      <h3>Convites de professores</h3>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          void action
            .run(`/institutions/${id}/invitations`, "POST", { email })
            .then((ok) => {
              if (ok) setEmail("");
            });
        }}
      >
        <label>
          E-mail do professor
          <input
            required
            type="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button disabled={action.busy}>Enviar convite</button>
      </form>
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
          {["PENDING", "ACCEPTED", "EXPIRED", "CANCELLED"].map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </label>
      {action.feedback}
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && <p>Nenhum convite.</p>}
      {resource.data?.items.map((i) => (
        <article className="panel" key={i.id}>
          <h3>{i.email}</h3>
          <p>
            {label(i.status)} · Expira em {date(i.expiresAt)}
          </p>
          {["PENDING", "EXPIRED"].includes(i.status) && (
            <div className="admin-actions">
              <button
                disabled={action.busy}
                onClick={() => {
                  void action.run(
                    `/institutions/${id}/invitations/${i.id}/resend`,
                    "POST",
                  );
                }}
              >
                Reenviar
              </button>
              <button
                disabled={action.busy}
                onClick={() => {
                  void action.run(
                    `/institutions/${id}/invitations/${i.id}`,
                    "DELETE",
                  );
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </article>
      ))}
      <Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />
    </section>
  );
}
export function ClassMembershipManager({
  classId,
  teacher,
}: {
  classId?: string;
  teacher: boolean;
}) {
  const [page, setPage] = useState(1);
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
