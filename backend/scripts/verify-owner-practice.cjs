// Real database verification is read-only. No session/token is manufactured.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),dotenv=require('dotenv');
const backend=path.resolve(__dirname,'..'),cfg=dotenv.parse(fs.readFileSync(path.join(backend,'.env')));
Object.assign(process.env,cfg,{QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED:'true',QUESTION_PRACTICE_PILOT_ENABLED:'false',QUESTION_PRACTICE_PILOT_BATCH_ID:'',QUESTION_PRACTICE_PILOT_BATCH_IDS:''});
const url=new URL(cfg.DIRECT_URL||cfg.DATABASE_URL);url.searchParams.set('connection_limit','1');
const db=new PrismaClient({datasourceUrl:url.toString()});
const {PrismaQuestionPracticeRepository}=require('../dist/repositories/prisma-question-practice-repository');
const {QuestionPracticeService}=require('../dist/services/question-practice-service');
const manifest=JSON.parse(fs.readFileSync(path.join(backend,'../docs/liberacao-administrativa-candidatas-2026-11-16.json'),'utf8'));
const args=process.argv.slice(2);
if(args.length && !(args.length===2&&args[0]==='--actor-email'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args[1])))throw Error('Use only optional --actor-email');
const actorEmail=args[1];
const optionalLocal=(name)=>{const file=path.join(backend,'.local',name);return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;};
const sha=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main(){try{
  await db.$executeRaw`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`;
  const ro=await db.$queryRaw`SHOW transaction_read_only`;if(ro[0].transaction_read_only!=='on')throw Error('Read only not confirmed');
  const repository=new PrismaQuestionPracticeRepository(db),service=new QuestionPracticeService(repository);
  const users=await db.user.findMany({where:{role:'ALUNO',registrationIntent:null,deletedAt:null,emailVerifiedAt:{not:null}},select:{id:true}});
  const disciplines=[...new Set(manifest.questions.map(q=>q.discipline))];
  const availability=[];
  for(const discipline of disciplines){
    const pool=await repository.listEligibleQuestions(discipline);
    const perUser=[];for(const user of users){const a=await service.availability(user.id,discipline,null);perUser.push({available:a.availableCount,quantities:a.availableQuantities,active:Boolean(a.activeAttempt)});}
    availability.push({discipline,eligible:pool.length,topics:[...new Set(pool.map(q=>q.topic))].map(topic=>({topic,count:pool.filter(q=>q.topic===topic).length})),
      studentAccounts:users.length,unseenMinimum:perUser.length?Math.min(...perUser.map(u=>u.available)):null,unseenMaximum:perUser.length?Math.max(...perUser.map(u=>u.available)):null,
      accountsWithFive:perUser.filter(u=>u.quantities.includes(5)).length});
  }
  const before=optionalLocal('owner-release-before.json');
  const publication=manifest.publication??optionalLocal('owner-publication-result.json');
  if(!publication?.batchId)throw Error('Publication batch not identified');
  const events=await db.administrativeEvent.findMany({where:{event:'OWNER_AUTHORIZED_PRACTICE_RELEASE',resourceId:{in:manifest.questions.map(q=>q.id)},result:{contains:publication.batchId},...(actorEmail?{actor:{email:actorEmail}}:{})},select:{resourceId:true,result:true}});
  if(events.length!==manifest.candidateCount||new Set(events.map(e=>e.resourceId)).size!==manifest.candidateCount)throw Error('Publication audit does not match manifest');
  const questions=await db.questao.findMany({orderBy:{id:'asc'},include:{alternativas:{orderBy:{id:'asc'}}}});
  const evaluations=await db.avaliacao.findMany({orderBy:{id:'asc'},include:{questoes:{orderBy:{id:'asc'}}}});
  const report={verifiedAt:new Date().toISOString(),readOnly:true,audit:{events:events.length,distinctQuestions:new Set(events.map(e=>e.resourceId)).size,actorMatches:actorEmail?true:null,batchId:publication.batchId},availability,
    preserved:{beforeSnapshotAvailable:!!before,questionsAndAlternatives:before?sha(questions)===before.questionDigest:null,evaluationsAndLinks:before?sha(evaluations)===before.evaluationsDigest:null,
      attemptsBefore:before?.attempts??null,attemptsAfter:await db.simulado.count(),answersBefore:before?.answers??null,answersAfter:await db.resposta.count(),practiceBefore:before?.practiceSessions??null,practiceAfter:await db.sessaoPratica.count()},
    evidence:'Actual practice service and repository reads against Supabase; not a browser login. No attempts or answers created.'};
  fs.writeFileSync(path.join(backend,'.local/owner-release-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await db.$disconnect();}}
main().catch(error=>{console.error(JSON.stringify({failed:true,code:error.code||error.name}));process.exitCode=1;});
