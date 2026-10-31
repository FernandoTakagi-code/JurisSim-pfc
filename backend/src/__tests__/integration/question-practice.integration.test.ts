import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { LetraAlternativa } from '@prisma/client';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorHandler } from '../../middlewares/error-handler';
import { createQuestionPracticeRoutes } from '../../routes/question-practice-routes';
import { PrismaQuestionPracticeRepository } from '../../repositories/prisma-question-practice-repository';
import { assertDisposableDatabase } from './disposable-database';
import { criarUsuario, encerrar, prisma, tokenPara } from './helpers';

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
  const app = express();
  app.use(express.json());
  // Enable only within this isolated integration server. This does not alter
  // the real process environment or the production feature flags.
  app.use('/question-practice', createQuestionPracticeRoutes({ isEnabled: () => true }));
  app.use(errorHandler);
  server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(setupServer);
afterAll(async () => { await encerrar(server); });

describe('question practice with disposable PostgreSQL', () => {
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
    expect(JSON.stringify(recovered.body)).not.toMatch(/correctOptionId|explanation|"correct"/);

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
});
