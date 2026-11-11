import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { DiagnosticService } from '../../services/diagnostic-service';
import { TrailService } from '../../services/trail-service';
import { TrailRepository } from '../../repositories/trail-repository';
import { PrismaQuestionPracticeRepository } from '../../repositories/prisma-question-practice-repository';
import { PrismaInitialDiagnosticResolutionRepository } from '../../repositories/prisma-initial-diagnostic-resolution-repository';
import { analyzeDiagnostic } from '../../services/adaptive-engine';
import { StudentHistoryRepository } from '../../repositories/student-history-repository';
import { criarUsuario, limparBanco, prisma, encerrar } from './helpers';

// The integration config and limparBanco both validate the harness-owned local
// database before fixtures are written. No dotenv, external URLs or providers.
beforeEach(limparBanco);
afterAll(() => encerrar());

async function fixture() {
  const owner = await criarUsuario('ALUNO');
  const author = await criarUsuario('PROFESSOR');
  const questions = [];
  for (let i = 0; i < 7; i++) questions.push(await prisma.questao.create({ data: {
    enunciado: `Questão isolada de regressão ${i}`, disciplina: 'Direito Civil', assunto: 'Contratos',
    nivel: 'BASICO', publica: true, fundamentacaoJuridica: 'Fixture técnica, não é acervo.', autorId: author.id,
    alternativas: { create: [{ texto: 'Correta', correta: true }, { texto: 'Incorreta', correta: false }] },
  }, include: { alternativas: true } }));
  const diagnostics = new DiagnosticService();
  const initial = await diagnostics.start(owner.id, 30);
  await diagnostics.answer(initial.id, owner.id, questions[0].id, questions[0].alternativas.find(a => a.correta)!.id);
  return { owner, questions, initial, diagnostics };
}

async function generated() {
  const f = await fixture();
  await f.diagnostics.finalize(f.initial.id, f.owner.id);
  const trail = await f.diagnostics.getTrail(f.initial.id, f.owner.id);
  const service = new TrailService();
  const attempt = await service.generate(trail.id, f.owner.id);
  await service.answer(attempt.id, f.owner.id, f.questions[0].id, f.questions[0].alternativas.find(a => a.correta)!.id);
  return { ...f, trail, service, attempt };
}

function failingClient(model: 'user' | 'trilhaAdaptativa'): PrismaClient {
  return new Proxy(prisma, { get(target, property) {
    if (property !== '$transaction') return Reflect.get(target, property);
    return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => target.$transaction(tx => work(new Proxy(tx, {
      get(inner, key) {
        if (key !== model) return Reflect.get(inner, key);
        return new Proxy(Reflect.get(inner, key), { get(delegate, method) {
          if (method === 'update') return async () => { throw new Error('Falha intermediária isolada'); };
          return Reflect.get(delegate, method);
        } });
      },
    })), options);
  } });
}

