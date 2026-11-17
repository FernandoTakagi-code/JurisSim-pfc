import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { LetraAlternativa } from '@prisma/client';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { errorHandler } from "../../src/middlewares/error-handler";
import { createQuestionPracticeRoutes } from "../../src/routes/question-practice-routes";
import { PrismaQuestionPracticeRepository } from "../../src/repositories/prisma-question-practice-repository";
import { assertDisposableDatabase } from './disposable-database';
import { criarUsuario, encerrar, prisma, tokenPara, limparBanco } from './helpers';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importPracticeDrafts } from "../../src/services/questions/practice-draft-import";
import { PrismaIndividualExamRepository } from "../../src/repositories/prisma-individual-exam-repository";
import { IndividualExamService } from "../../src/services/assessments/individual-exam-service";
import { studentHistoryRoutes } from "../../src/routes/student-history-routes";
import { publishOwnerPractice, revokeOwnerPractice, ownerManifestSelectionDigest } from "../../src/services/questions/owner-practice-publication";
import { ownerPracticeDigest } from "../../src/services/questions/owner-practice-release";
import { inventorySelect, toEligibleCandidate } from "../../src/repositories/prisma-initial-diagnostic-repository";
import cors from 'cors';
import { spawn } from 'node:child_process';
import { createAuthRoutes } from "../../src/routes/auth-routes";
import { createInstitutionRoutes } from "../../src/routes/institution-routes";
import { createQuestionReviewRoutes } from "../../src/routes/question-review-routes";
import { goalRoutes } from "../../src/routes/goals-reports-routes";

let server: Server;
let baseUrl: string;

async function createQuestionSet(authorId: string, discipline: string, count: number, isPublic = true) {
  const ids: string[] = [];
  for (let index = 0; index < count; index++) {
    const id = randomUUID();
    ids.push(id);
    await prisma.questao.create({
      data: {
        id,
        enunciado: `Enunciado de integração da questão ${index + 1} com extensão suficiente.`,
        disciplina: discipline,
        assunto: 'Assunto de integração',
        nivel: 'BASICO',
        fundamentacaoJuridica: 'Fundamentação original exclusiva para teste local.',
        autorId: authorId,
        publica: isPublic,
        origem: isPublic ? 'IA' : 'PROFESSOR',
        revisaoJuridicaEm: isPublic ? new Date() : null,
        revisorJuridicoId: isPublic ? authorId : null,
        revisaoPedagogicaEm: isPublic ? new Date() : null,
        revisorPedagogicoId: isPublic ? authorId : null,
        liberadaAcervoEm: isPublic ? new Date() : null,
        liberadaAcervoPorId: isPublic ? authorId : null,
        alternativas: {
          create: ['A', 'B', 'C', 'D'].map((letra, optionIndex) => ({
            letra: letra as LetraAlternativa,
            texto: `Alternativa ${letra} da questão ${index + 1}`,
            correta: optionIndex === 0,
          })),
        },
      },
    });
  }
  return ids;
}

