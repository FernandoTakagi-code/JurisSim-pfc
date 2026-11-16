import cors from 'cors';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createAuthRoutes } from "../../src/routes/auth-routes";
import { createInstitutionRoutes } from "../../src/routes/institution-routes";
import express from 'express';
import type { Server } from 'node:http';
import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { prisma, criarUsuario, tokenPara, limparBanco, encerrar } from './helpers';
import { assertDisposableDatabase } from './disposable-database';
import { createQuestionEditorialRoutes } from "../../src/routes/question-editorial-routes";
import { errorHandler } from "../../src/middlewares/error-handler";
import { QuestionPracticeService } from "../../src/services/questions/question-practice-service";
import { PrismaQuestionPracticeRepository } from "../../src/repositories/prisma-question-practice-repository";
import { QuestionEditorialService } from "../../src/services/questions/question-editorial-service";

let server: Server, base: string;
beforeAll(async () => {
  await assertDisposableDatabase(prisma);
  const app = express(); app.use(cors({origin:'http://127.0.0.1:5187'})); app.use(express.json()); app.use('/auth',createAuthRoutes()); app.use('/institutions',createInstitutionRoutes()); app.use('/question-editorial', createQuestionEditorialRoutes()); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(async () => {
  await assertDisposableDatabase(prisma); await limparBanco();
  vi.stubEnv('ADMINISTRATION_ENABLED','true'); vi.stubEnv('INSTITUTIONS_ENABLED','false');
  vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED','false'); vi.stubEnv('QUESTION_EDITORIAL_WRITES_ENABLED','true');
});
afterAll(async () => { vi.unstubAllEnvs(); await encerrar(server); });
async function admin() { const u = await criarUsuario('ALUNO'); return prisma.user.update({ where: { id: u.id }, data: { role: 'ADMIN' } }); }
async function question(authorId: string, overrides: Record<string, unknown> = {}) {
  return prisma.questao.create({ data: { autorId: authorId, enunciado: 'Enunciado completo para verificação editorial isolada.',
    disciplina: 'Direito Civil', assunto: 'Contratos', nivel: 'BASICO', fundamentacaoJuridica: 'Justificativa conferida no teste isolado.',
    publica: false, origem: 'IA', fonteNome: 'Documento isolado', fonteReferencia: 'referencia-isolada', licencaOuAutorizacao: 'Autorização documentada no teste',
    alternativas: { create: ['A','B','C','D'].map((letra, i) => ({ letra: letra as 'A'|'B'|'C'|'D', texto: `Alternativa ${letra}`, correta: i === 0 })) }, ...overrides } });
}
async function request(token: string | null, path: string, method = 'GET', body?: object) {
  const r = await fetch(base + '/question-editorial' + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type':'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, data: await r.json() };
}
const evidence = 'parecer-tecnico-isolado-001';
const body = (digest: string) => ({ expectedDigest: digest, evidenceRef: evidence, confirmed: true });

it('records two explicit human attestations and release atomically without changing content or academic records', async () => {
  const user = await admin(), token = tokenPara(user), q = await question(user.id);
  const detail = await request(token, `/${q.id}`); expect(detail.status).toBe(200);
  const digest = detail.data.digest;
  expect((await request(token, `/${q.id}/release`, 'POST', { ...body(digest), consentEvidence: evidence })).status).toBe(409);
  expect((await request(token, `/${q.id}/reviews/legal`, 'POST', body(digest))).status).toBe(200);
  expect((await request(token, `/${q.id}/reviews/pedagogical`, 'POST', body(digest))).status).toBe(200);
  expect((await request(token, `/${q.id}/release`, 'POST', { ...body(digest), consentEvidence: evidence })).status).toBe(200);
  const saved = await prisma.questao.findUniqueOrThrow({ where: { id: q.id }, include: { alternativas: true } });
  expect(saved).toMatchObject({ enunciado: q.enunciado, publica: true, revisorJuridicoId: user.id, revisorPedagogicoId: user.id, liberadaAcervoPorId: user.id });
  expect(saved.alternativas).toHaveLength(4);
  expect(await prisma.administrativeEvent.count({ where: { resourceId: q.id } })).toBe(3);
  expect(await prisma.simulado.count()).toBe(0); expect(await prisma.resposta.count()).toBe(0);
  const availability = await new QuestionPracticeService(new PrismaQuestionPracticeRepository()).availability((await criarUsuario('ALUNO')).id, 'Direito Civil', null);
  expect(availability).toMatchObject({ eligibleCount: 1, availableCount: 1, availableQuantities: [] });
  expect((await request(token, `/${q.id}/release`, 'POST', { ...body(digest), consentEvidence: evidence })).status).toBe(409);
});

it('blocks anonymous, student, teacher and suspended administrators without accepting forged responsible IDs', async () => {
  const user = await admin(), q = await question(user.id);
  expect((await request(null, '')).status).toBe(401);
  for (const role of ['ALUNO','PROFESSOR'] as const) {
    const other = await criarUsuario(role);
    expect((await request(tokenPara(other), `/${q.id}`)).status).toBe(403);
  }
  const token = tokenPara(user), digest = (await request(token, `/${q.id}`)).data.digest;
  expect((await request(token, `/${q.id}/reviews/legal`, 'POST', { ...body(digest), reviewerId: 'forged' })).status).toBe(422);
  await prisma.accountControl.create({ data: { userId: user.id, suspended: true } });
  expect((await request(token, `/${q.id}`)).status).toBe(403);
  expect(await prisma.administrativeEvent.count()).toBe(0);
});

it('keeps reads available with editorial writes disabled and refuses missing attestations or pending rights', async () => {
  const user = await admin(), token = tokenPara(user), q = await question(user.id, { licencaOuAutorizacao: 'PENDENTE_CONFERENCIA' });
  const digest = (await request(token, `/${q.id}`)).data.digest;
  expect((await request(token, `/${q.id}/reviews/legal`, 'POST', { ...body(digest), confirmed: false })).status).toBe(422);
  expect((await request(token, `/${q.id}/reviews/legal`, 'POST', body(digest))).status).toBe(409);
  vi.stubEnv('QUESTION_EDITORIAL_WRITES_ENABLED','false');
  expect((await request(token, '')).status).toBe(200);
  expect((await request(token, '/availability')).data.writesEnabled).toBe(false);
  expect((await request(token, `/${q.id}/reviews/legal`, 'POST', body(digest))).status).toBe(503);
  expect(await prisma.administrativeEvent.count()).toBe(0);
});

it('binds attestations to the content version and invalidates previous review fields when documentation changes', async () => {
  const user = await admin(), token = tokenPara(user), q = await question(user.id);
  const digest = (await request(token, `/${q.id}`)).data.digest;
  await request(token, `/${q.id}/reviews/legal`, 'POST', body(digest));
  await request(token, `/${q.id}/reviews/pedagogical`, 'POST', body(digest));
  const changed = await request(token, `/${q.id}/metadata`, 'PATCH', { expectedDigest: digest, evidenceRef: evidence, sourceName: 'Nova fonte documentada', sourceReference: 'referencia-isolada', license: 'Autorização documentada no teste' });
  expect(changed.status).toBe(200);
  const saved = await prisma.questao.findUniqueOrThrow({ where: { id: q.id } });
  expect(saved.revisaoJuridicaEm).toBeNull(); expect(saved.revisaoPedagogicaEm).toBeNull();
  expect((await request(token, `/${q.id}/release`, 'POST', { ...body(digest), consentEvidence: evidence })).status).toBe(409);
  const current = (await request(token, `/${q.id}`)).data.digest;
  expect((await request(token, `/${q.id}/release`, 'POST', { ...body(current), consentEvidence: evidence })).status).toBe(409);
  expect((await request(token, `/${q.id}/reviews/legal`, 'POST', body(current))).status).toBe(200);
});

it('rejects altered content even if historical review fields remain populated', async () => {
  const user = await admin(), token = tokenPara(user), q = await question(user.id);
  const digest = (await request(token, `/${q.id}`)).data.digest;
  await request(token, `/${q.id}/reviews/legal`, 'POST', body(digest));
  await request(token, `/${q.id}/reviews/pedagogical`, 'POST', body(digest));
  await prisma.questao.update({ where: { id: q.id }, data: { fundamentacaoJuridica: 'Conteúdo alterado no banco isolado.' } });
  const updated = (await request(token, `/${q.id}`)).data.digest;
  expect((await request(token, `/${q.id}/release`, 'POST', { ...body(updated), consentEvidence: evidence })).status).toBe(409);
  expect((await prisma.questao.findUniqueOrThrow({ where: { id: q.id } })).liberadaAcervoEm).toBeNull();
});

it('keeps incomplete content and private class questions outside global release', async () => {
  const user = await admin(), token = tokenPara(user), q = await question(user.id);
  await prisma.alternativa.updateMany({ where: { questaoId: q.id }, data: { letra: null } });
  let detail = await request(token, `/${q.id}`);
  expect((await request(token, `/${q.id}/reviews/legal`, 'POST', body(detail.data.digest))).status).toBe(409);
  const teacher = await criarUsuario('PROFESSOR');
  const turma = await prisma.turma.create({ data: { nome: 'Privada editorial', codigoConvite: `editorial-${teacher.id}`, professores: { connect: { id: teacher.id } } } });
  const scoped = await question(teacher.id, { turmaId: turma.id });
  detail = await request(token, `/${scoped.id}`);
  expect(detail.status).toBe(404);
  expect((await request(token, '')).data.items.some((item: { id: string }) => item.id === scoped.id)).toBe(false);
  expect((await request(token, `/${scoped.id}/reviews/legal`, 'POST', body('a'.repeat(64)))).status).toBe(404);
  expect((await prisma.questao.findUniqueOrThrow({ where: { id: scoped.id } })).publica).toBe(false);
});

it('does not duplicate attestations under concurrent requests', async () => {
  const user = await admin(), token = tokenPara(user), q = await question(user.id);
  const digest = (await request(token, `/${q.id}`)).data.digest;
  const results = await Promise.all([request(token, `/${q.id}/reviews/legal`, 'POST', body(digest)), request(token, `/${q.id}/reviews/legal`, 'POST', body(digest))]);
  expect(results.filter(r => r.status === 200)).toHaveLength(1);
  expect(results.map(r => r.status).sort()).toEqual([200,409]);
  expect(await prisma.administrativeEvent.count({ where: { resourceId: q.id, event: 'QUESTION_LEGAL_REVIEW_RECORDED' } })).toBe(1);
});

it('rolls back the review when its audit event cannot be persisted', async () => {
  const user = await admin(), token = tokenPara(user), q = await question(user.id);
  const digest = (await request(token, `/${q.id}`)).data.digest;
  const audit = vi.spyOn(QuestionEditorialService.prototype as any, 'audit').mockRejectedValueOnce(new Error('Isolated audit failure'));
  try {
    expect((await request(token, `/${q.id}/reviews/legal`, 'POST', body(digest))).status).toBe(500);
    expect((await prisma.questao.findUniqueOrThrow({ where: { id: q.id } })).revisaoJuridicaEm).toBeNull();
    expect(await prisma.administrativeEvent.count()).toBe(0);
  } finally { audit.mockRestore(); }
});

it('navigates the editorial frontend with a legitimate isolated ADMIN login and read-only API', async () => {
  vi.stubEnv('QUESTION_EDITORIAL_WRITES_ENABLED','false');
  vi.stubEnv('CORS_ORIGINS','http://127.0.0.1:5187');
  const user = await admin(); await question(user.id);
  await prisma.user.update({where:{id:user.id},data:{email:'editorial-admin@example.invalid'}});
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(process.execPath,[path.resolve('../frontend/tests/test-question-editorial-db.mjs')],{
      cwd:path.resolve('../frontend'),windowsHide:true,env:{...process.env,JURISSIM_DB_UI_API:base,JURISSIM_DB_UI_OWNER:'editorial-admin@example.invalid',JURISSIM_DB_UI_PASSWORD:'senha-de-teste',JURISSIM_DB_UI_INSTITUTION:'unused',GOOGLE_CLIENT_ID:''},stdio:['ignore','pipe','pipe']
    });
    let output=''; child.stdout.on('data',chunk=>{output+=String(chunk);}); child.stderr.on('data',chunk=>{output+=String(chunk);});
    child.once('error',reject); child.once('close',code=>code===0?resolve():reject(new Error('Editorial browser failed: '+output.slice(-6000))));
  });
},90000);
