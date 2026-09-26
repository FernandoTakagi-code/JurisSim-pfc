import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import bcrypt from 'bcrypt';

const mocks = vi.hoisted(() => ({
  user: vi.fn(), recordLogin: vi.fn(), diagnostic: vi.fn(), trail: vi.fn(), questions: vi.fn(),
  create: vi.fn(), attempt: vi.fn(), answer: vi.fn(), finalize: vi.fn(), level: vi.fn(),
}));
// Only persistence is mocked: use the actual server, login, middleware,
// routers, controllers, services and adaptive engine.
vi.mock('../repositories/auth-repository', () => ({ AuthRepository: class { findByEmail = mocks.user; recordLogin = mocks.recordLogin; } }));
vi.mock('../repositories/diagnostic-repository', () => ({ DiagnosticRepository: class { findAttempt = mocks.diagnostic; } }));
vi.mock('../repositories/trail-repository', () => ({ TrailRepository: class {
  findTrilha = mocks.trail;
  findQuestionsForTrail = mocks.questions;
  createTrailAttempt = mocks.create;
  findAttempt = mocks.attempt;
  saveAnswer = mocks.answer;
  finalize = mocks.finalize;
} }));
vi.mock('../repositories/student-repository', () => ({ StudentRepository: class { updateLevel = mocks.level; } }));

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  diagnostic: '00000000-0000-4000-8000-000000000002',
  trail: '00000000-0000-4000-8000-000000000003',
  attempt: '00000000-0000-4000-8000-000000000004',
  question: '00000000-0000-4000-8000-000000000005',
  alternative: '00000000-0000-4000-8000-000000000006',
};
const trail = {
  id: ids.trail, disciplinaPrioritaria: 'Civil', assuntoPrioritario: 'Contratos',
  nivelRecomendado: 'BASICO', quantidadeRecomendada: 10, simuladoGeradoId: null,
  simulado: { alunoId: ids.user },
};
function attempt(answered = false) {
  return {
    id: ids.attempt, alunoId: ids.user, finalizadoEm: null, iniciadoEm: new Date(),
    questoes: [{
      id: 'attempt-question', posicao: 1, questaoId: ids.question,
      resposta: answered ? { correta: true, alternativaEscolhidaId: ids.alternative } : null,
      questao: { id: ids.question, enunciado: 'Questão de teste', disciplina: 'Civil', assunto: 'Contratos', nivel: 'BASICO',
        alternativas: [{ id: ids.alternative, texto: 'Resposta', correta: true }] },
    }],
  };
}

let server: Server | undefined;
let base: string;
let token: string;
const otherTokens: Record<string, string> = {};

beforeAll(async () => {
  process.env.JWT_SECRET = 'chave-apenas-de-teste-das-rotas-de-trilhas';
  process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
  process.env.DIRECT_URL ||= process.env.DATABASE_URL;
  mocks.user.mockResolvedValue({ id: ids.user, nome: 'Aluno', email: 'aluno@example.com', role: 'ALUNO', senhaHash: await bcrypt.hash('senha-teste', 4) });
  // Import server.ts itself so removing its app.use('/trilhas', ...) breaks this test.
  // Replace only listen's port/bind address; no production changes for testability.
  const listen = vi.spyOn(express.application, 'listen').mockImplementation(function (this: express.Express) {
    server = createServer(this);
    server.listen(0, '127.0.0.1');
    return server;
  });
  try { await import('../server'); } finally { listen.mockRestore(); }
  if (!server) throw new Error('O servidor não iniciou.');
  if (!server.listening) await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'aluno@example.com', senha: 'senha-teste' }),
  });
  expect(response.status).toBe(200);
  token = (await response.json()).token;
  for (const role of ['ALUNO', 'PROFESSOR', 'ADMIN']) {
    mocks.user.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000099', nome: 'Outro usuário', email: 'outro@example.com', role, senhaHash: await bcrypt.hash('senha-teste', 4) });
    const otherLogin = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'outro@example.com', senha: 'senha-teste' }),
    });
    expect(otherLogin.status).toBe(200);
    otherTokens[role] = (await otherLogin.json()).token;
  }
});