async function request(method: string, path: string, token?: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

async function setupServer() {
  await assertDisposableDatabase(prisma);
  vi.stubEnv('QUESTION_PRACTICE_SCHEMA_ENABLED', 'true');
  await limparBanco();
  const app = express();
  app.use(cors({origin:'http://127.0.0.1:5187'}));
  app.use(express.json());
  app.use('/auth',createAuthRoutes());
  app.use('/institutions',createInstitutionRoutes());
  app.use('/question-review',createQuestionReviewRoutes());
  app.use('/goals',goalRoutes);
  // Enable only within this isolated integration server. This does not alter
  // the real process environment or the production feature flags.
  app.use('/question-practice', createQuestionPracticeRoutes({ isEnabled: () => true }));
  app.use('/students/me', studentHistoryRoutes);
  app.use(errorHandler);
  server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(setupServer);
afterAll(async () => { vi.unstubAllEnvs(); delete process.env.QUESTION_PRACTICE_PILOT_ENABLED; delete process.env.QUESTION_PRACTICE_PILOT_BATCH_ID; delete process.env.INDIVIDUAL_EXAM_PILOT_ENABLED; delete process.env.INDIVIDUAL_EXAM_PILOT_BATCH_ID; await encerrar(server); });

describe('question practice with disposable PostgreSQL', () => {
  it.each(['Direito Constitucional','Direito Civil','Direito Penal','Direito Administrativo','Direito do Trabalho'])('offers 5/10/20 only from eligible inventory and resumes without duplicates: %s', async discipline => {
    await assertDisposableDatabase(prisma); await limparBanco();
    const author = await criarUsuario('PROFESSOR');
    await createQuestionSet(author.id, discipline, 20);
    for (const quantity of [5,10,20]) {
      const student = await criarUsuario('ALUNO'), token = tokenPara(student);
      const availability = await request('GET', `/question-practice/catalog/${encodeURIComponent(discipline)}/availability?topic=${encodeURIComponent('Assunto de integração')}`, token);
      expect(availability.body).toMatchObject({ availableCount: 20, availableQuantities: [5,10,20] });
      const created = await request('POST', '/question-practice', token, { discipline, topic:'Assunto de integração', quantity });
      expect(created.status).toBe(201); expect(created.body.attempt.questions).toHaveLength(quantity);
      const resumed = await request('POST', '/question-practice', token, { discipline, topic:'Assunto de integração', quantity });
      expect(resumed.status).toBe(200); expect(resumed.body.attempt.id).toBe(created.body.attempt.id);
      expect(await prisma.sessaoPratica.count({ where: { alunoId:student.id } })).toBe(1);
    }
    await limparBanco();
  });
  it('shows pending public topic metadata without authorizing practice or exposing private topics', async () => {
    await assertDisposableDatabase(prisma);
    await limparBanco();
    const author = await criarUsuario('PROFESSOR'), student = await criarUsuario('ALUNO');
    const released = await createQuestionSet(author.id, 'Direito Civil', 5);
    const pending = await createQuestionSet(author.id, 'Direito Civil', 4);
    const hidden = await createQuestionSet(author.id, 'Direito Civil', 3, false);
    await prisma.questao.updateMany({ where: { id: { in: released } }, data: { assunto: 'Liberado no catálogo' } });
    await prisma.questao.updateMany({ where: { id: { in: pending } }, data: { assunto: 'Em revisão', liberadaAcervoEm: null, liberadaAcervoPorId: null } });
    await prisma.questao.updateMany({ where: { id: { in: hidden } }, data: { assunto: 'Privado oculto' } });
    const token = tokenPara(student);
    const base = '/question-practice/catalog/Direito%20Civil';
    const response = await request('GET', `${base}/availability`, token);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ eligibleCount: 5, availableCount: 5, availableQuantities: [5] });
    expect(response.body.topics).toEqual(expect.arrayContaining([
      { name: 'Liberado no catálogo', availableCount: 5, eligibleCount: 5, catalogCount: 5, pendingReviewCount: 0 },
      { name: 'Em revisão', availableCount: 0, eligibleCount: 0, catalogCount: 4, pendingReviewCount: 4 },
    ]));
    expect(JSON.stringify(response.body)).not.toContain('Privado oculto');
    expect(JSON.stringify(response.body)).not.toContain('Enunciado de integração');
    const filtered = await request('GET', `${base}/availability?topic=Em%20revis%C3%A3o`, token);
    expect(filtered.body).toMatchObject({ availableCount: 0, availableQuantities: [], availabilityReason: 'NO_ELIGIBLE_QUESTIONS' });
    expect(await prisma.sessaoPratica.count()).toBe(0);
    await limparBanco();
  });
  it.each([5, 10, 20])('completes and resumes a %i-question practice with eligible disposable fixtures', async quantity => {
    const author = await criarUsuario('PROFESSOR'), student = await criarUsuario('ALUNO');
    await createQuestionSet(author.id, 'Direito Administrativo', quantity);
    const token = tokenPara(student);
    const started = await request('POST', '/question-practice', token, { discipline: 'Direito Administrativo', quantity });
    expect(started.status).toBe(201);
    const { attempt } = started.body;
    expect(attempt.questions).toHaveLength(quantity);
    for (const question of attempt.questions) {
      const response = await request('PUT', `/question-practice/${attempt.id}/answers/${question.id}`, token,
        { alternativeId: question.alternatives[0].id });
      expect(response.status).toBe(200);
    }
    const recovered = await request('GET', `/question-practice/${attempt.id}`, token);
    expect(recovered.body.attempt.questions.every((q: { selectedOptionId: string | null }) => q.selectedOptionId)).toBe(true);
    const completed = await request('POST', `/question-practice/${attempt.id}/finalize`, token, {});
    expect(completed.status).toBe(200);
    expect(completed.body.result).toMatchObject({ total: quantity, correct: quantity });
    expect((await request('GET', `/question-practice/${attempt.id}/result`, token)).body.result).toEqual(completed.body.result);
    const history = await request('GET', '/students/me/activities', token);
    expect(history.status).toBe(200);
    expect(history.body.items.some((item: { id: string }) => item.id === attempt.id)).toBe(true);
    const performance = await request('GET', '/students/me/performance?kind=practice', token);
    expect(performance.status).toBe(200);
    expect(performance.body.totals).toMatchObject({ answered:quantity, correct:quantity, incorrect:0, activities:1, percentage:100 });
  });

  it('creates and resumes separate discipline sessions and filters private questions', async () => {
    const author = await criarUsuario('PROFESSOR');
    const student = await criarUsuario('ALUNO');
    const publicCivil = await createQuestionSet(author.id, 'Direito Civil', 5);
    const publicConstitutional = await createQuestionSet(author.id, 'Direito Constitucional', 5);
    const privateIds = await createQuestionSet(author.id, 'Direito Civil', 1, false);

    const repository = new PrismaQuestionPracticeRepository(prisma);
    const eligibleCivil = await repository.listEligibleQuestions('Direito Civil');
    expect(publicCivil.every(id => eligibleCivil.some(question => question.id === id))).toBe(true);
    expect(privateIds.every(id => !eligibleCivil.some(question => question.id === id))).toBe(true);

    const token = tokenPara(student);
    const civil = await request('POST', '/question-practice', token, { discipline: 'Direito Civil', topic: 'Assunto de integração', quantity: 5 });
    expect(civil.status).toBe(201);
    expect(civil.body.attempt.questions).toHaveLength(5);
    expect(civil.body.attempt.questions.every((question: { id: string }) => eligibleCivil.some(item => item.id === question.id))).toBe(true);
    expect(civil.body.attempt.questions.some((question: { id: string }) => privateIds.includes(question.id))).toBe(false);
    expect(JSON.stringify(civil.body)).not.toMatch(/correctOptionId|explanation|"correct"/);

    const resumed = await request('POST', '/question-practice', token, { discipline: 'Direito Civil', topic: 'Assunto de integração', quantity: 5 });
    expect(resumed.status).toBe(200);
    expect(resumed.body.resumed).toBe(true);
    expect(resumed.body.attempt.id).toBe(civil.body.attempt.id);
    const wrongTopic = await request('POST', '/question-practice', token, { discipline: 'Direito Civil', topic: 'Assunto inexistente', quantity: 5 });
    expect(wrongTopic.status).toBe(409);

    const eligibleConstitutional = await repository.listEligibleQuestions('Direito Constitucional');
    const constitutional = await request('POST', '/question-practice', token, { discipline: 'Direito Constitucional', quantity: 5 });
    expect(constitutional.status).toBe(201);
    expect(constitutional.body.attempt.id).not.toBe(civil.body.attempt.id);
    expect(publicConstitutional.every(id => eligibleConstitutional.some(question => question.id === id))).toBe(true);
    expect(constitutional.body.attempt.questions.every((question: { id: string }) => eligibleConstitutional.some(item => item.id === question.id))).toBe(true);
  });

  it('keeps questions answered only in the initial diagnostic available for practice', async () => {
    const author = await criarUsuario('PROFESSOR'), student = await criarUsuario('ALUNO');
    const ids = await createQuestionSet(author.id, 'Direito do Trabalho', 5);
    const answer = async (simuladoId: string, questionId: string, position: number) => {
      const link = await prisma.questaoSimulado.create({ data: { simuladoId, questaoId: questionId, posicao: position } });
      const option = await prisma.alternativa.findFirstOrThrow({ where: { questaoId: questionId, correta: true } });
      await prisma.resposta.create({ data: { simuladoId, questaoId: questionId, questaoSimuladoId: link.id, alternativaEscolhidaId: option.id, correta: true } });
    };
    const diagnostic = await prisma.simulado.create({ data: { tipo: 'DIAGNOSTICO', alunoId: student.id, finalizadoEm: new Date() } });
    await prisma.diagnosticoInicial.create({ data: { alunoId: student.id, simuladoId: diagnostic.id } });
    for (const [index, id] of ids.entries()) await answer(diagnostic.id, id, index + 1);

    const repository = new PrismaQuestionPracticeRepository(prisma);
    expect((await repository.listAnsweredQuestionIds(student.id, 'Direito do Trabalho')).size).toBe(0);
    const started = await request('POST', '/question-practice', tokenPara(student), { discipline: 'Direito do Trabalho', quantity: 5 });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    expect(started.body.attempt.questions.map((q: { id: string }) => q.id).sort()).toEqual([...ids].sort());

    // Answers from any other activity still count as already seen.
    const other = await prisma.simulado.create({ data: { tipo: 'PERSONALIZADO', alunoId: student.id, finalizadoEm: new Date() } });
    await answer(other.id, ids[0], 1);
    expect([...await repository.listAnsweredQuestionIds(student.id, 'Direito do Trabalho')]).toEqual([ids[0]]);
  });

  it('persists answers, corrects them on finalization, and rejects edits afterward', async () => {
    const author = await criarUsuario('PROFESSOR');
    const student = await criarUsuario('ALUNO');
    await createQuestionSet(author.id, 'Direito Penal', 5);
    const token = tokenPara(student);
    const started = await request('POST', '/question-practice', token, { discipline: 'Direito Penal', quantity: 5 });
    expect(started.status).toBe(201);

    const attempt = started.body.attempt;
    const savedAnswers: { questionId: string; alternativeId: string; correct: boolean }[] = [];
    for (const [index, question] of attempt.questions.entries()) {
      const options = await prisma.alternativa.findMany({
        where: { questaoId: question.id }, select: { id: true, correta: true }, orderBy: { letra: 'asc' },
      });
      const selected = options.find(option => option.correta === (index < 3))!;
      const saved = await request('PUT', `/question-practice/${attempt.id}/answers/${question.id}`, token, { alternativeId: selected.id });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      expect(saved.body).toMatchObject({ correct: selected.correta, explanation: expect.any(String), answeredCount: index + 1, totalQuestions: 5 });
      savedAnswers.push({ questionId: question.id, alternativeId: selected.id, correct: selected.correta });
    }

    const recovered = await request('GET', `/question-practice/${attempt.id}`, token);
    expect(recovered.status).toBe(200);
    for (const saved of savedAnswers) {
      expect(recovered.body.attempt.questions.find((question: { id: string }) => question.id === saved.questionId).selectedOptionId)
        .toBe(saved.alternativeId);
    }
    expect(recovered.body.attempt.questions.every((q: any) => q.feedback && typeof q.feedback.correct === 'boolean' && q.feedback.explanation)).toBe(true);
    expect((await request('PUT', `/question-practice/${attempt.id}/answers/${attempt.questions[0].id}`, token, { alternativeId: savedAnswers[0].alternativeId })).status).toBe(200);
    const different = attempt.questions[0].alternatives.find((a: any) => a.id !== savedAnswers[0].alternativeId).id;
    expect((await request('PUT', `/question-practice/${attempt.id}/answers/${attempt.questions[0].id}`, token, { alternativeId: different })).status).toBe(409);

    const finalized = await request('POST', `/question-practice/${attempt.id}/finalize`, token);
    expect(finalized.status).toBe(200);
    expect(finalized.body.result).toMatchObject({ total: 5, correct: 3, incorrect: 2, percentage: 60 });
    expect(finalized.body.result.answers.every((answer: { explanation: string }) => Boolean(answer.explanation))).toBe(true);

    const persistedSimulado = await prisma.simulado.findUnique({ where: { id: attempt.id }, select: { finalizadoEm: true } });
    expect(persistedSimulado?.finalizadoEm).toBeInstanceOf(Date);
    const persistedAnswers = await prisma.resposta.findMany({ where: { simuladoId: attempt.id }, select: { questaoId: true, alternativaEscolhidaId: true, correta: true } });
    expect(persistedAnswers).toHaveLength(5);
    expect(persistedAnswers.filter(answer => answer.correta)).toHaveLength(3);

    const repeated = await request('POST', `/question-practice/${attempt.id}/finalize`, token);
    expect(repeated.status).toBe(200);
    expect(repeated.body.result).toEqual(finalized.body.result);
    const editAfterCompletion = await request('PUT', `/question-practice/${attempt.id}/answers/${attempt.questions[0].id}`, token, {
      alternativeId: savedAnswers[0].alternativeId,
    });
    expect(editAfterCompletion.status).toBe(409);
  });

  it('enforces authentication, ALUNO role, and attempt ownership', async () => {
    const author = await criarUsuario('PROFESSOR');
    const owner = await criarUsuario('ALUNO');
    const otherStudent = await criarUsuario('ALUNO');
    const professor = await criarUsuario('PROFESSOR');
    await createQuestionSet(author.id, 'Direito Administrativo', 5);

    const unauthenticated = await request('POST', '/question-practice', undefined, { discipline: 'Direito Administrativo', quantity: 5 });
    expect(unauthenticated.status).toBe(401);
    const professorStart = await request('POST', '/question-practice', tokenPara(professor), { discipline: 'Direito Administrativo', quantity: 5 });
    expect(professorStart.status).toBe(403);

    const started = await request('POST', '/question-practice', tokenPara(owner), { discipline: 'Direito Administrativo', quantity: 5 });
    expect(started.status).toBe(201);
    const stolen = await request('GET', `/question-practice/${started.body.attempt.id}`, tokenPara(otherStudent));
    expect(stolen.status).toBe(404);
  });
  it('runs provisional practice with real draft snapshots and shared exam history without changing the student level', async () => {
    const operator = await criarUsuario('PROFESSOR'); await prisma.user.update({ where: { id: operator.id }, data: { role: 'ADMIN' } });
    const draft = JSON.parse(readFileSync(resolve('scripts/drafts/authorial-practice-60.draft.json'), 'utf8'));
    const imported = await importPracticeDrafts(prisma, draft, operator.id);
    process.env.QUESTION_PRACTICE_PILOT_ENABLED = 'true'; process.env.QUESTION_PRACTICE_PILOT_BATCH_ID = imported.batchId;
    process.env.INDIVIDUAL_EXAM_PILOT_ENABLED = 'true'; process.env.INDIVIDUAL_EXAM_PILOT_BATCH_ID = imported.batchId;
    const student = await criarUsuario('ALUNO'), token = tokenPara(student);
    const catalog = await request('GET', '/question-practice/catalog/Direito%20Civil/availability', token);
    expect(catalog.body).toMatchObject({ provisional: true, availableCount: 12, availableQuantities: [5, 10] });
    const selectableTopics = catalog.body.topics.filter((t: { eligibleCount: number }) => t.eligibleCount > 0);
    expect(selectableTopics).toHaveLength(2);
    expect(selectableTopics.every((t: { availableCount: number }) => t.availableCount === 6)).toBe(true);
    expect(catalog.body.topics.filter((t: { eligibleCount: number }) => t.eligibleCount === 0).every((t: { availableCount: number }) => t.availableCount === 0)).toBe(true);
    const topic = selectableTopics[0].name;
    const filtered = await request('GET', `/question-practice/catalog/Direito%20Civil/availability?topic=${encodeURIComponent(topic)}`, token);
    expect(filtered.body).toMatchObject({ availableCount: 6, availableQuantities: [5] });
    expect((await request('POST', '/question-practice', token, { discipline: 'Direito Civil', topic, quantity: 10 })).status).toBe(409);
    const started = await request('POST', '/question-practice', token, { discipline: 'Direito Civil', topic, quantity: 5 });
    expect(started.body.attempt.provisional).toBe(true);
    expect(started.body.attempt.topic).toBe(topic);
    expect((await request('GET', '/question-practice/catalog/Direito%20Civil/availability', token)).body.activeAttempt)
      .toMatchObject({ id: started.body.attempt.id, topic, quantity: 5 });
    const attempt = started.body.attempt, first = attempt.questions[0];
    await prisma.questao.update({ where: { id: first.id }, data: { fundamentacaoJuridica: 'Texto alterado apenas no banco isolado.' } });
    for (const q of attempt.questions) {
      const saved = await request('PUT', `/question-practice/${attempt.id}/answers/${q.id}`, token, { alternativeId: q.alternatives[0].id });
      expect(saved.status).toBe(200); expect(saved.body.provisional).toBe(true);
      if (q.id === first.id) expect(saved.body.explanation).not.toBe('Texto alterado apenas no banco isolado.');
    }
    expect((await request('GET', `/question-practice/${attempt.id}`, token)).body.attempt.questions.every((q: any) => q.feedback?.explanation)).toBe(true);
    const completions = await Promise.all(Array.from({ length: 3 }, () => request('POST', `/question-practice/${attempt.id}/finalize`, token)));
    expect(completions.every(r => r.status === 200 && r.body.result.provisional === true)).toBe(true);
    expect(completions[1].body.result).toEqual(completions[0].body.result);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).nivelAtual).toBe(student.nivelAtual);
    const examRepo = new PrismaIndividualExamRepository(prisma);
    expect((await examRepo.available(student.id)).filter(q => q.discipline === 'Direito Civil')).toHaveLength(7);
    const mixed = await new IndividualExamService(examRepo).start(student.id);
    const civilQuestion = mixed.attempt.questions.find(q => q.discipline === 'Direito Civil')!;
    await new IndividualExamService(examRepo).answer(student.id, mixed.attempt.id, civilQuestion.id, civilQuestion.alternatives[0].id);
    expect((await request('GET', '/question-practice/catalog/Direito%20Civil/availability', token)).body.availableCount).toBe(6);
    const [table] = await prisma.$queryRaw<{ rls: boolean }[]>`SELECT relrowsecurity AS rls FROM pg_class WHERE relname='SessaoPratica'`;
    expect(table.rls).toBe(true);
    expect(await prisma.questao.count({ where: { loteImportacaoId: imported.batchId, publica: false, revisaoJuridicaEm: null, revisaoPedagogicaEm: null, liberadaAcervoEm: null } })).toBe(60);
    process.env.QUESTION_PRACTICE_PILOT_ENABLED = 'false';
    expect((await request('GET', `/question-practice/${attempt.id}/result`, token)).body.result.provisional).toBe(true);
    process.env.INDIVIDUAL_EXAM_PILOT_ENABLED = 'false';
  });
  it('combines two explicitly allowed private batches and offers 20 by discipline or 10 by topic', async () => {
    const operator = await criarUsuario('PROFESSOR');
    await prisma.user.update({ where: { id: operator.id }, data: { role: 'ADMIN' } });
    const first = await importPracticeDrafts(prisma, JSON.parse(readFileSync(resolve('scripts/drafts/authorial-practice-60.draft.json'), 'utf8')), operator.id);
    const second = await importPracticeDrafts(prisma, JSON.parse(readFileSync(resolve('scripts/drafts/authorial-practice-expansion-60.draft.json'), 'utf8')), operator.id);
    process.env.QUESTION_PRACTICE_PILOT_ENABLED = 'true';
    process.env.INDIVIDUAL_EXAM_PILOT_ENABLED = 'true';
    process.env.QUESTION_PRACTICE_PILOT_BATCH_IDS = `${first.batchId},${second.batchId}`;
    process.env.INDIVIDUAL_EXAM_PILOT_BATCH_IDS = `${first.batchId},${second.batchId}`;
    try {
      const student = await criarUsuario('ALUNO'), token = tokenPara(student);
      const catalog = await request('GET', '/question-practice/catalog/Direito%20Civil/availability', token);
      expect(catalog.body).toMatchObject({ provisional: true, availableCount: 24, availableQuantities: [5, 10, 20] });
      const selectableTopics = catalog.body.topics.filter((t: { eligibleCount: number }) => t.eligibleCount > 0);
      expect(selectableTopics).toHaveLength(2);
      expect(selectableTopics.every((t: { availableCount: number }) => t.availableCount === 12)).toBe(true);
      expect(catalog.body.topics.filter((t: { eligibleCount: number }) => t.eligibleCount === 0).every((t: { availableCount: number }) => t.availableCount === 0)).toBe(true);
      const topic = selectableTopics[0].name;
      const started = await request('POST', '/question-practice', token, { discipline: 'Direito Civil', topic, quantity: 10 });
      expect(started.status).toBe(201);
      expect(started.body.attempt).toMatchObject({ provisional: true, topic });
      expect(started.body.attempt.questions).toHaveLength(10);
      const eligible = await new PrismaIndividualExamRepository(prisma).available(student.id);
      expect(eligible).toHaveLength(120);
      expect(await prisma.questao.count({ where: { loteImportacaoId: { in: [first.batchId, second.batchId] }, publica: false, revisaoJuridicaEm: null, revisaoPedagogicaEm: null, liberadaAcervoEm: null } })).toBe(120);
    } finally {
      delete process.env.QUESTION_PRACTICE_PILOT_BATCH_IDS;
      delete process.env.INDIVIDUAL_EXAM_PILOT_BATCH_IDS;
    }
  });
});

