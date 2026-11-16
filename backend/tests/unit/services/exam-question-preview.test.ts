import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ count: vi.fn(), question: vi.fn(), transaction: vi.fn() }));
vi.mock("../../../src/lib/prisma", () => ({prisma:{$transaction:mocks.transaction}}));
vi.mock("../../../src/services/assessments/class-lifecycle", () => ({visibleClasses:vi.fn(async()=>({}))}));
import { ClassExamService } from "../../../src/services/assessments/class-exam-service";
const service = new ClassExamService();
const actor = {userId:'owner',role:'ALUNO',institutionAdmin:true,institutionId:'institution-a'};
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('INSTITUTION_EXAM_MANAGEMENT_ENABLED','true');vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED','false');
  mocks.transaction.mockImplementation(fn=>fn({turma:{count:mocks.count},questao:{findFirst:mocks.question}}));
  mocks.count.mockResolvedValue(1);
  mocks.question.mockResolvedValue({id:'question',enunciado:'Exemplo',publica:true,autorId:null,turmaId:null,alternativas:[{id:'a',texto:'A',correta:true},{id:'b',texto:'B',correta:false}]});
});
afterEach(()=>vi.unstubAllEnvs());
it('consulta alternativas apenas após validar todas as turmas da instituição',async()=>{
  const result=await service.eligibleQuestionPreview(actor,['class-a'],'question');
  expect(result.alternativas).toHaveLength(2);
  expect(mocks.count).toHaveBeenCalledWith({where:{id:{in:['class-a']},archivedAt:null,institutionalClass:{institutionId:'institution-a',institution:{status:'ACTIVE'}}}});
  expect(mocks.question.mock.calls[0][0].where.id).toBe('question');
});
it('recusa turma não autorizada antes de ler a questão',async()=>{
  mocks.count.mockResolvedValue(0);
  await expect(service.eligibleQuestionPreview(actor,['foreign-class'],'question')).rejects.toMatchObject({statusCode:403});
  expect(mocks.question).not.toHaveBeenCalled();
});
it('não revela questão privada de outra turma ou questão inválida',async()=>{
  mocks.question.mockResolvedValue({id:'question',enunciado:'Privada',publica:false,autorId:'another',turmaId:'foreign-class',alternativas:[{correta:true},{correta:false}]});
  await expect(service.eligibleQuestionPreview(actor,['class-a'],'question')).rejects.toMatchObject({statusCode:404});
  mocks.question.mockResolvedValue(null);
  await expect(service.eligibleQuestionPreview(actor,['class-a'],'missing')).rejects.toMatchObject({statusCode:404});
});
it('recusa aluno, ADMIN global e capacidade desativada sem consultar dados',async()=>{
  for(const role of ['ALUNO','ADMIN'])await expect(service.eligibleQuestionPreview({userId:'user',role},['class-a'],'question')).rejects.toMatchObject({statusCode:403});
  vi.stubEnv('INSTITUTION_EXAM_MANAGEMENT_ENABLED','false');
  await expect(service.eligibleQuestionPreview(actor,['class-a'],'question')).rejects.toMatchObject({statusCode:503});
  expect(mocks.transaction).not.toHaveBeenCalled();
});
