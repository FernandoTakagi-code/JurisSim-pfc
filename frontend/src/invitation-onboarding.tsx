import {useEffect,useRef,useState,type FormEvent} from 'react';
import {apiRequest,ApiError} from './api';
import {AuthGate} from './auth-gate';
import {legalAcceptance,LegalLinks} from './legal';
import {pendingInvitation,pendingInvitationProof,clearInvitation,clearInvitationProof,invitationContextState} from './invitation-token';
import {EmailConfirmationGate} from './email-confirmation-gate';
import {refreshSession,useSession,logoutSession,sessionDestination} from './auth-session';
import {navigate} from './navigation';
import {passwordError,passwordRequirements} from '../../backend/src/password-policy';
import {Icon} from './ui-icon';
import {AccountConfirmationDialog} from './account-confirmation-dialog';
import './teacher-invitation.css';

type Details={institution:{id:string;name:string};invitedName?:string;email:string;accountExists:boolean;maskedEmail:string;expiresAt:string};
export function TeacherInvitationLanding(){
  const [,setRevision]=useState(0);
  const session=useSession(),token=pendingInvitation(),proof=pendingInvitationProof();
  const [details,setDetails]=useState<Details>(),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false),[login,setLogin]=useState(false);
  const [nome,setNome]=useState(''),[accepted,setAccepted]=useState(false);
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
  const [completedEmail,setCompletedEmail]=useState('');
  const [firstAccess,setFirstAccess]=useState(!!proof);
  const [declinePath,setDeclinePath]=useState<string>(),[declined,setDeclined]=useState(false);
  const pending=useRef(false);
  const [needsAuthentication,setNeedsAuthentication]=useState(false),[errorCode,setErrorCode]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{const update=()=>{setLogin(false);setFirstAccess(!!pendingInvitationProof());setDeclinePath(undefined);setDeclined(false);setNotice('');setCompletedEmail('');setPassword('');setConfirmation('');setAccepted(false);setRevision(v=>v+1);};window.addEventListener('jurissim-invitation',update);return()=>window.removeEventListener('jurissim-invitation',update);},[]);
  useEffect(()=>{let active=true;setError('');setErrorCode('');setDetails(undefined);setNeedsAuthentication(false);
    async function inspect(){
      if(!token||session.status==='loading')return;
      if(session.status==='ready'&&!session.session?.user.emailVerificado)return;
      if(session.status==='error'){setError(session.message??'Não foi possível verificar sua sessão. Tente novamente.');setErrorCode('COMMUNICATION_ERROR');return;}
      try{
        if(session.status!=='ready'){
          const availability=await apiRequest<{enabled:boolean}>('/institutions/availability',{}, {authenticated:false});
          if(!active)return;
          if(!availability.enabled){setNeedsAuthentication(true);return;}
        }
        const data=await apiRequest<Details>('/institutions/invitations/inspect',{method:'POST',body:JSON.stringify({token})},{authenticated:session.status==='ready'});
        if(active){setDetails(data);setNome(data.invitedName??'');}
      }catch(e){if(active){setError(e instanceof Error?e.message:'Não foi possível validar o convite. Tente novamente.');setErrorCode(e instanceof ApiError?e.code??'INVITATION_UNAVAILABLE':'COMMUNICATION_ERROR');}}
    }
    void inspect();
    return()=>{active=false;};
  },[token,session.status,session.session?.user.id,session.session?.user.emailVerificado,retry]);
  async function run(path:string,body:unknown,authenticated:boolean,onSuccess?:()=>Promise<void>){
    if(!token||pendingInvitation()!==token){setError('O contexto do convite não está disponível. Reabra o link original do e-mail.');return;}
    if(pending.current)return;pending.current=true;setBusy(true);setError('');setErrorCode('');
    try{const result=await apiRequest<{message:string}>(path,{method:'POST',body:JSON.stringify(body)},{authenticated});if(pendingInvitation()!==token)return;setNotice(result.message);await onSuccess?.();}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir.');setErrorCode(e instanceof ApiError?e.code??'INVITATION_UNAVAILABLE':'COMMUNICATION_ERROR');if(e instanceof ApiError&&['INVITATION_ACCEPTED','INVITATION_EXPIRED','INVITATION_REVOKED','INVITATION_DECLINED','INVITATION_INVALID'].includes(e.code??''))setDetails(undefined);}finally{pending.current=false;setBusy(false);}
  }
  function submit(event:FormEvent){event.preventDefault();
    const problem=passwordError(password);
    if(problem||password!==confirmation){setError(problem??'As senhas não coincidem.');return;}
    if(!proof&&!accepted){setError('Aceite os Termos de Uso e a Política de Privacidade.');return;}
    const body=proof?{token,proof,password,confirmation}:{token,nome,password,confirmation,acceptance:legalAcceptance};
    void run(proof?'/institutions/invitations/complete':'/institutions/invitations/register',body,false,async()=>{setCompletedEmail(details?.email??'');clearInvitationProof();setDetails(undefined);setPassword('');setConfirmation('');setFirstAccess(false);setLogin(true);setRetry(v=>v+1);});
  }
  if(login&&session.status!=='ready')return <AuthGate initialEmail={completedEmail||details?.email||''} initialNotice={notice} invitationLogin onInvitationBack={()=>{setLogin(false);setRetry(v=>v+1);}}/>;
  if(token&&session.status==='ready'&&!session.session?.user.emailVerificado)return <EmailConfirmationGate invitationPending email={session.session!.user.email} onSair={()=>void logoutSession().then(ok=>{if(ok)setLogin(true);})}/>;
  const matching=!!details&&session.session?.user.email.toLowerCase()===details.email?.toLowerCase()&&session.session.user.role!=='ADMIN';
  const status=declined?'Convite recusado':busy?'Operação em andamento':errorCode==='INVITATION_ACCEPTED'?'Convite aceito':errorCode==='INVITATION_EXPIRED'?'Convite expirado':errorCode==='INVITATION_REVOKED'?'Convite revogado':errorCode==='INVITATION_DECLINED'?'Convite recusado':errorCode==='INVITATION_WRONG_ACCOUNT'||(details&&session.status==='ready'&&!matching)?'Conta incorreta':error?'Não foi possível validar':!token?'Contexto indisponível':needsAuthentication?'Autenticação necessária':details?'Convite válido':'Verificando convite';
  const askDecline=(path:string,button:HTMLButtonElement)=>{button.focus();setError('');setDeclinePath(path);};
  return <main className="auth-layout teacher-invitation"><section className="auth-pitch"><img className="auth-brand-logo" src="/brand/jurissim-logo.png" alt="JurisSim — Educação Jurídica"/><div className="auth-pitch-copy"><h1>Ensine com o JurisSim</h1><p>Um convite exclusivo para fazer parte da sua instituição.</p></div></section>
    <section className="auth-content"><div className="auth-form-wrap invitation-card"><div className="invitation-heading"><span className="invitation-emblem"><Icon name="building"/></span><span>Convite de professor</span></div><h1>Você foi convidado para ensinar no JurisSim!</h1><p className={`invitation-status${error?' invitation-status-error':''}`} role="status"><span aria-hidden="true"/>{status}</p>
      {!token&&!notice&&<p role="status">{invitationContextState()==='invalid'?'O link do convite está incompleto ou inválido.':invitationContextState()==='expired'?'O contexto desta aba expirou.':'O convite não está disponível nesta aba.'} Reabra o link original enviado pela instituição. O convite não é salvo no navegador; login em outra aba ou uma recarga não recupera essa prova automaticamente.</p>}
      {token&&!details&&!error&&!needsAuthentication&&<p role="status">{session.status==='loading'?'Verificando sua sessão…':'Validando convite…'}</p>}
      {token&&needsAuthentication&&<div role="status"><h2>Entre para validar seu convite</h2><p>Neste ambiente, a validação exige autenticação na conta que recebeu o e-mail. Abrir o link não aceita o convite nem altera sua conta.</p><p>Uma sessão aberta em 127.0.0.1 não é compartilhada automaticamente com localhost.</p></div>}
      {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
      {token&&!details&&error&&['COMMUNICATION_ERROR','INVITATION_UNAVAILABLE'].includes(errorCode)&&<button type="button" disabled={busy} onClick={()=>{if(session.status==='error')void refreshSession(true).catch(()=>{});setRetry(v=>v+1);}}>Tentar novamente</button>}
      {token&&session.status!=='ready'&&<nav aria-label="Acesso ao convite"><button type="button" disabled={busy||session.status==='loading'} onClick={()=>setLogin(true)}>Já tenho conta — Entrar</button><button type="button" disabled={busy||!details||needsAuthentication||details.accountExists} onClick={()=>setFirstAccess(true)}>Primeiro acesso — Criar minha conta</button></nav>}
      {token&&needsAuthentication&&<p>Primeiro acesso não está disponível neste ambiente restrito. Procure o responsável pela homologação; não é necessário criar uma conta de Aluno para contornar esse bloqueio.</p>}
      {token&&!details&&session.status==='ready'&&<><p>Conta atual: {session.session?.user.email}. Use a conta que recebeu o convite.</p>{errorCode==='INVITATION_ACCEPTED'?<button type="button" onClick={()=>navigate(sessionDestination(session.session!))}>Acessar minha área</button>:<button type="button" disabled={busy} onClick={()=>void logoutSession().then(ok=>{if(ok)setLogin(true);})}>Entrar com outra conta</button>}</>}
      {details&&<><section className="invitation-details" aria-label="Dados do convite"><h2>{details.institution.name}</h2><dl><div><dt>E-mail destinatário</dt><dd data-invitation-email>{details.email??details.maskedEmail}</dd></div><div><dt>Papel oferecido</dt><dd>Professor</dd></div><div><dt>Válido até</dt><dd>{new Date(details.expiresAt).toLocaleString('pt-BR')}</dd></div></dl></section>
        {session.status==='ready'&&!proof?<>
          <p role="status">{matching?'Convite pronto para aceitação. Confirme explicitamente para ativar seu vínculo docente.':'Você está conectado com outra conta. Entre com o e-mail indicado no convite.'}</p>
          {!session.session?.user.emailVerificado&&<p>Confirme o e-mail da sua conta pelo fluxo normal antes de aceitar.</p>}
          <div className="invitation-actions"><button className="invitation-primary" disabled={busy||!matching||!session.session?.user.emailVerificado} onClick={()=>void run('/institutions/invitations/accept',{token},true,async()=>{clearInvitation();await refreshSession(true);navigate('/professor');})}><Icon name="graduation"/>{busy?'Processando…':'Aceitar convite'}</button>
          <button disabled={busy||!matching||!session.session?.user.emailVerificado} onClick={event=>askDecline('/institutions/invitations/decline',event.currentTarget)}>Recusar convite</button></div>
          {!matching&&<button disabled={busy} onClick={()=>void logoutSession().then(ok=>{if(ok)setLogin(true);})}>Entrar com outra conta</button>}
        </>:<>
          {details.accountExists&&!proof?<p>Sua conta foi preservada. Entre com sua senha ou Google para aceitar ou recusar este vínculo.</p>:<>
            {(firstAccess||proof)&&<><p>Crie sua conta do JurisSim com o e-mail convidado. O link recebido comprova esse endereço. Depois, entre para revisar e aceitar ou recusar o convite; criar a conta não ativa o vínculo.</p>
            <form className="auth-card" onSubmit={submit} aria-busy={busy}>
              {!proof&&<label>Nome completo<input name="nome" autoComplete="name" required minLength={2} maxLength={120} value={nome} onChange={e=>setNome(e.target.value)}/></label>}
              <label>Nova senha<input name="password" type="password" autoComplete="new-password" required maxLength={128} aria-describedby="invitation-password-rules" value={password} onChange={e=>setPassword(e.target.value)}/></label>
              <ul id="invitation-password-rules" aria-label="Requisitos da senha">{passwordRequirements.map(rule=><li key={rule.id}>{rule.test(password)?'✓':'○'} {rule.label}</li>)}</ul>
              <label>Confirmar senha<input name="confirmation" type="password" autoComplete="new-password" required maxLength={128} aria-invalid={confirmation.length>0&&password!==confirmation} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
              {confirmation&&password!==confirmation&&<p role="status">As senhas não coincidem.</p>}
              {!proof&&<><label><input name="acceptance" type="checkbox" required checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>Li e aceito os Termos de Uso e a Política de Privacidade.</label><LegalLinks/></>}
              {proof&&<button type="button" disabled={busy} onClick={event=>askDecline('/institutions/invitations/decline-proof',event.currentTarget)}>Recusar sem ativar vínculo</button>}
              <button className="auth-submit" disabled={busy||(!proof&&!accepted)}>{busy?'Concluindo…':proof?'Definir minha senha':'Criar minha conta'}</button>
              {!proof&&<button type="button" disabled={busy} onClick={()=>setFirstAccess(false)}>Voltar às opções de acesso</button>}
              {!proof&&<button type="button" disabled={busy} onClick={event=>askDecline('/institutions/invitations/decline-new',event.currentTarget)}>Recusar convite</button>}
            </form></>}
          </>}
        </>}
      </>}
      <button className="text-button" onClick={()=>{clearInvitation();navigate('/');}}>Voltar ao login único</button>
    </div></section>
    {declinePath&&<AccountConfirmationDialog title="Recusar convite?" description="A recusa impede a ativação deste vínculo. Sua conta e seu histórico serão preservados." busy={busy} close={()=>{if(!pending.current)setDeclinePath(undefined);}}>
      {error&&<p role="alert">{error}</p>}<div className="account-actions"><button type="button" data-confirmation-cancel className="account-action-button" disabled={busy} onClick={()=>setDeclinePath(undefined)}>Cancelar</button><button type="button" className="account-action-button account-session-confirm" disabled={busy} onClick={()=>void run(declinePath,declinePath.endsWith('decline-proof')?{token,proof}:{token},declinePath.endsWith('/decline'),async()=>{setDeclinePath(undefined);setDeclined(true);clearInvitation();setDetails(undefined);})}>Sim, recusar convite</button></div>
    </AccountConfirmationDialog>}
  </main>;
}
