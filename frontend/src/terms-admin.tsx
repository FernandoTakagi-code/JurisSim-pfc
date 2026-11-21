// Seção "Termos de uso" do ADMIN: edita o texto e publica uma nova versão, exigindo novo aceite das demais contas.
import { useEffect, useState } from "react";
import { apiRequest } from "./api";
import { TermsSections } from "./legal";

export type TermsSection = { title: string; body: string };
type TermsVersion = { version: string; publishedAt: string; sections: TermsSection[] };
export type TermsOverview = {
  current: TermsVersion;
  history: { version: string; publishedAt: string; publishedBy: string | null }[];
  acceptedCount: number;
  activeAccounts: number;
};

const normalize = (sections: TermsSection[]) => sections.map(({ title, body }) => ({ title: title.trim(), body: body.trim() }));
export const sectionsChanged = (current: TermsSection[], draft: TermsSection[]) => JSON.stringify(normalize(current)) !== JSON.stringify(normalize(draft));
export function moveSection(sections: TermsSection[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= sections.length) return sections;
  const next = [...sections];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export const removeSection = (sections: TermsSection[], index: number) => sections.filter((_, i) => i !== index);
export const addSection = (sections: TermsSection[]) => [...sections, { title: "", body: "" }];
/** Mesmas regras do servidor, para avisar antes de enviar. */
export function publishProblem(sections: TermsSection[]) {
  if (!sections.length) return "Inclua ao menos uma seção.";
  if (sections.length > 40) return "Use no máximo 40 seções.";
  const clean = normalize(sections);
  if (clean.some((s) => !s.title || !s.body)) return "Preencha o título e o texto de todas as seções.";
  if (clean.some((s) => /[<>]/.test(s.title + s.body))) return "Os títulos e textos não podem conter os caracteres < ou >.";
  if (clean.some((s) => s.title.length > 120 || s.body.length > 5000)) return "Cada título pode ter até 120 caracteres e cada texto até 5.000.";
  return "";
}

const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function TermsAdministrationView(props: {
  overview: TermsOverview | null; draft: TermsSection[]; preview: boolean; confirming: boolean; busy: boolean;
  message: string; error: string; viewing: TermsVersion | null;
  onChange: (sections: TermsSection[]) => void; onTogglePreview: () => void; onAskPublish: () => void;
  onCancelPublish: () => void; onConfirmPublish: () => void; onView: (version: string) => void; onCloseView: () => void;
}) {
  const { overview, draft } = props;
  if (!overview) return <section className="panel" role="status">{props.error ? <p role="alert" className="error">{props.error}</p> : "Carregando os Termos de Uso…"}</section>;
  const changed = sectionsChanged(overview.current.sections, draft);
  const update = (index: number, field: keyof TermsSection, value: string) =>
    props.onChange(draft.map((section, i) => (i === index ? { ...section, [field]: value } : section)));
  return (
    <div className="admin-terms">
      <section className="panel admin-terms-status">
        <h2>Versão em vigor</h2>
        <p className="admin-status-label">Em vigor: {overview.current.version} · desde {day(overview.current.publishedAt)}</p>
        <p>{overview.acceptedCount.toLocaleString("pt-BR")} de {overview.activeAccounts.toLocaleString("pt-BR")} contas aceitaram esta versão</p>
        <p className="muted">Ao publicar uma nova versão, todas as outras contas precisam ler e aceitar o texto no próximo acesso. O Aviso de Privacidade não muda.</p>
      </section>

      <section className="panel admin-terms-editor" aria-labelledby="terms-editor-title">
        <div className="dashboard-panel-heading">
          <h2 id="terms-editor-title">Texto dos Termos de Uso</h2>
          <button type="button" className="text-button" onClick={props.onTogglePreview}>{props.preview ? "Voltar à edição" : "Pré-visualizar"}</button>
        </div>
        {props.preview ? <div className="legal-document admin-terms-preview"><TermsSections sections={normalize(draft)} /></div> : (
          <>
            {draft.map((section, index) => (
              <fieldset className="admin-terms-section" key={index}>
                <legend>Seção {index + 1}</legend>
                <label>Título<input value={section.title} maxLength={120} onChange={(e) => update(index, "title", e.target.value)} /></label>
                <label>Texto<textarea rows={5} maxLength={5000} value={section.body} onChange={(e) => update(index, "body", e.target.value)} /></label>
                <div className="admin-terms-section-actions">
                  <button type="button" aria-label={`Subir seção ${index + 1}`} disabled={index === 0} onClick={() => props.onChange(moveSection(draft, index, -1))}>↑</button>
                  <button type="button" aria-label={`Descer seção ${index + 1}`} disabled={index === draft.length - 1} onClick={() => props.onChange(moveSection(draft, index, 1))}>↓</button>
                  <button type="button" disabled={draft.length === 1} onClick={() => props.onChange(removeSection(draft, index))}>Remover</button>
                </div>
              </fieldset>
            ))}
            <button type="button" onClick={() => props.onChange(addSection(draft))}>+ Adicionar seção</button>
          </>
        )}
        {props.error && <p role="alert" className="error">{props.error}</p>}
        {props.message && <p role="status" className="recovery-notice">{props.message}</p>}
        <div className="admin-actions">
          <button className="primary-button" disabled={!changed || props.busy} onClick={props.onAskPublish}>Publicar nova versão</button>
        </div>
      </section>

      {props.confirming && (
        <div className="admin-terms-confirm panel" role="dialog" aria-modal="true" aria-labelledby="terms-confirm-title">
          <h2 id="terms-confirm-title">Publicar nova versão dos Termos de Uso?</h2>
          <p>Todas as outras contas precisarão aceitar a nova versão no próximo acesso. Seu aceite será registrado ao publicar.</p>
          <div className="admin-actions">
            <button className="primary-button" disabled={props.busy} onClick={props.onConfirmPublish}>Confirmar publicação</button>
            <button type="button" disabled={props.busy} onClick={props.onCancelPublish}>Cancelar</button>
          </div>
        </div>
      )}

      <section className="panel admin-terms-history">
        <h2>Histórico de versões</h2>
        <ul>
          {overview.history.map((item, index) => (
            <li key={item.version}>
              <strong>{item.version}</strong> · {dateTime(item.publishedAt)} · {item.publishedBy ?? "Sistema"}{index === 0 ? " (em vigor)" : ""}
              <button type="button" className="text-button" onClick={() => props.onView(item.version)}>Ver texto</button>
            </li>
          ))}
        </ul>
        {props.viewing && (
          <article className="legal-document admin-terms-preview">
            <h3>Versão {props.viewing.version} (somente leitura)</h3>
            <TermsSections sections={props.viewing.sections} />
            <button type="button" onClick={props.onCloseView}>Fechar</button>
          </article>
        )}
      </section>
    </div>
  );
}

export function TermsAdministration() {
  const [overview, setOverview] = useState<TermsOverview | null>(null);
  const [draft, setDraft] = useState<TermsSection[]>([]);
  const [preview, setPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<TermsVersion | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    apiRequest<TermsOverview>("/legal/admin/terms-of-use")
      .then((data) => { if (active) { setOverview(data); setDraft(data.current.sections); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Não foi possível carregar os Termos de Uso."); });
    return () => { active = false; };
  }, [revision]);
  const askPublish = () => {
    const problem = publishProblem(draft);
    setMessage("");
    if (problem) { setError(problem); return; }
    setError("");
    setConfirming(true);
  };
  const publish = async () => {
    setBusy(true);
    try {
      const result = await apiRequest<{ version: string }>("/legal/admin/terms-of-use", { method: "POST", body: JSON.stringify({ sections: draft }) });
      setConfirming(false);
      setPreview(false);
      setMessage(`Versão ${result.version} publicada. As demais contas precisarão aceitá-la no próximo acesso.`);
      setRevision((r) => r + 1);
    } catch (e) {
      setConfirming(false);
      setError(e instanceof Error ? e.message : "Não foi possível publicar a nova versão.");
    } finally {
      setBusy(false);
    }
  };
  const view = async (version: string) => {
    try { setViewing(await apiRequest<TermsVersion>(`/legal/admin/terms-of-use/${encodeURIComponent(version)}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível abrir a versão."); }
  };
  return (
    <TermsAdministrationView
      overview={overview} draft={draft} preview={preview} confirming={confirming} busy={busy} message={message} error={error} viewing={viewing}
      onChange={(sections) => { setDraft(sections); setMessage(""); setError(""); }}
      onTogglePreview={() => setPreview((p) => !p)} onAskPublish={askPublish} onCancelPublish={() => setConfirming(false)}
      onConfirmPublish={() => void publish()} onView={(version) => void view(version)} onCloseView={() => setViewing(null)}
    />
  );
}
