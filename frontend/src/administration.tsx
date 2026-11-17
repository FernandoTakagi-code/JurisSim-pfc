import { InstitutionRequest } from './institution-request';
import { AdminAccountDeletion } from './account-deletion';
import { institutionPendingFields, noWebsiteDeclaration } from '../../backend/src/institution-registration';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
import { institutionNavigate, canViewInstitution } from "./institution-navigation";

type Page<T> = { items: T[]; page: number; hasMore: boolean };
type Institution = {
  ownerId?: string;
  owner?: {emailVerifiedAt:string|null};
  homologationApproval?: boolean;
  approvalReview?: {pendingFields:string[];canApprove:boolean};
  id: string;
  name: string;
  status: string;
  email: string;
  responsibleName: string;
  tradeName?: string;
  address?: string;
  representativePosition?: string;
  contactEmail?: string;
  institutionType?: string; postalCode?: string; street?: string; number?: string;
  addressComplement?: string; district?: string; city?: string; state?: string; website?: string;
  representativePhone?: string; representationDeclaration?: boolean;
  representationDeclaredAt?: string; representationDeclarationVersion?: string; representationEvidence?: string;
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
  createdAt?: string;
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
const QuestionEditorialPage = lazy(() => import('./question-editorial').then(module => ({ default: module.QuestionEditorialPage })));
const sectionDescriptions: Record<AdminSectionId, string> = {
  editorial: 'Consulte o conteúdo e o histórico editorial das questões.',
  overview:
    "Consulte os eventos reais da plataforma e os indicadores disponíveis para sua conta administrativa.",
  institutions:
    "Consulte instituições cadastradas, seus responsáveis e decisões de aprovação ou suspensão.",
  requests:
    "Analise solicitações institucionais e registre decisões com justificativa.",
  users:
    "Pesquise alunos, professores e administradores. Consulte vínculos, situação da conta e acesso administrativo em um só lugar.",
  teachers:
    "Consulte contas de professores e seus vínculos institucionais, sem alterar o histórico acadêmico.",
  classes:
    "A gestão pedagógica pertence à instituição e aos professores com vínculo autorizado; não integra as permissões globais.",
  audit:
    "Consulte a auditoria da plataforma e, quando disponível, os eventos administrativos institucionais.",
  security:
    "Confira a segurança da sua conta e consulte os eventos de autenticação registrados.",
  notifications:
    "Mensagens automáticas destinadas à sua conta. Não há envio de recados entre usuários; acessos e alterações ficam em Logs e auditoria.",
  settings:
    "Confira o acesso à plataforma e a disponibilidade do cadastro e dos painéis institucionais.",
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
      "As notificações não estão disponíveis no momento.",
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
const auditResult = (value: string) => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && 'reason' in parsed && typeof parsed.reason === 'string') return parsed.reason;
  } catch { /* Older events contain only a result label. */ }
  return value;
};
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
          <button type="button" onClick={resource.reload}>Tentar novamente</button>
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
        type="button"
        className="outline-button"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        Anterior
      </button>
      <span>Página {page}</span>
      <button
        type="button"
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
function Notifications({recent=false,administrative=false}:{recent?:boolean;administrative?:boolean}={}) {
  const [page, setPage] = useState(1);
  const [expanded,setExpanded]=useState(false);
  const resource = useResource<
    Page<{ id: string; message: string; createdAt: string }>
  >(`/institutions/notifications?page=${page}`);
  if(recent&&!expanded&&resource.data?.items.length===0)return null;
  return (
    <section>
      <h2>{administrative?'Avisos para sua conta':recent&&!expanded?'Notificações recentes':'Notificações'}</h2>
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && <div className={administrative?'panel admin-empty-state':undefined} role="status"><p>{administrative?'Você não tem avisos no momento.':'Nenhuma notificação.'}</p>{administrative&&<p>O sistema gera avisos para o destinatário de uma decisão institucional ou solicitação de turma. O ADMIN não recebe automaticamente todos esses avisos. Para analisar pedidos de instituições, abra Solicitações de cadastro.</p>}</div>}
      {(recent&&!expanded?resource.data?.items.slice(0,3):resource.data?.items)?.map((n) => (
        <article className="panel" key={n.id}>
          <time>{date(n.createdAt)}</time>
          <p>{n.message}</p>
        </article>
      ))}
      {recent&&!expanded?((resource.data?.hasMore||(resource.data?.items.length??0)>3)&&<button className="text-button" onClick={()=>setExpanded(true)}>Ver todas as notificações</button>):((resource.data?.items.length??0)>0||page>1)&&<Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />}
    </section>
  );
}
const auditNames: Record<string, string> = {
  ACEITE_TERMOS_E_PRIVACIDADE: 'Termos e privacidade aceitos', USUARIO_CADASTRADO: 'Conta criada',
  LOGIN_SUCESSO: 'Login realizado', LOGIN_FALHA: 'Tentativa de login recusada',
  DIAGNOSTICO_INICIADO: 'Diagnóstico iniciado', DIAGNOSTICO_FINALIZADO: 'Diagnóstico concluído',
  QUESTAO_CRIADA: 'Questão criada', QUESTAO_ATUALIZADA: 'Questão atualizada', QUESTAO_EXCLUIDA: 'Questão excluída',
  PASSWORD_RECOVERY_REQUESTED: 'Recuperação de senha solicitada', PASSWORD_RECOVERY_COMPLETED: 'Senha recuperada',
  EMAIL_CONFIRMADO: 'E-mail confirmado', SENHA_REDEFINIDA: 'Senha redefinida', CONTA_EXCLUIDA: 'Conta excluída',
  RECUPERACAO_SENHA_SOLICITADA: 'Recuperação de senha solicitada', INSTITUTION_REQUESTED: 'Cadastro institucional solicitado',
  INSTITUTION_ACTIVE: 'Instituição aprovada', INSTITUTION_REJECTED: 'Instituição recusada', INSTITUTION_SUSPENDED: 'Instituição suspensa',
  INSTITUTION_UPDATED: 'Instituição atualizada', INSTITUTION_RESUBMITTED: 'Cadastro institucional reenviado', INSTITUTION_ADMINISTRATIVE_UPDATED: 'Cadastro institucional atualizado',
  INSTITUTION_RESPONSIBLE_CHANGED: 'Responsável institucional alterado', PERMISSION_CHANGED: 'Permissão alterada',
  ACCOUNT_SUSPENDED: 'Conta suspensa', ACCOUNT_REACTIVATED: 'Conta reativada', CLASS_CREATED: 'Turma criada',
  CLASS_CODE_ROTATED: 'Código de convite renovado', ACCESS_DENIED: 'Acesso bloqueado',
};
const auditName = (code: string) => auditNames[code] ?? 'Outro evento registrado';
const severityName = (code: string) => ({ INFO: 'Informação', WARN: 'Atenção', ERROR: 'Erro' }[code] ?? 'Registro');
function eventOutcome(value: string) {
  const known: Record<string,string> = { SUCCESS: 'Concluído', FAILED: 'Falha', ACTIVE: 'Aprovada', REJECTED: 'Recusada', PENDING: 'Pendente', SUSPENDED: 'Suspensa' };
  if (known[value]) return known[value];
  try { const result = JSON.parse(value); return known[result?.status] ?? 'Registrado'; } catch { return 'Registrado'; }
}
function AuditDetails({ event }: { event: Event | PlatformAuditEvent }) {
  return <details className="admin-audit-details"><summary>Detalhes técnicos</summary><dl>
    <dt>Código do evento</dt><dd>{'event' in event ? event.event : event.action}</dd>
    <dt>Registro</dt><dd>{event.id}</dd>
    <dt>Conta responsável (ID)</dt><dd>{('userId' in event ? event.userId : event.actorId) ?? 'Não identificada'}</dd>
    <dt>Recurso (ID)</dt><dd>{event.resourceId ?? 'Não informado'}</dd>
    {'institutionId' in event && <><dt>Instituição (ID)</dt><dd>{event.institutionId ?? 'Não informada'}</dd></>}
    {'result' in event && <><dt>Resultado registrado</dt><dd>{event.result}</dd></>}
    {'termsVersion' in event && <><dt>Versão dos termos</dt><dd>{event.termsVersion ?? 'Não se aplica'}</dd><dt>Versão da privacidade</dt><dd>{event.privacyVersion ?? 'Não se aplica'}</dd></>}
  </dl></details>;
}
function AdministrationAudit({ available }: { available: boolean }) {
  const [source, setSource] = useState('management');
  const management = available && source === 'management';
  return <section className="admin-audit-workspace">
    <p className="admin-audit-scope">Visão global: registros de toda a plataforma, não apenas da sua conta. Escolha um histórico e filtre o período para investigar uma ocorrência.</p>
    <div className="admin-audit-tabs" role="group" aria-label="Histórico de auditoria">
      {available && <button aria-pressed={management} onClick={() => setSource('management')}>Gestão administrativa</button>}
      <button aria-pressed={!management} onClick={() => setSource('accounts')}>Acessos e contas</button>
    </div>
    {management ? <AuditPanel /> : <PlatformAuditPanel />}
  </section>;
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
  const [validation, setValidation] = useState('');
  const query = new URLSearchParams({ page: String(page), ...filters });
  const resource = useResource<Page<Event>>(
    `/institutions/${institutionId ? `${institutionId}/logs` : "admin/logs"}?${query}`,
  );
  return (
    <section className="panel">
      <h2>Gestão administrativa</h2>
      <p>{institutionId ? 'Decisões e alterações desta instituição.' : 'Decisões institucionais, permissões e alterações administrativas.'} Os registros aparecem do mais recente para o mais antigo.</p>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.from && draft.to && new Date(draft.from) > new Date(draft.to)) {
            setValidation('O início do período deve ser anterior ou igual ao fim.'); return;
          }
          setValidation('');
          const next = Object.fromEntries(Object.entries(draft).filter(([, v]) => v).map(([k,v]) => [k, k === 'from' || k === 'to' ? new Date(v).toISOString() : v]));
          if (page === 1 && JSON.stringify(next) === JSON.stringify(filters)) resource.reload();
          setPage(1);
          setFilters(next);
        }}
      >
        <label>Evento<select value={draft.event ?? ''} onChange={e=>setDraft({...draft,event:e.target.value})}><option value="">Todos</option>{Object.entries(auditNames).filter(([code])=>!platformAuditActions.includes(code as typeof platformAuditActions[number])).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
<label>
          Gravidade
          <select
            value={draft.severity ?? ""}
            onChange={(e) => setDraft({ ...draft, severity: e.target.value })}
          >
            <option value="">Todas</option>
            <option value="INFO">Informação</option>
            <option value="WARN">Aviso</option>
            <option value="ERROR">Erro</option>
          </select>
        </label>
        {["from", "to"].map((field, i) => (
          <label key={field}>
            {i ? "Até" : "Desde"}
            <input
              type="datetime-local"
              value={draft[field] ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  [field]: e.target.value,
                })
              }
            />
          </label>
        ))}
        <details className="admin-audit-advanced"><summary>Filtros avançados por identificador ou código</summary>
        {["event", "actorId", ...(institutionId ? [] : ["institutionId"])].map(
          (field, i) => (
            <label key={field}>
              {["Tipo de evento", "Identificador do responsável", "Identificador da instituição"][i]}
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
        </details>
        <button className="primary-button">Aplicar filtros</button>
        <button type="button" onClick={()=>{const initial: Record<string,string> = initialInstitutionId ? {institutionId:initialInstitutionId} : {};setDraft(initial);setFilters(initial);setPage(1);setValidation('');resource.reload();}}>Limpar filtros</button>
      </form>
      {validation && <p className="error" role="alert">{validation}</p>}
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && <p className="empty-dashboard" role="status">Nenhum evento neste período. Amplie as datas ou limpe os filtros.</p>}
      {!!resource.data?.items.length && <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data e hora</th>
              <th>Evento</th>
              <th>Resultado</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {resource.data?.items.map((e) => (
              <tr key={e.id}>
                <td>{date(e.occurredAt)}</td>
                <td>
                  <strong>{auditName(e.event)}</strong>
                  <small>{severityName(e.severity)}</small>
                </td>
                <td>{eventOutcome(e.result)}</td>
                <td><AuditDetails event={e}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {(!!resource.data?.items.length || page > 1) && <Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />}
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
      <h2>Acessos e contas</h2>
      <p>
        Registros de autenticação, contas e atividades, do mais recente para o mais antigo. Use as datas para consultar registros antigos. Esta consulta é
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
                {auditName(action)}
              </option>
            ))}
          </select>
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
        <details className="admin-audit-advanced"><summary>Filtrar por conta</summary><label>
          ID do usuário
          <input
            value={draft.userId}
            maxLength={36}
            pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
            title="Identificador UUID do usuário"
            onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
          />
        </label>
        </details>
        <button className="primary-button">Consultar registros</button><button type="button" onClick={()=>{setDraft({action:"",userId:"",from:"",to:"",limit:"25"});setQuery("limit=25");setValidation("");resource.reload();}}>Limpar filtros</button>
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
          {new URLSearchParams(query).get("limit")}.
        </p>
      )}
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data e hora</th>
              <th>Ação</th>
              <th>Detalhes</th>
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
                <td><strong>{auditName(event.action)}</strong></td><td><AuditDetails event={event}/></td>
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
        Consulte os acessos bem-sucedidos e as tentativas de acesso na auditoria da plataforma.
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
  if (current?.id === 'editorial') return <Suspense fallback={<section className="page" role="status">Carregando revisão editorial…</section>}><QuestionEditorialPage /></Suspense>;
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
            <AdministrationSettings availability={availability.data} refreshAvailability={availability.reload} />
          ) : tab === 'classes' ? (
            <section className="panel"><h2>Gestão pedagógica institucional</h2><p>Turmas e alunos são gerenciados pelos responsáveis e professores autorizados da própria instituição. A administração geral não possui acesso pedagógico rotineiro.</p></section>
          ) : tab === "security" ? (
            <><AdministrationSecurity />{can('users')&&<UserAdministration permissionsOnly/>}</>
          ) : tab === "audit" ? (
            <AdministrationAudit available={can("audit")} />
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
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
function AdministrationSettings({ availability, refreshAvailability }: { availability?: AdministrationAvailability; refreshAvailability:()=>void }) {
  const health = useResource<{status: string}>("/health");
  return <div className="admin-settings">
    <section className="panel"><h2>Conexão com a plataforma</h2><ResourceState resource={health}/><p>{health.loading ? 'Verificando a conexão…' : health.error ? 'Não foi possível consultar a plataforma agora. Tente atualizar a verificação.' : health.data?.status === 'ok' ? 'A plataforma está respondendo.' : 'A plataforma não confirmou sua disponibilidade.'}</p><p className="muted">Esta verificação confere a resposta da API; não testa o envio de e-mails nem todos os recursos.</p><button onClick={()=>{health.reload();refreshAvailability();}} disabled={health.loading}>Atualizar verificação</button></section>
    <section className="panel"><h2>Cadastro de instituições</h2><p className="admin-status-label">{availability===undefined?'Aguardando consulta':registrationAvailable(availability)?'Recebendo solicitações':'Cadastro pausado'}</p><p>{availability===undefined?'Atualize a verificação para consultar a disponibilidade.':registrationAvailable(availability)?'Novas instituições podem enviar uma solicitação para análise do administrador.':'Novas instituições ainda não podem enviar solicitações. As instituições já registradas continuam disponíveis para consulta no ADMIN.'}</p><p className="muted">Essa configuração é independente do cadastro de alunos. A alteração é feita no ambiente de publicação pela equipe responsável.</p></section>
    <section className="panel"><h2>Acesso aos painéis</h2><dl className="admin-availability-list"><div><dt>Administração geral</dt><dd>{availability===undefined?'Aguardando consulta':(availability.administrationEnabled??availability.enabled)?'Disponível':'Indisponível'}</dd></div><div><dt>Área das instituições</dt><dd>{availability===undefined?'Aguardando consulta':availability.enabled?'Disponível':'Aguardando ativação'}</dd></div></dl><p className="muted">A área institucional permite aos responsáveis gerenciar professores, convites e turmas. Liberar o ADMIN não ativa essa área automaticamente.</p></section>
  </div>;
}
type AdminSummary = {
  users: number; students: number; institutions: number; pending: number; teachers: number;
  classes: number; archivedClasses: number; errors: number; publishedExams: number;
  publishedActivities: number | null; completedActivities: number | null; newUsers: number;
  activitiesAvailable: boolean;
  registrationsByDay: {day:string;count:number}[];
  institutionGrowthByDay: {day:string;count:number}[];
  participationByDay: {day:string;students:number;attempts:number}[];
  userDistribution: {profile:string;count:number}[];
};
function SummaryBars({
  title,
  items,
  valueKey = "count",
}: {
  title: string;
  items: { day: string; count?: number; students?: number; attempts?: number }[];
  valueKey?: "count" | "students" | "attempts";
}) {
  const max = Math.max(1, ...items.map((item) => item[valueKey] ?? 0));
  return (
    <section className="panel dashboard-panel">
      <h2>{title}</h2>
      {items.length ? (
        <div className="summary-bars" role="img" aria-label={`${title}, dados dos últimos 30 dias`}>
          {items.map((item) => (
            <div className="summary-bar-column" key={item.day} title={`${item.day}: ${item[valueKey] ?? 0}`}>
              <span style={{ height: `${Math.max(3, ((item[valueKey] ?? 0) / max) * 100)}%` }} />
              <small>{item.day.slice(8)}</small>
            </div>
          ))}
        </div>
      ) : <p className="empty-dashboard">Sem registros no período consultado.</p>}
    </section>
  );
}
function GlobalIndicators({ enabled }: { enabled: boolean }) {
  const resource = useResource<AdminSummary>(enabled ? "/institutions/admin/summary" : null);
  const data = resource.data;
  const titles: [keyof AdminSummary, string, string][] = [
    ["users", "Contas cadastradas", "Contas não excluídas"],
    ["students", "Alunos cadastrados", "Contas com perfil de aluno"],
    ["teachers", "Professores vinculados", "Vínculos ativos em instituições ativas"],
    ["institutions", "Instituições", "Cadastros institucionais"],
    ["classes", "Turmas ativas", "Turmas operacionais visíveis"],
    ["pending", "Solicitações pendentes", "Aguardando análise"],
    ["publishedExams", "Simulados publicados", "Avaliações disponíveis"],
    ["publishedActivities", "Atividades publicadas", "Indisponível se a estrutura não estiver instalada"],
    ["completedActivities", "Atividades concluídas", "Entregas finalizadas"],
    ["newUsers", "Novos cadastros", "Últimos 30 dias"],
  ];
  return (
    <>
      <ResourceState resource={resource} />
      <div className="dashboard-stats">
        {titles.filter(([key]) =>
          (key !== "publishedActivities" && key !== "completedActivities") ||
          typeof data?.[key] === "number"
        ).map(([key, title, description]) => (
          <article key={key}>
            <span>{title}</span>
            <strong>{typeof data?.[key] === "number" ? (data[key] as number).toLocaleString("pt-BR") : data?.[key] === null ? "Indisponível" : "—"}</strong>
            <small>{!enabled ? "Módulo desativado" : resource.loading ? "Carregando…" : resource.error ? "Falha ao consultar" : description}</small>
          </article>
        ))}
      </div>
      {data && (
        <>
          <div className="dashboard-grid admin-charts">
            <SummaryBars title="Evolução de cadastros" items={data.registrationsByDay ?? []} />
            <section className="panel dashboard-panel">
              <h2>Distribuição de usuários por perfil</h2>
              {(data.userDistribution ?? []).length ? (
                <div className="profile-distribution">
                  {(data.userDistribution ?? []).map((item) => (
                    <div key={item.profile}>
                      <span>{({ALUNO:"Aluno",PROFESSOR:"Professor",ADMIN:"Administrador",INSTITUTIONAL_OWNER:"Responsável institucional",INVITED_TEACHER:"Professor convidado"} as Record<string,string>)[item.profile] ?? "Outro perfil"}</span><strong>{item.count.toLocaleString("pt-BR")}</strong>
                      <i><b style={{ width: `${data.users ? Math.max(1, (item.count / data.users) * 100) : 0}%` }} /></i>
                    </div>
                  ))}
                </div>
              ) : <p className="empty-dashboard">Sem usuários para apresentar.</p>}
            </section>
            <SummaryBars title="Crescimento de instituições" items={data.institutionGrowthByDay ?? []} />
            <SummaryBars title="Alunos participantes por dia" items={data.participationByDay ?? []} valueKey="students" />
          </div>
          <div className="admin-quick-actions panel">
            <h2>Ações administrativas</h2>
            <div className="admin-actions">
              <button onClick={() => navigate("/administracao/instituicoes")}>Gerenciar instituições</button>
              <button onClick={() => navigate("/administracao/solicitacoes")}>Analisar solicitações</button>
              <button onClick={() => navigate("/administracao/usuarios")}>Consultar usuários</button>
              <button onClick={() => navigate("/administracao/auditoria")}>Logs e auditoria</button>
              <button onClick={() => navigate("/administracao/acervo")}>Revisão editorial do acervo</button>
            </div>
            <p>O gerenciamento pedagógico de turmas continua restrito à instituição e aos professores autorizados.</p>
          </div>
        </>
      )}
    </>
  );
}

function RecentAdministrativeEvents({ enabled }: { enabled: boolean }) {
 const resource = useResource<Page<Event>>(enabled ? '/institutions/admin/logs?page=1' : null);
 return <><p>Decisões e alterações administrativas recentes. Os logins ficam em Logs e auditoria → Acessos e contas.</p><ResourceState resource={resource}/>
 {!enabled ? <p className="empty-dashboard">Histórico administrativo indisponível nesta configuração.</p> : resource.data?.items.length === 0 ? <p className="empty-dashboard">Nenhuma movimentação administrativa registrada.</p> : resource.data?.items.slice(0,5).map(event=><div className="admin-event-row" key={event.id}><div><strong>{auditName(event.event)}</strong><p>{eventOutcome(event.result)} · {severityName(event.severity)}</p></div><time dateTime={event.occurredAt}>{date(event.occurredAt)}</time></div>)}</>;
}
const institutionPendingCategories: [string, string[]][] = [
  ['Identificação institucional', ['Razão social', 'Nome fantasia', 'CNPJ', 'CNPJ inválido', 'Tipo']],
  ['Endereço', ['CEP', 'Logradouro', 'Número', 'Bairro', 'Cidade', 'UF']],
  ['Contatos', ['E-mail institucional', 'Telefone institucional']],
  ['Responsável e comprovação', ['Responsável', 'Cargo', 'Telefone profissional', 'Comprovação de representação', 'Declaração de responsabilidade']],
  ['Informações complementares', ['Site ou declaração de inexistência']],
];
function InstitutionPendingDetails({ institution }: { institution: Institution }) {
  const pending = institutionReviewPendingFields(institution);
  if (!pending.length) return <p>Sem pendências cadastrais identificadas.</p>;
  return <section aria-label="Pendências cadastrais">
    <p>Dados e vínculos existentes preservados.</p>
    {institutionPendingCategories.map(([category, fields]) => {
      const items = pending.filter(field => fields.includes(field));
      return <div key={category}><h4>{category}</h4>{items.length ? <ul>{items.map(field => <li key={field}>{field === 'Tipo' ? 'Tipo de instituição' : field}</li>)}</ul> : <p>Sem pendências identificadas nesta categoria.</p>}</div>;
    })}
  </section>;
}
function institutionReviewPendingFields(institution:Institution){
  return institution.approvalReview?.pendingFields??institutionPendingFields(institution);
}
function DecisionEmailControl({institutionId}:{institutionId:string}) {
  const [open,setOpen]=useState(false);
  const resource=useResource<{id?:string;state:string;canRetry:boolean;attempts?:number;lastAttemptAt?:string;finishedAt?:string;lastError?:{code:string}}>(open?`/institutions/admin/institutions/${institutionId}/decision-email`:null);
  const action=useMutation(resource.reload);
  const states:Record<string,string>={PENDING:'Aguardando envio',SENDING:'Envio em andamento ou sem resultado final',SENT:'Aceito pelo provedor',FAILED:'Envio não aceito ou indisponível',UNKNOWN:'Recebimento indeterminado; confira o provedor antes de qualquer novo envio',CANCELLED:'Decisão substituída; envio cancelado',NOT_QUEUED:'Sem notificação registrada'};
  const errors:Record<string,string>={TRANSPORT_UNAVAILABLE:'Serviço de e-mail indisponível.',INVALID_APP_URL:'Endereço de acesso indisponível para a mensagem.',DELIVERY_NOT_ACCEPTED:'O envio não foi aceito pelo provedor.',DELIVERY_INDETERMINATE:'Não foi possível confirmar o resultado; confira o provedor antes de repetir.'};
  return <div><button type="button" onClick={()=>{setOpen(true);if(open)resource.reload();}}>Consultar notificação por e-mail</button>{open&&<><ResourceState resource={resource}/>{resource.data&&<><p role="status">{states[resource.data.state]??'Estado indisponível'}</p>{typeof resource.data.attempts==='number'&&<p>Tentativas de processamento: {resource.data.attempts}</p>}{resource.data.lastAttemptAt&&<p>Última tentativa: {date(resource.data.lastAttemptAt)}</p>}{resource.data.finishedAt&&<p>Resultado registrado: {date(resource.data.finishedAt)}</p>}{resource.data.lastError&&<p>{errors[resource.data.lastError.code]??'Falha no processamento da notificação.'}</p>}</>}{resource.data?.canRetry&&<button disabled={action.busy} onClick={()=>{void action.run(`/institutions/admin/institutions/${institutionId}/decision-email/${resource.data!.id}/retry`,'POST',{confirmation:true});}}>Tentar envio seguro</button>}{action.feedback}</>}</div>;
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
      <h2>{initialStatus === 'PENDING' ? 'Análise de solicitações' : 'Instituições cadastradas'}</h2>
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
          {institutionReviewPendingFields(i).length > 0 && <p>Cadastro incompleto · {institutionReviewPendingFields(i).length} pendências para análise.</p>}
          <details><summary>Dados cadastrais e análise</summary>
          {i.homologationApproval && <p>Instituição de teste autorizada, sem CNPJ. A aprovação depende da análise cadastral.</p>}
          <InstitutionPendingDetails institution={i}/>
          <p>{i.description}</p>
          <dl>
            <dt>E-mail do responsável confirmado</dt><dd>{i.owner?(i.owner.emailVerifiedAt?'Sim':'Não confirmado'):'Não disponível nesta consulta'}</dd>
            <dt>Nome fantasia</dt><dd>{i.tradeName ?? 'Não informado no cadastro anterior'}</dd>
            <dt>Endereço</dt><dd>{i.address ?? 'Não informado no cadastro anterior'}</dd>
            <dt>Cargo do representante</dt><dd>{i.representativePosition ?? 'Não informado no cadastro anterior'}</dd>
            <dt>Contato institucional</dt><dd>{i.contactEmail ?? i.email}</dd>
            <dt>Tipo de instituição</dt><dd>{i.institutionType ? ({ENSINO_SUPERIOR:'Ensino superior', CURSO_PREPARATORIO:'Curso preparatório', OUTRA_ORGANIZACAO:'Outra organização'}[i.institutionType] ?? i.institutionType) : 'Não informado no cadastro anterior'}</dd>
            <dt>Endereço estruturado</dt><dd>{[i.postalCode,i.street,i.number,i.addressComplement,i.district,i.city,i.state].filter(Boolean).join(' · ') || 'Não informado no cadastro anterior'}</dd>
            <dt>Site oficial</dt><dd>{i.website || (i.description.includes(noWebsiteDeclaration) ? 'Declarou não possuir site oficial' : 'Não informado')}</dd>
            <dt>Telefone profissional do responsável</dt><dd>{i.representativePhone ?? 'Não informado no cadastro anterior'}</dd>
            <dt>Declaração de vínculo e responsabilidade</dt><dd>{i.representationDeclaration ? `Aceita em ${i.representationDeclaredAt ? date(i.representationDeclaredAt) : 'data não informada'} · versão ${i.representationDeclarationVersion}` : 'Não consta neste cadastro anterior'}</dd>
            <dt>Referência para comprovação</dt><dd>{i.representationEvidence ?? 'Não informada no cadastro anterior'}</dd>
          </dl>
          {!i.institutionType && <p>“Cadastro anterior” indica que o tipo não foi informado nos dados existentes; não é um tipo de instituição.</p>}
          <p>A declaração de representação deve ser verificada antes da aprovação. Não envie documentos pessoais sensíveis neste formulário.</p>
          {canDecide && <AdministrativeInstitutionDetails institution={i} reload={resource.reload}/>}
          {canDecide&&<DecisionEmailControl institutionId={i.id}/>}
          {i.decisionReason && <p>Última decisão: {i.decisionReason}</p>}
          </details>
          <div className="admin-actions">
            {(i.status === "PENDING" ||
              i.status === "SUSPENDED" ||
              i.status === "REJECTED") && (
              <button
                disabled={!canDecide || action.busy || (i.approvalReview ? !i.approvalReview.canApprove : i.homologationApproval===true || (i.status !== "SUSPENDED" && institutionReviewPendingFields(i).length > 0))}
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
function UserHistory({userId}: {userId: string}) {
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Event>>(`/institutions/admin/users/${userId}/history?page=${page}`);
  return <section className="panel"><h3>Histórico administrativo da conta</h3><ResourceState resource={resource}/>{resource.data?.items.length === 0 && <p>Nenhuma ocorrência registrada.</p>}{resource.data?.items.map(event => <p key={event.id}>{date(event.occurredAt)} · {event.event} · {auditResult(event.result)}</p>)}{resource.data && <Pages page={page} hasMore={resource.data.hasMore} change={setPage}/>}</section>;
}
function UserAdministration({ initialRole = "",permissionsOnly=false }: { initialRole?: string;permissionsOnly?:boolean }) {
  const currentUserId = useSession().session?.user.id;
  const [page, setPage] = useState(1),
    [search, setSearch] = useState<string | null>(null),
    [queryRole, setQueryRole] = useState(initialRole),
    [status, setStatus] = useState(""),
    [queryStatus, setQueryStatus] = useState(""),
    [reason, setReason] = useState(""),
    [historyId, setHistoryId] = useState<string>(),
    [draft, setDraft] = useState(""),
    [role, setRole] = useState(initialRole);
  const [change, setChange] = useState<{
    id: string;
    body: object;
    title: string;
  }>();
  const resource = useResource<Page<AdminUser>>(
      search ? `/institutions/admin/users?${new URLSearchParams({ page: String(page), search, ...(queryRole ? { role: queryRole } : {}), ...(queryStatus ? {status:queryStatus} : {}) })}` : null,
    ),
    action = useMutation(resource.reload);
  return (
    <>
      <h2>{permissionsOnly?'Permissões administrativas':initialRole === 'PROFESSOR'?'Consulta de professores e vínculos':'Consulta de contas'}</h2>
      {!permissionsOnly && <p className="muted">Para encontrar professores, selecione Professor no filtro Perfil da conta. A segurança da sua própria conta fica em Perfil e configurações.</p>}
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim().length < 2) return;
          setSearch(draft.trim());
          setQueryRole(role);
          setQueryStatus(status);
          setHistoryId(undefined);
          setChange(undefined);
          resource.reload();
          setPage(1);
        }}
      >
        <label>
          Nome ou e-mail
          <input
            required minLength={2}
            maxLength={120}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <label>
          Perfil da conta
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
        <label>Situação da conta<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todas</option><option value="ACTIVE">Ativa</option><option value="SUSPENDED">Suspensa</option></select></label>
        <button>Pesquisar</button>
      </form>
      {search === null && <p role="status">Pesquise por nome ou e-mail para consultar contas. Nenhuma conta é carregada automaticamente.</p>}
      {action.feedback}
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && <p>Nenhuma conta encontrada.</p>}
      {resource.data?.items.map((u) => (
        <article className="panel" key={u.id}>
          <h3>{u.nome}</h3>
          <p>
            {u.email} · {label(u.role)} · {u.suspended ? "Suspenso" : "Ativo"}
          </p>
          <details><summary>Ficha da conta e vínculos</summary>
          {u.createdAt && <p>Cadastro: {date(u.createdAt)}</p>}
          <p>Perfil global: {label(u.role)} · E-mail {u.emailVerifiedAt ? "confirmado" : "pendente"}</p>
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
              .
            </p>
          )}
          {u.memberships.map((m, index) => (
            <p key={index}>
              {m.institution.name}: {label(m.role)} (
              {m.active ? "vínculo ativo" : "desvinculado"}; instituição{" "}
              {label(m.institution.status)})
            </p>
          ))}
          {u.memberships.length === 0 && <p>Sem vínculos institucionais registrados.</p>}
          <button onClick={() => setHistoryId(historyId === u.id ? undefined : u.id)}>Histórico administrativo</button>
          </details>
          <div className="admin-actions account-actions">
            {!permissionsOnly&&<button
              className={`account-action-button${u.suspended ? ' account-action-positive' : ''}`}
              disabled={action.busy || u.id === currentUserId}
              title={u.id === currentUserId ? 'Sua própria suspensão não pode ser alterada nesta tela.' : undefined}
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
            {!permissionsOnly && <AdminAccountDeletion userId={u.id} email={u.email} disabled={action.busy || u.id === currentUserId} onDone={resource.reload} />}
            {(u.role==='ADMIN'||u.role==='PROFESSOR'||u.memberships.some(m=>m.role==='INSTITUTION_ADMIN'))&&<details className="admin-permission-tools"><summary>Acesso de administrador</summary><p>Este acesso permite administrar a plataforma inteira. O vínculo de professor ou responsável institucional é separado.</p><button
              className="account-action-button"
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
            </button></details>}
          </div>
        </article>
      ))}
      {change && (
        <div className="panel account-action-form" role="alert" aria-busy={action.busy}>
          <p>{change.title}? As sessões anteriores da conta serão revogadas.</p>
          <p>Usuário: {resource.data?.items.find(user => user.id === change.id)?.email ?? change.id}. Reativar suspensão não restaura uma conta desativada ou excluída.</p>
          <label>Justificativa<textarea required minLength={3} maxLength={500} disabled={action.busy} value={reason} onChange={e => setReason(e.target.value)}/></label>
          <button
            className={`account-action-button${'suspended' in change.body && change.body.suspended === false ? ' account-action-positive' : ''}`}
            disabled={action.busy || reason.trim().length < 3}
            onClick={() => {
              void action
                .run(
                  `/institutions/admin/users/${change.id}`,
                  "PATCH",
                  { ...change.body, reason: reason.trim() },
                )
                .then((ok) => {
                  if (ok) { setChange(undefined); setReason(""); }
                });
            }}
          >
            {action.busy ? 'Salvando...' : 'Confirmar alteração'}
          </button>
          <button className="account-action-button" disabled={action.busy} onClick={() => {setChange(undefined);setReason("");}}>Cancelar</button>
        </div>
      )}
      {resource.data && <Pages page={page} hasMore={resource.data.hasMore} change={setPage} />}
      {historyId && <UserHistory key={historyId} userId={historyId}/>}
    </>
  );
}
function InstitutionalFeatureStatus({ status }: { status?: string }) {
  const copy = status === 'PENDING'
    ? ['SolicitaÃ§Ã£o institucional pendente', 'Sua solicitaÃ§Ã£o foi recebida e aguarda anÃ¡lise. Nenhuma permissÃ£o de gestÃ£o Ã© liberada antes da aprovaÃ§Ã£o.']
    : status === 'ACTIVE'
      ? ['Cadastro institucional aprovado', 'As operaÃ§Ãµes institucionais ainda aguardam habilitaÃ§Ã£o autorizada. Seu perfil pessoal e seus dados acadÃªmicos permanecem preservados.']
      : status === 'REJECTED'
        ? ['SolicitaÃ§Ã£o institucional nÃ£o aprovada', 'O acompanhamento detalhado ainda nÃ£o estÃ¡ habilitado. Nenhuma permissÃ£o institucional foi concedida.']
        : ['SolicitaÃ§Ã£o institucional indisponÃ­vel', 'O recebimento de solicitaÃ§Ãµes ainda nÃ£o foi habilitado. Nenhuma permissÃ£o de gestÃ£o Ã© concedida por esta tela.'];
  return <article className="panel institution-empty-state" role="status" aria-live="polite"><h2>{copy[0]}</h2><p>{copy[1]}</p></article>;
}

