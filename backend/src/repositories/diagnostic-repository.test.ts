import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    simulado: { findFirst: vi.fn(), create: vi.fn() },
    questao: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../lib/prisma';
import { diagnosticAttemptSelect, diagnosticResultSelect, DiagnosticRepository } from './diagnostic-repository';

const findFirst = vi.mocked(prisma.simulado.findFirst);

describe('DiagnosticRepository.findAttemptForResult', () => {
  beforeEach(() => vi.clearAllMocks());

  it('usa select explícito e restringe a tentativa ao proprietário autenticado', async () => {
    findFirst.mockResolvedValue(null);
    const repository = new DiagnosticRepository();

    await repository.findAttemptForResult('attempt-1', 'student-1');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'attempt-1', alunoId: 'student-1', tipo: 'DIAGNOSTICO' },
      select: diagnosticResultSelect,
    });
    expect(findFirst.mock.calls[0][0]).not.toHaveProperty('include');
  });

  it('o início consulta somente IDs de questões públicas', async () => {
    vi.mocked(prisma.questao.findMany).mockResolvedValue([] as never);

    await new DiagnosticRepository().findQuestionsForDiagnostic(30);

    expect(prisma.questao.findMany).toHaveBeenCalledWith({
      take: 30,
      where: { publica: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
  });

  it('a tentativa inicial grava e retorna apenas campos legados necessários ao controller', async () => {
    const created = { id: 'attempt-1', iniciadoEm: new Date(), questoes: [{ id: 'link-1' }] };
    const tx = {
      simulado: { create: vi.fn().mockResolvedValue(created) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(((callback: (client: typeof tx) => unknown) => callback(tx)) as never);

    await new DiagnosticRepository().createAttempt('student-1', ['question-1']);

    expect(tx.simulado.create).toHaveBeenCalledWith(expect.objectContaining({
      select: { id: true, iniciadoEm: true, questoes: { select: { id: true } } },
    }));
  });

  it('as consultas antigas de questões do diagnóstico selecionam campos legados, sem metadados recentes', () => {
    const serializedSelect = JSON.stringify(diagnosticAttemptSelect);
    for (const excludedField of [
      'fonteNome', 'fonteReferencia', 'licencaOuAutorizacao', 'loteImportacaoId', 'fingerprint', 'origem',
      'revisaoJuridicaEm', 'revisorJuridicoId', 'revisaoPedagogicaEm', 'revisorPedagogicoId',
      'liberadaAcervoEm', 'liberadaAcervoPorId', 'situacaoDireitos', 'direitosVerificadosEm',
      'direitosVerificadosPorId', 'oabExame', 'oabEdicao', 'oabTipoProva', 'oabNumeroQuestao',
      'fonteOficialUrl', 'situacaoQuestaoOficial', 'letra',
    ]) {
      expect(serializedSelect).not.toContain(`"${excludedField}"`);
    }
    expect(diagnosticAttemptSelect.questoes.select.questao.select).toEqual({
      id: true, enunciado: true, disciplina: true, assunto: true, nivel: true,
      alternativas: { select: { id: true, texto: true, correta: true } },
    });
  });

  it('seleciona os dados de cálculo e resposta sem alternativas ou metadados recentes', () => {
    expect(diagnosticResultSelect.questoes).toEqual({
      orderBy: { posicao: 'asc' },
      select: {
        questao: { select: { disciplina: true, assunto: true, nivel: true } },
        resposta: { select: { correta: true } },
      },
    });
    expect(diagnosticResultSelect.desempenhosDiagnostico).toBeDefined();
    expect(diagnosticResultSelect.trilhaAdaptativa).toBeDefined();

    const serializedSelect = JSON.stringify(diagnosticResultSelect);
    for (const excludedField of [
      'alternativas', 'letra', 'fonteNome', 'fonteReferencia', 'licencaOuAutorizacao', 'loteImportacaoId',
      'fingerprint', 'origem', 'revisaoJuridicaEm', 'revisorJuridicoId', 'revisaoPedagogicaEm',
      'revisorPedagogicoId', 'liberadaAcervoEm', 'liberadaAcervoPorId', 'situacaoDireitos',
      'direitosVerificadosEm', 'direitosVerificadosPorId', 'oabExame', 'oabEdicao', 'oabTipoProva',
      'oabNumeroQuestao', 'fonteOficialUrl', 'situacaoQuestaoOficial',
    ]) {
      expect(serializedSelect).not.toContain(`"${excludedField}"`);
    }
  });
});
