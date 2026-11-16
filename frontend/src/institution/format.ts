export const statusNames: Record<string, string> = {
  ACTIVE: "Ativa",
  PENDING: "Pendente",
  ACCEPTED: "Aceito",
  DECLINED: "Recusado",
  CANCELLED: "Revogado",
  EXPIRED: "Expirado",
  SUSPENDED: "Suspensa",
  SUCCESS: "Sucesso",
};

export const date = (value?: string) =>
  value ? new Date(value).toLocaleString("pt-BR") : "Não disponível";

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