async function ownerFixture(quantity:number){
  await assertDisposableDatabase(prisma); await limparBanco();
  vi.stubEnv('QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED','true');
  vi.stubEnv('QUESTION_PRACTICE_PILOT_ENABLED','false'); vi.stubEnv('QUESTION_PRACTICE_PILOT_BATCH_IDS',''); vi.stubEnv('QUESTION_PRACTICE_PILOT_BATCH_ID','');
  const author=await criarUsuario('PROFESSOR'), student=await criarUsuario('ALUNO');
  const owner=await criarUsuario('ALUNO');await prisma.user.update({where:{id:owner.id},data:{role:'ADMIN'}});
  const ids=await createQuestionSet(author.id,'Direito Civil',quantity);
  await prisma.questao.updateMany({where:{id:{in:ids}},data:{revisaoJuridicaEm:null,revisorJuridicoId:null,revisaoPedagogicaEm:null,revisorPedagogicoId:null,liberadaAcervoEm:null,liberadaAcervoPorId:null,licencaOuAutorizacao:'PENDENTE'}});
  const rows=await prisma.questao.findMany({where:{id:{in:ids}},select:inventorySelect});
  const questions=rows.map(q=>({id:q.id,contentDigest:ownerPracticeDigest(q)}));
  const manifest={candidateCount:quantity,questions,selectionSha256:ownerManifestSelectionDigest(questions)};
  return {owner,student,ids,manifest};
}
it.each([5,10,20])('owner authorization supports %i-question training without fake reviews and revokes new selection without losing history',async quantity=>{
  const f=await ownerFixture(quantity), repo=new PrismaQuestionPracticeRepository(prisma);
  expect(await repo.listEligibleQuestions('Direito Civil')).toHaveLength(0);
  const release=await publishOwnerPractice(prisma,f.manifest,f.owner.email,'Explicit owner authorization in isolated test');
  expect(release.published).toBe(quantity);
  expect((await publishOwnerPractice(prisma,f.manifest,f.owner.email,'Explicit owner authorization in isolated test')).alreadyPublished).toBe(quantity);
  expect(await prisma.administrativeEvent.count()).toBe(quantity);
  expect(await repo.listEligibleQuestions('Direito Civil')).toHaveLength(quantity);
  expect((await repo.listCatalogTopics('Direito Civil'))[0].pendingReviewCount).toBe(0);
  const token=tokenPara(f.student);
  const started=await request('POST','/question-practice',token,{discipline:'Direito Civil',quantity});
  expect(started.status).toBe(201);const id=started.body.attempt.id;
  await revokeOwnerPractice(prisma,release.batchId,f.owner.email,'Reversal test preserving student data');
  expect(await repo.listEligibleQuestions('Direito Civil')).toHaveLength(0);
  const resumed=await request('POST','/question-practice',token,{discipline:'Direito Civil',quantity});
  expect(resumed.status).toBe(200); expect(resumed.body.attempt.id).toBe(id);
  for(const q of resumed.body.attempt.questions)expect((await request('PUT',`/question-practice/${id}/answers/${q.id}`,token,{alternativeId:q.alternatives[0].id})).status).toBe(200);
  expect((await request('POST',`/question-practice/${id}/finalize`,token,{})).body.result).toMatchObject({total:quantity,correct:quantity});
  expect((await request('GET','/students/me/activities',token)).body.items.some((q:{id:string})=>q.id===id)).toBe(true);
  expect((await request('GET','/students/me/performance?kind=practice',token)).body.totals).toMatchObject({correct:quantity,activities:1});
  const fresh=await criarUsuario('ALUNO');expect((await request('POST','/question-practice',tokenPara(fresh),{discipline:'Direito Civil',quantity})).status).toBe(409);
  const rows=await prisma.questao.findMany({where:{id:{in:f.ids}},select:inventorySelect});
  expect(rows.every(q=>!q.revisaoJuridicaEm&&!q.revisaoPedagogicaEm&&!q.liberadaAcervoEm&&q.licencaOuAutorizacao==='PENDENTE'&&!toEligibleCandidate(q))).toBe(true);
  await expect(publishOwnerPractice(prisma,f.manifest,f.owner.email,'Retry revoked batch test')).rejects.toThrow('revogado');
});
it('owner release rejects private, changed, duplicate and published-exam content atomically and excludes it after subsequent changes',async()=>{
  const f=await ownerFixture(5);
  await expect(publishOwnerPractice(prisma,f.manifest,f.student.email,'Unauthorized student test')).rejects.toThrow('ADMIN');
  for(const data of [{publica:false},{fundamentacaoJuridica:'Changed explanation'}]){
    const prior=await prisma.questao.findUniqueOrThrow({where:{id:f.ids[0]}});
    await prisma.questao.update({where:{id:f.ids[0]},data});
    await expect(publishOwnerPractice(prisma,f.manifest,f.owner.email,'Owner isolated authorization')).rejects.toThrow('impedimentos');
    await prisma.questao.update({where:{id:f.ids[0]},data:{publica:prior.publica,fundamentacaoJuridica:prior.fundamentacaoJuridica}});
  }
  const original=await prisma.questao.findUniqueOrThrow({where:{id:f.ids[1]}});
  const first=await prisma.questao.findUniqueOrThrow({where:{id:f.ids[0]}});
  await prisma.questao.update({where:{id:f.ids[1]},data:{enunciado:first.enunciado}});
  await expect(publishOwnerPractice(prisma,f.manifest,f.owner.email,'Duplicate content rejection')).rejects.toThrow('impedimentos');
  await prisma.questao.update({where:{id:f.ids[1]},data:{enunciado:original.enunciado}});
  await expect(publishOwnerPractice(prisma,{...f.manifest,selectionSha256:'f'.repeat(64)},f.owner.email,'Tampered manifest test')).rejects.toThrow('inválidos');
  const exam=await prisma.avaliacao.create({data:{titulo:'Published isolated exam',autorId:f.owner.id,publishedAt:new Date(),questoes:{create:{questaoId:f.ids[0],posicao:1}}}});
  await expect(publishOwnerPractice(prisma,f.manifest,f.owner.email,'Owner isolated authorization')).rejects.toThrow('impedimentos');
  expect(await prisma.administrativeEvent.count()).toBe(0);
  // Only isolated fixtures are updated; no existing exam is touched.
  await prisma.avaliacao.update({where:{id:exam.id},data:{publishedAt:null}});
  const published=await publishOwnerPractice(prisma,f.manifest,f.owner.email,'Owner isolated authorization');
  expect(published.published).toBe(5);
  await prisma.questao.update({where:{id:f.ids[0]},data:{fundamentacaoJuridica:'Version changed after authorization'}});
  expect(await new PrismaQuestionPracticeRepository(prisma).listEligibleQuestions('Direito Civil')).toHaveLength(4);
  await prisma.avaliacao.update({where:{id:exam.id},data:{publishedAt:new Date()}});
  vi.stubEnv('QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED','false');
  expect(await new PrismaQuestionPracticeRepository(prisma).listEligibleQuestions('Direito Civil')).toHaveLength(0);
});

