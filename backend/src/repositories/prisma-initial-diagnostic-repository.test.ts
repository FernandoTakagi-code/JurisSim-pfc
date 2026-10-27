import { Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { INITIAL_DIAGNOSTIC_COMPOSITION } from '../services/initial-diagnostic-composition';
import { InitialDiagnosticService } from '../services/initial-diagnostic-service';
import { PrismaInitialDiagnosticRepository } from './prisma-initial-diagnostic-repository';

function questionIds(): string[] {
  return Array.from({ length: 30 }, (_, index) => `question-${index + 1}`);
}

function identity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'identity-1', alunoId: 'student-1', simuladoId: 'simulado-1',
    simulado: {
      id: 'simulado-1', alunoId: 'student-1', tipo: 'DIAGNOSTICO', finalizadoEm: null,
      questoes: questionIds().map((questaoId, index) => ({ posicao: index + 1, questaoId })),
    },
    ...overrides,
  };
}

function dbMock(overrides: Record<string, unknown> = {}) {
  const tx = {
    diagnosticoInicial: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'identity-1' }) },
    simulado: { create: vi.fn().mockResolvedValue({ id: 'simulado-1' }) },
    questaoSimulado: { createMany: vi.fn().mockResolvedValue({ count: 30 }) },
  };
  const db = {
    diagnosticoInicial: { findUnique: vi.fn().mockResolvedValue(null) },
    resposta: { findMany: vi.fn().mockResolvedValue([]) },
    questao: { findMany: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>, options?: unknown) => callback(tx)),
    ...overrides,
  } as unknown as PrismaClient;
  return { db, tx };
}

function inventoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inventory-question',
    enunciado: 'Enunciado jurídico com conteúdo suficiente para revisão.',
    disciplina: 'Direito Constitucional',
    assunto: 'Direitos fundamentais',
    nivel: 'BASICO',
    fundamentacaoJuridica: 'Fundamentação jurídica documentada.',
    publica: true,
    turmaId: null,
    origem: 'IA',
    revisaoJuridicaEm: new Date('2026-01-01T00:00:00.000Z'),
    revisorJuridicoId: 'reviewer-legal',
    revisaoPedagogicaEm: new Date('2026-01-02T00:00:00.000Z'),
    revisorPedagogicoId: 'reviewer-pedagogic',
    liberadaAcervoEm: new Date('2026-01-03T00:00:00.000Z'),
    liberadaAcervoPorId: 'publisher',
    situacaoDireitos: null,
    direitosVerificadosEm: null,
    direitosVerificadosPorId: null,
    oabExame: null,
    oabEdicao: null,
    oabTipoProva: null,
    oabNumeroQuestao: null,
    fonteOficialUrl: null,
    situacaoQuestaoOficial: null,
    fonteNome: null,
    fonteReferencia: null,
    licencaOuAutorizacao: null,
    alternativas: ['A', 'B', 'C', 'D'].map((letra, index) => ({
      letra, texto: `Alternativa ${letra}`, correta: index === 0,
    })),
    ...overrides,
  };
}

function officialRow(overrides: Record<string, unknown> = {}) {
  return inventoryRow({
    id: 'official-question',
    origem: 'OAB_OFICIAL',
    situacaoDireitos: 'AUTORIZADA',
    direitosVerificadosEm: new Date('2026-01-04T00:00:00.000Z'),
    direitosVerificadosPorId: 'rights-reviewer',
    oabExame: '18197',
    oabEdicao: '47',
    oabTipoProva: 'Caderno Tipo 1',
    oabNumeroQuestao: 1,
    fonteOficialUrl: 'https://exam.example.gov/prova.pdf',
    situacaoQuestaoOficial: 'VALIDA',
    fonteNome: 'Fonte oficial',
    fonteReferencia: '47º Exame, primeira fase, questão 1',
    licencaOuAutorizacao: 'Autorização documentada no processo local.',
    ...overrides,
  });
}

