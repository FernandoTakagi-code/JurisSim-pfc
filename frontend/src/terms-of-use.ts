// Termos de Uso em vigor, vindos da API. O Aviso de Privacidade continua no código.
import { ApiError, apiRequest } from "./api";
import bundled from "../../backend/src/legal-versions.json";

export type TermsSection = { title: string; body: string };
export type CurrentTerms = { version: string; publishedAt: string; sections: TermsSection[] };
export type CurrentLegal = { terms: CurrentTerms; privacyVersion: string };
export type LegalVersions = { termsVersion: string; privacyVersion: string };

let pending: Promise<CurrentLegal> | null = null;

/** Carrega os Termos em vigor uma vez por página; `force` busca de novo (ex.: após uma publicação). */
export function loadCurrentLegal(force = false): Promise<CurrentLegal> {
  if (!pending || force) {
    pending = apiRequest<CurrentLegal>("/legal/current", {}, { authenticated: false });
    pending.catch(() => { pending = null; });
  }
  return pending;
}

/** Aceite enviado no cadastro. Sem a API, usa a versão empacotada e o servidor confirma ou recusa. */
export async function currentLegalAcceptance() {
  try {
    const current = await loadCurrentLegal();
    return { accepted: true as const, termsVersion: current.terms.version, privacyVersion: current.privacyVersion };
  } catch {
    return { accepted: true as const, termsVersion: bundled.termsVersion, privacyVersion: bundled.privacyVersion };
  }
}

/** Novo aceite de quem já tem conta. "outdated" quando outra versão foi publicada nesse meio-tempo. */
export async function acceptLegalUpdate(versions: LegalVersions): Promise<"accepted" | "outdated"> {
  try {
    await apiRequest("/auth/legal-acceptance", { method: "POST", body: JSON.stringify({ accepted: true, ...versions }) });
    return "accepted";
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return "outdated";
    throw error;
  }
}
