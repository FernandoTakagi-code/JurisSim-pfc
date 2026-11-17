import {useState} from 'react';
import {useResource,useMutation,ResourceState,Pages} from '../administration';
import {Icon} from '../ui-icon';
import type {Page,Class,Summary,Member} from './types';
import {initials} from './format';
import {Dialog} from './dialog';

export function Teachers({
  id,
  summary,
  page,
  setPage,
  reload,
  canManageTeachers = false,
}: {
  id: string;
  summary: Summary;
  page: number;
  setPage: (page: number) => void;
  reload: () => void;
  canManageTeachers?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Member>(),
    [detail, setDetail] = useState<Member>(),
    [assign, setAssign] = useState<Member>();
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
                  <div className="institution-row-actions">
                    <button className="outline-button" onClick={() => setDetail(member)}>Ver detalhes</button>
                    {canManageTeachers && member.active && <button className="outline-button" disabled={action.busy} onClick={() => setAssign(member)}>Gerenciar vínculo / turmas</button>}
                    {canManageTeachers && member.active && <button className="outline-button" disabled={action.busy} onClick={() => setSelected(member)}>Desvincular</button>}
                  </div>
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
      {detail && (
        <Dialog title="Detalhes do professor" close={() => setDetail(undefined)}>
          <div className="institution-teacher-details">
            <p><strong>Nome:</strong> {detail.user?.nome ?? "Conta indisponível"}</p>
            <p><strong>E-mail:</strong> {detail.user?.email ?? "E-mail indisponível"}</p>
            <p><strong>Vínculo:</strong> {detail.active ? "Ativo nesta instituição" : "Desvinculado"}</p>
            <p>O acesso às turmas depende de designação específica; o vínculo institucional não concede acesso a outras instituições.</p>
          </div>
        </Dialog>
      )}
      {assign && (
        <Dialog title={`Designar turmas — ${assign.user?.nome ?? "Professor"}`} close={() => setAssign(undefined)}>
          <TeacherClassAssignments id={id} member={assign} onDone={() => { setAssign(undefined); reload(); }} />
        </Dialog>
      )}
    </div>
  );
}

export function TeacherClassAssignments({ id, member, onDone }: { id: string; member: Member; onDone: () => void }) {
  const [page, setPage] = useState(1);
  const classes = useResource<Page<Class>>(`/turmas?page=${page}`);
  const action = useMutation(onDone);
  const assigned = new Set(classes.data?.items.filter(item => item.professores?.some(teacher => teacher.id === member.userId)).map(item => item.id) ?? []);
  return (
    <div className="institution-teacher-assignments">
      <p>As designações afetam somente turmas desta instituição e preservam o histórico acadêmico.</p>
      <ResourceState resource={classes} />
      {classes.data?.items.map(item => {
        const isAssigned = assigned.has(item.id);
        return <div className="institution-assignment-row" key={item.id}>
          <span><strong>{item.nome}</strong><small>{item.archivedAt ? "Arquivada" : "Ativa"}</small></span>
          <button className="outline-button" disabled={action.busy || !!item.archivedAt} onClick={() => void action.run(`/turmas/${item.id}/teachers/${member.userId}`, "PUT", { assigned: !isAssigned })}>{isAssigned ? "Retirar designação" : "Designar professor"}</button>
        </div>;
      })}
      <Pages page={page} hasMore={classes.data?.hasMore} change={setPage} />
      {action.feedback}
    </div>
  );
}

export function TeacherAssignment({
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
