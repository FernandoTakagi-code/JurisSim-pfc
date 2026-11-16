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
    id: "audit",
    path: "/administracao/auditoria",
    label: "Logs e auditoria",
    icon: "chart",
  },
  {
    id: "notifications",
    path: "/administracao/notificacoes",
    label: "Avisos",
    icon: "file",
  },
  {
    id: "settings",
    path: "/administracao/configuracoes",
    label: "Estado do sistema",
    icon: "settings",
  },
] as const;
export type AdminSectionId = (typeof adminSections)[number]["id"] | 'classes' | 'teachers' | 'security';
export const isAdministrationPath = (path: string) =>
  path === "/administracao" || path.startsWith("/administracao/");
export const adminSection = (path: string) =>
  path.replace(/\/$/,'')==='/administracao/turmas' ? {id:'classes' as const,path:'/administracao/turmas',label:'Gestão pedagógica institucional',icon:'book'}
  : path.replace(/\/$/,'')==='/administracao/professores' ? {id:'teachers' as const,path:'/administracao/professores',label:'Usuários — professores',icon:'users'}
  : path.replace(/\/$/,'')==='/administracao/seguranca' ? {id:'security' as const,path:'/administracao/seguranca',label:'Acesso administrativo',icon:'users'}
  : adminSections.find((section) => section.path === path.replace(/\/$/, ""));
