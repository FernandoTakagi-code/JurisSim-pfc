// Route metadata only. Authorization always uses the validated server session.
export const adminSections = [
  {
    id: "overview",
    path: "/administracao",
    label: "Visão geral",
    icon: "home",
  },
  {
    id: "institutions",
    path: "/administracao/instituicoes",
    label: "Instituições",
    icon: "book",
  },
  {
    id: "requests",
    path: "/administracao/solicitacoes",
    label: "Solicitações de cadastro",
    icon: "file",
  },
  {
    id: "users",
    path: "/administracao/usuarios",
    label: "Usuários",
    icon: "users",
  },
  {
    id: "teachers",
    path: "/administracao/professores",
    label: "Professores",
    icon: "user",
  },
  {
    id: "audit",
    path: "/administracao/auditoria",
    label: "Logs e auditoria",
    icon: "chart",
  },
  {
    id: "security",
    path: "/administracao/seguranca",
    label: "Segurança",
    icon: "target",
  },
  {
    id: "notifications",
    path: "/administracao/notificacoes",
    label: "Notificações",
    icon: "file",
  },
  {
    id: "settings",
    path: "/administracao/configuracoes",
    label: "Configurações do sistema",
    icon: "settings",
  },
] as const;
export type AdminSectionId = (typeof adminSections)[number]["id"] | 'classes';
export const isAdministrationPath = (path: string) =>
  path === "/administracao" || path.startsWith("/administracao/");
export const adminSection = (path: string) =>
  path.replace(/\/$/,'')==='/administracao/turmas' ? {id:'classes' as const,path:'/administracao/turmas',label:'Gestão pedagógica institucional',icon:'book'} : adminSections.find((section) => section.path === path.replace(/\/$/, ""));
