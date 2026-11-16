import {useState,useEffect,useRef} from 'react';
import {useResource,useMutation,ResourceState,Pages} from '../administration';
import {Icon} from '../ui-icon';
import type {Page,Class,Invitation} from './types';
import {date,initials,statusNames} from './format';
import {Dialog} from './dialog';

export function InvitationsTable({ id, revision, canManageTeachers = false }: { id: string; revision: string; canManageTeachers?: boolean }) {
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
          <p>{canManageTeachers ? "Tokens seguros, uso único e validade informada em cada convite." : "Convites e estados registrados para esta instituição."}</p>
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
              <th>Enviado em</th>
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
                <td>{date(invite.sentAt ?? invite.createdAt)}</td>
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
                  {canManageTeachers && ["PENDING", "EXPIRED", "CANCELLED"].includes(invite.status) && (
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

export function InvitationForm({ id, institutionName, classes, done, restricted, onBusyChange }: { id: string; institutionName: string; classes: Class[]; done: () => void; restricted: boolean; onBusyChange: (busy: boolean) => void }) {
  const [selectedClass, setSelectedClass] = useState<string>("");
  const pending = useRef(false);
  const action = useMutation(done);
  const availableClasses = classes.filter((turma) => !turma.archivedAt);
  return (
    <form
      id="institution-teacher-invitation-form"
      className="admin-form institution-invitation-form"
      aria-busy={action.busy}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending.current) return;
        const data = new FormData(e.currentTarget);
        pending.current = true;
        onBusyChange(true);
        void action.run(`/institutions/${id}/invitations`, "POST", {
          email: data.get("email"),
          message: data.get("message"),
          classIds: selectedClass ? [selectedClass] : [],
        }).finally(() => { pending.current = false; onBusyChange(false); });
      }}
    >
      <div className="institution-invite-context">
        <span className="institution-invite-context-icon"><Icon name="building" /></span>
        <span><small>Institui&ccedil;&atilde;o selecionada</small><strong title={institutionName}>{institutionName}</strong></span>
        <span className="institution-invite-context-status">Atual</span>
      </div>
      <label className="institution-invite-email-label">
        <span className="institution-invite-label-row">E-mail profissional <span className="institution-required">Obrigat&oacute;rio</span></span>
        <span className="institution-invite-email-field">
          <Icon name="mail" />
          <input type="email" name="email" data-dialog-autofocus disabled={action.busy} required maxLength={254} autoComplete="email" placeholder="nome@instituicao.com.br" />
        </span>
      </label>
      <label>
        Mensagem <span className="institution-optional">Opcional</span>
        <textarea name="message" disabled={action.busy} rows={3} maxLength={2000} placeholder="Escreva uma mensagem para acompanhar o convite." />
      </label>
      <label className="institution-invite-class-label">
        Turma inicial <span className="institution-optional">Opcional</span>
        <select name="classId" value={selectedClass} disabled={action.busy || availableClasses.length === 0} onChange={(event) => setSelectedClass(event.target.value)}>
          <option value="">Sem designa&ccedil;&atilde;o inicial</option>
          {availableClasses.map((turma) => <option key={turma.id} value={turma.id}>{turma.nome}</option>)}
        </select>
      </label>
      {restricted && <p className="institution-invitation-scope" role="note">Neste ambiente, convide somente profissionais previamente autorizados.</p>}
      <p className="institution-invite-privacy"><Icon name="lock" /> {"O vínculo só é criado após o aceite. Contas existentes e histórico acadêmico são preservados."}</p>
      {action.feedback}
    </form>
  );
}
