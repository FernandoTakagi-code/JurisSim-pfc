// Disposable loopback PostgreSQL only. Never loads .env or accepts a connection.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawnSync}=require('node:child_process'),{randomBytes}=require('node:crypto'),assert=require('node:assert/strict');
const bin='C:/Program Files/PostgreSQL/17/bin';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'jurissim-invitation-migration-'));
const data=path.join(root,'data'),operator='fixture_'+randomBytes(5).toString('hex'),password=randomBytes(24).toString('hex');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','APPDATA','LOCALAPPDATA'].includes(k.toUpperCase())));
let started=false;
function run(name,args,input){
  const result=spawnSync(path.join(bin,name+'.exe'),args,{env,input,encoding:'utf8',windowsHide:true,timeout:60000,stdio:['pipe','pipe','pipe']});
  if(result.status!==0){fs.writeFileSync(path.join(root,name+'-error.log'),result.stderr??'');throw new Error('Isolated '+name+' failed; diagnostics: '+root);}
  return result.stdout.trim();
}
const sql=text=>run('psql',['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-f','-'],text);
(async()=>{
  assert.equal(process.argv.length,2);
  const pw=path.join(root,'password.tmp');fs.writeFileSync(pw,password+'\n',{flag:'wx'});
  try{run('initdb',['-D',data,'-U',operator,'--pwfile='+pw,'--auth-local=scram-sha-256','--auth-host=scram-sha-256','--encoding=UTF8','--no-locale']);}finally{fs.unlinkSync(pw);}
  const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
  Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:operator,PGPASSWORD:password,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5'});
  run('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o','-h 127.0.0.1 -p '+port,'-w','-t','30','start']);started=true;
  sql('CREATE TABLE "User" (id TEXT PRIMARY KEY); CREATE TABLE "Turma" (id TEXT PRIMARY KEY); INSERT INTO "User" VALUES (\'historical-user\'); INSERT INTO "Turma" VALUES (\'historical-class\');');
  sql(fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261104000100_institutions_administration/migration.sql'),'utf8'));
  sql(`INSERT INTO "Institution" (id,name,"responsibleName","ownerId",email,phone,description,"updatedAt") VALUES ('institution','Fixture','Fixture','historical-user','fixture@example.invalid','11999999999','Fixture institution',now());
  INSERT INTO "TeacherInvitation" (id,"institutionId",email,"tokenHash","expiresAt",status) VALUES ('historical-invite','institution','teacher@example.invalid','historical-hash',now()+interval '1 day','PENDING');`);
  const before=sql(`SELECT row_to_json(t) FROM "TeacherInvitation" t ORDER BY id;`);
  sql(fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261105000100_teacher_invitation_onboarding/migration.sql'),'utf8'));
  assert.deepEqual(JSON.parse(sql(`SELECT row_to_json(t)::jsonb - 'invitedName' FROM "TeacherInvitation" t ORDER BY id;`)),JSON.parse(before));
  sql(`UPDATE "TeacherInvitation" SET status='DECLINED' WHERE id='historical-invite';
    INSERT INTO "TeacherInvitationClass" VALUES ('historical-invite','historical-class');
    INSERT INTO "InvitationOnboarding" (id,"invitationId","userId","proofHash","initialPasswordHash","expiresAt") VALUES ('setup','historical-invite','historical-user','proof-hash','fixture-hash',now()+interval '30 minutes');`);
  assert.equal(sql(`SELECT count(*) FROM "User" WHERE id='historical-user';`),'1');
  assert.equal(sql(`SELECT count(*) FROM "Turma" WHERE id='historical-class';`),'1');
  assert.equal(sql(`SELECT count(*) FROM pg_class WHERE relname IN ('InvitationOnboarding','TeacherInvitationClass') AND relrowsecurity;`),'2');
  assert.equal(sql(`SELECT count(*) FROM pg_constraint WHERE conrelid IN ('"InvitationOnboarding"'::regclass,'"TeacherInvitationClass"'::regclass) AND contype='f';`),'4');
  const {PrismaClient}=require('@prisma/client');
  const client=new PrismaClient({datasourceUrl:`postgresql://${operator}:${password}@127.0.0.1:${port}/postgres?schema=public`});
  try{
    assert.equal(await client.invitationOnboarding.count(),1);
    assert.equal(await client.teacherInvitationClass.count(),1);
  }finally{await client.$disconnect();}
  const dump=path.join(root,'fixture.dump');run('pg_dump',['-Fc','-d','postgres','-f',dump]);run('createdb',['restored']);run('pg_restore',['--exit-on-error','-d','restored',dump]);
  assert.equal(run('psql',['-X','-w','-A','-t','-d','restored','-c','SELECT count(*) FROM "InvitationOnboarding";']),'1');
  console.log('PASS: administrative baseline + onboarding migration; historical rows, DECLINED, assignments, 4 FKs, RLS and dump/restore verified in disposable PostgreSQL.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>{if(started){try{run('pg_ctl',['-D',data,'-m','fast','-w','-t','30','stop']);console.log('Isolated cluster stopped.');}catch(error){console.error(error.message);process.exitCode=1;}}});
