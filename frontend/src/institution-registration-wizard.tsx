import {useRef,useState,type FormEvent} from 'react';
import {apiRequest} from './api';
import {establishSession,refreshSession} from './auth-session';
import {navigate} from './navigation';
import {legalAcceptance,LegalLinks} from './legal';
import {institutionStates,noWebsiteDeclaration} from '../../backend/src/institution-registration';
import {institutionRequestSchema} from '../../backend/src/services/institution-registration-validation';
import {passwordError,passwordRequirements} from '../../backend/src/password-policy';
import './institution-request.css';

type Field=[string,string,string,number,boolean];
const institutionFields:Field[]=[['name','Razão social','text',180,true],['tradeName','Nome fantasia','text',180,true],['registrationNumber','CNPJ','text',25,true],['contactEmail','E-mail institucional','email',254,true],['phone','Telefone institucional com DDD','tel',25,true],['postalCode','CEP','text',9,true],['street','Logradouro','text',180,true],['number','Número ou S/N','text',20,true],['addressComplement','Complemento','text',120,false],['district','Bairro','text',120,true],['city','Cidade','text',120,true],['website','Site institucional','url',500,false]];
const responsibleFields:Field[]=[['responsibleName','Nome completo','text',120,true],['representativePosition','Cargo ou função','text',120,true],['representativePhone','Telefone profissional com DDD','tel',25,true]];
const fieldLabels:Record<string,string>={...Object.fromEntries([...institutionFields,...responsibleFields].map(([key,label])=>[key,label])),institutionType:'Tipo de instituição',state:'UF',representationEvidence:'Comprovação de representação',representationDeclaration:'Declaração de responsabilidade',noWebsite:'Site ou declaração de inexistência'};
const institutionTypeLabels:Record<string,string>={ENSINO_SUPERIOR:'Ensino superior',CURSO_PREPARATORIO:'Curso preparatório',OUTRA_ORGANIZACAO:'Outra organização'};
const responsibleKeys=['responsibleName','representativePosition','representativePhone','representationEvidence','representationDeclaration'];

