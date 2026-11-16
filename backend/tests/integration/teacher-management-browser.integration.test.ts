import { spawn } from "node:child_process";
import path from "node:path";
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
import { assertDisposableDatabase } from "./disposable-database";
let server: Server, baseUrl: string;
const previousCors=process.env.CORS_ORIGINS;
beforeAll(async () => {
  await assertDisposableDatabase(prisma);
  process.env.CORS_ORIGINS='http://127.0.0.1:5199';
  ({ server, baseUrl } = await iniciarServidor());
});
beforeEach(async () => {
  process.env.INSTITUTIONS_ENABLED = "false";
  await limparBanco();
});
afterAll(async () => {
  await encerrar(server);
  if(previousCors===undefined)delete process.env.CORS_ORIGINS;else process.env.CORS_ORIGINS=previousCors;
});
it("runs the actual frontend against authenticated backend and disposable PostgreSQL, never API fixtures", async () => {
  const teacher = await criarUsuario("PROFESSOR"),
    student = await criarUsuario("ALUNO");
  const request = (method: string, url: string, body?: object) =>
    requisicao(baseUrl, method, url, {
      token: tokenPara(teacher),
      corpo: body,
    });
  const main = (await request("POST", "/turmas", { nome: "Browser atividade" }))
    .corpo.turma;
  const empty = (
    await request("POST", "/turmas", { nome: "Browser exclusão vazia" })
  ).corpo.turma;
  const archived = (
    await request("POST", "/turmas", { nome: "Browser arquivada vazia" })
  ).corpo.turma;
  await request("PATCH", `/turmas/${archived.id}`, { archived: true });
  await request("POST", `/turmas/${main.id}/students`, {
    email: student.email,
  });
  const q = await request(
    "POST",
    "/questoes",
    questaoValida({ publica: false, turmaId: main.id }),
  );
  expect(q.status).toBe(201);
  const initial = await prisma.simulado.create({
    data: {
      tipo: "DIAGNOSTICO",
      alunoId: student.id,
      finalizadoEm: new Date(),
    },
  });
  await prisma.diagnosticoInicial.create({
    data: { alunoId: student.id, simuladoId: initial.id },
  });
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "COMSPEC",
  ])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    JURISSIM_LIVE_BROWSER_API: baseUrl,
    JURISSIM_LIVE_BROWSER_TOKEN: tokenPara(teacher),
    JURISSIM_LIVE_STUDENT_TOKEN: tokenPara(student),
    JURISSIM_LIVE_CLASS_ID: main.id,
    JURISSIM_TEST_CAPABILITY: process.env.JURISSIM_TEST_CAPABILITY,
  });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["tests/test-teacher-live.mjs"], {
      cwd: path.resolve("../frontend"),
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (c) => {
      output += c;
    });
    child.stderr.on("data", (c) => {
      output += c;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Live browser timed out."));
    }, 120000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        console.log(output);
        resolve();
      } else reject(new Error(output));
    });
  });
  expect(
    await prisma.turma.count({
      where: { id: { in: [empty.id, archived.id] } },
    }),
  ).toBe(0);
  expect(await prisma.turma.count({ where: { id: main.id } })).toBe(1);
  expect(
    (await prisma.classLifecycle.findUnique({ where: { classId: main.id } }))
      ?.deletedAt,
  ).not.toBeNull();
  const activity = await prisma.classActivity.findFirst({
    where: { classId: main.id },
  });
  expect(activity?.closedAt).not.toBeNull();
  const attempt = await prisma.simulado.findFirst({
    where: { alunoId: student.id, avaliacaoId: activity!.evaluationId },
    include: { respostas: true },
  });
  expect(attempt?.finalizadoEm).not.toBeNull();
  expect(attempt?.respostas[0].correta).toBe(true);
  expect(
    await prisma.user.count({ where: { id: student.id, deletedAt: null } }),
  ).toBe(1);
}, 180000);