it('rolls back the entire owner batch on audit failure, keeps flags independent and fails closed on malformed events',async()=>{
  const f=await ownerFixture(5);
  const failing={ $transaction: (work:(tx:unknown)=>Promise<unknown>,options:never)=>prisma.$transaction(async tx=>work(new Proxy(tx,{get(target,key){
    if(key==='administrativeEvent')return {...target.administrativeEvent,createMany:async(args:never)=>{await target.administrativeEvent.createMany(args);throw new Error('Simulated failure after audit insertion');}};
    return Reflect.get(target,key);
  }})),options) };
  await expect(publishOwnerPractice(failing as never,f.manifest,f.owner.email,'Isolated rollback verification')).rejects.toThrow('Simulated failure');
  expect(await prisma.administrativeEvent.count()).toBe(0);
  await publishOwnerPractice(prisma,f.manifest,f.owner.email,'Isolated complete owner authorization');
  expect(await new PrismaQuestionPracticeRepository(prisma).listEligibleQuestions('Direito Civil')).toHaveLength(5);
  await prisma.administrativeEvent.create({data:{event:'OWNER_AUTHORIZED_PRACTICE_RELEASE',actorId:f.owner.id,resourceId:f.ids[0],result:'null'}});
  expect(await new PrismaQuestionPracticeRepository(prisma).listEligibleQuestions('Direito Civil')).toHaveLength(5);
  await prisma.user.update({where:{id:f.owner.id},data:{role:'ALUNO'}});
  expect(await new PrismaQuestionPracticeRepository(prisma).listEligibleQuestions('Direito Civil')).toHaveLength(0);
});

