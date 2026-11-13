import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  criarUsuario,
  encerrar,
  limparBanco,
  prisma,
  tokenPara,
} from "./helpers";
import { assertDisposableDatabase } from "./disposable-database";
import { createQuestionReviewRoutes } from "../../routes/question-review-routes";
import { errorHandler } from "../../middlewares/error-handler";
import { importPracticeDrafts } from "../../services/practice-draft-import";
import { createDiagnosticQuestionSnapshot } from "../../services/diagnostic-question-snapshot";
import {
  QuestionReviewService,
  reviewQuantities,
} from "../../services/question-review-service";

let server: Server,
  base: string,
  enabled = true,
  token: string,
  otherToken: string,
  professorToken: string,
  studentId: string,
  sourceIds: string[] = [];
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function originalState() {
  return {
    exams: await prisma.simulado.findMany({
      where: { alunoId: studentId },
      orderBy: { id: "asc" },
      include: {
        questoes: { orderBy: { id: "asc" } },
        respostas: { orderBy: { id: "asc" } },
      },
    }),
    level: (await prisma.user.findUniqueOrThrow({ where: { id: studentId } }))
      .nivelAtual,
  };
}
async function request(
  method: string,
  path: string,
  auth = token,
  body?: unknown,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json() };
}
beforeAll(async () => {
  await assertDisposableDatabase(prisma);
  await limparBanco();
  const operator = await criarUsuario("PROFESSOR");
  professorToken = tokenPara(operator);
  await prisma.user.update({
    where: { id: operator.id },
    data: { role: "ADMIN" },
  });
  const batch = await importPracticeDrafts(
    prisma,
    JSON.parse(
      readFileSync("scripts/drafts/authorial-practice-60.draft.json", "utf8"),
    ),
    operator.id,
  );
  const qs = await prisma.questao.findMany({
    where: {
      loteImportacaoId: batch.batchId,
      disciplina: "Direito Constitucional",
    },
    orderBy: { id: "asc" },
    include: { alternativas: { orderBy: { letra: "asc" } } },
  });
  sourceIds = qs.map((q) => q.id);
  const student = await criarUsuario("ALUNO");
  studentId = student.id;
  token = tokenPara(student);
  otherToken = tokenPara(await criarUsuario("ALUNO"));
  async function original(
    indices: number[],
    completed: boolean,
    correct: (i: number) => boolean,
    date: string,
  ) {
    const exam = await prisma.simulado.create({
      data: {
        tipo: "PERSONALIZADO",
        alunoId: student.id,
        finalizadoEm: completed ? new Date(date) : null,
      },
    });
    for (const [position, index] of indices.entries()) {
      const q = qs[index],
        option = q.alternativas.find((a) => a.correta === correct(index))!;
      const link = await prisma.questaoSimulado.create({
        data: {
          simuladoId: exam.id,
          questaoId: q.id,
          posicao: position + 1,
          conteudoSnapshot: createDiagnosticQuestionSnapshot(q, true),
        },
      });
      await prisma.resposta.create({
        data: {
          simuladoId: exam.id,
          questaoId: q.id,
          questaoSimuladoId: link.id,
          alternativaEscolhidaId: option.id,
          correta: option.correta,
          respondidoEm: new Date(date),
        },
      });
    }
  }
  await original([0, 1, 2, 3, 4, 5], true, (i) => i >= 3, "2026-01-01");
  await original([0], true, () => true, "2026-02-01"); // Most recent completed response wins.
  await original([0, 6], false, () => false, "2026-03-01"); // Never leaks unfinished exam keys.
  const app = express();
  app.use(express.json());
  app.use(
    "/question-review",
    createQuestionReviewRoutes({
      isEnabled: () => enabled,
      service: new QuestionReviewService(prisma, () => 0.5),
    }),
  );
  app.use(errorHandler);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => encerrar(server));

it("protects the review feature, role and per-student history and excludes unfinished originals", async () => {
  enabled = false;
  expect(
    (
      await request(
        "GET",
        "/question-review/catalog/Direito%20Constitucional/availability",
        "",
      )
    ).status,
  ).toBe(503);
  enabled = true;
  expect(
    (
      await request(
        "GET",
        "/question-review/catalog/Direito%20Constitucional/availability",
        "",
      )
    ).status,
  ).toBe(401);
  const professor = await criarUsuario("PROFESSOR");
  professorToken = tokenPara(professor);
  expect(
    (
      await request(
        "GET",
        "/question-review/catalog/Direito%20Constitucional/availability",
        professorToken,
      )
    ).status,
  ).toBe(403);
  const all = await request(
    "GET",
    "/question-review/catalog/Direito%20Constitucional/availability?filter=all",
  );
  expect(all.body).toMatchObject({
    availableCount: 6,
    availableQuantities: [5],
    provisional: true,
  });
  const wrong = await request(
    "GET",
    "/question-review/catalog/Direito%20Constitucional/availability?filter=incorrect",
  );
  expect(wrong.body).toMatchObject({
    availableCount: 2,
    availableQuantities: [2],
  });
  expect(
    (
      await request(
        "GET",
        "/question-review/catalog/Direito%20Constitucional/availability?filter=incorrect",
        otherToken,
      )
    ).body.availableCount,
  ).toBe(0);
  expect(
    (
      await request(
        "GET",
        "/question-review/catalog/Direito%20Constitucional/availability?filter=unknown",
      )
    ).status,
  ).toBe(422);
  const topic = wrong.body.topics[0].name;
  const filtered = await request(
    "GET",
    `/question-review/catalog/Direito%20Constitucional/availability?filter=incorrect&topic=${encodeURIComponent(topic)}`,
  );
  expect(filtered.body.availableCount).toBe(
    wrong.body.topics[0].availableCount,
  );
  expect(reviewQuantities(0)).toEqual([]);
  expect(reviewQuantities(1)).toEqual([1]);
  expect(reviewQuantities(3)).toEqual([3]);
  expect(reviewQuantities(24)).toEqual([5, 10, 20]);
});

it("saves a separate immutable review, resumes feedback, and preserves original responses and level", async () => {
  const before = hash(await originalState());
  const payload = {
    discipline: "Direito Constitucional",
    quantity: 2,
    filter: "incorrect",
  };
  const started = await request("POST", "/question-review", token, payload);
  expect(started.status).toBe(201);
  const attempt = started.body.attempt;
  expect(attempt).toMatchObject({
    mode: "REVIEW",
    state: "IN_PROGRESS",
    provisional: true,
  });
  expect(new Set(attempt.questions.map((q: { id: string }) => q.id))).toEqual(
    new Set([sourceIds[1], sourceIds[2]]),
  );
  expect(JSON.stringify(attempt)).not.toMatch(
    /correctOptionId|explanation|"correct"|sourceAnswerId/,
  );
  expect(
    (await request("POST", "/question-review", token, payload)).body.attempt.id,
  ).toBe(attempt.id);
  expect(
    (await request("GET", `/question-review/${attempt.id}`, otherToken)).status,
  ).toBe(404);
  expect(
    (await request("POST", `/question-review/${attempt.id}/finalize`)).status,
  ).toBe(409);
  expect(
    (await request("GET", `/question-review/${attempt.id}/result`)).status,
  ).toBe(409);
  const first = attempt.questions[0],
    option = first.alternatives[0].id;
  const feedback = await request(
    "PUT",
    `/question-review/${attempt.id}/answers/${first.id}`,
    token,
    { alternativeId: option },
  );
  expect(feedback.status).toBe(200);
  expect(feedback.body.explanation).toBeTruthy();
  expect(
    (
      await request(
        "PUT",
        `/question-review/${attempt.id}/answers/${first.id}`,
        token,
        { alternativeId: option },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        "PUT",
        `/question-review/${attempt.id}/answers/${first.id}`,
        token,
        { alternativeId: first.alternatives[1].id },
      )
    ).status,
  ).toBe(409);
  await prisma.questao.update({
    where: { id: first.id },
    data: { fundamentacaoJuridica: "Alterado somente no banco descartável." },
  });
  const resumed = await request("GET", `/question-review/${attempt.id}`);
  expect(resumed.body.attempt.questions[0].feedback.explanation).toBe(
    feedback.body.explanation,
  );
  expect(resumed.body.attempt.questions[1].feedback).toBeUndefined();
  const next = attempt.questions[1];
  await request(
    "PUT",
    `/question-review/${attempt.id}/answers/${next.id}`,
    token,
    { alternativeId: next.alternatives[0].id },
  );
  const result = await request(
    "POST",
    `/question-review/${attempt.id}/finalize`,
  );
  expect(result.status).toBe(200);
  expect(result.body.result).toMatchObject({
    mode: "REVIEW",
    total: 2,
    provisional: true,
  });
  expect(
    (await request("GET", `/question-review/${attempt.id}/result`)).body.result,
  ).toEqual(result.body.result);
  expect(
    (
      await request(
        "PUT",
        `/question-review/${attempt.id}/answers/${first.id}`,
        token,
        { alternativeId: option },
      )
    ).status,
  ).toBe(409);
  expect(hash(await originalState())).toBe(before);
  const catalog = await request(
    "GET",
    "/question-review/catalog/Direito%20Constitucional/availability?filter=incorrect",
  );
  expect(catalog.body).toMatchObject({
    availableCount: 2,
    activeAttempt: null,
  });
  expect(catalog.body.history[0]).toMatchObject({
    id: attempt.id,
    completed: true,
    quantity: 2,
    answered: 2,
  });
  expect(
    (
      await prisma.$queryRaw<
        { rls: boolean }[]
      >`SELECT relrowsecurity AS rls FROM pg_class WHERE relname='SessaoRevisaoQuestao'`
    )[0].rls,
  ).toBe(true);
});
