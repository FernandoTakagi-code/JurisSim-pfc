import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { resolveInventoryCheckDatabaseUrl } from '../src/config/inventory-check-database-url';
import { importAuthorialPilot, preparePilotImport } from '../src/services/authorial-pilot-import';

async function main(){
 const args=process.argv.slice(2);
 const allowed=new Set(['--input','--operator-id','--target-id','--apply']);
 const flags=new Map<string,string>();
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(!allowed.has(flag)||flags.has(flag))throw new Error('Argumento inválido.');
  if(flag==='--apply'){flags.set(flag,'true');continue;}
  const value=args[++i];if(!value||value.startsWith('--'))throw new Error('Argumento sem valor.');flags.set(flag,value);
 }
 const input=JSON.parse(readFileSync(resolve(flags.get('--input')||'scripts/drafts/authorial-diagnostic-30.draft.json'),'utf8'));
 const plan=preparePilotImport(input);
 console.log(JSON.stringify({questions:30,mode:'AUTORAL_30',status:'PILOTO_EM_REVISAO',legalApprovals:0,pedagogicalApprovals:0,releaseApprovals:0,hash:plan.hash}));
 const url=resolveInventoryCheckDatabaseUrl();if(!url)throw new Error('Destino não configurado.');
 const target=new URL(url);if(!['postgresql:','postgres:'].includes(target.protocol))throw new Error('Protocolo inválido.');
 const targetId=createHash('sha256').update([target.hostname,target.port,target.pathname,target.username].join('|')).digest('hex');
 console.log(JSON.stringify({targetId}));
 if(!flags.has('--apply')){console.log('Prévia local, sem conexão ou escrita.');return;}
 if(flags.get('--target-id')!==targetId||!flags.get('--operator-id'))throw new Error('Identidade de destino ou responsável ausente.');
 const db=new PrismaClient({datasources:{db:{url}}});
 try{console.log(JSON.stringify(await importAuthorialPilot(db,input,flags.get('--operator-id')!)));}
 finally{await db.$disconnect();}
}
main().catch(()=>{console.error('Importação piloto recusada; detalhes de conexão omitidos.');process.exitCode=1;});
