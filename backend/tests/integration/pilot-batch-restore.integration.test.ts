import express from 'express';
import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createIndividualExamRoutes } from "../../src/routes/individual-exam-routes";
import { errorHandler } from "../../src/middlewares/error-handler";
import { criarUsuario, prisma, tokenPara, encerrar, limparBanco } from './helpers';
import { assertDisposableDatabase } from './disposable-database';
import { importPracticeDrafts } from "../../src/services/questions/practice-draft-import";
import { pilotBatchCounts } from "../../src/services/questions/pilot-batch-completion";
import { restoreQuestionsToPilot } from "../../src/services/questions/pilot-batch-restore";

const draft = (name: string) => JSON.parse(readFileSync(resolve(`scripts/drafts/${name}.draft.json`), 'utf8'));
const ADM = 'Direito Administrativo', CIV = 'Direito Civil';
let server: Server, base: string;

beforeAll(async () => {
  await assertDisposableDatabase(prisma);
  await limparBanco();
  process.env.INDIVIDUAL_EXAM_SCHEMA_ENABLED = 'true';
  const app = express(); app.use(express.json());
  app.use('/individual-exams', createIndividualExamRoutes({ isEnabled: () => true }));
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  delete process.env.INDIVIDUAL_EXAM_SCHEMA_ENABLED; delete process.env.INDIVIDUAL_EXAM_PILOT_ENABLED; delete process.env.INDIVIDUAL_EXAM_PILOT_BATCH_ID;
  await encerrar(server);
});
async function request(method: string, path: string, token: string, body?: unknown) {
  const response = await fetch(base + '/individual-exams' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}

it('devolve ao lote ativo as questões de treino que ficaram publicadas a meio da revisão e o simulado volta a iniciar', async () => {
  const admin = await criarUsuario('PROFESSOR'); await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  const active = await importPracticeDrafts(prisma, draft('authorial-practice-60'), admin.id);
  const source = await importPracticeDrafts(prisma, draft('authorial-practice-expansion-60'), admin.id);
  // Produção: o lote ativo ficou sem Administrativo; no outro lote, Administrativo foi publicado com revisão pedagógica e sem jurídica.
  const activeAdm = await prisma.questao.findMany({ where: { loteImportacaoId: active.batchId, disciplina: ADM }, select: { id: true } });
  await prisma.alternativa.deleteMany({ where: { questaoId: { in: activeAdm.map(q => q.id) } } });
  await prisma.questao.deleteMany({ where: { id: { in: activeAdm.map(q => q.id) } } });
  const reviewedAt = new Date('2026-11-16T12:00:00Z');
  await prisma.questao.updateMany({ where: { loteImportacaoId: source.batchId, disciplina: ADM }, data: { publica: true, revisaoPedagogicaEm: reviewedAt, revisorPedagogicoId: admin.id } });
  const sourceAdm = await prisma.questao.findMany({ where: { loteImportacaoId: source.batchId, disciplina: ADM }, orderBy: { id: 'asc' }, select: { id: true } });
  // Duas questões que não podem ser tocadas: uma com revisão jurídica e outra usada em avaliação de turma.
  const legallyReviewed = sourceAdm[0].id;
  await prisma.questao.update({ where: { id: legallyReviewed }, data: { revisaoJuridicaEm: reviewedAt, revisorJuridicoId: admin.id } });
  const teacher = await criarUsuario('PROFESSOR');
  const exam = await prisma.avaliacao.create({ data: { titulo: 'Avaliação fixture', autorId: teacher.id } });
  const usedInExam = sourceAdm[1].id;
  await prisma.avaliacaoQuestao.create({ data: { avaliacaoId: exam.id, questaoId: usedInExam, posicao: 1 } });

  process.env.INDIVIDUAL_EXAM_PILOT_ENABLED = 'true'; process.env.INDIVIDUAL_EXAM_PILOT_BATCH_ID = active.batchId;
  const student = await criarUsuario('ALUNO'), token = tokenPara(student);
  expect((await request('GET', '/availability', token)).body.canStart).toBe(false);

  const result = await restoreQuestionsToPilot(prisma, { sourceBatchId: source.batchId, targetBatchId: active.batchId, disciplines: [ADM, CIV], target: 10, operatorId: admin.id });
  expect(result.moved[ADM]).toBe(10);
  expect(result.moved[CIV]).toBe(0);
  expect(result.after).toMatchObject({ [ADM]: 10, [CIV]: 12 });
  const movedIds = result.items.map(i => i.id);
  expect(movedIds).not.toContain(legallyReviewed);
  expect(movedIds).not.toContain(usedInExam);
  const untouched = await prisma.questao.findMany({ where: { id: { in: [legallyReviewed, usedInExam] } }, select: { loteImportacaoId: true, publica: true } });
  expect(untouched.every(q => q.loteImportacaoId === source.batchId && q.publica)).toBe(true);
  const moved = await prisma.questao.findMany({ where: { id: { in: movedIds } }, select: { publica: true, revisaoPedagogicaEm: true, revisorPedagogicoId: true, loteImportacaoId: true } });
  expect(moved.every(q => !q.publica && !q.revisaoPedagogicaEm && !q.revisorPedagogicoId && q.loteImportacaoId === active.batchId)).toBe(true);

  const events = await prisma.administrativeEvent.findMany({ where: { event: 'PILOT_QUESTION_RESTORED' } });
  expect(events).toHaveLength(10);
  const recorded = JSON.parse(events[0].result);
  expect(recorded).toMatchObject({ status: 'SUCCESS', previous: { publica: true, revisaoPedagogicaEm: reviewedAt.toISOString(), revisorPedagogicoId: admin.id, loteImportacaoId: source.batchId } });

  const after = await request('GET', '/availability', token);
  expect(after.body).toMatchObject({ provisional: true, canStart: true });
  const started = await request('POST', '/', token, {});
  expect(started.status).toBe(201);
  expect(started.body.attempt.questions).toHaveLength(30);

  const again = await restoreQuestionsToPilot(prisma, { sourceBatchId: source.batchId, targetBatchId: active.batchId, disciplines: [ADM, CIV], target: 10, operatorId: admin.id });
  expect(again.items).toHaveLength(0);
  expect(await pilotBatchCounts(prisma, active.batchId, [ADM])).toEqual({ [ADM]: 10 });
});

it('recusa responsável que não é ADMIN e lotes iguais ou inexistentes, sem gravar nada', async () => {
  const teacher = await criarUsuario('PROFESSOR');
  const options = { sourceBatchId: '00000000-0000-4000-8000-000000000001', targetBatchId: '00000000-0000-4000-8000-000000000002', disciplines: [ADM], target: 10 };
  await expect(restoreQuestionsToPilot(prisma, { ...options, operatorId: teacher.id })).rejects.toThrow('Responsável pela manutenção não autorizado.');
  const admin = await criarUsuario('PROFESSOR'); await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  await expect(restoreQuestionsToPilot(prisma, { ...options, operatorId: admin.id })).rejects.toThrow('Lote de origem ou de destino não encontrado.');
  await expect(restoreQuestionsToPilot(prisma, { ...options, targetBatchId: options.sourceBatchId, operatorId: admin.id })).rejects.toThrow('Os lotes de origem e destino devem ser diferentes.');
});
