import type {Session} from './auth-session';
export const profileTabs=['personal','security','appearance','preferences'] as const;
export type ProfileTab=(typeof profileTabs)[number];
export function profilePath(role:Session['user']['role']){return role==='ADMIN'?'/administracao/perfil':role==='PROFESSOR'?'/professor/perfil':'/perfil';}
export function profileRoute(role:Session['user']['role'],path:string,search=''){
  const canonical=profilePath(role);
  const ownSettings=role==='ADMIN'?'/administracao/preferencias':role==='PROFESSOR'?'/professor/configuracoes':'/configuracoes';
  const appearance=path===ownSettings||path==='/configuracoes';
  const recognized=appearance||path===canonical||path==='/perfil';
  if(!recognized)return null;
  const params=new URLSearchParams(search),requested=params.get('aba');
  const tab:ProfileTab=profileTabs.includes(requested as ProfileTab)?requested as ProfileTab:appearance?'appearance':'personal';
  if(appearance&&!requested)params.set('aba',tab);
  return {canonical,tab,target:canonical+(params.size?'?'+params.toString():'')};
}
export function accountIdentity(session:Pick<Session,'user'|'registrationIntent'|'administration'>,institutionalContext=false){
  const individual={ALUNO:'Aluno',PROFESSOR:'Professor',ADMIN:'Administrador geral'}[session.user.role];
  const manager=session.administration?.memberships.some(m=>m.role==='INSTITUTION_ADMIN')===true;
  const institutional=session.user.role!=='ADMIN'&&((session.user.role==='ALUNO'&&session.registrationIntent==='INSTITUTION')||(institutionalContext&&manager));
  return {individual,institutional,label:institutional?(manager?'Administrador institucional':'Responsável institucional'):individual};
}
