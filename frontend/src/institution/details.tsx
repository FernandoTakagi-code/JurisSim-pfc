import {useState} from 'react';
import {useMutation} from '../administration';
import {Icon} from '../ui-icon';
import type {Institution} from './types';
import {date,initials,statusNames} from './format';

export function InstitutionCard({
  institution,
  reload,
  readOnly = false,
}: {
  institution: Institution;
  reload: () => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const action = useMutation(reload);
  return (
    <div className="institution-profile-page">
      <header className="institution-page-hero">
        <div><p className="eyebrow">IDENTIDADE INSTITUCIONAL</p><h1>Minha instituição</h1><p>Dados cadastrais, situação atual e informações autorizadas para gestão.</p></div>
        <div className="institution-statuses" aria-label="Situação institucional"><span className="status success"><i />Cadastro {statusNames[institution.status] ?? institution.status}</span>{readOnly ? <span className="status"><i />Modo de leitura · gestão aguardando ativação</span> : <span className="status success"><i />Operacional neste painel</span>}</div>
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
        {!readOnly && <button className="primary-button" aria-label="Editar dados autorizados" onClick={() => setEditing(!editing)}>
          {editing ? "Cancelar edição" : "Administrar instituição"}
        </button>}
        {action.feedback}
        {editing && !readOnly && (
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
      </aside>
      </div>
    </div>
  );
}
