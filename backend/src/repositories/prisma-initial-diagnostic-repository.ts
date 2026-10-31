import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { INITIAL_DIAGNOSTIC_DISCIPLINES, type InitialDiagnosticCandidate } from '../services/initial-diagnostic-composition';
import {
  type CreateInitialDiagnosticInput,
  type CreateOrGetInitialDiagnosticResult,
  type InitialDiagnosticAttempt,
  type InitialDiagnosticRepository,
} from '../services/initial-diagnostic-service';
import { createDiagnosticQuestionSnapshot } from '../services/diagnostic-question-snapshot';

const initialInclude = {
  simulado: {
    select: {
      id: true,
      alunoId: true,
      tipo: true,
      finalizadoEm: true,
      questoes: { orderBy: { posicao: 'asc' as const }, select: { posicao: true, questaoId: true } },
    },
  },
};

type InitialIdentity = Prisma.DiagnosticoInicialGetPayload<{ include: typeof initialInclude }>;

export const inventorySelect = {
  id: true,
  enunciado: true,
  disciplina: true,
  assunto: true,
  nivel: true,
  fundamentacaoJuridica: true,
  publica: true,
  turmaId: true,
  origem: true,
  revisaoJuridicaEm: true,
  revisorJuridicoId: true,
  revisaoPedagogicaEm: true,
  revisorPedagogicoId: true,
  liberadaAcervoEm: true,
  liberadaAcervoPorId: true,
  situacaoDireitos: true,
  direitosVerificadosEm: true,
  direitosVerificadosPorId: true,
  oabExame: true,
  oabEdicao: true,
  oabTipoProva: true,
  oabNumeroQuestao: true,
  fonteOficialUrl: true,
  situacaoQuestaoOficial: true,
  fonteNome: true,
  fonteReferencia: true,
  licencaOuAutorizacao: true,
  alternativas: {
    orderBy: { letra: 'asc' },
    select: { id: true, letra: true, texto: true, correta: true },
  },
} as const satisfies Prisma.QuestaoSelect;

export type InventoryRow = Prisma.QuestaoGetPayload<{ select: typeof inventorySelect }>;

export const inventoryWhere: Prisma.QuestaoWhereInput = {
  publica: true,
  turmaId: null,
  disciplina: { in: [...INITIAL_DIAGNOSTIC_DISCIPLINES] },
  origem: { in: ['IA', 'OAB_OFICIAL'] },
  revisaoJuridicaEm: { not: null },
  revisorJuridicoId: { not: null },
  revisaoPedagogicaEm: { not: null },
  revisorPedagogicoId: { not: null },
  liberadaAcervoEm: { not: null },
  liberadaAcervoPorId: { not: null },
  OR: [
    { origem: 'IA' },
    {
      origem: 'OAB_OFICIAL',
      situacaoQuestaoOficial: 'VALIDA',
      situacaoDireitos: { in: ['AUTORIZADA', 'DOMINIO_PUBLICO_VERIFICADO'] },
      direitosVerificadosEm: { not: null },
      direitosVerificadosPorId: { not: null },
      oabExame: { not: null },
      oabEdicao: { not: null },
      oabTipoProva: { not: null },
      oabNumeroQuestao: { not: null },
      fonteOficialUrl: { not: null },
      fonteNome: { not: null },
      fonteReferencia: { not: null },
      licencaOuAutorizacao: { not: null },
    },
  ],
};

const ALTERNATIVE_LETTERS = ['A', 'B', 'C', 'D'] as const;