describe('adaptador Prisma do Diagnóstico Inicial', () => {
  it('recupera tentativa existente, status e questões em ordem persistida', async () => {
    const current = identity({ simulado: {
      id: 'simulado-1', alunoId: 'student-1', tipo: 'DIAGNOSTICO', finalizadoEm: new Date(),
      questoes: [{ posicao: 1, questaoId: 'q-first' }, { posicao: 2, questaoId: 'q-second' }],
    } });
    const { db } = dbMock({ diagnosticoInicial: { findUnique: vi.fn().mockResolvedValue(current) } });
    const repository = new PrismaInitialDiagnosticRepository(db);

    await expect(repository.findInitialAttempt('student-1')).resolves.toEqual({
      id: 'simulado-1', state: 'COMPLETED', orderedQuestionIds: ['q-first', 'q-second'],
    });
    expect(db.diagnosticoInicial.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { alunoId: 'student-1' }, include: expect.objectContaining({ simulado: expect.any(Object) }),
    }));
  });

  it('rejeita identidade cujo dono ou tipo não corresponde ao diagnóstico', async () => {
    const wrongOwner = identity({ simulado: {
      id: 'simulado-1', alunoId: 'other-student', tipo: 'DIAGNOSTICO', finalizadoEm: null, questoes: [],
    } });
    const { db } = dbMock({ diagnosticoInicial: { findUnique: vi.fn().mockResolvedValue(wrongOwner) } });
    await expect(new PrismaInitialDiagnosticRepository(db).findInitialAttempt('student-1'))
      .rejects.toThrow(/propriedade/);
  });

  it('persiste simulado, identidade e 30 vínculos em uma transação serializável, na ordem recebida', async () => {
    const { db, tx } = dbMock();
    const repository = new PrismaInitialDiagnosticRepository(db);
    const ids = questionIds();

    await expect(repository.createInitialOrGetExisting({ studentId: 'student-1', orderedQuestionIds: ids }))
      .resolves.toEqual({
        attempt: { id: 'simulado-1', state: 'IN_PROGRESS', orderedQuestionIds: ids }, created: true,
      });

    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(tx.simulado.create).toHaveBeenCalledWith({
      data: { tipo: 'DIAGNOSTICO', alunoId: 'student-1' }, select: { id: true },
    });
    expect(tx.diagnosticoInicial.create).toHaveBeenCalledWith({
      data: { alunoId: 'student-1', simuladoId: 'simulado-1' }, select: { id: true },
    });
    const [links] = tx.questaoSimulado.createMany.mock.calls[0];
    expect(links.data).toEqual(ids.map((questaoId, index) => ({ simuladoId: 'simulado-1', questaoId, posicao: index + 1 })));
    expect(links.data).toHaveLength(30);
  });

  it('reverte o simulado e a identidade quando a gravação dos vínculos falha', async () => {
    const staged: { simulado?: string; identity?: string; links?: unknown[] } = {};
    let committed: typeof staged | null = null;
    let rolledBack = false;
    const tx = {
      diagnosticoInicial: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(async () => { staged.identity = 'identity-1'; return { id: 'identity-1' }; }),
      },
      simulado: { create: vi.fn(async () => { staged.simulado = 'simulado-1'; return { id: 'simulado-1' }; }) },
      questaoSimulado: { createMany: vi.fn(async () => { throw new Error('falha de vínculo'); }) },
    };
    const db = {
      diagnosticoInicial: { findUnique: vi.fn().mockResolvedValue(null) },
      resposta: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
        try {
          const result = await callback(tx);
          committed = structuredClone(staged);
          return result;
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      }),
    } as unknown as PrismaClient;

    await expect(new PrismaInitialDiagnosticRepository(db).createInitialOrGetExisting({
      studentId: 'student-1', orderedQuestionIds: questionIds(),
    })).rejects.toThrow('falha de vínculo');
    expect(rolledBack).toBe(true);
    expect(committed).toBeNull();
  });

  it('recupera a tentativa vencedora depois do conflito de unicidade', async () => {
    const uniqueConflict = new Prisma.PrismaClientKnownRequestError('unique conflict', {
      code: 'P2002', clientVersion: '6.19.3', meta: { target: ['alunoId'] },
    });
    const winner = identity({ simulado: {
      id: 'winner', alunoId: 'student-1', tipo: 'DIAGNOSTICO', finalizadoEm: null,
      questoes: questionIds().map((questaoId, index) => ({ posicao: index + 1, questaoId })),
    } });
    const { db } = dbMock({
      $transaction: vi.fn().mockRejectedValue(uniqueConflict),
      diagnosticoInicial: { findUnique: vi.fn().mockResolvedValue(winner) },
    });

    await expect(new PrismaInitialDiagnosticRepository(db).createInitialOrGetExisting({
      studentId: 'student-1', orderedQuestionIds: questionIds(),
    })).resolves.toMatchObject({
      created: false, attempt: { id: 'winner', state: 'IN_PROGRESS', orderedQuestionIds: questionIds() },
    });
    expect(db.diagnosticoInicial.findUnique).toHaveBeenCalledTimes(1);
  });

  it('não permite IDs repetidos ou quantidade diferente de 30 na persistência', async () => {
    const { db } = dbMock();
    const repository = new PrismaInitialDiagnosticRepository(db);
    await expect(repository.createInitialOrGetExisting({ studentId: 'student-1', orderedQuestionIds: questionIds().slice(1) }))
      .rejects.toThrow(/exatamente 30/);
    await expect(repository.createInitialOrGetExisting({
      studentId: 'student-1', orderedQuestionIds: [...questionIds().slice(1), questionIds()[1]],
    })).rejects.toThrow(/não pode repetir/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('returns fully approved AI and official questions with independent origins and levels', async () => {
    const ai = inventoryRow({ id: 'ai-question', nivel: 'BASICO' });
    const official = officialRow({ id: 'official-question', nivel: 'AVANCADO', situacaoDireitos: 'DOMINIO_PUBLICO_VERIFICADO' });
    const findMany = vi.fn().mockResolvedValue([ai, official]);
    const { db } = dbMock({ questao: { findMany } });

    await expect(new PrismaInitialDiagnosticRepository(db).listEligibleInventory()).resolves.toEqual([
      expect.objectContaining({ id: 'ai-question', origin: 'IA', level: 'BASICO', complete: true }),
      expect.objectContaining({ id: 'official-question', origin: 'OAB_OFICIAL', level: 'AVANCADO', reproductionRightsDocumented: true }),
    ]);
    const [args] = findMany.mock.calls[0];
    expect(args.where).toMatchObject({
      publica: true,
      turmaId: null,
      disciplina: { in: ['Direito Constitucional', 'Direito Civil', 'Direito Penal', 'Direito Administrativo', 'Direito do Trabalho'] },
      origem: { in: ['IA', 'OAB_OFICIAL'] },
    });
  });

  it('excludes incomplete, unreviewed, private, teacher, annulled and undocumented questions', async () => {
    const rows = [
      inventoryRow({ id: 'short-statement', enunciado: 'curto' }),
      inventoryRow({ id: 'short-alternatives', alternativas: inventoryRow().alternativas.slice(0, 3) }),
      inventoryRow({ id: 'duplicate-letters', alternativas: [
        { letra: 'A', texto: 'a', correta: true }, { letra: 'A', texto: 'b', correta: false },
        { letra: 'C', texto: 'c', correta: false }, { letra: 'D', texto: 'd', correta: false },
      ] }),
      inventoryRow({ id: 'multiple-correct', alternativas: inventoryRow().alternativas.map((item, index) => ({ ...item, correta: index < 2 })) }),
      inventoryRow({ id: 'blank-option', alternativas: inventoryRow().alternativas.map((item, index) => ({ ...item, texto: index === 2 ? '  ' : item.texto })) }),
      inventoryRow({ id: 'unreviewed-legal', revisaoJuridicaEm: null }),
      inventoryRow({ id: 'missing-legal-reviewer', revisorJuridicoId: null }),
      inventoryRow({ id: 'unreviewed-pedagogical', revisaoPedagogicaEm: null }),
      inventoryRow({ id: 'not-released', liberadaAcervoEm: null }),
      inventoryRow({ id: 'private', publica: false }),
      inventoryRow({ id: 'class-private', turmaId: 'class-1' }),
      inventoryRow({ id: 'teacher', origem: 'PROFESSOR' }),
      inventoryRow({ id: 'noncanonical-discipline', disciplina: 'Direito Empresarial' }),
      officialRow({ id: 'annulled', situacaoQuestaoOficial: 'ANULADA' }),
      officialRow({ id: 'rights-unverified', situacaoDireitos: 'NAO_VERIFICADO' }),
      officialRow({ id: 'rights-no-evidence', licencaOuAutorizacao: '  ' }),
      officialRow({ id: 'missing-rights-reviewer', direitosVerificadosPorId: null }),
      officialRow({ id: 'incomplete-official-identity', oabNumeroQuestao: null }),
      officialRow({ id: 'missing-official-source', fonteOficialUrl: null }),
      officialRow({ id: 'invalid-official-url', fonteOficialUrl: 'javascript:alert(1)' }),
    ];
    const { db } = dbMock({ questao: { findMany: vi.fn().mockResolvedValue(rows) } });

    await expect(new PrismaInitialDiagnosticRepository(db).listEligibleInventory()).resolves.toEqual([]);
  });

  it('leaves category shortages to the composition policy without substituting origin or level', async () => {
    const { db } = dbMock({ questao: { findMany: vi.fn().mockResolvedValue([inventoryRow()]) } });
    const repository = new PrismaInitialDiagnosticRepository(db);
    const inventory = await repository.listEligibleInventory();
    const service = new InitialDiagnosticService({
      findInitialAttempt: vi.fn().mockResolvedValue(null),
      listEligibleInventory: vi.fn().mockResolvedValue(inventory),
      listAnsweredQuestionIds: vi.fn().mockResolvedValue(new Set()),
      createInitialOrGetExisting: vi.fn(),
    });

    const result = await service.getOrCreate('student-1');
    expect(result.status).toBe('INSUFFICIENT');
    if (result.status === 'INSUFFICIENT') {
      expect(result.shortages).toEqual(expect.arrayContaining([
        expect.objectContaining({ discipline: 'Direito Constitucional', level: 'BASICO', origin: 'IA', required: 2, available: 1 }),
        expect.objectContaining({ discipline: 'Direito Constitucional', level: 'INTERMEDIARIO', origin: 'OAB_OFICIAL' }),
        expect.objectContaining({ discipline: 'Direito Civil', level: 'BASICO', origin: 'IA' }),
      ]));
    }
  });
  it('consulta histórico de respostas somente do aluno e devolve IDs únicos', async () => {
    const { db } = dbMock({ resposta: { findMany: vi.fn().mockResolvedValue([
      { questaoId: 'q1' }, { questaoId: 'q1' }, { questaoId: 'q2' },
    ]) } });
    const repository = new PrismaInitialDiagnosticRepository(db);
    await expect(repository.listAnsweredQuestionIds('student-1')).resolves.toEqual(new Set(['q1', 'q2']));
    expect(db.resposta.findMany).toHaveBeenCalledWith({
      where: { simulado: { alunoId: 'student-1' } }, select: { questaoId: true }, distinct: ['questaoId'],
    });
  });

  it('mantém intacta a composição aprovada de 30 posições', () => {
    expect(INITIAL_DIAGNOSTIC_COMPOSITION.reduce((sum, slot) => sum + slot.quantity, 0)).toBe(30);
  });
});