describe('P0 · ciclo de tentativas com PostgreSQL descartável real', () => {
  it('preserva as sete questões legadas e retoma o início após timeout ou concorrência', async () => {
    const f = await fixture();
    const [a, b] = await Promise.all([f.diagnostics.start(f.owner.id, 30), f.diagnostics.start(f.owner.id, 30)]);
    expect(a.id).toBe(f.initial.id); expect(b.id).toBe(a.id);
    const questions = await f.diagnostics.getQuestions(a.id, f.owner.id);
    expect(questions).toHaveLength(7);
    expect(questions[0].selectedOptionId).toBeTruthy();
    for (const question of questions) {
      expect(question).not.toHaveProperty('fundamentacaoJuridica');
      for (const alternative of question.alternatives) expect(Object.keys(alternative).sort()).toEqual(['id', 'text']);
    }
  });

  it('gera uma única trilha para solicitações simultâneas e retries', async () => {
    const f = await fixture(); await f.diagnostics.finalize(f.initial.id, f.owner.id);
    const trail = await f.diagnostics.getTrail(f.initial.id, f.owner.id), service = new TrailService();
    const results = await Promise.all(Array.from({ length: 4 }, () => service.generate(trail.id, f.owner.id)));
    expect(new Set(results.map(r => r.id)).size).toBe(1);
    expect((await service.generate(trail.id, f.owner.id)).id).toBe(results[0].id);
    expect(await prisma.simulado.count({ where: { tipo: 'PERSONALIZADO' } })).toBe(1);
  });

  it('rollback da geração não deixa tentativa órfã; retry recupera o vínculo', async () => {
    const f = await fixture(); await f.diagnostics.finalize(f.initial.id, f.owner.id);
    const trail = await f.diagnostics.getTrail(f.initial.id, f.owner.id);
    await expect(new TrailRepository(failingClient('trilhaAdaptativa')).createTrailAttempt(f.owner.id, trail.id, [f.questions[0].id])).rejects.toThrow('Falha intermediária');
    expect(await prisma.simulado.count({ where: { tipo: 'PERSONALIZADO' } })).toBe(0);
    expect((await prisma.trilhaAdaptativa.findUniqueOrThrow({ where: { id: trail.id } })).simuladoGeradoId).toBeNull();
    expect((await new TrailService().generate(trail.id, f.owner.id)).questoes.length).toBeGreaterThan(0);
  });

  it('falha após finalizar trilha reverte tentativa, métricas e nível na mesma transação', async () => {
    const f = await generated(), prior = await prisma.user.findUniqueOrThrow({ where: { id: f.owner.id } });
    const service = new TrailService(new TrailRepository(failingClient('user')));
    await expect(service.finalize(f.attempt.id, f.owner.id)).rejects.toThrow('Falha intermediária');
    expect((await prisma.simulado.findUniqueOrThrow({ where: { id: f.attempt.id } })).finalizadoEm).toBeNull();
    expect(await prisma.desempenhoDiagnostico.count({ where: { simuladoId: f.attempt.id } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.owner.id } })).nivelAtual).toBe(prior.nivelAtual);
    await expect(f.service.finalize(f.attempt.id, f.owner.id)).resolves.toHaveProperty('level');
  });

  it('finalização concorrente de trilha é idempotente e não regrava o nível em retry antigo', async () => {
    const f = await generated();
    const results = await Promise.all(Array.from({ length: 4 }, () => f.service.finalize(f.attempt.id, f.owner.id)));
    expect(results.every(r => r.level === results[0].level)).toBe(true);
    const count = await prisma.desempenhoDiagnostico.count({ where: { simuladoId: f.attempt.id } });
    expect(count).toBe(analyzeDiagnostic(f.attempt.questoes.map(q => ({ discipline: q.questao.disciplina,
      topic: q.questao.assunto, difficulty: q.questao.nivel, isCorrect: q.questaoId === f.questions[0].id }))).performances.length);
    await prisma.user.update({ where: { id: f.owner.id }, data: { nivelAtual: 'AVANCADO' } });
    await f.service.finalize(f.attempt.id, f.owner.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.owner.id } })).nivelAtual).toBe('AVANCADO');
    expect(await prisma.desempenhoDiagnostico.count({ where: { simuladoId: f.attempt.id } })).toBe(count);
  });

  it('retry da última resposta é seguro e uma resposta diferente não sobrescreve a salva', async () => {
    const f = await generated(), q = f.questions[0], correct = q.alternativas.find(a => a.correta)!.id;
    await Promise.all([f.service.answer(f.attempt.id, f.owner.id, q.id, correct), f.service.answer(f.attempt.id, f.owner.id, q.id, correct)]);
    await expect(f.service.answer(f.attempt.id, f.owner.id, q.id, q.alternativas.find(a => !a.correta)!.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(await prisma.resposta.count({ where: { simuladoId: f.attempt.id } })).toBe(1);
    await f.service.finalize(f.attempt.id, f.owner.id);
    await expect(f.service.answer(f.attempt.id, f.owner.id, q.id, correct)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('serializa resposta concorrente à finalização e mantém o resultado consistente', async () => {
    const f = await generated(), q = f.questions[1];
    await Promise.allSettled([f.service.answer(f.attempt.id, f.owner.id, q.id, q.alternativas.find(a => a.correta)!.id), f.service.finalize(f.attempt.id, f.owner.id)]);
    const stored = await prisma.resposta.count({ where: { simuladoId: f.attempt.id, correta: true } });
    expect((await f.service.getResult(f.attempt.id, f.owner.id)).correctAnswers).toBe(stored);
  });

  it('não permite usar identidade inicial nos contratos legados e preserva seu histórico', async () => {
    const f = await generated();
    await prisma.diagnosticoInicial.create({ data: { alunoId: f.owner.id, simuladoId: f.initial.id } });
    const before = await prisma.simulado.findUniqueOrThrow({ where: { id: f.initial.id }, include: { desempenhosDiagnostico: true, trilhaAdaptativa: true } });
    expect(await new StudentHistoryRepository().overview(f.owner.id)).toMatchObject({ latestDiagnosticId: f.initial.id, latestDiagnosticInitial: true });
    for (const run of [() => f.diagnostics.getQuestions(f.initial.id, f.owner.id), () => f.diagnostics.getResult(f.initial.id, f.owner.id),
      () => f.diagnostics.finalize(f.initial.id, f.owner.id), () => f.diagnostics.answer(f.initial.id, f.owner.id, f.questions[0].id, f.questions[0].alternativas[0].id)]) {
      await expect(run()).rejects.toMatchObject({ statusCode: 404 });
    }
    await f.service.finalize(f.attempt.id, f.owner.id);
    expect(await prisma.simulado.findUniqueOrThrow({ where: { id: f.initial.id }, include: { desempenhosDiagnostico: true, trilhaAdaptativa: true } })).toEqual(before);
  });

  it('isola prática, trilha, diagnóstico, avaliação e proprietários nos repositórios', async () => {
    const f = await generated(), other = await criarUsuario('ALUNO');
    const practice = await prisma.simulado.create({ data: { tipo: 'PERSONALIZADO', alunoId: f.owner.id,
      sessaoPratica: { create: { disciplina: 'Direito Civil' } } } });
    const exam = await prisma.simulado.create({ data: { tipo: 'AVALIACAO', alunoId: f.owner.id } });
    for (const id of [practice.id, f.initial.id, exam.id]) {
      await expect(f.service.getQuestions(id, f.owner.id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(f.service.finalize(id, f.owner.id)).rejects.toMatchObject({ statusCode: 404 });
    }
    const repo = new PrismaQuestionPracticeRepository();
    expect(await repo.findAttempt(f.owner.id, f.attempt.id)).toBeNull();
    expect(await repo.findAttempt(other.id, practice.id)).toBeNull();
    expect(await new PrismaInitialDiagnosticResolutionRepository().findOwnedAttempt(f.owner.id, f.initial.id)).toBeNull();
    await expect(f.service.getQuestions(f.attempt.id, other.id)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rollback da prática inclui nível e finalização, permitindo retry', async () => {
    const f = await fixture(), q = f.questions[0];
    const practice = await prisma.simulado.create({ data: { tipo: 'PERSONALIZADO', alunoId: f.owner.id,
      sessaoPratica: { create: { disciplina: 'Direito Civil' } },
      questoes: { create: { questaoId: q.id, posicao: 1 } } }, include: { questoes: true } });
    await prisma.resposta.create({ data: { simuladoId: practice.id, questaoId: q.id,
      questaoSimuladoId: practice.questoes[0].id, alternativaEscolhidaId: q.alternativas.find(a => a.correta)!.id, correta: true } });
    await expect(new PrismaQuestionPracticeRepository(failingClient('user')).finalize(f.owner.id, practice.id)).rejects.toThrow('Falha intermediária');
    expect((await prisma.simulado.findUniqueOrThrow({ where: { id: practice.id } })).finalizadoEm).toBeNull();
    const repository = new PrismaQuestionPracticeRepository();
    const results = await Promise.all([repository.finalize(f.owner.id, practice.id), repository.finalize(f.owner.id, practice.id)]);
    expect(results.map(r => r.state)).toEqual(['COMPLETED', 'COMPLETED']);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.owner.id } })).nivelAtual).toBe('AVANCADO');
    await prisma.user.update({ where: { id: f.owner.id }, data: { nivelAtual: 'BASICO' } });
    await repository.finalize(f.owner.id, practice.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.owner.id } })).nivelAtual).toBe('BASICO');
  });

  it('finaliza o diagnóstico legado repetidamente sem duplicar métricas nem trilha', async () => {
    const f = await fixture();
    await Promise.all(Array.from({ length: 3 }, () => f.diagnostics.finalize(f.initial.id, f.owner.id)));
    const result = await f.diagnostics.getResult(f.initial.id, f.owner.id);
    expect(result.result.totalQuestions).toBe(7);
    expect(await prisma.trilhaAdaptativa.count()).toBe(1);
    expect(await prisma.desempenhoDiagnostico.count()).toBe(result.result.performances.length);
  });
});
