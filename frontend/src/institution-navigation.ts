import { useSyncExternalStore } from "react";
import { navigate } from "./navigation";
import type { Session } from "./auth-session";
export const canManageInstitution = (session: Session, id: string) =>
  session.user.role !== "ADMIN" &&
  session.user.emailVerificado &&
  session.administration?.enabled === true &&
  session.administration.memberships.some(
    (m) => m.institutionId === id && m.role === "INSTITUTION_ADMIN",
  );
export const institutionSections = [
  { id: "overview", label: "Visão geral", group: "Gestão", icon: "home" },
  {
    id: "institution",
    label: "Minha instituição",
    group: "Gestão",
    icon: "building",
  },
  { id: "teachers", label: "Professores", group: "Gestão", icon: "graduation" },
  { id: "invitations", label: "Convites", group: "Gestão", icon: "mail" },
  { id: "classes", label: "Turmas", group: "Gestão", icon: "book" },
  { id: "students", label: "Alunos", group: "Gestão", icon: "users" },
  {
    id: "performance",
    label: "Desempenho acadêmico",
    group: "Acompanhamento",
    icon: "chart",
  },
  { id: "exams", label: "Simulados", group: "Acompanhamento", icon: "file" },
  {
    id: "reports",
    label: "Relatórios",
    group: "Acompanhamento",
    icon: "chart",
  },
  {
    id: "notifications",
    label: "Notificações",
    group: "Sistema",
    icon: "bell",
  },
  {
    id: "settings",
    label: "Auditoria institucional",
    group: "Sistema",
    icon: "chart",
  },
] as const;
export type InstitutionSection = (typeof institutionSections)[number]["id"];
export function useInstitutionLocation() {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener("popstate", listener);
      window.addEventListener("jurissim-institution-context", listener);
      return () => {
        window.removeEventListener("popstate", listener);
        window.removeEventListener("jurissim-institution-context", listener);
      };
    },
    () => window.location.pathname + window.location.search,
  );
}
export function institutionNavigate(
  id: string,
  section: InstitutionSection,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({
    instituicao: id,
    secao: section,
    ...extra,
  });
  sessionStorage.setItem("jurissim_administration_institution", id);
  navigate("/instituicoes?" + params.toString());
}
