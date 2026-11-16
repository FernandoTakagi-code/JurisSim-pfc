import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { iniciarServidor, encerrar, limparBanco, criarUsuario, tokenPara, prisma, questaoValida, requisicao } from './helpers';
import { ClassExamService } from "../../src/services/class-exam-service";
let server: Server, baseUrl: string;
beforeAll(async () => { ({ server, baseUrl } = await iniciarServidor()); });
beforeEach(async () => { process.env.INSTITUTIONS_ENABLED = 'false'; await limparBanco(); });
afterAll(async () => { await encerrar(server); });
async function fixture() {
  const teacher = await criarUsuario('PROFESSOR'), other = await criarUsuario('PROFESSOR'), student = await criarUsuario('ALUNO');
  const turma = await prisma.turma.create({ data: { nome: 'Teste 1', codigoConvite: randomUUID(), professores: { connect: { id: teacher.id } }, alunos: { connect: { id: student.id } } } });
  const otherClass = await prisma.turma.create({ data: { nome: 'Outra turma', codigoConvite: randomUUID(), professores: { connect: { id: other.id } } } });
  const body = { ...questaoValida(), publica: false, turmaId: turma.id, nivel: 'INTERMEDIARIO' as const };
  const request = (method: string, path: string, actor = teacher, corpo?: object) => requisicao(baseUrl, method, path, { token: tokenPara(actor), corpo });
  return { teacher, other, student, turma, otherClass, body, request };
}
it('persists private class ownership and returns the authorized class name', async () => {
  const f = await fixture();
  const context = await f.request('GET', `/questoes/turmas/${f.turma.id}/contexto`);
  expect(context.corpo).toMatchObject({ id: f.turma.id, nome: 'Teste 1' });
  const created = await f.request('POST', '/questoes', f.teacher, f.body);
  expect(created.status).toBe(201);
  expect(await prisma.questao.findUnique({ where: { id: created.corpo.id } })).toMatchObject({ turmaId: f.turma.id, publica: false, autorId: f.teacher.id });
  expect((await f.request('GET', `/questoes?turmaId=${f.turma.id}`)).corpo[0].id).toBe(created.corpo.id);
});
it('denies another professor, forged authorship and students at the API', async () => {
  const f = await fixture();
  for (const actor of [f.other, f.student]) {
    expect((await f.request('POST', '/questoes', actor, { ...f.body, autorId: f.teacher.id })).status).toBe(403);
    expect((await f.request('GET', `/questoes/turmas/${f.turma.id}/contexto`, actor)).status).toBe(403);
  }
  expect(await prisma.questao.count()).toBe(0);
});
it('rejects global publication and classless creation without changing the existing global bank', async () => {
  const f = await fixture();
  const existing = await prisma.questao.create({ data: { ...f.body, alternativas: undefined, autorId: f.teacher.id, turmaId: null, publica: true } });
  expect((await f.request('POST', '/questoes', f.teacher, { ...f.body, publica: true })).status).toBe(403);
  const { turmaId: _, ...withoutClass } = f.body;
  expect((await f.request('POST', '/questoes', f.teacher, withoutClass)).status).toBe(403);
  expect((await f.request('PUT', `/questoes/${existing.id}`, f.teacher, { publica: false })).status).toBe(403);
  expect(await prisma.questao.findUnique({ where: { id: existing.id } })).toMatchObject({ publica: true, turmaId: null });
});
it('rejects new questions and context access after archiving', async () => {
  const f = await fixture();
  await prisma.turma.update({ where: { id: f.turma.id }, data: { archivedAt: new Date() } });
  expect((await f.request('POST', '/questoes', f.teacher, f.body)).status).toBe(409);
  expect((await f.request('GET', `/questoes/turmas/${f.turma.id}/contexto`)).status).toBe(409);
  expect(await prisma.questao.count()).toBe(0);
});
it('isolates private questions from students, other classes and global exercises', async () => {
  const f = await fixture(); const created = await f.request('POST', '/questoes', f.teacher, f.body);
  expect((await f.request('GET', '/questoes', f.student)).corpo).toEqual([]);
  expect((await f.request('GET', `/questoes/${created.corpo.id}`, f.student)).status).toBe(404);
  expect((await f.request('GET', '/questoes', f.other)).corpo).toEqual([]);
  const service = new ClassExamService();
  await expect(service.saveExam({ role: 'PROFESSOR', userId: f.other.id }, { titulo: 'Indevido', descricao: '', duracaoSegundos: null, turmaIds: [f.otherClass.id], questaoIds: [created.corpo.id] })).rejects.toMatchObject({ statusCode: 403 });
  expect(await prisma.questao.count({ where: { publica: true } })).toBe(0);
});
it('blocks publication, transfer and edits of questions already used in exams, preserving their links', async () => {
  const f = await fixture(); const created = await f.request('POST', '/questoes', f.teacher, f.body); const id = created.corpo.id;
  expect((await f.request('PUT', `/questoes/${id}`, f.teacher, { publica: true })).status).toBe(403);
  await prisma.turma.update({ where: { id: f.otherClass.id }, data: { professores: { connect: { id: f.teacher.id } } } });
  expect((await f.request('PUT', `/questoes/${id}`, f.teacher, { turmaId: f.otherClass.id })).status).toBe(403);
  const service = new ClassExamService();
  const exam = await service.saveExam({ role: 'PROFESSOR', userId: f.teacher.id }, { titulo: 'Histórico preservado', descricao: '', duracaoSegundos: null, turmaIds: [f.turma.id], questaoIds: [id] });
  await service.publish({ role: 'PROFESSOR', userId: f.teacher.id }, exam.id);
  const attempt = await service.start({ role: 'ALUNO', userId: f.student.id }, exam.id);
  const before = await prisma.questao.findUnique({ where: { id }, include: { alternativas: true } });
  await service.answer({ role: 'ALUNO', userId: f.student.id }, attempt.id, id, before!.alternativas.find(a => a.correta)!.id);
  const result = await service.finalize({ role: 'ALUNO', userId: f.student.id }, attempt.id);
  expect(result.overallPercentage).toBe(100);
  const answers = await prisma.resposta.findMany({ where: { simuladoId: attempt.id } });
  expect((await f.request('PUT', `/questoes/${id}`, f.teacher, { assunto: 'Alterado' })).status).toBe(409);
  expect((await f.request('DELETE', `/questoes/${id}`)).status).toBe(409);
  expect(await prisma.questao.findUnique({ where: { id }, include: { alternativas: true } })).toEqual(before);
  expect(await prisma.simulado.count({ where: { id: attempt.id, alunoId: f.student.id } })).toBe(1);
  expect(await prisma.resposta.findMany({ where: { simuladoId: attempt.id } })).toEqual(answers);
  expect((await service.attempt({ role: 'ALUNO', userId: f.student.id }, attempt.id)).result).toEqual(result);
});
