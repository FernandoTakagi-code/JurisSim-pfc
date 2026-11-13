import {lazy,Suspense} from 'react';
const Wizard=lazy(()=>import('./institution-registration-wizard').then(module=>({default:module.InstitutionRegistrationWizard})));
type Props=Parameters<typeof import('./institution-registration-wizard').InstitutionRegistrationWizard>[0];
export function InstitutionRegistrationWizard(props:Props){return <Suspense fallback={<p role="status">Preparando cadastro institucional…</p>}><Wizard {...props}/></Suspense>;}