afterAll(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.diagnostic.mockResolvedValue({ ...attempt(true), id: ids.diagnostic, finalizadoEm: new Date(), trilhaAdaptativa: trail });
  mocks.trail.mockResolvedValue(trail);
  mocks.questions.mockResolvedValue([{ id: ids.question }]);
  mocks.create.mockResolvedValue(attempt());
  mocks.attempt.mockResolvedValue(attempt());
  mocks.answer.mockResolvedValue(undefined);
  mocks.finalize.mockResolvedValue(true);
  mocks.level.mockResolvedValue(undefined);
});

const endpoints = [
  ['POST', `/trilhas/${ids.trail}/gerar`],
  ['GET', `/trilhas/attempts/${ids.attempt}/questions`],
  ['PUT', `/trilhas/attempts/${ids.attempt}/answers/${ids.question}`],
  ['POST', `/trilhas/attempts/${ids.attempt}/finalize`],
];

describe('rotas de trilhas montadas no servidor real', () => {
  it.each(endpoints)('%s %s nega acesso a terceiros sem aceitar identidade enviada pelo cliente', async (method, path) => {
    for (const role of ['ALUNO', 'PROFESSOR', 'ADMIN']) {
      const response = await fetch(`${base}${path}?userId=${ids.user}&alunoId=${ids.user}`, {
        method,
        headers: { Authorization: `Bearer ${otherTokens[role]}`, 'Content-Type': 'application/json' },
        ...(method !== 'GET' ? { body: JSON.stringify({ selectedOptionId: ids.alternative, userId: ids.user, alunoId: ids.user, role: 'ADMIN' }) } : {}),
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ message: 'Acesso negado a trilha de outro usuario.' });
    }
    expect(mocks.questions).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.answer).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.level).not.toHaveBeenCalled();
  });

  it.each(endpoints)('%s %s exige token (401, não 404)', async (method, path) => {
    const headerCases: Record<string, string>[] = [{}, { Authorization: 'Bearer invalido' }];
    for (const headers of headerCases) {
      const response = await fetch(`${base}${path}`, { method, headers });
      expect(response.status).toBe(401);
    }
    expect(mocks.trail).not.toHaveBeenCalled();
    expect(mocks.attempt).not.toHaveBeenCalled();
  });

  it('usa token do login oficial em diagnóstico → trilha → questões → resposta → finalização', async () => {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const diagnostic = await fetch(`${base}/diagnostics/${ids.diagnostic}/trail`, { headers });
    expect(diagnostic.status).toBe(200);
    const { trail: recommendation } = await diagnostic.json();
    expect(recommendation.id).toBe(ids.trail);
    expect(mocks.diagnostic).toHaveBeenCalledWith(ids.diagnostic, ids.user);

    const generated = await fetch(`${base}/trilhas/${recommendation.id}/gerar`, { method: 'POST', headers });
    expect(generated.status).toBe(201);
    const session = await generated.json();
    expect(session.id).toBe(ids.attempt);
    expect(mocks.create).toHaveBeenCalledWith(ids.user, ids.trail, [ids.question]);

    const questions = await fetch(`${base}/trilhas/attempts/${session.id}/questions`, { headers });
    expect(questions.status).toBe(200);
    const body = await questions.json();
    expect(body.questions[0].id).toBe(ids.question);
    expect(body.questions[0].alternatives[0]).not.toHaveProperty('correta');

    const answered = await fetch(`${base}/trilhas/attempts/${session.id}/answers/${body.questions[0].id}`, {
      method: 'PUT', headers, body: JSON.stringify({ selectedOptionId: ids.alternative }),
    });
    expect(answered.status).toBe(200);
    expect(mocks.answer).toHaveBeenCalledWith(ids.attempt, ids.question, 'attempt-question', ids.alternative, true);

    mocks.attempt.mockResolvedValue(attempt(true));
    const finalized = await fetch(`${base}/trilhas/attempts/${session.id}/finalize`, { method: 'POST', headers });
    expect(finalized.status).toBe(200);
    expect((await finalized.json()).overallPercentage).toBe(100);
    expect(mocks.level).toHaveBeenCalledWith(ids.user, 'AVANCADO');
  });

  it('preserva 404 de negócio para trilha inexistente, distinguindo-o de rota ausente', async () => {
    mocks.trail.mockResolvedValue(null);
    const response = await fetch(`${base}/trilhas/${ids.trail}/gerar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: 'Trilha adaptativa nao encontrada.' });
    expect(mocks.trail).toHaveBeenCalledWith(ids.trail);
  });
});
