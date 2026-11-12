import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../errors/api-error';
import { inventorySelect, inventoryWhere, toEligibleCandidate } from './prisma-initial-diagnostic-repository';
import { createDiagnosticQuestionSnapshot, readDiagnosticQuestionSnapshot } from '../services/diagnostic-question-snapshot';
import { PRACTICE_DISCIPLINES } from '../services/question-practice-service';
import type { ExamCandidate, IndividualExamAttempt, IndividualExamRepository } from '../services/individual-exam-service';

type Connection = Prisma.TransactionClient;
async function activeId(db: Connection, studentId: string) {
  const rows = await db.$queryRaw<{ simuladoId: string }[]>`
    SELECT e."simuladoId" FROM "SessaoSimuladoIndividual" e
    JOIN "Simulado" s ON s.id=e."simuladoId" AND s."alunoId"=e."alunoId"
    WHERE e."alunoId"=${studentId} AND s."finalizadoEm" IS NULL ORDER BY e."criadaEm" ASC LIMIT 1`;
  return rows[0]?.simuladoId ?? null;
}
async function lockAttempt(db: Connection, studentId: string, id: string) {
  const rows = await db.$queryRaw<{ finalizadoEm: Date | null }[]>`
    SELECT s."finalizadoEm" FROM "SessaoSimuladoIndividual" e
    JOIN "Simulado" s ON s.id=e."simuladoId" AND s."alunoId"=e."alunoId"
    WHERE e."alunoId"=${studentId} AND e."simuladoId"=${id} AND s.tipo='PERSONALIZADO' FOR UPDATE OF s`;
  if (!rows[0]) throw new ApiError(404, 'Simulado individual não encontrado.');
  return rows[0];
}

export class PrismaIndividualExamRepository implements IndividualExamRepository {
  constructor(private readonly db: PrismaClient = prisma) {}
  async available(studentId: string): Promise<ExamCandidate[]> {
    // One inventory query across all five disciplines; never one query per question.
    const rows = await this.db.questao.findMany({ where: { ...inventoryWhere, respostas: { none: { simulado: { alunoId: studentId } } } }, select: inventorySelect });
    return rows.flatMap(row => toEligibleCandidate(row) ? [{ id: row.id, discipline: row.disciplina }] : []);
  }
  async active(studentId: string) {
    const id = await activeId(this.db, studentId);
    return id ? this.find(studentId, id) : null;
  }
  async find(studentId: string, id: string): Promise<IndividualExamAttempt | null> {
    const identities = await this.db.$queryRaw<{ simuladoId: string }[]>`
      SELECT "simuladoId" FROM "SessaoSimuladoIndividual" WHERE "alunoId"=${studentId} AND "simuladoId"=${id}`;
    if (!identities[0]) return null;
    const row = await this.db.simulado.findFirst({ where: { id, alunoId: studentId, tipo: 'PERSONALIZADO' }, select: {
      id: true, finalizadoEm: true,
      questoes: { orderBy: { posicao: 'asc' }, select: { questaoId: true, posicao: true, conteudoSnapshot: true, resposta: { select: { alternativaEscolhidaId: true } } } },
    } });
    if (!row) return null;
    const questions = row.questoes.map(q => {
      const snapshot = readDiagnosticQuestionSnapshot(q.conteudoSnapshot);
      if (!snapshot) throw new Error('Invalid individual exam snapshot');
      return { id: q.questaoId, position: q.posicao, snapshot, selectedOptionId: q.resposta?.alternativaEscolhidaId ?? null };
    });
    if (questions.length !== 30 || PRACTICE_DISCIPLINES.some(d => questions.filter(q => q.snapshot.discipline === d).length !== 6)) throw new Error('Invalid individual exam composition');
    return { id: row.id, completed: Boolean(row.finalizadoEm), questions };
  }
  async create(studentId: string, candidates: ExamCandidate[]) {
    if (candidates.length !== 30 || new Set(candidates.map(q => q.id)).size !== 30) throw new Error('Invalid individual exam selection');
    const id = await this.db.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id=${studentId} FOR UPDATE`;
      if (!locked.length) throw new ApiError(404, 'Aluno não encontrado.');
      const previous = await activeId(tx, studentId);
      if (previous) return previous;
      // Recheck eligibility and history inside the student-serialized transaction.
      const rows = await tx.questao.findMany({ where: { ...inventoryWhere, id: { in: candidates.map(q => q.id) }, respostas: { none: { simulado: { alunoId: studentId } } } }, select: inventorySelect });
      const valid = rows.filter(row => toEligibleCandidate(row));
      if (valid.length !== 30 || PRACTICE_DISCIPLINES.some(d => valid.filter(q => q.disciplina === d).length !== 6)) throw new ApiError(409, 'O acervo disponível mudou. Consulte a disponibilidade e tente novamente.');
      const byId = new Map(valid.map(q => [q.id, q]));
      const exam = await tx.simulado.create({ data: { tipo: 'PERSONALIZADO', alunoId: studentId }, select: { id: true } });
      await tx.questaoSimulado.createMany({ data: candidates.map((q, index) => ({ simuladoId: exam.id, questaoId: q.id, posicao: index + 1, conteudoSnapshot: createDiagnosticQuestionSnapshot(byId.get(q.id)!) })) });
      await tx.$executeRaw`INSERT INTO "SessaoSimuladoIndividual" (id,"simuladoId","alunoId") VALUES (${randomUUID()},${exam.id},${studentId})`;
      return exam.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    const result = await this.find(studentId, id);
    if (!result) throw new Error('Could not recover individual exam');
    return result;
  }
  async answer(studentId: string, id: string, questionId: string, alternativeId: string) {
    await this.db.$transaction(async tx => {
      const state = await lockAttempt(tx, studentId, id);
      if (state.finalizadoEm) throw new ApiError(409, 'Este simulado já foi entregue.');
      const link = await tx.questaoSimulado.findFirst({ where: { simuladoId: id, questaoId: questionId }, select: { id: true, conteudoSnapshot: true } });
      const snapshot = readDiagnosticQuestionSnapshot(link?.conteudoSnapshot);
      const alternative = snapshot?.alternatives.find(a => a.id === alternativeId);
      if (!link || !alternative) throw new ApiError(422, 'Questão ou alternativa inválida para este simulado.');
      await tx.resposta.upsert({ where: { questaoSimuladoId: link.id }, create: { simuladoId: id, questaoId: questionId, questaoSimuladoId: link.id, alternativaEscolhidaId: alternativeId, correta: alternative.correct }, update: { alternativaEscolhidaId: alternativeId, correta: alternative.correct, respondidoEm: new Date() } });
    });
  }
  async finalize(studentId: string, id: string) {
    await this.db.$transaction(async tx => {
      const state = await lockAttempt(tx, studentId, id);
      if (state.finalizadoEm) return;
      const [total, unanswered] = await Promise.all([
        tx.questaoSimulado.count({ where: { simuladoId: id } }),
        tx.questaoSimulado.count({ where: { simuladoId: id, resposta: null } }),
      ]);
      if (total !== 30 || unanswered) throw new ApiError(409, 'Responda todas as 30 questões antes de entregar.');
      await tx.simulado.update({ where: { id }, data: { finalizadoEm: new Date() } });
    });
    const result = await this.find(studentId, id);
    if (!result) throw new Error('Could not recover completed individual exam');
    return result;
  }
}
