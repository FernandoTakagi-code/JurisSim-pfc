import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaQuestionPracticeRepository } from './prisma-question-practice-repository';

const fakeDb = vi.hoisted(() => ({
  questao: { findMany: vi.fn() }, resposta: { findMany: vi.fn() }, simulado: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  questaoSimulado: { createMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() }, alternativa: { findFirst: vi.fn() },
  $executeRaw: vi.fn(), $queryRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: fakeDb }));

const candidate = (id: string, correct = 0) => ({
  id, enunciado: `Enunciado suficientemente completo ${id}`, disciplina: 'Direito Civil', assunto: 'Contratos', nivel: 'BASICO',
  fundamentacaoJuridica: 'Fundamentação jurídica revisada.', publica: true, turmaId: null, origem: 'IA',
  revisaoJuridicaEm: new Date(), revisorJuridicoId: 'reviewer-law', revisaoPedagogicaEm: new Date(), revisorPedagogicoId: 'reviewer-ped',
  liberadaAcervoEm: new Date(), liberadaAcervoPorId: 'admin', situacaoDireitos: null, direitosVerificadosEm: null,
  direitosVerificadosPorId: null, oabExame: null, oabEdicao: null, oabTipoProva: null, oabNumeroQuestao: null,
  fonteOficialUrl: null, situacaoQuestaoOficial: null, fonteNome: null, fonteReferencia: null, licencaOuAutorizacao: null,
  alternativas: ['A', 'B', 'C', 'D'].map((letra, index) => ({ id: `${id}-${letra}`, letra, texto: `Alternativa ${letra}`, correta: index === correct })),
});

describe('PrismaQuestionPracticeRepository isolation contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb.$transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work(fakeDb));
    fakeDb.questao.findMany.mockResolvedValue([]);
    fakeDb.resposta.findMany.mockResolvedValue([]);
    fakeDb.simulado.create.mockResolvedValue({ id: 'simulado-1' });
    fakeDb.simulado.findFirst.mockResolvedValue({
      id: 'simulado-1', finalizadoEm: null,
      questoes: [candidate('q1')].map((q, index) => ({ posicao: index + 1, questao: { ...q, alternativas: q.alternativas }, resposta: null })),
    });
    fakeDb.questaoSimulado.createMany.mockResolvedValue({ count: 1 });
    fakeDb.questaoSimulado.findFirst.mockResolvedValue({ id: 'link-1' });
    fakeDb.alternativa.findFirst.mockResolvedValue({ id: 'q1-A', correta: true });
    fakeDb.questaoSimulado.count.mockResolvedValue(0);
    fakeDb.simulado.updateMany.mockResolvedValue({ count: 1 });
    fakeDb.$executeRaw.mockResolvedValue(1);
    fakeDb.$queryRaw.mockImplementation(async () => []);
  });

  it('uses the shared eligibility filter and discards incomplete candidates', async () => {
    fakeDb.questao.findMany.mockResolvedValue([candidate('eligible'), { ...candidate('incomplete'), alternativas: [] }]);
    const repository = new PrismaQuestionPracticeRepository(fakeDb as never);
    const result = await repository.listEligibleQuestions('Direito Civil');
    expect(result.map(question => question.id)).toEqual(['eligible']);
    const query = fakeDb.questao.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ publica: true, turmaId: null, disciplina: 'Direito Civil' });
    expect(query.select).toHaveProperty('revisaoJuridicaEm', true);
    expect(query.select).toHaveProperty('situacaoDireitos', true);
  });

  it('persists the attempt, ordered question links, and session marker in one transaction', async () => {
    fakeDb.$queryRaw
      .mockResolvedValueOnce([{ id: 'student-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'session-1', simuladoId: 'simulado-1', alunoId: 'student-1', disciplina: 'Direito Civil', finalizadoEm: null }]);
    fakeDb.simulado.findFirst.mockResolvedValueOnce({
      id: 'simulado-1', finalizadoEm: null,
      questoes: [candidate('q1'), candidate('q2')].map((q, index) => ({ posicao: index + 1, questao: q, resposta: null })),
    });
    const repository = new PrismaQuestionPracticeRepository(fakeDb as never);
    const created = await repository.createAttempt('student-1', 'Direito Civil', [candidate('q1') as never, candidate('q2') as never]);
    expect(created.questions.map(question => question.position)).toEqual([1, 2]);
    expect(fakeDb.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'ReadCommitted' });
    expect(fakeDb.simulado.create).toHaveBeenCalledWith({ data: { tipo: 'PERSONALIZADO', alunoId: 'student-1' }, select: { id: true } });
    expect(fakeDb.questaoSimulado.createMany).toHaveBeenCalledWith({ data: [
      { simuladoId: 'simulado-1', questaoId: 'q1', posicao: 1 }, { simuladoId: 'simulado-1', questaoId: 'q2', posicao: 2 },
    ] });
    expect(fakeDb.$executeRaw).toHaveBeenCalledOnce();
  });

  it('does not write the session marker if question linking fails inside the transaction', async () => {
    fakeDb.questaoSimulado.createMany.mockRejectedValue(new Error('simulated link failure'));
    fakeDb.$queryRaw.mockResolvedValueOnce([{ id: 'student-1' }]).mockResolvedValueOnce([]);
    const repository = new PrismaQuestionPracticeRepository(fakeDb as never);
    await expect(repository.createAttempt('student-1', 'Direito Civil', [candidate('q1') as never])).rejects.toThrow('simulated link failure');
    expect(fakeDb.$executeRaw).not.toHaveBeenCalled();
  });
});
