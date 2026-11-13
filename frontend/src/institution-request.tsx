import {useState} from 'react';
import {InstitutionRegistrationWizard} from './institution-wizard-loader';

export function InstitutionRequest({onCreated,contactEmail,responsibleName,initial}:{onCreated:()=>void;contactEmail:string;responsibleName:string;initial?:Record<string,unknown>}) {
  const [open,setOpen]=useState(false),[submitted,setSubmitted]=useState(false);
  return <>
    <button type="button" className="outline-button" onClick={()=>setOpen(value=>!value)}>{open?'Fechar solicita\u00e7\u00e3o':initial?'Corrigir e reenviar solicita\u00e7\u00e3o':'Solicitar cadastro de institui\u00e7\u00e3o'}</button>
    {submitted&&<p role="status">Solicitação enviada para análise. O envio não concede privilégios.</p>}
    {open&&<InstitutionRegistrationWizard account={{email:contactEmail,name:responsibleName}} initial={initial} onCancel={()=>setOpen(false)} onCreated={()=>{setOpen(false);setSubmitted(true);onCreated();}}/>}
  </>;
}
