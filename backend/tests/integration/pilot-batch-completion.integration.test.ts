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
import { completePilotBatch, pilotBatchCounts } from "../../src/services/questions/pilot-batch-completion";

const drafts = ['authorial-practice-60', 'authorial-practice-expansion-60']
  .map(name => JSON.parse(readFileSync(resolve(`scripts/drafts/${name}.draft.json`), 'utf8')));
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

it('completa Administrativo e Civil no lote piloto ativo e o simulado de 30 questões volta a iniciar', async () => {
  const admin = await criarUsuario('PROFESSOR'); await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  const imported = await importPracticeDrafts(prisma, drafts[0], admin.id);
  // Situação de produção: o lote ativo ficou sem Administrativo e com uma única questão de Civil.
  const civil = await prisma.questao.findMany({ where: { loteImportacaoId: imported.batchId, disciplina: CIV }, select: { id: true } });
  const removed = { loteImportacaoId: imported.batchId, OR: [{ disciplina: ADM }, { id: { in: civil.slice(1).map(q => q.id) } }] };
  await prisma.alternativa.deleteMany({ where: { questao: removed } });
  await prisma.questao.deleteMany({ where: removed });
  process.env.INDIVIDUAL_EXAM_PILOT_ENABLED = 'true'; process.env.INDIVIDUAL_EXAM_PILOT_BATCH_ID = imported.batchId;

  const student = await criarUsuario('ALUNO'), token = tokenPara(student);
  const before = await request('GET', '/availability', token);
  expect(before.body.canStart).toBe(false);
  expect(Object.fromEntries(before.body.disciplines.map((d: { discipline: string; available: number }) => [d.discipline, d.available]))).toMatchObject({ [ADM]: 0, [CIV]: 1 });

  const result = await completePilotBatch(prisma, drafts, { batchId: imported.batchId, operatorId: admin.id, disciplines: [ADM, CIV], target: 10 });
  expect(result).toMatchObject({ batchId: imported.batchId, added: 19, before: { [ADM]: 0, [CIV]: 1 }, after: { [ADM]: 10, [CIV]: 10 } });
  const added = await prisma.questao.findMany({ where: { id: { in: result.created.map(c => c.id) } }, select: { publica: true, revisaoJuridicaEm: true, revisaoPedagogicaEm: true, liberadaAcervoEm: true, origem: true, alternativas: { select: { correta: true } } } });
  expect(added.every(q => !q.publica && !q.revisaoJuridicaEm && !q.revisaoPedagogicaEm && !q.liberadaAcervoEm && q.origem === 'IA')).toBe(true);
  expect(added.every(q => q.alternativas.length === 4 && q.alternativas.filter(a => a.correta).length === 1)).toBe(true);

  const after = await request('GET', '/availability', token);
  expect(after.body).toMatchObject({ provisional: true, canStart: true });
  const started = await request('POST', '/', token, {});
  expect(started.status).toBe(201);
  expect(started.body.attempt.questions).toHaveLength(30);

  // Rodar de novo é seguro: o lote já está no alvo e nada é acrescentado.
  const again = await completePilotBatch(prisma, drafts, { batchId: imported.batchId, operatorId: admin.id, disciplines: [ADM, CIV], target: 10 });
  expect(again.added).toBe(0);
  expect(await pilotBatchCounts(prisma, imported.batchId, [ADM, CIV])).toEqual({ [ADM]: 10, [CIV]: 10 });
});

it('recusa responsável que não é ADMIN e lote inexistente, sem gravar nada', async () => {
  const teacher = await criarUsuario('PROFESSOR');
  const total = await prisma.questao.count();
  await expect(completePilotBatch(prisma, drafts, { batchId: '00000000-0000-4000-8000-000000000000', operatorId: teacher.id, disciplines: [ADM], target: 10 }))
    .rejects.toThrow('Responsável pela manutenção não autorizado.');
  const admin = await criarUsuario('PROFESSOR'); await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  await expect(completePilotBatch(prisma, drafts, { batchId: '00000000-0000-4000-8000-000000000000', operatorId: admin.id, disciplines: [ADM], target: 10 }))
    .rejects.toThrow('Lote piloto não encontrado.');
  expect(await prisma.questao.count()).toBe(total);
});
