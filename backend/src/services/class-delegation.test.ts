import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const db=vi.hoisted(()=>{
  const model=()=>Object.fromEntries(['findFirst','findMany','findUnique','create','update','count'].map(k=>[k,vi.fn()]));
  return {turma:model(),avaliacao:model(),institutionalMembership:model(),institutionalClass:model(),administrativeEvent:model(),$queryRaw:vi.fn(),$transaction:vi.fn()};
});
vi.mock('../lib/prisma',()=>({prisma:db}));
import {ClassExamService} from './class-exam-service';
const service=new ClassExamService();
const professor={userId:'teacher-1',role:'PROFESSOR',institutionId:'institution-a',allowedClassIds:['class-a']};
const replacement={...professor,userId:'teacher-2'};
const owner={userId:'owner',role:'ALUNO',institutionAdmin:true,institutionId:'institution-a',allowedClassIds:['class-a']};
let classes:any[],exams:any[];
const preserved={questions:[{id:'question-a',authorId:'teacher-1',classId:'class-a'}],attempts:[{id:'attempt-a',score:80}],students:['student-a']};
function matches(row:any,where:any):boolean{
  return Object.entries(where).every(([key,value]:[string,any])=>{
    if(value===undefined)return true;
    if(key==='AND')return (Array.isArray(value)?value:[value]).every(v=>matches(row,v));
    if(key==='some')return Array.isArray(row)&&row.some(v=>matches(v,value));
    if(key==='every')return Array.isArray(row)&&row.every(v=>matches(v,value));
    if(key==='in')return value.includes(row);
    if(value!==null&&typeof value==='object')return row?.[key]!=null&&matches(row[key],value);
    return row?.[key]===value;
  });
}
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('INSTITUTIONS_ENABLED','true');
  classes=[{id:'class-a',nome:'Turma A',archivedAt:null,professores:[{id:'teacher-1'}],institutionalClass:{institutionId:'institution-a'},_count:{alunos:1}}];
  exams=[{id:'exam-a',autorId:'teacher-1',publishedAt:null,turmas:classes,_count:{tentativas:0},questoes:[]}];
  db.$transaction.mockImplementation(work=>work(db));
  db.turma.findFirst.mockImplementation(({where})=>classes.find(c=>matches(c,where))??null);
  db.turma.findMany.mockImplementation(async({where})=>classes.filter(c=>matches(c,where)));
  db.turma.update.mockImplementation(({where,data})=>{
    expect(Object.keys(data)).toEqual(['professores']);
    const turma=classes.find(c=>c.id===where.id)!;
    if(data.professores?.disconnect)turma.professores=turma.professores.filter((t:any)=>t.id!==data.professores.disconnect.id);
    if(data.professores?.connect&&!turma.professores.some((t:any)=>t.id===data.professores.connect.id))turma.professores.push(data.professores.connect);
    return turma;
  });
  db.avaliacao.findMany.mockImplementation(({where})=>exams.filter(e=>matches(e,where)));
  db.avaliacao.findFirst.mockImplementation(({where})=>exams.find(e=>matches(e,where))??null);
  db.institutionalMembership.findFirst.mockImplementation(({where})=>where.institutionId==='institution-a'?{id:'active-membership'}:null);
  db.turma.create.mockImplementation(({data})=>{const turma={id:'created-class',...data};classes.push(turma);return turma;});
});
afterEach(()=>vi.unstubAllEnvs());
it('professor atribuído vê sua turma e seu simulado; vínculo institucional isolado não basta',async()=>{
  expect((await service.listClasses(professor,1)).items).toHaveLength(1);
  expect((await service.listExams(professor,1)).items).toHaveLength(1);
  expect((await service.listClasses(replacement,1)).items).toHaveLength(0);
  expect((await service.listExams(replacement,1)).items).toHaveLength(0);
});
it('retirada da delegação revoga leitura, edição e publicação apesar de autoria e IDs antigos',async()=>{
  const snapshot=structuredClone(preserved);
  await service.assignTeacher(owner,'class-a','teacher-1',false);
  expect((await service.listClasses(professor,1)).items).toHaveLength(0);
  expect((await service.listExams(professor,1)).items).toHaveLength(0);
  await expect(service.updateClass(professor,'class-a',{nome:'Indevido'})).rejects.toMatchObject({statusCode:404});
  await expect(service.publish(professor,'exam-a')).rejects.toMatchObject({statusCode:404});
  await expect(service.saveExam(professor,{titulo:'Indevido',descricao:'',turmaIds:['class-a'],questaoIds:['question-a'],duracaoSegundos:null},'exam-a')).rejects.toMatchObject({statusCode:404});
  expect(preserved).toEqual(snapshot);expect(exams[0].autorId).toBe('teacher-1');expect(db.avaliacao.update).not.toHaveBeenCalled();
});
it('instituição substitui a delegação sem mudar propriedade, autoria ou histórico',async()=>{
  await service.assignTeacher(owner,'class-a','teacher-1',false);
  await service.assignTeacher(owner,'class-a','teacher-2',true);
  expect((await service.listClasses(replacement,1)).items).toHaveLength(1);
  expect((await service.listClasses(professor,1)).items).toHaveLength(0);
  expect(classes[0].institutionalClass.institutionId).toBe('institution-a');
  expect(exams).toHaveLength(1);expect(preserved.questions[0].authorId).toBe('teacher-1');
});
it('professor cria turma institucional com gestão inicial delegada e propriedade institucional',async()=>{
  await service.createClass(professor,'Nova turma');
  expect(db.turma.create.mock.calls[0][0].data.professores).toEqual({connect:{id:'teacher-1'}});
  expect(db.institutionalClass.create).toHaveBeenCalledWith({data:{classId:'created-class',institutionId:'institution-a'}});
});
it('gestão institucional de simulados é idêntica para responsável ALUNO ou PROFESSOR',async()=>{
  expect((await service.listExams(owner,1)).items).toHaveLength(1);
  expect((await service.listExams({...owner,role:'PROFESSOR'},1)).items).toHaveLength(1);
  expect((await service.listExams({...owner,institutionId:'institution-b'},1)).items).toHaveLength(0);
});
it('simulado com destino fora das turmas autorizadas não concede acesso parcial à gestão',async()=>{
  exams[0].turmas=[classes[0],{id:'class-b',professores:[{id:'teacher-2'}],institutionalClass:{institutionId:'institution-b'}}];
  expect((await service.listExams(professor,1)).items).toHaveLength(0);
  expect((await service.listExams(owner,1)).items).toHaveLength(0);
  await expect(service.publish(professor,'exam-a')).rejects.toMatchObject({statusCode:404});
});
it('ADMIN não lê nem publica simulados, mesmo forjando contexto institucional no serviço',async()=>{
  const global={...owner,role:'ADMIN'};
  await expect(service.listExams(global,1)).rejects.toMatchObject({statusCode:403});
  await expect(service.publish(global,'exam-a')).rejects.toMatchObject({statusCode:403});
});
it('professor não solicita matrícula em turma e não designa outros professores',async()=>{
  await expect(service.join(professor,'some-code')).rejects.toMatchObject({statusCode:403});
  await expect(service.assignTeacher(professor,'class-a','teacher-2',true)).rejects.toMatchObject({statusCode:403});
});
it('responsável mantém matrícula e tentativas pessoais fora do contexto administrativo',async()=>{
  await expect(service.join(owner,'some-code')).rejects.toMatchObject({statusCode:403});
  await expect(service.start(owner,'exam-a')).rejects.toMatchObject({statusCode:403});
  expect(db.avaliacao.findFirst).not.toHaveBeenCalled();
});
