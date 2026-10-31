import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  transaction: {
    questao: { findMany: vi.fn(), create: vi.fn() },
    loteImportacao: { create: vi.fn() },
  },
}));
vi.mock('../config/prisma', () => ({ prisma: db }));

import { Prisma } from '@prisma/client';
import { PrismaQuestionImportDatabase } from './prisma-question-import-database';

describe('adaptador de importação Prisma', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async callback => callback(db.transaction));
    db.transaction.questao.findMany.mockResolvedValue([{ fingerprint: 'hash-existente' }, { fingerprint: null }]);
    db.transaction.loteImportacao.create.mockResolvedValue({
      id: 'batch-id', administradorId: 'admin-id', importadoEm: new Date('2026-10-21T12:00:00Z'),
      arquivoHash: 'a'.repeat(64), totalQuestoes: 1,
    });
    db.transaction.questao.create.mockResolvedValue({ id: 'question-id' });
  });

  it('usa uma única transação Prisma serializável', async () => {
    const database = new PrismaQuestionImportDatabase();
    const result = await database.transaction(async transaction => {
      const existing = await transaction.findExistingFingerprints(['hash-existente', 'hash-novo']);
      const batch = await transaction.createBatch({
        administradorId: 'admin-id', importadoEm: new Date('2026-10-21T12:00:00Z'),
        arquivoHash: 'a'.repeat(64), totalQuestoes: 1,
      });
      const question = await transaction.createQuestionWithAlternatives({
        fingerprint: 'hash-novo', enunciado: 'Enunciado original', disciplina: 'Direito Civil', assunto: 'Contratos',
        nivel: 'BASICO', fundamentacaoJuridica: 'Fundamentação original', publica: true,
        fonteNome: 'Fonte declarada', fonteReferencia: 'Referência declarada', licencaOuAutorizacao: 'Autorização declarada',
        alternativas: [{ texto: 'A', correta: true }, { texto: 'B', correta: false }],
        autorId: 'admin-id', loteImportacaoId: batch.id,
      });
      return { existing, batch, question };
    }, { isolationLevel: 'Serializable' });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    expect(result.existing).toEqual(new Set(['hash-existente']));
    expect(db.transaction.questao.findMany).toHaveBeenCalledWith({
      where: { fingerprint: { in: ['hash-existente', 'hash-novo'] } }, select: { fingerprint: true },
    });
    expect(db.transaction.loteImportacao.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ administradorId: 'admin-id' }) }));
    expect(db.transaction.questao.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        fingerprint: 'hash-novo', fonteNome: 'Fonte declarada', loteImportacaoId: 'batch-id',
        alternativas: { create: [{ texto: 'A', correta: true }, { texto: 'B', correta: false }] },
      }),
      select: { id: true },
    }));
    expect(result.question).toEqual({ id: 'question-id' });
  });

  it('propaga falhas Prisma para o repositório traduzir sem tentar transação ilimitada', async () => {
    const conflict = Object.assign(new Error('unique conflict'), { code: 'P2002' });
    db.$transaction.mockRejectedValueOnce(conflict);
    const database = new PrismaQuestionImportDatabase();
    await expect(database.transaction(async () => 'ok', { isolationLevel: 'Serializable' })).rejects.toBe(conflict);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
