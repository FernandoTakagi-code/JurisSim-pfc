import {
  Prisma,
  PrismaClient,
  type SessaoRevisaoQuestao,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError } from "../errors/api-error";
import { PRACTICE_DISCIPLINES } from "./question-practice-service";
import {
  readDiagnosticQuestionSnapshot,
  createDiagnosticQuestionSnapshot,
} from "./diagnostic-question-snapshot";

export type ReviewFilter = "all" | "incorrect";
const itemSchema = z.object({
  id: z.uuid(),
  statement: z.string(),
  discipline: z.string(),
  topic: z.string(),
  level: z.string(),
  explanation: z.string(),
  provisional: z.boolean(),
  sourceAttemptId: z.uuid(),
  sourceAnswerId: z.uuid(),
  alternatives: z
    .array(
      z.object({
        id: z.uuid(),
        letter: z.string(),
        text: z.string(),
        correct: z.boolean(),
      }),
    )
    .length(4),
});
type Item = z.infer<typeof itemSchema>;
const items = (row: SessaoRevisaoQuestao) =>
  z.array(itemSchema).min(1).max(20).parse(row.conteudo);
const answers = (row: SessaoRevisaoQuestao) =>
  z.record(z.string(), z.string()).parse(row.respostas);
export const reviewQuantities = (count: number) =>
  [...new Set([Math.min(5, count), 10, 20])].filter((n) => n > 0 && n <= count);
const checkDiscipline = (discipline: string) => {
  if (
    !PRACTICE_DISCIPLINES.includes(
      discipline as (typeof PRACTICE_DISCIPLINES)[number],
    )
  )
    throw new ApiError(422, "Selecione uma disciplina válida.");
};