function hasOfficialSource(row: InventoryRow): boolean {
  if (row.origem !== 'OAB_OFICIAL'
    || row.situacaoQuestaoOficial !== 'VALIDA'
    || !['AUTORIZADA', 'DOMINIO_PUBLICO_VERIFICADO'].includes(row.situacaoDireitos ?? '')
    || !row.direitosVerificadosEm || !row.direitosVerificadosPorId?.trim()
    || !row.oabExame?.trim() || !row.oabEdicao?.trim() || !row.oabTipoProva?.trim()
    || !Number.isInteger(row.oabNumeroQuestao) || (row.oabNumeroQuestao ?? 0) < 1
    || !row.fonteNome?.trim() || !row.fonteReferencia?.trim() || !row.licencaOuAutorizacao?.trim()) {
    return false;
  }

  if (!row.fonteOficialUrl?.trim()) return false;
  try {
    const url = new URL(row.fonteOficialUrl);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function hasCompleteContent(row: InventoryRow): boolean {
  if (row.enunciado.trim().length < 10 || !row.disciplina.trim() || !row.assunto.trim()
    || !row.fundamentacaoJuridica.trim() || row.alternativas.length !== 4) {
    return false;
  }

  const letters = row.alternativas.map(alternative => alternative.letra);
  if (letters.some(letter => !letter) || new Set(letters).size !== 4
    || !ALTERNATIVE_LETTERS.every(letter => letters.includes(letter))) {
    return false;
  }

  return row.alternativas.every(alternative => alternative.texto.trim())
    && row.alternativas.filter(alternative => alternative.correta).length === 1;
}

export function toEligibleCandidate(row: InventoryRow): InitialDiagnosticCandidate | null {
  if (!row.publica || row.turmaId !== null || (row.situacaoQuestaoOficial as string | null) === 'ANULADA'
    || !INITIAL_DIAGNOSTIC_DISCIPLINES.includes(row.disciplina as typeof INITIAL_DIAGNOSTIC_DISCIPLINES[number])
    || (row.origem !== 'IA' && row.origem !== 'OAB_OFICIAL')
    || !row.revisaoJuridicaEm || !row.revisorJuridicoId?.trim()
    || !row.revisaoPedagogicaEm || !row.revisorPedagogicoId?.trim()
    || !row.liberadaAcervoEm || !row.liberadaAcervoPorId?.trim()
    || !hasCompleteContent(row)) {
    return null;
  }

  if (row.origem === 'OAB_OFICIAL' && !hasOfficialSource(row)) return null;

  return {
    id: row.id,
    discipline: row.disciplina,
    level: row.nivel,
    origin: row.origem,
    public: row.publica && row.turmaId === null,
    complete: true,
    annulled: row.situacaoQuestaoOficial === 'ANULADA',
    published: Boolean(row.liberadaAcervoEm && row.liberadaAcervoPorId?.trim()),
    legalReviewApproved: Boolean(row.revisaoJuridicaEm && row.revisorJuridicoId?.trim()),
    pedagogicalReviewApproved: Boolean(row.revisaoPedagogicaEm && row.revisorPedagogicoId?.trim()),
    reproductionRightsDocumented: row.origem === 'OAB_OFICIAL'
      ? Boolean(row.direitosVerificadosEm && row.direitosVerificadosPorId?.trim()
        && row.licencaOuAutorizacao?.trim()
        && ['AUTORIZADA', 'DOMINIO_PUBLICO_VERIFICADO'].includes(row.situacaoDireitos ?? ''))
      : false,
  };
}

function toAttempt(identity: InitialIdentity, expectedStudentId: string): InitialDiagnosticAttempt {
  if (identity.alunoId !== expectedStudentId || identity.simulado.alunoId !== expectedStudentId) {
    throw new Error('Inconsistência de propriedade na identidade do Diagnóstico Inicial.');
  }
  if (identity.simulado.tipo !== 'DIAGNOSTICO') {
    throw new Error('A identidade inicial está vinculada a um Simulado que não é DIAGNOSTICO.');
  }

  return {
    id: identity.simulado.id,
    state: identity.simulado.finalizadoEm ? 'COMPLETED' : 'IN_PROGRESS',
    orderedQuestionIds: identity.simulado.questoes.map(question => question.questaoId),
  };
}

function isPrismaConflict(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034');
}

function validateCreateInput(input: CreateInitialDiagnosticInput): void {
  if (input.orderedQuestionIds.length !== 30) {
    throw new RangeError('O Diagnóstico Inicial exige exatamente 30 questões.');
  }
  if (new Set(input.orderedQuestionIds).size !== 30) {
    throw new RangeError('O Diagnóstico Inicial não pode repetir questões.');
  }
}

export class PrismaInitialDiagnosticRepository implements InitialDiagnosticRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findInitialAttempt(studentId: string): Promise<InitialDiagnosticAttempt | null> {
    const identity = await this.db.diagnosticoInicial.findUnique({
      where: { alunoId: studentId },
      include: initialInclude,
    });
    return identity ? toAttempt(identity, studentId) : null;
  }

  async listEligibleInventory(): Promise<InitialDiagnosticCandidate[]> {
    // The checked-in generated client can lag local schema work; this narrow
    // delegate shape keeps the query contract explicit until prisma generate
    // can complete in the Windows workspace.
    const rows = await this.db.questao.findMany({ where: inventoryWhere, select: inventorySelect });
    return rows.flatMap(row => {
      const candidate = toEligibleCandidate(row);
      return candidate ? [candidate] : [];
    });
  }

  async listAnsweredQuestionIds(studentId: string): Promise<ReadonlySet<string>> {
    const answers = await this.db.resposta.findMany({
      where: { simulado: { alunoId: studentId } },
      select: { questaoId: true },
      distinct: ['questaoId'],
    });
    return new Set(answers.map(answer => answer.questaoId));
  }

  async createInitialOrGetExisting(
    input: CreateInitialDiagnosticInput,
  ): Promise<CreateOrGetInitialDiagnosticResult> {
    validateCreateInput(input);

    try {
      return await this.db.$transaction(async tx => {
        const existing = await tx.diagnosticoInicial.findUnique({
          where: { alunoId: input.studentId },
          include: initialInclude,
        });
        if (existing) return { attempt: toAttempt(existing, input.studentId), created: false };

        // All writes stay in the same transaction. Any identity or question
        // link failure rolls back the Simulado as well, so no orphan survives.
        const simulado = await tx.simulado.create({
          data: { tipo: 'DIAGNOSTICO', alunoId: input.studentId },
          select: { id: true },
        });
        await tx.diagnosticoInicial.create({
          data: { alunoId: input.studentId, simuladoId: simulado.id },
          select: { id: true },
        });
        const selectedQuestions = await tx.questao.findMany({
          where: { id: { in: [...input.orderedQuestionIds] } },
          select: {
            id: true, enunciado: true, disciplina: true, assunto: true, nivel: true,
            fundamentacaoJuridica: true,
            alternativas: { select: { id: true, letra: true, texto: true, correta: true }, orderBy: { letra: 'asc' } },
          },
        });
        if (selectedQuestions.length !== 30) {
          throw new Error('NÃ£o foi possÃ­vel congelar o conteÃºdo de todas as questÃµes do diagnÃ³stico.');
        }
        const byId = new Map(selectedQuestions.map(question => [question.id, question]));
        const links = await tx.questaoSimulado.createMany({
          data: input.orderedQuestionIds.map((questaoId, index) => ({
            simuladoId: simulado.id,
            questaoId,
            posicao: index + 1,
            conteudoSnapshot: createDiagnosticQuestionSnapshot(byId.get(questaoId)!),
          })),
        });
        if (links.count !== 30) {
          throw new Error(`Persistência incompleta do Diagnóstico Inicial: esperadas 30 questões, gravadas ${links.count}.`);
        }

        return {
          attempt: { id: simulado.id, state: 'IN_PROGRESS', orderedQuestionIds: [...input.orderedQuestionIds] },
          created: true,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isPrismaConflict(error)) throw error;

      // The failed transaction has already rolled back. Only return a winner
      // when the unique initial identity actually exists; otherwise preserve
      // the original conflict for diagnosis by the caller.
      const winner = await this.findInitialAttempt(input.studentId);
      if (winner) return { attempt: winner, created: false };
      throw error;
    }
  }
}
