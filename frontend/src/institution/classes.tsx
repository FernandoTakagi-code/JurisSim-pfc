import {useMutation} from '../administration';
import type {Class} from './types';

export function ReadOnlyClasses({ classes, onStudentsSelected }: { classes: Class[]; onStudentsSelected: (id: string) => void }) {
  return <section className="panel table-panel"><div className="table-toolbar"><div><h2>Turmas vinculadas</h2><p>Consulta das turmas associadas à sua instituição.</p></div></div><div className="table-scroll"><table><thead><tr><th>Turma</th><th>Situação</th><th>Alunos matriculados</th><th>Consulta</th></tr></thead><tbody>{classes.map(item => <tr key={item.id}><td><strong>{item.nome}</strong></td><td>{item.archivedAt ? "Arquivada" : "Ativa"}</td><td>{item._count.alunos}</td><td><button className="outline-button" onClick={() => onStudentsSelected(item.id)}>Ver alunos</button></td></tr>)}</tbody></table></div>{classes.length === 0 && <p>Nenhuma turma vinculada disponível para consulta.</p>}</section>;
}

export function CreateClass({ done }: { done: () => void }) {
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
