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
] as const;
export type AdminSectionId = (typeof adminSections)[number]["id"] | 'classes' | 'teachers' | 'security' | 'settings' | 'notifications';
export const isAdministrationPath = (path: string) =>
  path === "/administracao" || path.startsWith("/administracao/");
export const adminSection = (path: string) =>
  path.replace(/\/$/,'')==='/administracao/notificacoes' ? {id:'audit' as const,path:'/administracao/notificacoes',label:'Logs e auditoria',icon:'chart'}
  : path.replace(/\/$/,'')==='/administracao/turmas' ? {id:'classes' as const,path:'/administracao/turmas',label:'Gestão pedagógica institucional',icon:'book'}
  : path.replace(/\/$/,'')==='/administracao/professores' ? {id:'teachers' as const,path:'/administracao/professores',label:'Usuários — professores',icon:'users'}
  : path.replace(/\/$/,'')==='/administracao/seguranca' ? {id:'security' as const,path:'/administracao/seguranca',label:'Acesso administrativo',icon:'users'}
  : path.replace(/\/$/,'')==='/administracao/configuracoes' ? {id:'settings' as const,path:'/administracao/configuracoes',label:'Disponibilidade da plataforma',icon:'settings'}
  : adminSections.find((section) => section.path === path.replace(/\/$/, ""));