export function InstitutionRegistrationWizard({account,onCreated,initial,onCancel}:{account?:{email:string;name:string};onCreated?:()=>void;initial?:Record<string,unknown>;onCancel?:()=>void}){
  const [step,setStep]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [values,setValues]=useState<Record<string,string|boolean>>(()=>{
    const data:Record<string,string|boolean>={noWebsite:false,representationDeclaration:false,...Object.fromEntries(Object.entries(initial??{}).filter(([,v])=>typeof v==='string'||typeof v==='boolean')) as Record<string,string|boolean>};
    data.email=account?.email??'';data.emailConfirmation=account?.email??'';
    data.responsibleName=String(initial?.responsibleName??account?.name??'');
    data.noWebsite=!initial?.website&&String(initial?.description??'').includes(noWebsiteDeclaration);
    return data;
  });
  const pending=useRef(false), heading=useRef<HTMLHeadingElement>(null);
  const set=(key:string,value:string|boolean)=>setValues(old=>({...old,[key]:value}));
  const fields=(items:Field[])=>items.map(([name,label,type,max,required])=><label key={name}>{label}{!required&&' (opcional)'}<input name={name} type={type} required={required && !(name==='website'&&values.noWebsite)} disabled={name==='website'&&values.noWebsite===true} maxLength={max} value={String(values[name]??'')} onChange={e=>set(name,e.target.value)} autoComplete={name==='responsibleName'?'name':undefined}/></label>);
  function institutionPayload(){
    const keys=[...institutionFields.map(([key])=>key),...responsibleKeys,'institutionType','state','noWebsite'];
    return Object.fromEntries(keys.map(key=>[key,values[key]??(['noWebsite','representationDeclaration'].includes(key)?false:'')]).filter(([key,value])=>value!==''||!['addressComplement','website'].includes(String(key))));
  }
  function validateStep(){
    const validation=institutionRequestSchema.safeParse(institutionPayload());
    const issue=!validation.success&&validation.error.issues.find(issue=>step===1?!responsibleKeys.includes(String(issue.path[0])):step===2?responsibleKeys.includes(String(issue.path[0])):true);
    if(issue){setError(`${fieldLabels[String(issue.path[0])]??String(issue.path[0])}: ${issue.code==='too_small'||issue.code==='invalid_type'?'preencha este campo corretamente.':issue.message}`);return false;}
    if(step>=2 && String(values.email??'').trim().toLowerCase()!==String(values.emailConfirmation??'').trim().toLowerCase()){setError('Os e-mails do responsável não coincidem.');return false;}
    if(step===3&&!account){const problem=passwordError(String(values.senha??''));if(problem){setError(problem);return false;}if(values.senha!==values.confirmacaoSenha){setError('As senhas não coincidem.');return false;}}
    return true;
  }
  function changeStep(next:number){setError('');setStep(next);requestAnimationFrame(()=>heading.current?.focus());}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(pending.current||!validateStep())return;
    if(step<3){changeStep(step+1);return;}
    if(!values.accepted){setError('Aceite os Termos de Uso e a Política de Privacidade.');return;}
    const parsed=institutionRequestSchema.safeParse(institutionPayload());if(!parsed.success){setError('Revise os dados obrigatórios antes do envio.');return;}
    pending.current=true;setBusy(true);setError('');
    try{
      if(account){
        await apiRequest(initial?.id?`/institutions/requests/${initial.id}`:'/institutions/requests',{method:initial?.id?'PUT':'POST',body:JSON.stringify(parsed.data)});
        await refreshSession(true);onCreated?.();
      }else{
        const result=await apiRequest<{token:string;emailVerification?:{message:string}}>('/auth/institution-register',{method:'POST',body:JSON.stringify({institution:parsed.data,email:values.email,emailConfirmation:values.emailConfirmation,senha:values.senha,confirmacaoSenha:values.confirmacaoSenha,acceptance:legalAcceptance})},{authenticated:false});
        setValues(old=>({...old,senha:'',confirmacaoSenha:''}));
        if(result.emailVerification?.message)sessionStorage.setItem('jurissim_institution_notice',result.emailVerification.message);
        await establishSession(result.token);navigate('/instituicoes',true);
      }
    }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível enviar. Seus dados foram mantidos para revisão.');}
    finally{pending.current=false;setBusy(false);}
  }
  return <form className="panel admin-form institution-request-form institution-wizard" onSubmit={e=>void submit(e)}>
    <h2 ref={heading} tabIndex={-1}>Cadastro institucional completo</h2>
    <ol className="institution-steps" aria-label="Etapas do cadastro">{['Instituição','Responsável','Acesso e envio'].map((text,i)=><li key={text} aria-current={step===i+1?'step':undefined}>{i+1}. {text}</li>)}</ol>
    <p>Etapa {step} de 3. O envio não concede privilégios; o acesso institucional depende da confirmação e da aprovação administrativa.</p>
    <fieldset hidden={step!==1} disabled={busy||step!==1}><legend>Dados da instituição</legend><div className="institution-request-grid">{fields(institutionFields)}
      <label>Tipo de instituição<select name="institutionType" required value={String(values.institutionType??'')} onChange={e=>set('institutionType',e.target.value)}><option value="">Selecione</option><option value="ENSINO_SUPERIOR">Ensino superior</option><option value="CURSO_PREPARATORIO">Curso preparatório</option><option value="OUTRA_ORGANIZACAO">Outra organização</option></select></label>
      <label>UF<select name="state" required value={String(values.state??'')} onChange={e=>set('state',e.target.value)}><option value="">Selecione</option>{institutionStates.map(state=><option key={state}>{state}</option>)}</select></label>
    </div><label className="institution-declaration"><input name="noWebsite" type="checkbox" checked={values.noWebsite===true} onChange={e=>{set('noWebsite',e.target.checked);if(e.target.checked)set('website','');}}/>Declaro que a instituição não possui site institucional.</label></fieldset>
    <fieldset hidden={step!==2} disabled={busy||step!==2}><legend>Dados do responsável</legend><div className="institution-request-grid">{fields(responsibleFields)}
      <label>E-mail do responsável<input name="email" type="email" required maxLength={254} readOnly={!!account} value={String(values.email??'')} onChange={e=>set('email',e.target.value)}/></label>
      <label>Confirmação do e-mail<input name="emailConfirmation" type="email" required maxLength={254} readOnly={!!account} value={String(values.emailConfirmation??'')} onChange={e=>set('emailConfirmation',e.target.value)}/></label>
    </div>{account&&<p>Utilizaremos sua conta autenticada e seu e-mail já confirmado, sem criar outro usuário ou alterar sua senha.</p>}
      <label>Comprovação de representação institucional<textarea name="representationEvidence" required minLength={10} maxLength={1000} value={String(values.representationEvidence??'')} onChange={e=>set('representationEvidence',e.target.value)} placeholder="Informe a referência verificável para comprovar sua autorização. Não envie RG ou CPF."/></label>
      <label className="institution-declaration"><input name="representationDeclaration" type="checkbox" required checked={values.representationDeclaration===true} onChange={e=>set('representationDeclaration',e.target.checked)}/>Declaro ter autorização para representar a instituição e assumo responsabilidade pela veracidade das informações.</label>
    </fieldset>
    <fieldset hidden={step!==3} disabled={busy||step!==3}><legend>Acesso, revisão e envio</legend>
      {!account&&<><label>Senha<input name="senha" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={String(values.senha??'')} onChange={e=>set('senha',e.target.value)}/></label><ul>{passwordRequirements.map(rule=><li key={rule.id}>{rule.label}</li>)}</ul><label>Confirmação da senha<input name="confirmacaoSenha" type="password" autoComplete="new-password" required maxLength={128} value={String(values.confirmacaoSenha??'')} onChange={e=>set('confirmacaoSenha',e.target.value)}/></label></>}
      <details open><summary>Revisar dados da solicitação</summary><dl className="institution-review">{[...institutionFields,...responsibleFields].filter(([key])=>key!=='website').map(([key,label])=><div key={key}><dt>{label}</dt><dd>{String(values[key]??'')||'Não informado'}</dd></div>)}<div><dt>Tipo de instituição / UF</dt><dd>{institutionTypeLabels[String(values.institutionType??'')]??'Não informado'} · {String(values.state??'')}</dd></div><div><dt>E-mail do responsável</dt><dd>{String(values.email??'')}</dd></div><div><dt>Site</dt><dd>{values.noWebsite?'Declarou não possuir site':String(values.website??'')}</dd></div><div><dt>Comprovação</dt><dd>{String(values.representationEvidence??'')}</dd></div></dl></details>
      <label className="institution-declaration"><input name="accepted" type="checkbox" required checked={values.accepted===true} onChange={e=>set('accepted',e.target.checked)}/>Li e aceito os Termos de Uso e a Política de Privacidade.</label><LegalLinks/>
    </fieldset>
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="admin-actions">{step>1&&<button type="button" disabled={busy} onClick={()=>changeStep(step-1)}>Voltar</button>}<button type="submit" disabled={busy}>{busy?'Enviando…':step===3?'Enviar solicitação para análise':'Continuar'}</button>{onCancel&&<button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>}</div>
    {!account&&<p>Já possui conta? Entre com seu e-mail e complete a solicitação na área institucional. Não crie um segundo usuário.</p>}
  </form>;
}
