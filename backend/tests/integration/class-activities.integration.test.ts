import type { Server } from "node:http";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import {
  iniciarServidor,
  encerrar,
  limparBanco,
  criarUsuario,
  tokenPara,
  prisma,
  questaoValida,
  requisicao,
} from "./helpers";
import { ClassExamService } from "../../src/services/assessments/class-exam-service";
let server: Server, baseUrl: string;
beforeAll(async () => {
  ({ server, baseUrl } = await iniciarServidor());
});
beforeEach(async () => {
  process.env.INSTITUTIONS_ENABLED = "false";
  await limparBanco();
});
afterAll(async () => {
  await encerrar(server);
});
async function fixture() {
  const teacher = await criarUsuario("PROFESSOR"),
    other = await criarUsuario("PROFESSOR"),
    student = await criarUsuario("ALUNO"),
    outsider = await criarUsuario("ALUNO");
  const request = (
    method: string,
    path: string,
    body?: object,
    actor = teacher,
  ) =>
    requisicao(baseUrl, method, path, { token: tokenPara(actor), corpo: body });
  const turma = (
    await request("POST", "/turmas", { nome: "Atividades isoladas" })
  ).corpo.turma;
  await request("POST", `/turmas/${turma.id}/students`, {
    email: student.email,
  });
  const question = (
    await request(
      "POST",
      "/questoes",
      questaoValida({ turmaId: turma.id, publica: false }),
    )
  ).corpo;
  const input = {
    classId: turma.id,
    titulo: "Atividade técnica de teste",
    descricao: "Exclusiva do PostgreSQL descartável",
    questaoIds: [question.id],
    dueAt: null,
  };
  return { teacher, other, student, outsider, turma, question, input, request };
}
it("creates a draft, lists authorized questions, publishes and records real student answers and results", async () => {
  const f = await fixture();
  const questions = await f.request(
    "GET",
    `/atividades/questions?classId=${f.turma.id}`,
  );
  expect(questions.status).toBe(200);
  expect(questions.corpo.items[0].id).toBe(f.question.id);
  expect(JSON.stringify(questions.corpo)).not.toContain('"correta":');
  const saved = await f.request("POST", "/atividades", f.input);
  expect(saved.status).toBe(201);
  const id = saved.corpo.id;
  const draftList = await f.request("GET", `/atividades?classId=${f.turma.id}&status=DRAFT&search=t%C3%A9cnica`);
  expect(draftList.status).toBe(200);
  expect(draftList.corpo).toMatchObject({
    summary: { drafts: 1, published: 0, closed: 0, cancelled: 0 },
    items: [expect.objectContaining({ id, teacherName: f.teacher.nome, status: "DRAFT" })],
  });
  expect((await f.request("GET", `/atividades?classId=${f.turma.id}&search=sem%20correspond%C3%AAncia`)).corpo.items).toEqual([]);
  expect(
    await prisma.classActivity.findUnique({ where: { evaluationId: id } }),
  ).toMatchObject({ classId: f.turma.id, closedAt: null, cancelledAt: null });
  expect(
    (
      await f.request(
        "GET",
        `/atividades?classId=${f.turma.id}&status=PUBLISHED`,
        undefined,
        f.student,
      )
    ).corpo.items,
  ).toEqual([]);
  expect(
    (await f.request("POST", `/atividades/${id}/publish`, {})).status,
  ).toBe(200);
  expect(
    (
      await f.request(
        "GET",
        `/atividades?classId=${f.turma.id}`,
        undefined,
        f.student,
      )
    ).corpo.items[0],
  ).toMatchObject({ id, status: "PUBLISHED", canStart: true });
  // Publicar a atividade não a coloca nas listas independentes de simulados.
  expect((await f.request("GET", "/avaliacoes")).corpo.items).toEqual([]);
  const attempt = await f.request(
    "POST",
    `/avaliacoes/${id}/attempts`,
    {},
    f.student,
  );
  expect(attempt.status).toBe(200);
  expect(
    (await f.request("POST", `/avaliacoes/${id}/attempts`, {}, f.student)).corpo
      .id,
  ).toBe(attempt.corpo.id);
  const chosen = f.question.alternativas.find(
    (a: { correta: boolean }) => a.correta,
  ).id;
  expect(
    (
      await f.request(
        "PUT",
        `/avaliacoes/attempts/${attempt.corpo.id}/answers/${f.question.id}`,
        { selectedOptionId: chosen },
        f.student,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await f.request(
        "POST",
        `/avaliacoes/attempts/${attempt.corpo.id}/finalize`,
        {},
        f.student,
      )
    ).corpo.overallPercentage,
  ).toBe(100);
  const details = await f.request(
    "GET",
    `/avaliacoes/attempts/${attempt.corpo.id}`,
    undefined,
    f.student,
  );
  expect(details.corpo).toMatchObject({
    kind: "ACTIVITY",
    classId: f.turma.id,
    status: "COMPLETED",
    result: { overallPercentage: 100 },
  });
  expect(
    await prisma.resposta.count({ where: { simuladoId: attempt.corpo.id } }),
  ).toBe(1);
});
it("blocks teachers and students from other classes, forged question IDs and global questions lacking editorial release", async () => {
  const f = await fixture();
  const saved = await f.request("POST", "/atividades", f.input),
    id = saved.corpo.id;
  expect(
    (await f.request("POST", "/atividades", f.input, f.other)).status,
  ).toBe(403);
  expect(
    (await f.request("POST", "/atividades", f.input, f.student)).status,
  ).toBe(403);
  expect(
    (await f.request("POST", `/atividades/${id}/publish`, {}, f.other)).status,
  ).toBe(404);
  expect(
    (
      await f.request(
        "GET",
        `/atividades?classId=${f.turma.id}`,
        undefined,
        f.other,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await f.request(
        "GET",
        `/atividades/questions?classId=${f.turma.id}`,
        undefined,
        f.outsider,
      )
    ).status,
  ).toBe(403);
  const global = await prisma.questao.create({
    data: {
      enunciado: "Questão global sem aprovações editoriais",
      disciplina: "Direito Civil",
      assunto: "Teste",
      nivel: "BASICO",
      fundamentacaoJuridica: "Fixture sem aprovação",
      publica: true,
      autorId: f.teacher.id,
      alternativas: {
        create: f.question.alternativas.map(
          (a: { texto: string; correta: boolean; letra: string }) => ({
            texto: a.texto,
            correta: a.correta,
            letra: a.letra,
          }),
        ),
      },
    },
  });
  expect(
    (
      await f.request("POST", "/atividades", {
        ...f.input,
        questaoIds: [global.id],
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.request("GET", `/atividades/questions?classId=${f.turma.id}`)
    ).corpo.items.map((q: { id: string }) => q.id),
  ).not.toContain(global.id);
  const otherClass = (
    await f.request("POST", "/turmas", { nome: "Outra turma" }, f.other)
  ).corpo.turma;
  expect(
    (
      await f.request(
        "POST",
        "/atividades",
        { ...f.input, classId: otherClass.id },
        f.other,
      )
    ).status,
  ).toBe(403);
  await f.request("POST", `/atividades/${id}/publish`, {});
  expect(
    (await f.request("POST", `/avaliacoes/${id}/attempts`, {}, f.outsider))
      .status,
  ).toBe(404);
  expect(
    (
      await f.request(
        "GET",
        `/atividades?classId=${f.turma.id}`,
        undefined,
        f.outsider,
      )
    ).status,
  ).toBe(404);
});
it("edits unstarted activities back to draft and prevents bypass through simulated-exam endpoints", async () => {
  const f = await fixture();
  const id = (await f.request("POST", "/atividades", f.input)).corpo.id;
  await f.request("POST", `/atividades/${id}/publish`, {});
  expect(
    (
      await f.request("PUT", `/atividades/${id}`, {
        ...f.input,
        titulo: "Título atualizado",
      })
    ).status,
  ).toBe(200);
  expect(
    (await f.request("GET", `/atividades?classId=${f.turma.id}`)).corpo
      .items[0],
  ).toMatchObject({ titulo: "Título atualizado", status: "DRAFT" });
  expect(
    (await f.request("POST", `/avaliacoes/${id}/publish`, {})).status,
  ).toBe(404);
  expect(
    (
      await f.request("PUT", `/avaliacoes/${id}`, {
        titulo: "Bypass",
        descricao: "",
        turmaIds: [f.turma.id],
        questaoIds: [f.question.id],
        duracaoSegundos: null,
      })
    ).status,
  ).toBe(404);
  expect((await f.request("POST", `/atividades/${id}/cancel`, {})).status).toBe(
    200,
  );
  expect(
    (await f.request("POST", `/atividades/${id}/publish`, {})).status,
  ).toBe(409);
});
it("closing preserves started attempts, blocks new starts and forbids cancelling or editing started content", async () => {
  const f = await fixture(),
    second = await criarUsuario("ALUNO");
  await f.request("POST", `/turmas/${f.turma.id}/students`, {
    email: second.email,
  });
  const id = (await f.request("POST", "/atividades", f.input)).corpo.id;
  await f.request("POST", `/atividades/${id}/publish`, {});
  const attempt = (
    await f.request("POST", `/avaliacoes/${id}/attempts`, {}, f.student)
  ).corpo.id;
  expect(
    (
      await f.request("PUT", `/atividades/${id}`, {
        ...f.input,
        titulo: "Indevido",
      })
    ).status,
  ).toBe(409);
  expect((await f.request("POST", `/atividades/${id}/cancel`, {})).status).toBe(
    409,
  );
  expect((await f.request("POST", `/atividades/${id}/close`, {})).status).toBe(
    200,
  );
  expect(
    (await f.request("POST", `/avaliacoes/${id}/attempts`, {}, second)).status,
  ).toBe(409);
  expect(
    (await f.request("POST", `/avaliacoes/${id}/attempts`, {}, f.student)).corpo
      .id,
  ).toBe(attempt);
  expect(
    (
      await f.request(
        "PUT",
        `/avaliacoes/attempts/${attempt}/answers/${f.question.id}`,
        { selectedOptionId: f.question.alternativas[0].id },
        f.student,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await f.request(
        "POST",
        `/avaliacoes/attempts/${attempt}/finalize`,
        {},
        f.student,
      )
    ).status,
  ).toBe(200);
});
it("enforces optional deadlines without discarding an already-started attempt", async () => {
  const f = await fixture();
  expect(
    (
      await f.request("POST", "/atividades", {
        ...f.input,
        dueAt: "2000-01-01T00:00:00.000Z",
      })
    ).status,
  ).toBe(422);
  const id = (
    await f.request("POST", "/atividades", {
      ...f.input,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    })
  ).corpo.id;
  await f.request("POST", `/atividades/${id}/publish`, {});
  await prisma.classActivity.update({
    where: { evaluationId: id },
    data: { dueAt: new Date(0) },
  });
  expect(
    (await f.request("POST", `/avaliacoes/${id}/attempts`, {}, f.student))
      .status,
  ).toBe(409);
});
it("preserves activity results after class deletion and blocks new activity operations", async () => {
  const f = await fixture(),
    service = new ClassExamService();
  const id = (await f.request("POST", "/atividades", f.input)).corpo.id;
  await f.request("POST", `/atividades/${id}/publish`, {});
  const student = { userId: f.student.id, role: "ALUNO" };
  const attempt = await service.start(student, id);
  await service.answer(
    student,
    attempt.id,
    f.question.id,
    f.question.alternativas[0].id,
  );
  await service.finalize(student, attempt.id);
  expect(
    (
      await f.request("DELETE", `/turmas/${f.turma.id}`, {
        confirmationName: f.turma.nome,
      })
    ).corpo.mode,
  ).toBe("SOFT");
  expect((await f.request("POST", "/atividades", f.input)).status).toBe(403);
  expect(
    (
      await f.request(
        "GET",
        `/atividades?classId=${f.turma.id}`,
        undefined,
        f.student,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await f.request(
        "GET",
        `/avaliacoes/attempts/${attempt.id}`,
        undefined,
        f.student,
      )
    ).status,
  ).toBe(200);
  expect(
    await prisma.classActivity.count({ where: { evaluationId: id } }),
  ).toBe(1);
  expect(
    await prisma.resposta.count({ where: { simuladoId: attempt.id } }),
  ).toBe(1);
});
