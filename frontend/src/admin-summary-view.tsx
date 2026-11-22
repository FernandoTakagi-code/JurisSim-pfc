// Indicadores da Visão geral do ADMIN e barra de filtro por período. Componentes só de apresentação.
import { bucketLabel, dayDisabled, fillBuckets, periodTitle, type GroupBy, type SummaryPeriod } from "./admin-summary-period";

type Series = { day?: string; bucket?: string; count?: number; students?: number; attempts?: number }[];
export type AdminSummary = {
  users: number; students: number; institutions: number; pending: number; teachers: number;
  classes: number; archivedClasses: number; errors: number; publishedExams: number;
  publishedActivities: number | null; completedActivities: number | null; newUsers: number;
  activitiesAvailable: boolean;
  registrationsByDay: Series;
  institutionGrowthByDay: Series;
  participationByDay: Series;
  userDistribution: { profile: string; count: number }[];
  period?: SummaryPeriod | null;
};
type ValueKey = "count" | "students" | "attempts";

const profileNames: Record<string, string> = { ALUNO: "Aluno", PROFESSOR: "Professor", ADMIN: "Administrador", INSTITUTIONAL_OWNER: "Responsável institucional", INVITED_TEACHER: "Professor convidado" };
const titles: [keyof AdminSummary, string, string][] = [
  ["users", "Contas cadastradas", "Contas não excluídas"],
  ["students", "Alunos cadastrados", "Contas com perfil de aluno"],
  ["teachers", "Professores vinculados", "Vínculos ativos em instituições ativas"],
  ["institutions", "Instituições", "Cadastros institucionais"],
  ["classes", "Turmas ativas", "Turmas operacionais visíveis"],
  ["pending", "Solicitações pendentes", "Aguardando análise"],
  ["publishedExams", "Simulados publicados", "Avaliações disponíveis"],
  ["publishedActivities", "Atividades publicadas", "Atividades disponíveis para os alunos"],
  ["completedActivities", "Atividades concluídas", "Entregas finalizadas"],
  ["newUsers", "Novos cadastros", "Últimos 30 dias"],
];

export function SummaryBars({ title, items, valueKey = "count", period }: { title: string; items: Series; valueKey?: ValueKey; period?: SummaryPeriod | null }) {
  const zero = { count: 0, students: 0, attempts: 0 };
  const rows = period
    ? fillBuckets(items.map(item => ({ ...zero, ...item, bucket: item.bucket ?? item.day ?? "" })), period.from, period.to, period.groupBy, zero)
        .map(item => ({ key: item.bucket, label: bucketLabel(item.bucket, period.groupBy), value: item[valueKey] ?? 0 }))
    : items.map(item => ({ key: item.day ?? "", label: (item.day ?? "").slice(8), value: item[valueKey] ?? 0 }));
  const max = Math.max(1, ...rows.map(row => row.value));
  // No máximo ~8 rótulos no eixo para não sobrepor; a data de cada barra segue no tooltip.
  const labelStep = Math.max(1, Math.ceil((rows.length - 1) / 7));
  const description = period ? periodTitle(period) : "dados dos últimos 30 dias";
  return (
    <section className="panel dashboard-panel">
      <h2>{title}</h2>
      {period && <p className="muted">{periodTitle(period)}</p>}
      {rows.length && (period || items.length) ? (
        <div className="summary-bars" role="img" aria-label={`${title}, ${description}`}>
          {rows.map((row, i) => (
            <div className="summary-bar-column" key={row.key} title={`${row.key}: ${row.value}`}>
              <span style={{ height: `${Math.max(3, (row.value / max) * 100)}%` }} />
              <small>{i % labelStep === 0 || i === rows.length - 1 ? row.label : ""}</small>
            </div>
          ))}
        </div>
      ) : <p className="empty-dashboard">Sem registros no período consultado.</p>}
    </section>
  );
}

