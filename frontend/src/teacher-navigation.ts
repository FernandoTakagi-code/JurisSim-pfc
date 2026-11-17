export const teacherSections = [
  {path:'/professor',label:'Início',icon:'home'},
  {path:'/professor/turmas',label:'Turmas',icon:'users'},
  {path:'/professor/alunos',label:'Alunos',icon:'user'},
  {path:'/professor/atividades',label:'Atividades',icon:'book'},
  {path:'/professor/simulados',label:'Simulados',icon:'file'},
  {path:'/professor/questoes',label:'Banco de questões',icon:'book'},
  {path:'/professor/desempenho',label:'Desempenho',icon:'chart'},
] as const;

export function teacherCanonicalPath(path:string) {
  return path.replace(/^\/professor\/relatorios(?=\/|$)/,'/professor/desempenho');
}
