// Consulta de CEP pela ViaCEP direto do navegador. Só o CEP é enviado; nenhuma falha impede o preenchimento manual.
import { institutionStates } from "../../backend/src/institution-registration";

export type CepAddress = { street: string; district: string; city: string; state: string };
export type CepLookup = { status: "found"; address: CepAddress } | { status: "not_found" | "unavailable" | "invalid" };
type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const LOOKUP_TIMEOUT_MS = 6000;

export const cepDigits = (value: string) => value.replace(/\D/g, "");
export const isCompleteCep = (value: string) => cepDigits(value).length === 8;
export const formatCep = (value: string) => {
  const digits = cepDigits(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
};

export async function lookupCep(value: string, request: FetchLike = fetch as unknown as FetchLike, timeoutMs = LOOKUP_TIMEOUT_MS): Promise<CepLookup> {
  if (!isCompleteCep(value)) return { status: "invalid" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await request(`https://viacep.com.br/ws/${cepDigits(value)}/json/`, { signal: controller.signal });
    if (response.status === 400) return { status: "not_found" };
    if (!response.ok) return { status: "unavailable" };
    const body = (await response.json()) as Record<string, unknown>;
    if (body.erro === true || body.erro === "true") return { status: "not_found" };
    const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");
    const state = text("uf").toUpperCase();
    if (!(institutionStates as readonly string[]).includes(state) || !text("localidade")) return { status: "unavailable" };
    return { status: "found", address: { street: text("logradouro"), district: text("bairro"), city: text("localidade"), state } };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
