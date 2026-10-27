import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../config/prisma';
import type {
  QuestionImportBatch,
  QuestionImportDatabase,
  QuestionImportTransaction,
} from './question-import-repository';

class PrismaQuestionImportTransaction implements QuestionImportTransaction {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  async findExistingFingerprints(fingerprints: string[]) {
    if (fingerprints.length === 0) return new Set<string>();
    const rows = await this.transaction.questao.findMany({
      where: { fingerprint: { in: fingerprints } },
      select: { fingerprint: true },
    });
    return new Set(rows.flatMap(row => row.fingerprint ? [row.fingerprint] : []));
  }

  async createBatch(data: Omit<QuestionImportBatch, 'id'>) {
    return this.transaction.loteImportacao.create({
      data,
      select: { id: true, administradorId: true, importadoEm: true, arquivoHash: true, totalQuestoes: true },
    });
  }

  async createQuestionWithAlternatives(data: Parameters<QuestionImportTransaction['createQuestionWithAlternatives']>[0]) {
    const { alternativas, ...question } = data;
    return this.transaction.questao.create({
      data: { ...question, alternativas: { create: alternativas } },
      select: { id: true },
    });
  }
}

export class PrismaQuestionImportDatabase implements QuestionImportDatabase {
  constructor(private readonly client: Pick<PrismaClient, '$transaction'> = prisma) {}

  transaction<T>(
    operation: (transaction: QuestionImportTransaction) => Promise<T>,
    options: { isolationLevel: 'Serializable' },
  ) {
    return this.client.$transaction(
      transaction => operation(new PrismaQuestionImportTransaction(transaction)),
      { isolationLevel: options.isolationLevel as Prisma.TransactionIsolationLevel },
    );
  }
}