export function AdminSummaryView({ data, enabled, loading, error, onNavigate }: {
  data: AdminSummary | null | undefined; enabled: boolean; loading: boolean; error: boolean; onNavigate: (path: string) => void;
}) {
  const period = data?.period ?? null;
  const visible = titles.filter(([key]) =>
    (key !== "newUsers" || !period) &&
    ((key !== "publishedActivities" && key !== "completedActivities") || typeof data?.[key] === "number"));
  return (
    <>
      <div className="dashboard-stats">
        {visible.map(([key, title, description]) => (
          <article key={key}>
            <span>{title}</span>
            <strong>{typeof data?.[key] === "number" ? (data[key] as number).toLocaleString("pt-BR") : data?.[key] === null ? "Indisponível" : "—"}</strong>
            <small>{!enabled ? "Módulo desativado" : loading ? "Carregando…" : error ? "Falha ao consultar" : period ? "No período" : description}</small>
          </article>
        ))}
      </div>
      {data && (
        <>
          <div className="dashboard-grid admin-charts">
            <SummaryBars title="Evolução de cadastros" items={data.registrationsByDay ?? []} period={period} />
            <section className="panel dashboard-panel">
              <h2>Distribuição de usuários por perfil</h2>
              {period && <p className="muted">{periodTitle(period)}</p>}
              {(data.userDistribution ?? []).length ? (
                <div className="profile-distribution">
                  {(data.userDistribution ?? []).map((item) => (
                    <div key={item.profile}>
                      <span>{profileNames[item.profile] ?? "Outro perfil"}</span><strong>{item.count.toLocaleString("pt-BR")}</strong>
                      <i><b style={{ width: `${data.users ? Math.max(1, (item.count / data.users) * 100) : 0}%` }} /></i>
                    </div>
                  ))}
                </div>
              ) : <p className="empty-dashboard">{period ? "Nenhuma conta criada no período." : "Sem usuários para apresentar."}</p>}
            </section>
            <SummaryBars title="Crescimento de instituições" items={data.institutionGrowthByDay ?? []} period={period} />
            <SummaryBars title={period ? "Alunos participantes" : "Alunos participantes por dia"} items={data.participationByDay ?? []} valueKey="students" period={period} />
          </div>
          <div className="admin-quick-actions panel">
            <h2>Ações administrativas</h2>
            <div className="admin-actions">
              <button onClick={() => onNavigate("/administracao/instituicoes")}>Gerenciar instituições</button>
              <button onClick={() => onNavigate("/administracao/solicitacoes")}>Analisar solicitações</button>
              <button onClick={() => onNavigate("/administracao/usuarios")}>Consultar usuários</button>
              <button onClick={() => onNavigate("/administracao/auditoria")}>Logs e auditoria</button>
              <button onClick={() => onNavigate("/administracao/acervo")}>Revisão editorial do acervo</button>
            </div>
            <p>O gerenciamento pedagógico de turmas continua restrito à instituição e aos professores autorizados.</p>
          </div>
        </>
      )}
    </>
  );
}

export type PeriodDraft = { from: string; to: string; groupBy: GroupBy };
const groupOptions: [GroupBy, string][] = [["day", "Dia"], ["week", "Semana"], ["month", "Mês"]];

export function SummaryFilterBar({ draft, applied, error, onChange, onApply, onClear }: {
  draft: PeriodDraft; applied: SummaryPeriod | null; error: string;
  onChange: (draft: PeriodDraft) => void; onApply: () => void; onClear: () => void;
}) {
  const complete = Boolean(draft.from && draft.to);
  const noDays = complete && draft.from <= draft.to && dayDisabled(draft.from, draft.to);
  return (
    <form className="panel admin-summary-filter" aria-label="Período dos indicadores" onSubmit={(event) => { event.preventDefault(); onApply(); }}>
      <h2>Período dos indicadores</h2>
      <div className="admin-summary-filter-fields">
        <label>De<input type="date" min="2000-01-01" value={draft.from} onChange={(e) => onChange({ ...draft, from: e.target.value })} /></label>
        <label>Até<input type="date" min="2000-01-01" value={draft.to} onChange={(e) => onChange({ ...draft, to: e.target.value })} /></label>
        <div role="group" aria-label="Agrupar por" className="admin-summary-groupby">
          {groupOptions.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={draft.groupBy === value}
              disabled={value === "day" && noDays}
              title={value === "day" && noDays ? "Para períodos acima de 1 ano, agrupe por semana ou mês." : undefined}
              onClick={() => onChange({ ...draft, groupBy: value })}>{label}</button>
          ))}
        </div>
        <button className="primary-button" disabled={!complete}>Aplicar</button>
        {applied && <button type="button" onClick={onClear}>Limpar filtro</button>}
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
      <p className="muted">{applied ? `Mostrando ${periodTitle(applied)}.` : "Sem filtro: totais atuais e gráficos dos últimos 30 dias."}</p>
    </form>
  );
}
