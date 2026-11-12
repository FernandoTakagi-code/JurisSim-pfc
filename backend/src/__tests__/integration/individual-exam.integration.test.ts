import express from 'express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createIndividualExamRoutes } from '../../routes/individual-exam-routes';
import { errorHandler } from '../../middlewares/error-handler';
import { criarUsuario, prisma, tokenPara, encerrar } from './helpers';
import { assertDisposableDatabase } from './disposable-database';
import { PRACTICE_DISCIPLINES } from '../../services/question-practice-service';
import { StudentHistoryRepository } from '../../repositories/student-history-repository';
import { TrailRepository } from '../../repositories/trail-repository';

let server: Server, base: string;
beforeAll(async () => {
  await assertDisposableDatabase(prisma);
  process.env.INDIVIDUAL_EXAM_SCHEMA_ENABLED = 'true';
  const app = express(); app.use(express.json());
  app.use('/individual-exams', createIndividualExamRoutes({ isEnabled: () => true }));
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { delete process.env.INDIVIDUAL_EXAM_SCHEMA_ENABLED; await encerrar(server); });
async function request(method: string, path: string, token?: string, body?: unknown) {
  const response = await fetch(base + '/individual-exams' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
it('persists a balanced attempt, resumes safely, keeps feedback private and corrects immutable snapshots on delivery', async () => {
  const student = await criarUsuario('ALUNO'), other = await criarUsuario('ALUNO'), teacher = await criarUsuario('PROFESSOR');
  const token = tokenPara(student), otherToken = tokenPara(other);
  expect((await request('GET', '/availability')).status).toBe(401);
  expect((await request('GET', '/availability', tokenPara(teacher))).status).toBe(403);
  for (const discipline of PRACTICE_DISCIPLINES) for (let i = 0; i < 7; i++) await prisma.questao.create({ data: {
    enunciado: `Questão de teste isolado ${discipline} ${i}`, disciplina: discipline, assunto: 'Assunto de integração', nivel: 'BASICO', fundamentacaoJuridica: 'Explicação original preservada.', publica: i < 6, origem: 'IA', autorId: teacher.id,
    revisaoJuridicaEm: new Date(), revisorJuridicoId: teacher.id, revisaoPedagogicaEm: new Date(), revisorPedagogicoId: teacher.id, liberadaAcervoEm: new Date(), liberadaAcervoPorId: teacher.id,
    alternativas: { create: (['A', 'B', 'C', 'D'] as const).map(letra => ({ letra, texto: `Texto ${letra}`, correta: letra === 'A' })) },
  } });
  expect((await request('GET', '/availability', token)).body.canStart).toBe(true);
  const starts = await Promise.all([request('POST', '/', token, {}), request('POST', '/', token, {})]);
  expect(starts.every(r => r.status === 201 || r.status === 200)).toBe(true);
  const id = starts[0].body.attempt.id;
  expect(starts[1].body.attempt.id).toBe(id);
  const questions = starts[0].body.attempt.questions;
  expect(questions).toHaveLength(30);
  expect(await prisma.simulado.count({ where: { alunoId: student.id } })).toBe(1);
  expect(questions[0].alternatives[0]).not.toHaveProperty('correct');
  expect(questions[0]).not.toHaveProperty('explanation');
  expect((await request('GET', `/${id}`, otherToken)).status).toBe(404);
  expect((await request('GET', `/${id}/result`, token)).status).toBe(409);
  expect((await request('POST', `/${id}/finalize`, token, {})).status).toBe(409);
  const q = questions[0], firstOption = q.alternatives.find((a: any) => a.letter === 'A');
  expect((await request('PUT', `/${id}/answers/${q.id}`, token, { alternativeId: questions[1].alternatives[0].id })).status).toBe(422);
  const saved = await request('PUT', `/${id}/answers/${q.id}`, token, { alternativeId: firstOption.id });
  expect(saved.body).toEqual({ saved: true, selectedOptionId: firstOption.id });
  const history = new StudentHistoryRepository();
  expect((await history.learningSummary(student.id)).disciplines).toEqual([]);
  expect((await history.history(student.id, 10))[0]).toMatchObject({ type: 'INDIVIDUAL', correctAnswers: null });
  expect(await new TrailRepository().findAttempt(id)).toBeNull();
  await prisma.questao.update({ where: { id: q.id }, data: { enunciado: 'Enunciado alterado depois de iniciar.', fundamentacaoJuridica: 'Explicação alterada.' } });
  expect((await request('GET', `/${id}`, token)).body.attempt.questions[0].statement).toBe(q.statement);
  for (const item of questions.slice(1)) expect((await request('PUT', `/${id}/answers/${item.id}`, token, { alternativeId: item.alternatives.find((a: any) => a.letter === 'A').id })).status).toBe(200);
  expect((await request('GET', '/availability', token)).body.disciplines.every((d: any) => d.available === 0)).toBe(true);
  expect((await request('GET', '/availability', otherToken)).body.canStart).toBe(true);
  const delivered = await request('POST', `/${id}/finalize`, token, {});
  expect(delivered.body.result).toMatchObject({ correct: 30, total: 30, percentage: 100 });
  expect(delivered.body.result.answers[0].explanation).toBe('Explicação original preservada.');
  expect((await request('POST', `/${id}/finalize`, token, {})).body.result).toEqual(delivered.body.result);
  expect((await request('PUT', `/${id}/answers/${q.id}`, token, { alternativeId: q.alternatives[1].id })).status).toBe(409);
  expect((await request('POST', '/', token, {})).status).toBe(409);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).nivelAtual).toBe(student.nivelAtual);
});
