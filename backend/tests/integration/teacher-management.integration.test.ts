import type {Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {iniciarServidor,encerrar,limparBanco,criarUsuario,tokenPara,prisma,questaoValida,requisicao} from './helpers';
import {ClassExamService} from "../../src/services/class-exam-service";
let server:Server,baseUrl:string;
beforeAll(async()=>{({server,baseUrl}=await iniciarServidor());});
beforeEach(async()=>{process.env.INSTITUTIONS_ENABLED='false';await limparBanco();});
afterAll(async()=>{await encerrar(server);});
async function fixture(){
  const teacher=await criarUsuario('PROFESSOR'),other=await criarUsuario('PROFESSOR'),student=await criarUsuario('ALUNO');
  await prisma.user.update({where:{id:student.id},data:{nome:'Aluno pesquisável'}});
  const request=(method:string,path:string,body?:object,actor=teacher)=>requisicao(baseUrl,method,path,{token:tokenPara(actor),corpo:body});
  const created=await request('POST','/turmas',{nome:'Gestão isolada'});expect(created.status).toBe(201);
  const turma=created.corpo.turma as {id:string;nome:string};
  return {teacher,other,student,request,turma,inviteCode:created.corpo.inviteCode};
}
it('searches by name and email only after authorizing the selected class, with bounded results',async()=>{
  const f=await fixture();
  for(const q of ['pesquisável',f.student.email]){
    const response=await f.request('GET',`/turmas/${f.turma.id}/student-search?q=${encodeURIComponent(q)}`);
    expect(response.status).toBe(200);expect(response.corpo.items[0]).toMatchObject({id:f.student.id,enrolled:false});
    expect(JSON.stringify(response.corpo)).not.toMatch(/senhaHash|sessionVersion|tokenHash/);
  }
  expect((await f.request('GET',`/turmas/${f.turma.id}/student-search?q=Aluno`,undefined,f.other)).status).toBe(404);
  expect((await f.request('GET',`/turmas/${f.turma.id}/student-search?q=Aluno`,undefined,f.student)).status).toBe(403);
  expect((await f.request('GET',`/turmas/${f.turma.id}/student-search?q=Al`)).status).toBe(422);
});
it('adds, prevents duplicate enrollment, lists class name, removes and preserves accounts',async()=>{
  const f=await fixture(),path=`/turmas/${f.turma.id}/students`;
  expect((await f.request('POST',path,{email:f.student.email})).status).toBe(200);
  expect((await f.request('POST',path,{email:f.student.email.toUpperCase()})).status).toBe(409);
  const roster=await f.request('GET',path);
  expect(roster.corpo.class.nome).toBe(f.turma.nome);expect(roster.corpo.items[0].turmasComoAluno[0].nome).toBe(f.turma.nome);
  expect((await f.request('DELETE',`${path}/${f.student.id}`)).status).toBe(200);
  expect((await f.request('GET',path)).corpo.items).toEqual([]);
  expect(await prisma.user.count({where:{id:f.student.id,deletedAt:null}})).toBe(1);
  expect(await prisma.classJoinRequest.findUnique({where:{classId_studentId:{classId:f.turma.id,studentId:f.student.id}}})).toMatchObject({status:'REMOVED'});
  expect((await f.request('POST',path,{email:f.student.email})).status).toBe(200);
});
it('serializes concurrent duplicate enrollments',async()=>{
  const f=await fixture();const path=`/turmas/${f.turma.id}/students`;
  const results=await Promise.all([f.request('POST',path,{email:f.student.email}),f.request('POST',path,{email:f.student.email})]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  expect(await prisma.turma.count({where:{id:f.turma.id,alunos:{some:{id:f.student.id}}}})).toBe(1);
});
it('blocks another teacher and student on enrollment, editing, questions, archiving and deletion',async()=>{
  const f=await fixture();
  for(const actor of [f.other,f.student]){
    for(const [method,path,body]of [
      ['POST',`/turmas/${f.turma.id}/students`,{email:f.student.email}],
      ['DELETE',`/turmas/${f.turma.id}/students/${f.student.id}`,undefined],
      ['PATCH',`/turmas/${f.turma.id}`,{nome:'Indevido'}],
      ['PATCH',`/turmas/${f.turma.id}`,{archived:true}],
      ['POST','/questoes',questaoValida({turmaId:f.turma.id,publica:false})],
      ['DELETE',`/turmas/${f.turma.id}`,{confirmationName:f.turma.nome}],
    ]as const)expect([403,404]).toContain((await f.request(method,path,body,actor)).status);
  }
  expect(await prisma.turma.findUnique({where:{id:f.turma.id}})).toMatchObject({nome:f.turma.nome,archivedAt:null});
});
it('archives for consultation, blocks new enrollments/questions, and keeps archive distinct from deletion',async()=>{
  const f=await fixture();expect((await f.request('PATCH',`/turmas/${f.turma.id}`,{archived:true})).status).toBe(200);
  expect((await f.request('GET','/turmas')).corpo.items).toHaveLength(1);
  expect((await f.request('GET',`/turmas/${f.turma.id}/students`)).status).toBe(200);
  expect((await f.request('POST',`/turmas/${f.turma.id}/students`,{email:f.student.email})).status).toBe(404);
  expect((await f.request('POST','/questoes',questaoValida({publica:false,turmaId:f.turma.id}))).status).toBe(409);
  expect(await prisma.classLifecycle.findUnique({where:{classId:f.turma.id}})).toMatchObject({deletedAt:null});
});
it('requires explicit exact confirmation and physically deletes only a proven empty class',async()=>{
  const f=await fixture();
  expect((await f.request('DELETE',`/turmas/${f.turma.id}`,{confirmationName:'Outra turma'})).status).toBe(422);
  expect((await f.request('DELETE',`/turmas/${f.turma.id}`,{})).status).toBe(422);
  const before=await prisma.user.count();
  const response=await f.request('DELETE',`/turmas/${f.turma.id}`,{confirmationName:f.turma.nome});
  expect(response.status).toBe(200);expect(response.corpo.mode).toBe('HARD');
  expect(await prisma.turma.count({where:{id:f.turma.id}})).toBe(0);expect(await prisma.user.count()).toBe(before);
  expect((await f.request('GET','/turmas')).corpo.items).toEqual([]);
  expect(await prisma.administrativeEvent.count({where:{event:'CLASS_DELETED',resourceId:f.turma.id}})).toBe(1);
});
it('does not infer creator ownership from a current delegation or an unproven legacy record',async()=>{
  const f=await fixture();
  await prisma.turma.update({where:{id:f.turma.id},data:{professores:{connect:{id:f.other.id}}}});
  expect((await f.request('DELETE',`/turmas/${f.turma.id}`,{confirmationName:f.turma.nome},f.other)).status).toBe(403);
  const legacy=await prisma.turma.create({data:{nome:'Legado sem autoria',codigoConvite:randomUUID(),professores:{connect:{id:f.teacher.id}}}});
  expect((await f.request('DELETE',`/turmas/${legacy.id}`,{confirmationName:legacy.nome})).status).toBe(403);
});
it('soft deletes dependent classes and blocks new access while preserving questions, answers and final results',async()=>{
  const f=await fixture();
  await f.request('POST',`/turmas/${f.turma.id}/students`,{email:f.student.email});
  const created=await f.request('POST','/questoes',questaoValida({publica:false,turmaId:f.turma.id}));expect(created.status).toBe(201);
  const service=new ClassExamService(),actor={userId:f.teacher.id,role:'PROFESSOR'},student={userId:f.student.id,role:'ALUNO'};
  const exam=await service.saveExam(actor,{titulo:'Histórico de teste',descricao:'',duracaoSegundos:null,turmaIds:[f.turma.id],questaoIds:[created.corpo.id]});
  await service.publish(actor,exam.id);const attempt=await service.start(student,exam.id);
  await service.answer(student,attempt.id,created.corpo.id,created.corpo.alternativas.find((a:{correta:boolean})=>a.correta).id);
  const result=await service.finalize(student,attempt.id);expect(result.overallPercentage).toBe(100);
  const snapshot=await prisma.simulado.findUnique({where:{id:attempt.id},include:{respostas:true,desempenhosDiagnostico:true,questoes:true}});
  const response=await f.request('DELETE',`/turmas/${f.turma.id}`,{confirmationName:f.turma.nome});
  expect(response.status).toBe(200);expect(response.corpo.mode).toBe('SOFT');
  expect(await prisma.turma.count({where:{id:f.turma.id}})).toBe(1);
  expect((await f.request('GET','/turmas')).corpo.items).toEqual([]);
  expect((await f.request('GET','/turmas',undefined,f.student)).corpo.items).toEqual([]);
  expect((await f.request('GET',`/turmas/${f.turma.id}`,undefined,f.student)).status).toBe(404);
  expect((await f.request('POST',`/turmas/${f.turma.id}/students`,{email:f.student.email})).status).toBe(404);
  expect((await f.request('GET',`/questoes/turmas/${f.turma.id}/contexto`)).status).toBe(403);
  expect((await f.request('POST','/questoes',questaoValida({publica:false,turmaId:f.turma.id}))).status).toBe(403);
  await expect(service.start(student,exam.id)).rejects.toMatchObject({statusCode:404});
  expect(await prisma.simulado.findUnique({where:{id:attempt.id},include:{respostas:true,desempenhosDiagnostico:true,questoes:true}})).toEqual(snapshot);
  expect(await prisma.questao.count({where:{id:created.corpo.id}})).toBe(1);
  expect(await prisma.user.count()).toBe(3);
  expect(await prisma.turma.count({where:{id:f.turma.id,alunos:{some:{id:f.student.id}}}})).toBe(1);
});
it('creates and edits a simulation draft, enforces its question count, publishes, and persists student results',async()=>{
  const f=await fixture();
  await f.request('POST',`/turmas/${f.turma.id}/students`,{email:f.student.email});
  const firstResponse=await f.request('POST','/questoes',questaoValida({turmaId:f.turma.id,publica:false}));
  const secondResponse=await f.request('POST','/questoes',questaoValida({turmaId:f.turma.id,publica:false,enunciado:'Questão distinta para validar a edição do simulado.'}));
  expect(firstResponse.status).toBe(201);expect(secondResponse.status).toBe(201);
  const first=firstResponse.corpo,second=secondResponse.corpo;
  const service=new ClassExamService(),teacher={userId:f.teacher.id,role:'PROFESSOR'},student={userId:f.student.id,role:'ALUNO'};
  const draft=await service.saveExam(teacher,{titulo:'Simulado editável',descricao:'Teste persistido',duracaoSegundos:1800,turmaIds:[f.turma.id],questaoIds:[first.id],expectedQuestions:2});
  expect(draft.publishedAt).toBeNull();
  expect(await prisma.classExamSettings.findUnique({where:{evaluationId:draft.id}})).toMatchObject({expectedQuestions:2});
  await expect(service.publish(teacher,draft.id)).rejects.toMatchObject({statusCode:409});
  await service.saveExam(teacher,{titulo:'Simulado editado',descricao:'Rascunho corrigido',duracaoSegundos:2400,turmaIds:[f.turma.id],questaoIds:[first.id,second.id],expectedQuestions:2},draft.id);
  const published=await service.publish(teacher,draft.id);
  expect(published.publishedAt).toBeInstanceOf(Date);
  expect(await prisma.avaliacaoQuestao.count({where:{avaliacaoId:draft.id}})).toBe(2);
  await expect(service.saveExam(teacher,{titulo:'Mutação publicada',descricao:'',duracaoSegundos:null,turmaIds:[f.turma.id],questaoIds:[first.id,second.id],expectedQuestions:2},draft.id)).rejects.toMatchObject({statusCode:409});
  const attempt=await service.start(student,draft.id);
  for(const question of [first,second]) await service.answer(student,attempt.id,question.id,question.alternativas.find((option:{correta:boolean})=>option.correta).id);
  const result=await service.finalize(student,attempt.id);
  expect(result.overallPercentage).toBe(100);
  const savedAttempt=await prisma.simulado.findUnique({where:{id:attempt.id},include:{respostas:true}});
  expect(savedAttempt?.finalizadoEm).toBeInstanceOf(Date);
  expect(savedAttempt?.respostas).toHaveLength(2);
  expect(savedAttempt?.respostas.every(answer=>answer.correta)).toBe(true);
  const details=await f.request('GET',`/avaliacoes/${draft.id}/details`);
  expect(details.corpo).toMatchObject({questionCount:2,statistics:{participants:1,attempts:1,completed:1}});
});
