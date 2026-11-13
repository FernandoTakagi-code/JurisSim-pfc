import {beforeEach,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({turma:{count:vi.fn()},questao:{findMany:vi.fn()},$transaction:vi.fn()}));
vi.mock('../lib/prisma',()=>({prisma:db}));
vi.mock('../config/institution-homologation',async original=>({...await original<typeof import('../config/institution-homologation')>(),homologationClassBoundary:()=>undefined,restrictedInstitutionId:()=>undefined}));
import {ClassExamService} from './class-exam-service';
const actor={userId:'teacher',role:'PROFESSOR',institutionId:'institution-a',allowedClassIds:['class-a','class-b']};
const question=(id:string,fields={})=>({id,enunciado:'Enunciado',disciplina:'Civil',assunto:'Tema',nivel:'BASICO',publica:false,turmaId:null,autorId:'teacher',alternativas:[{correta:true},{correta:false}],...fields});
beforeEach(()=>{vi.clearAllMocks();db.$transaction.mockImplementation(work=>work(db));db.turma.count.mockResolvedValue(1);db.questao.findMany.mockResolvedValue([]);});
it('reads the existing bank for assigned classes without exposing answer keys or administrative fields',async()=>{
  db.questao.findMany.mockResolvedValue([question('public',{publica:true,autorId:'other'}),question('own'),question('class',{autorId:'other',turmaId:'class-a'})]);
  const result=await new ClassExamService().eligibleQuestions(actor,['class-a']);
  expect(result.items.map(q=>q.id)).toEqual(['public','own','class']);
  for(const row of result.items){expect(row).not.toHaveProperty('alternativas');expect(row).not.toHaveProperty('autorId');expect(row).not.toHaveProperty('turmaId');expect(row).not.toHaveProperty('fundamentacaoJuridica');}
  expect(db.turma.count).toHaveBeenCalledWith({where:expect.objectContaining({id:{in:['class-a']},professores:{some:{id:'teacher'}},AND:[{id:{in:['class-a','class-b']}}]})});
  expect(db.$transaction.mock.calls[0][1]).toEqual({isolationLevel:'RepeatableRead'});
});
it('refuses an unauthorized class before reading questions',async()=>{
  db.turma.count.mockResolvedValue(0);
  await expect(new ClassExamService().eligibleQuestions(actor,['foreign'])).rejects.toMatchObject({statusCode:403});
  expect(db.questao.findMany).not.toHaveBeenCalled();
});
it.each(['ALUNO','ADMIN'])('denies %s without bank reads',async role=>{
  await expect(new ClassExamService().eligibleQuestions({...actor,role},['class-a'])).rejects.toMatchObject({statusCode:403});expect(db.questao.findMany).not.toHaveBeenCalled();
});
it('filters malformed questions and inaccessible private items even if a persistence double returns them',async()=>{
  db.questao.findMany.mockResolvedValue([question('foreign',{autorId:'other'}),question('other-class',{turmaId:'foreign'}),question('zero-correct',{alternativas:[{correta:false},{correta:false}]}),question('two-correct',{alternativas:[{correta:true},{correta:true}]}),question('one-option',{alternativas:[{correta:true}]})]);
  expect((await new ClassExamService().eligibleQuestions(actor,['class-a'])).items).toEqual([]);
});
it('private class questions cannot be shared across two selected classes',async()=>{
  db.turma.count.mockResolvedValue(2);db.questao.findMany.mockResolvedValue([question('private-class',{turmaId:'class-a'}),question('public',{publica:true})]);
  expect((await new ClassExamService().eligibleQuestions(actor,['class-a','class-b'])).items.map(q=>q.id)).toEqual(['public']);
});
it('no classes selected does not fall back to the whole bank',async()=>{
  await expect(new ClassExamService().eligibleQuestions(actor,[])).rejects.toMatchObject({statusCode:422});expect(db.questao.findMany).not.toHaveBeenCalled();
});
it('pagination never claims the whole bank is empty from a filtered page',async()=>{
  db.questao.findMany.mockResolvedValue(Array.from({length:51},(_,i)=>question(String(i),{alternativas:[{correta:false}]})));
  expect(await new ClassExamService().eligibleQuestions(actor,['class-a'],2)).toEqual({items:[],page:2,hasMore:true});
  expect(db.questao.findMany.mock.calls[0][0]).toMatchObject({skip:50,take:51});
});
it('institutional administrators use their institution boundary, not global ADMIN privileges',async()=>{
  await new ClassExamService().eligibleQuestions({...actor,role:'ALUNO',institutionAdmin:true},['class-a']);
  expect(db.turma.count.mock.calls[0][0].where.institutionalClass).toEqual({institutionId:'institution-a',institution:{status:'ACTIVE'}});
});