it('completes five-question practice in all five disciplines and a separate Civil review through the real browser',async()=>{
  const f=await ownerFixture(6);const author=(await prisma.questao.findUniqueOrThrow({where:{id:f.ids[0]}})).autorId;
  for(const discipline of ['Direito Constitucional','Direito Administrativo','Direito Penal','Direito do Trabalho'])await createQuestionSet(author,discipline,discipline==='Direito Administrativo'?5:6);
  const rows=await prisma.questao.findMany({select:{id:true,disciplina:true}});
  for(const q of rows)await prisma.questao.update({where:{id:q.id},data:{enunciado:`Enunciado isolado suficientemente completo de ${q.disciplina}: ${q.id}`,assunto:`Assunto isolado ${q.id}`,revisaoJuridicaEm:null,revisorJuridicoId:null,revisaoPedagogicaEm:null,revisorPedagogicoId:null,liberadaAcervoEm:null,liberadaAcervoPorId:null}});
  const inventory=await prisma.questao.findMany({select:inventorySelect}),questions=inventory.map(q=>({id:q.id,contentDigest:ownerPracticeDigest(q)}));
  await publishOwnerPractice(prisma,{candidateCount:29,questions,selectionSha256:ownerManifestSelectionDigest(questions)},f.owner.email,'Isolated browser owner authorization');
  const email='student-practice@example.invalid';await prisma.user.update({where:{id:f.student.id},data:{email}});
  vi.stubEnv('QUESTION_REVIEW_SCHEMA_ENABLED','true');vi.stubEnv('QUESTION_REVIEW_API_ENABLED','true');vi.stubEnv('CORS_ORIGINS','http://127.0.0.1:5187');
  await new Promise<void>((resolveDone,reject)=>{
    let output='';const child=spawn(process.execPath,[resolve('../frontend/tests/test-student-practice-db.mjs')],{cwd:resolve('../frontend'),windowsHide:true,env:{...process.env,JURISSIM_DB_UI_API:baseUrl,JURISSIM_DB_UI_OWNER:email,JURISSIM_DB_UI_PASSWORD:'senha-de-teste',GOOGLE_CLIENT_ID:''},stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',chunk=>{output+=String(chunk);});child.stderr.on('data',chunk=>{output+=String(chunk);});child.once('error',reject);child.once('close',code=>code===0?resolveDone():reject(Error('Isolated student browser: '+output.slice(-6000))));
  });
  expect(await prisma.simulado.count({where:{alunoId:f.student.id,finalizadoEm:{not:null}}})).toBe(5);
  expect(await prisma.resposta.count({where:{simulado:{alunoId:f.student.id}}})).toBe(25);
  expect(await prisma.sessaoRevisaoQuestao.count({where:{alunoId:f.student.id,disciplina:'Direito Civil',finalizadaEm:{not:null}}})).toBe(1);
},120000);
