import {useEffect,useState, type FormEvent} from 'react';
import {apiRequest} from './api';
import {AuthGate} from './auth-gate';
import {legalAcceptance,LegalLinks} from './legal';
import {pendingInvitation,pendingInvitationProof,clearInvitation} from './invitation-token';
import {refreshSession,useSession} from './auth-session';
import {navigate} from './navigation';
import {passwordError} from '../../backend/src/password-policy';

type Details={institution:{id:string;name:string};invitedName?:string;maskedEmail:string;expiresAt:string};
export function TeacherInvitationLanding(){
  const [,setInvitationRevision]=useState(0);
  useEffect(()=>{const update=()=>setInvitationRevision(v=>v+1);window.addEventListener('jurissim-invitation',update);return()=>window.removeEventListener('jurissim-invitation',update);},[]);
  const session=useSession();
  const token=pendingInvitation(), proof=pendingInvitationProof();
  const [details,setDetails]=useState<Details>();
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false),[login,setLogin]=useState(false);
  const [nome,setNome]=useState(''),[accepted,setAccepted]=useState(false);
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
  useEffect(()=>{let active=true;if(token) void apiRequest<Details>('/institutions/invitations/inspect',{method:'POST',body:JSON.stringify({token})},{authenticated:false}).then(data=>{if(active){setDetails(data);setNome(data.invitedName??'');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[token]);
  async function run(path:string,body:unknown,authenticated:boolean,onSuccess?:()=>Promise<void>){
    if(busy)return;setBusy(true);setError('');
    try{const result=await apiRequest<{message:string}>(path,{method:'POST',body:JSON.stringify(body)},{authenticated});setNotice(result.message);await onSuccess?.();}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir.');}finally{setBusy(false);}
  }
  function submit(event:FormEvent){event.preventDefault();
    if(proof){const problem=passwordError(password);if(problem || password!==confirmation){setError(problem??'As senhas não coincidem.');return;}
      void run('/institutions/invitations/complete',{token,proof,password,confirmation},false,async()=>{clearInvitation();setDetails(undefined);setPassword('');setConfirmation('');});
    }else void run('/institutions/invitations/onboarding',{token,nome,acceptance:legalAcceptance},false);
  }
  if(login && session.status!=='ready')return <AuthGate/>;
  return <main className="auth-layout"><section className="auth-pitch"><img className="auth-brand-logo" src="/brand/jurissim-logo.png" alt="JurisSim — Educação Jurídica"/><div className="auth-pitch-copy"><h1>Acesso por convite</h1><p>Seu vínculo depende da instituição e da confirmação do e-mail convidado.</p></div></section><section className="auth-content"><div className="auth-form-wrap"><h1>Convite de professor</h1>
    {!token&&!notice&&<p>Abra o link enviado pela instituição. As credenciais do convite não ficam armazenadas neste navegador.</p>}
    {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {details&&<><h2>{details.institution.name}</h2><p>Destinatário: {details.maskedEmail} · Válido até {new Date(details.expiresAt).toLocaleString('pt-BR')}</p>
      {session.status==='ready'&&!proof?<><p>Use exclusivamente a conta com o e-mail convidado e confirmado.</p><button disabled={busy||!session.session?.user.emailVerificado} onClick={()=>void run('/institutions/invitations/accept',{token},true,async()=>{clearInvitation();await refreshSession(true);navigate('/professor');})}>Aceitar convite</button><button disabled={busy||!session.session?.user.emailVerificado} onClick={()=>void run('/institutions/invitations/decline',{token},true,async()=>{clearInvitation();setDetails(undefined);})}>Recusar convite</button></>:<>
      {!proof&&<><button onClick={()=>setLogin(true)}>Já tenho conta — entrar com senha ou Google</button><p>Primeiro acesso? Confirme o controle do e-mail antes de definir sua senha. Contas existentes continuam utilizando o login e a senha atuais.</p></>}
      <form className="auth-card" onSubmit={submit}>{proof?<><label>Nova senha<input type="password" autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirmar senha<input type="password" autoComplete="new-password" required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label></>:<><label>Nome completo<input required minLength={2} maxLength={120} value={nome} onChange={e=>setNome(e.target.value)}/></label><label><input type="checkbox" required checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>Li e aceito os Termos de Uso e a Política de Privacidade.</label><LegalLinks/></>}
      {proof&&<button type="button" disabled={busy} onClick={()=>void run('/institutions/invitations/decline-proof',{token,proof},false,async()=>{clearInvitation();setDetails(undefined);})}>Recusar sem ativar vínculo</button>}
      <button className="auth-submit" disabled={busy||(!proof&&!accepted)}>{busy?'Aguarde…':proof?'Confirmar e-mail e concluir acesso':'Receber confirmação de primeiro acesso'}</button></form></>}
    </>}
    <button className="text-button" onClick={()=>{clearInvitation();navigate('/');}}>Voltar ao login único</button>
  </div></section></main>;
}