export function InstitutionsPortal({ session }: { session: Session }) {
  const availability = useResource<AdministrationAvailability>(
    "/institutions/availability",
  );
  const resource = useResource<Institution[]>("/institutions/mine");
  const adminIds =
    session.administration?.memberships
      .filter((m) => m.role === "INSTITUTION_ADMIN")
      .map((m) => m.institutionId) ?? [];
  const institutions = resource.data ?? [];
  const activeInstitution = institutions.find((institution) => institution.status === "ACTIVE");
  const hasPendingInstitution = institutions.some((institution) => institution.status === "PENDING");
  const heading = activeInstitution
    ? "Minha instituição"
    : hasPendingInstitution
      ? "Acompanhamento institucional"
      : "Cadastro institucional";
  const refreshInstitution = () => {
    void refreshSession(true).then(resource.reload).catch(() => {});
  };
  return (
    <section className="page admin-page institution-portal">
      <header className="institution-portal-header">
        <div>
          <p className="gold">INSTITUIÇÕES</p>
          <h1>{heading}</h1>
          <p>Acompanhe a situação cadastral e os recursos disponíveis para sua instituição.</p>
        </div>
      </header>
      <ResourceState resource={availability} />
      {availability.data &&
      resource.error && !resource.data ? (
        <InstitutionalFeatureStatus status={session.institutionalStatus} />
      ) : (
        (
          <>
            <ResourceState resource={resource} />
            {!resource.loading&&registrationAvailable(availability.data) && session.user.emailVerificado && !resource.data?.some(i=>i.ownerId===session.user.id) ? (
              <InstitutionRequest
                onCreated={resource.reload}
                contactEmail={session.user.email}
                responsibleName={session.user.nome}
              />
            ) : (
              !session.user.emailVerificado&&<p>Confirme seu e-mail antes de enviar uma solicitação.</p>
            )}
            <h2 className="institution-portal-section-title">Meus vínculos e solicitações</h2>
            {institutions.length === 0 && (
              <p className="institution-empty-state">Nenhuma solicitação ou vínculo institucional.</p>
            )}
            <div className="institution-request-list">
            {institutions.map((i) => (
              <article className="panel institution-request-card" key={i.id}>
                <div className="institution-request-heading">
                  <div><h3>{i.name}</h3><p>Informações do seu cadastro institucional.</p></div>
                  <button className="outline-button" onClick={refreshInstitution}>Atualizar situação e permissões</button>
                </div>
                <dl className="institution-request-status"><div><dt>Situação cadastral</dt><dd><span className={`institution-status ${i.status==='ACTIVE'?'is-approved':i.status==='REJECTED'?'is-rejected':'is-pending'}`}>{i.status==='ACTIVE'?'Cadastro aprovado':label(i.status)}</span></dd></div><div><dt>Situação operacional</dt><dd><span className={`institution-status ${i.status==='ACTIVE'&&availability.data?.enabled&&session.administration?.enabled&&adminIds.includes(i.id)?'is-ready':'is-waiting'}`}>{i.status==='ACTIVE'&&availability.data?.enabled&&session.administration?.enabled&&adminIds.includes(i.id)?'Disponível para sua gestão':i.status==='ACTIVE'?'Aguardando liberação':'Disponível após aprovação e liberação'}</span></dd></div></dl>
                {i.decisionReason?.trim() && <aside className="institution-review-note" aria-label="Observação registrada na análise"><span>{i.status === 'REJECTED' ? 'Orientação para revisão do cadastro' : 'Observação registrada na análise'}</span><p>{i.decisionReason}</p></aside>}
                {i.status==='REJECTED'&&i.ownerId===session.user.id&&registrationAvailable(availability.data)&&session.user.emailVerificado&&<InstitutionRequest onCreated={resource.reload} contactEmail={session.user.email} responsibleName={session.user.nome} initial={i}/>}
                {!availability.data?.enabled && i.status === "ACTIVE" && (
                  <p className="institution-guidance">Acompanhamento em modo de leitura. As operações de gestão aguardam ativação autorizada.</p>
                )}
                {i.status==='ACTIVE' && canViewInstitution(session,i.id) && (
                  <button type="button" className="primary-button institution-manage-button" onClick={() => institutionNavigate(i.id,'overview')}>
                    {availability.data?.enabled ? 'Administrar instituição' : 'Acompanhar instituição'}
                  </button>
                )}
              </article>
            ))}
            </div>

            {session.user.emailVerificado &&
              administrativeCapability(availability.data, "notifications") && (
                <Notifications recent/>
              )}
          </>
        )
      )}
    </section>
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
  requestsOnly=false,
}: {
  classId?: string;
  teacher: boolean;
  requestsOnly?: boolean;
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
    (!teacher || available.data?.enabled)
      ? `/turmas/${classId ? `${classId}/` : ""}requests?page=${page}`
      : null,
  );
  const students = useResource<Page<{ id: string; nome: string }>>(
    available.data?.enabled && teacher && classId && !requestsOnly
      ? `/turmas/${classId}/students?page=${page}`
      : null,
  );
  const action = useMutation(() => {
    resource.reload();
    students.reload();
  });
  if (teacher && !available.data?.enabled) return null;
  return (
    <section className="panel">
      <h3>
        {teacher ? "Solicitações de entrada" : "Minhas solicitações de entrada"}
      </h3>
      {action.feedback}
      {teacher&&classId&&!requestsOnly&&<form className="admin-form" onSubmit={e=>{e.preventDefault();void action.run(`/turmas/${classId}/students`,'POST',{email:studentEmail}).then(ok=>{if(ok)setStudentEmail('');});}}><label>E-mail do aluno já cadastrado<input type="email" required maxLength={254} value={studentEmail} onChange={e=>setStudentEmail(e.target.value)}/></label><button className="primary-button" disabled={action.busy}>Vincular aluno</button></form>}
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && <p>Nenhuma solicitação.</p>}
      {resource.data?.items.map((r) => (
        <article key={r.id}>
          <p>
            {teacher ? (r.studentName ?? "Aluno indisponível") : r.className} ·{" "}
            {!teacher && r.status === 'PENDING' ? 'Aguardando aprovação do professor' : label(r.status)} · {date(r.createdAt)}
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
      {teacher && !requestsOnly && (
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
export function RemoveStudent({
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
