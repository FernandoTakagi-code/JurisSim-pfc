import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { prisma, criarUsuario, limparBanco, encerrar, tokenPara } from './helpers';
import { assertDisposableDatabase } from './disposable-database';
import { classRoutes, examRoutes } from "../../src/routes/class-exam-routes";
import { errorHandler } from "../../src/middlewares/error-handler";
import { ClassExamService } from "../../src/services/assessments/class-exam-service";
let server: Server, base: string;
beforeAll(async () => {
  await assertDisposableDatabase(prisma);
  const app = express(); app.use(express.json()); app.use('/turmas', classRoutes); app.use('/avaliacoes', examRoutes); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(async () => { process.env.INSTITUTIONS_ENABLED = 'false'; await limparBanco(); });
afterAll(async () => { process.env.INSTITUTIONS_ENABLED = 'false'; await encerrar(server); });
async function request(method: string, path: string, user?: Parameters<typeof tokenPara>[0], body?: object) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${tokenPara(user)}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
async function fixture() {
  const teacher = await criarUsuario('PROFESSOR'), student = await criarUsuario('ALUNO'), outsider = await criarUsuario('ALUNO');
  const turma = await prisma.turma.create({ data: { nome: 'Teste 1', codigoConvite: `fixture-${randomUUID()}`, professores: { connect: { id: teacher.id } }, alunos: { connect: { id: student.id } } } });
  const question = await prisma.questao.create({ data: { autorId: teacher.id, turmaId: turma.id, publica: false,
    enunciado: 'Questão técnica exclusivamente do banco descartável', disciplina: 'Direito Civil', assunto: 'Contratos', nivel: 'BASICO', fundamentacaoJuridica: 'Fixture',
    alternativas: { create: [{ texto: 'Correta', correta: true }, { texto: 'Incorreta', correta: false }] } }, include: { alternativas: true } });
  const service = new ClassExamService();
  const input = { titulo: 'Simulado publicado de teste', descricao: 'Fixture', duracaoSegundos: null, turmaIds: [turma.id], questaoIds: [question.id] };
  const exam = await service.saveExam({ userId: teacher.id, role: 'PROFESSOR' }, input);
  const draft = await service.saveExam({ userId: teacher.id, role: 'PROFESSOR' }, { ...input, titulo: 'Rascunho invisível' });
  await service.publish({ userId: teacher.id, role: 'PROFESSOR' }, exam.id);
  return { teacher, student, outsider, turma, question, exam, draft, service };
}

it('opens Teste 1 for an enrolled student, exposes only published activities, and protects other students and drafts', async () => {
  const f = await fixture();
  expect((await request('GET', `/turmas/${f.turma.id}`)).status).toBe(401);
  expect((await request('GET', `/turmas/${f.turma.id}`, f.teacher)).status).toBe(403);
  expect((await request('GET', `/turmas/${f.turma.id}`, f.outsider)).status).toBe(404);
  const response = await request('GET', `/turmas/${f.turma.id}`, f.student);
  expect(response.status).toBe(200); expect(response.body.nome).toBe('Teste 1');
  expect(response.body.professors[0].nome).toBe(f.teacher.nome); expect(response.body.enrollment.status).toBe('MATRICULADO');
  expect(response.body.exams.map((e: { id: string }) => e.id)).toEqual([f.exam.id]);
  expect(JSON.stringify(response.body)).not.toMatch(/alternativas|correta|senhaHash|tokenHash/);
  expect((await request('POST', `/avaliacoes/${f.exam.id}/attempts`, f.outsider, {})).status).toBe(404);
});

it('starts, resumes, saves, finalizes and displays only the enrolled student result without recreating an attempt', async () => {
  const f = await fixture();
  const started = await request('POST', `/avaliacoes/${f.exam.id}/attempts`, f.student, {});
  expect(started.status).toBe(200); const id = started.body.id;
  expect((await request('POST', `/avaliacoes/${f.exam.id}/attempts`, f.student, {})).body.id).toBe(id);
  let details = await request('GET', `/turmas/${f.turma.id}`, f.student);
  expect(details.body.exams[0].attempt).toMatchObject({ id, status: 'IN_PROGRESS', result: null });
  const chosen = f.question.alternativas.find(a => a.correta)!;
  expect((await request('PUT', `/avaliacoes/attempts/${id}/answers/${f.question.id}`, f.student, { selectedOptionId: chosen.id })).status).toBe(200);
  expect((await request('GET', `/avaliacoes/attempts/${id}`, f.student)).body.questions[0].selectedOptionId).toBe(chosen.id);
  expect((await request('POST', `/avaliacoes/attempts/${id}/finalize`, f.student, {})).body.overallPercentage).toBe(100);
  details = await request('GET', `/turmas/${f.turma.id}`, f.student);
  expect(details.body.exams[0].attempt).toMatchObject({ id, status: 'COMPLETED', result: { correctAnswers: 1, totalQuestions: 1, overallPercentage: 100 } });
  expect((await request('GET', `/avaliacoes/attempts/${id}`, f.outsider)).status).toBe(404);
  expect(await prisma.simulado.count({ where: { alunoId: f.student.id, avaliacaoId: f.exam.id } })).toBe(1);
});

it.each(['PENDING', 'REJECTED', 'REMOVED'])('blocks %s students even if a stale enrollment relation remains', async status => {
  const f = await fixture();
  await prisma.classJoinRequest.create({ data: { classId: f.turma.id, studentId: f.student.id, status } });
  expect((await request('GET', `/turmas/${f.turma.id}`, f.student)).status).toBe(404);
  expect((await request('GET', '/turmas', f.student)).body.items).toEqual([]);
  expect((await request('POST', `/avaliacoes/${f.exam.id}/attempts`, f.student, {})).status).toBe(404);
  expect((await request('GET', '/turmas/requests', f.student)).body.items[0].status).toBe(status);
});

it('keeps professor approval/refusal under the responsible teacher and never enrolls a rejected request', async () => {
  const f = await fixture(), otherTeacher = await criarUsuario('PROFESSOR');
  const institution = await prisma.institution.create({ data: { name: 'Fixture institution', responsibleName: 'Fixture', ownerId: f.teacher.id,
    email: `${randomUUID()}@example.invalid`, phone: '11999990000', description: 'Fixture', status: 'ACTIVE',
    memberships: { create: [f.teacher, otherTeacher].map(t => ({ userId: t.id, role: 'TEACHER', active: true })) } } });
  await prisma.institutionalClass.create({ data: { institutionId: institution.id, classId: f.turma.id } });
  process.env.INSTITUTIONS_ENABLED = 'true';
  const join = await prisma.classJoinRequest.create({ data: { classId: f.turma.id, studentId: f.outsider.id } });
  expect((await request('PATCH', `/turmas/${f.turma.id}/requests/${join.id}`, otherTeacher, { approve: true })).status).toBe(404);
  expect((await request('PATCH', `/turmas/${f.turma.id}/requests/${join.id}`, f.teacher, { approve: true })).status).toBe(200);
  expect((await request('GET', `/turmas/${f.turma.id}`, f.outsider)).status).toBe(200);
  const rejected = await criarUsuario('ALUNO'); const pending = await prisma.classJoinRequest.create({ data: { classId: f.turma.id, studentId: rejected.id } });
  expect((await request('PATCH', `/turmas/${f.turma.id}/requests/${pending.id}`, f.teacher, { approve: false })).status).toBe(200);
  expect((await request('GET', `/turmas/${f.turma.id}`, rejected)).status).toBe(404);
  expect((await prisma.classJoinRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('REJECTED');
});

it('paginates published exams and allows archived class history without starting new attempts', async () => {
  const f = await fixture();
  await prisma.turma.update({ where: { id: f.turma.id }, data: { avaliacoes: { create: Array.from({ length: 50 }, (_, i) => ({
    titulo: `Fixture publicada ${i}`, autorId: f.teacher.id, publishedAt: new Date(),
  })) } } });
  const first = await request('GET', `/turmas/${f.turma.id}?page=1`, f.student);
  expect(first.body.exams).toHaveLength(50); expect(first.body.hasMore).toBe(true);
  const second = await request('GET', `/turmas/${f.turma.id}?page=2`, f.student);
  expect(second.body.exams).toHaveLength(1); expect(second.body.hasMore).toBe(false);
  await prisma.turma.update({ where: { id: f.turma.id }, data: { archivedAt: new Date() } });
  expect((await request('GET', `/turmas/${f.turma.id}?page=1`, f.student)).status).toBe(200);
  expect((await request('POST', `/avaliacoes/${f.exam.id}/attempts`, f.student, {})).status).toBe(404);
  expect((await request('GET', `/turmas/${f.turma.id}?page=0`, f.student)).status).toBe(422);
});
