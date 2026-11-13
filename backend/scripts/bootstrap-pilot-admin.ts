import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { resolveInventoryCheckDatabaseUrl } from '../src/config/inventory-check-database-url';

async function main(){
 const args=process.argv.slice(2),flags=new Map<string,string>();
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(!['--email','--target-id','--apply'].includes(flag)||flags.has(flag))throw new Error('Argumentos inválidos.');
  if(flag==='--apply'){flags.set(flag,'true');continue;}
  const value=args[++i];if(!value||value.startsWith('--'))throw new Error('Valor ausente.');flags.set(flag,value);
 }
 const email=z.email().parse(flags.get('--email')).trim().toLowerCase();
 const url=resolveInventoryCheckDatabaseUrl();if(!url)throw new Error('Banco não configurado.');
 const target=new URL(url),targetId=createHash('sha256').update([target.hostname,target.port,target.pathname,target.username].join('|')).digest('hex');
 const db=new PrismaClient({datasources:{db:{url}}});
 try{
  const existing=await db.user.findFirst({where:{email:{equals:email,mode:'insensitive'}},select:{id:true,role:true,deletedAt:true}});
  console.log(JSON.stringify({email,targetId,existing:existing?{id:existing.id,role:existing.role,deleted:Boolean(existing.deletedAt)}:null}));
  if(!flags.has('--apply'))return;
  if(flags.get('--target-id')!==targetId)throw new Error('Destino não confirmado.');
  if(existing){if(existing.role!=='ADMIN'||existing.deletedAt)throw new Error('Conta existente não será modificada.');console.log(JSON.stringify({adminId:existing.id,created:false}));return;}
  const directory=resolve(__dirname,'../.local');mkdirSync(directory,{recursive:true});
  const backend=realpathSync(resolve(__dirname,'..')),resolvedDirectory=realpathSync(directory),rel=relative(backend,resolvedDirectory);
  if(isAbsolute(rel)||rel.startsWith('..')||rel!=='.local')throw new Error('Diretório de credenciais inválido.');
  const file=resolve(resolvedDirectory,'pilot-admin.credentials.json');
  let credentials:{email:string;userId:string;password:string};
  if(existsSync(file)){credentials=JSON.parse(readFileSync(file,'utf8'));if(credentials.email!==email||!credentials.userId||!credentials.password)throw new Error('Credenciais locais existentes divergentes.');}
  else{credentials={email,userId:randomUUID(),password:'JurisSim!'+randomBytes(24).toString('base64url')};writeFileSync(file,JSON.stringify(credentials,null,2)+'\n',{flag:'wx',mode:0o600});}
  const senhaHash=await bcrypt.hash(credentials.password,12);
  await db.$transaction(async tx=>{
   await tx.user.create({data:{id:credentials.userId,nome:'Fernando Takagi — Administração',email,role:'ADMIN',senhaHash}});
   await tx.auditLog.create({data:{userId:credentials.userId,action:'USUARIO_CADASTRADO',resourceId:credentials.userId}});
  });
  console.log(JSON.stringify({adminId:credentials.userId,created:true,credentialsFile:file,emailVerification:'PENDENTE',termsAcceptance:'PENDENTE'}));
 }finally{await db.$disconnect();}
}
main().catch(()=>{console.error('Criação administrativa recusada; detalhes e credenciais omitidos.');process.exitCode=1;});