export class QuestionReviewService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly random: () => number = Math.random,
  ) {}

  private async pool(
    studentId: string,
    discipline: string,
    filter: ReviewFilter,
  ): Promise<Item[]> {
    checkDiscipline(discipline);
    // Completed originals only: never disclose keys from an unfinished mixed exam.
    // Reviews live in a different table and cannot redefine this original history.
    const rows = await this.db.resposta.findMany({
      where: { simulado: { alunoId: studentId, finalizadoEm: { not: null } } },
      orderBy: [{ respondidoEm: "desc" }, { id: "desc" }],
      include: {
        questaoSimulado: true,
        questao: { include: { alternativas: { orderBy: { letra: "asc" } } } },
      },
    });
    const seen = new Set<string>(),
      result: Item[] = [];
    for (const row of rows) {
      if (
        row.questaoSimulado &&
        (row.questaoSimulado.simuladoId !== row.simuladoId ||
          row.questaoSimulado.questaoId !== row.questaoId)
      )
        continue;
      if (seen.has(row.questaoId)) continue;
      seen.add(row.questaoId);
      const raw = row.questaoSimulado?.conteudoSnapshot;
      let snapshot = readDiagnosticQuestionSnapshot(raw);
      if (raw && !snapshot) continue;
      if (!snapshot) {
        try {
          snapshot = createDiagnosticQuestionSnapshot(
            row.questao,
            !row.questao.liberadaAcervoEm,
          );
        } catch {
          continue;
        }
      }
      if (
        snapshot.discipline !== discipline ||
        (filter === "incorrect" && row.correta)
      )
        continue;
      result.push(
        itemSchema.parse({
          id: row.questaoId,
          statement: snapshot.statement,
          discipline: snapshot.discipline,
          topic: snapshot.topic,
          level: snapshot.difficulty,
          explanation: snapshot.explanation,
          provisional: Boolean(snapshot.provisional),
          sourceAttemptId: row.simuladoId,
          sourceAnswerId: row.id,
          alternatives: snapshot.alternatives.map((a) => ({
            ...a,
            letter: a.letter!,
          })),
        }),
      );
    }
    return result;
  }

  private activeWhere(
    studentId: string,
    discipline: string,
    topic: string | null,
    filter: ReviewFilter,
  ) {
    return {
      alunoId: studentId,
      disciplina: discipline,
      filtro: filter,
      finalizadaEm: null,
      ...(topic ? { assunto: topic } : {}),
    };
  }
  async availability(
    studentId: string,
    discipline: string,
    topic: string | null,
    filter: ReviewFilter,
  ) {
    const pool = await this.pool(studentId, discipline, filter);
    const filtered = topic ? pool.filter((q) => q.topic === topic) : pool;
    const [active, history] = await Promise.all([
      this.db.sessaoRevisaoQuestao.findFirst({
        where: this.activeWhere(studentId, discipline, topic, filter),
        orderBy: { criadaEm: "asc" },
      }),
      this.db.sessaoRevisaoQuestao.findMany({
        where: { alunoId: studentId, disciplina: discipline },
        orderBy: [{ criadaEm: "desc" }, { id: "desc" }],
        take: 10,
      }),
    ]);
    return {
      provisional: filtered.some((q) => q.provisional),
      availableCount: filtered.length,
      availableQuantities: reviewQuantities(filtered.length),
      topics: [...new Set(pool.map((q) => q.topic))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .map((name) => ({
          name,
          availableCount: pool.filter((q) => q.topic === name).length,
        })),
      activeAttempt: active
        ? {
            id: active.id,
            topic: active.assunto,
            quantity: items(active).length,
          }
        : null,
      history: history.map((row) => ({
        id: row.id,
        filter: row.filtro,
        topic: row.assunto,
        createdAt: row.criadaEm,
        completed: Boolean(row.finalizadaEm),
        quantity: items(row).length,
        answered: Object.keys(answers(row)).length,
      })),
    };
  }

  async start(
    studentId: string,
    discipline: string,
    topic: string | null,
    quantity: number,
    filter: ReviewFilter,
  ) {
    checkDiscipline(discipline);
    const existing = await this.db.sessaoRevisaoQuestao.findFirst({
      where: this.activeWhere(studentId, discipline, topic, filter),
      orderBy: { criadaEm: "asc" },
    });
    if (existing)
      return { attempt: this.publicAttempt(existing), resumed: true };
    const pool = (await this.pool(studentId, discipline, filter)).filter(
      (q) => !topic || q.topic === topic,
    );
    if (!reviewQuantities(pool.length).includes(quantity))
      throw new ApiError(
        409,
        "Escolha uma quantidade disponível no seu histórico de atividades concluídas.",
      );
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.max(0, Math.floor(this.random() * (i + 1))));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const selected = pool.slice(0, quantity);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${studentId} FOR UPDATE`;
      const active = await tx.sessaoRevisaoQuestao.findFirst({
        where: this.activeWhere(studentId, discipline, topic, filter),
        orderBy: { criadaEm: "asc" },
      });
      const row =
        active ??
        (await tx.sessaoRevisaoQuestao.create({
          data: {
            alunoId: studentId,
            disciplina: discipline,
            assunto: topic,
            filtro: filter,
            conteudo: selected as unknown as Prisma.InputJsonValue,
          },
        }));
      return { attempt: this.publicAttempt(row), resumed: Boolean(active) };
    });
  }

  private async require(studentId: string, id: string) {
    const row = await this.db.sessaoRevisaoQuestao.findFirst({
      where: { id, alunoId: studentId },
    });
    if (!row) throw new ApiError(404, "Revisão não encontrada.");
    return row;
  }
  async get(studentId: string, id: string) {
    return this.publicAttempt(await this.require(studentId, id));
  }
  private publicAttempt(row: SessaoRevisaoQuestao) {
    const selected = answers(row),
      pool = items(row);
    return {
      id: row.id,
      mode: "REVIEW",
      filter: row.filtro,
      discipline: row.disciplina,
      topic: row.assunto,
      state: row.finalizadaEm ? "COMPLETED" : "IN_PROGRESS",
      provisional: pool.some((q) => q.provisional),
      questions: pool.map((q, i) => ({
        id: q.id,
        position: i + 1,
        statement: q.statement,
        discipline: q.discipline,
        topic: q.topic,
        level: q.level,
        selectedOptionId: selected[q.id] ?? null,
        alternatives: q.alternatives.map(({ id, letter, text }) => ({
          id,
          letter,
          text,
        })),
        ...(selected[q.id]
          ? { feedback: this.feedback(q, selected[q.id]) }
          : {}),
      })),
    };
  }
  private feedback(q: Item, optionId: string) {
    return {
      correct: Boolean(q.alternatives.find((a) => a.id === optionId)?.correct),
      correctOptionId: q.alternatives.find((a) => a.correct)!.id,
      explanation: q.explanation,
    };
  }
  async answer(
    studentId: string,
    id: string,
    questionId: string,
    alternativeId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SessaoRevisaoQuestao" WHERE id=${id} AND "alunoId"=${studentId} FOR UPDATE`;
      const row = await tx.sessaoRevisaoQuestao.findFirst({
        where: { id, alunoId: studentId },
      });
      if (!row) throw new ApiError(404, "Revisão não encontrada.");
      if (row.finalizadaEm)
        throw new ApiError(409, "Esta revisão já foi finalizada.");
      const q = items(row).find((q) => q.id === questionId);
      if (!q) throw new ApiError(404, "Questão não encontrada nesta revisão.");
      if (!q.alternatives.some((a) => a.id === alternativeId))
        throw new ApiError(422, "Alternativa inválida.");
      const selected = answers(row);
      if (selected[q.id] && selected[q.id] !== alternativeId)
        throw new ApiError(409, "A resposta corrigida não pode ser alterada.");
      selected[q.id] = alternativeId;
      await tx.sessaoRevisaoQuestao.update({
        where: { id },
        data: { respostas: selected },
      });
      return {
        saved: true,
        ...this.feedback(q, alternativeId),
        provisional: q.provisional,
      };
    });
  }
  async finalize(studentId: string, id: string) {
    const row = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SessaoRevisaoQuestao" WHERE id=${id} AND "alunoId"=${studentId} FOR UPDATE`;
      const row = await tx.sessaoRevisaoQuestao.findFirst({
        where: { id, alunoId: studentId },
      });
      if (!row) throw new ApiError(404, "Revisão não encontrada.");
      if (row.finalizadaEm) return row;
      if (items(row).some((q) => !answers(row)[q.id]))
        throw new ApiError(
          409,
          "Confirme todas as respostas antes de finalizar a revisão.",
        );
      return tx.sessaoRevisaoQuestao.update({
        where: { id },
        data: { finalizadaEm: new Date() },
      });
    });
    return this.result(row);
  }
  async getResult(studentId: string, id: string) {
    const row = await this.require(studentId, id);
    if (!row.finalizadaEm)
      throw new ApiError(409, "Finalize a revisão para consultar o resultado.");
    return this.result(row);
  }
  private result(row: SessaoRevisaoQuestao) {
    const pool = items(row),
      selected = answers(row);
    const response = pool.map((q) => ({
      questionId: q.id,
      statement: q.statement,
      discipline: q.discipline,
      selectedOptionId: selected[q.id],
      ...this.feedback(q, selected[q.id]),
      alternatives: q.alternatives.map(({ id, letter, text }) => ({
        id,
        letter,
        text,
      })),
    }));
    const correct = response.filter((a) => a.correct).length;
    return {
      mode: "REVIEW",
      provisional: pool.some((q) => q.provisional),
      total: pool.length,
      correct,
      incorrect: pool.length - correct,
      percentage: Math.round((100 * correct) / pool.length),
      answers: response,
    };
  }
}
