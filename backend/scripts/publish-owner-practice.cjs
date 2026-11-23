// Ferramenta explícita para operadores, fixada por manifesto. Sem endpoint HTTP ou interface pública.
// O padrão é uma simulação (dry run); --apply é obrigatório para a publicação autorizada pelo usuário.
const fs=require('node:fs'),path=require('node:path');
const {PrismaClient}=require('@prisma/client');
const dotenv=require('dotenv');
const backend=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(backend,'../docs/liberacao-administrativa-candidatas-2026-11-16.json'),'utf8'));
const expectedSelection='292cad34a94306ef99a2ecf581b4645eb90fd881ff969ad922a09fb07a5a9526';
if(manifest.candidateCount!==29||manifest.selectionSha256!==expectedSelection)throw Error('Selection requires new authorization');
const args=process.argv.slice(2);
const mode=args[0],allowed=mode==='--apply'?['--actor-email','--authorization-ref']:['--actor-email','--reason'];
const offset=mode==='--revoke-batch'?2:1,values={};
if(args.length && !['--apply','--revoke-batch'].includes(mode))throw Error('Unsupported arguments');
if(mode==='--revoke-batch'&&!/^[a-f0-9]{64}$/.test(args[1]||''))throw Error('Invalid batch');
for(let i=offset;i<args.length;i+=2){if(!allowed.includes(args[i])||!args[i+1]||values[args[i]])throw Error('Unsupported arguments');values[args[i]]=args[i+1];}
const email=values['--actor-email'],evidence=values[mode==='--apply'?'--authorization-ref':'--reason'];
if(mode&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')||!evidence||evidence.trim().length<8))throw Error('Explicit actor email and authorization reference/reversal reason are required');
let db;
async function main(){try{
  if(!args.length){console.log(JSON.stringify({dryRun:true,count:29,selection:expectedSelection,previouslyApplied:manifest.status.startsWith('APPLIED'),note:'No connection or write. Apply requires --actor-email and --authorization-ref; reversal requires --actor-email and --reason.'}));return;}
  const cfg=dotenv.parse(fs.readFileSync(path.join(backend,'.env')));
  const url=new URL(cfg.DIRECT_URL||cfg.DATABASE_URL);url.searchParams.set('connection_limit','1');
  if(!url.hostname.endsWith('.supabase.com')&&!url.hostname.endsWith('.supabase.co'))throw Error('Unexpected configured target');
  db=new PrismaClient({datasourceUrl:url.toString()});
  const {publishOwnerPractice,revokeOwnerPractice}=require('../dist/services/questions/owner-practice-publication');
  const result=args[0]==='--apply'
    ? await publishOwnerPractice(db,manifest,email,evidence)
    : await revokeOwnerPractice(db,args[1],email,evidence);
  fs.mkdirSync(path.join(backend,'.local'),{recursive:true});
  fs.writeFileSync(path.join(backend,'.local',args[0]==='--apply'?'owner-publication-result.json':'owner-revocation-result.json'),JSON.stringify({...result,completedAt:new Date().toISOString()},null,2));
  console.log(JSON.stringify(result));
}finally{await db?.$disconnect();}}
main().catch(error=>{console.error(JSON.stringify({failed:true,code:error.code||error.name,status:error.statusCode}));process.exitCode=1;});
