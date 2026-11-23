import { institutionApplication } from '../fixtures/institution-request';
// PostgreSQL real + Express/serviços reais. Apenas a entrega externa é capturada.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import express from "express";
import cors from "cors";
import path from "node:path";
import { spawn } from "node:child_process";
import bcrypt from "bcrypt";
import { randomUUID, createHash } from "node:crypto";
import type { Server } from "node:http";
import { prisma, limparBanco, questaoValida } from "./helpers";
import { assertDisposableDatabase } from "./disposable-database";
import { AuthController } from "../../src/controllers/auth-controller";
import { AuthService } from "../../src/services/accounts/auth-service";
import { EmailVerificationService } from "../../src/services/accounts/email-verification-service";
import { PasswordRecoveryService } from "../../src/services/accounts/password-recovery-service";
import { InstitutionService } from "../../src/services/institutions/institution-service";
import { InvitationOnboardingService } from "../../src/services/institutions/invitation-onboarding";
import type { TransactionalEmail } from "../../src/services/email/brevo-email-transport";
import { createAuthRoutes } from "../../src/routes/auth-routes";
import { createInstitutionRoutes } from "../../src/routes/institution-routes";
import { classRoutes, examRoutes } from "../../src/routes/class-exam-routes";
import { activityRoutes } from "../../src/routes/class-activity-routes";
import { goalRoutes, reportRoutes } from "../../src/routes/goals-reports-routes";
import { studentHistoryRoutes } from "../../src/routes/student-history-routes";
import { profilePhotoRoutes } from "../../src/routes/profile-photo-routes";
import questaoRoutes from "../../src/routes/questaoRoutes";
import { requireAuth } from "../../src/middlewares/auth-middleware";
import { denyGlobalAcademicAccess } from "../../src/middlewares/academic-access";
import { errorHandler } from "../../src/middlewares/error-handler";
import versions from "../../src/legal-versions.json";

const password = "Isolated-flow-original1!",
  changedPassword = "Isolated-flow-replacement1!";
const acceptance = { accepted: true, ...versions };
let base: string, server: Server;
let resetAuthRoutes: () => void;
let resetInstitutionRoutes: () => void;
const delivered: TransactionalEmail[] = [],
  verification: string[] = [],
  recovery: string[] = [];
const delivery = {
  isConfigured: true,
  send: async (email: TransactionalEmail) => {
    delivered.push(email);
  },
};
const institutionService = new InstitutionService(delivery),
  onboarding = new InvitationOnboardingService(delivery);
const tokenFrom = (url: string, key = "token") =>
  new URLSearchParams(url.split("?")[1]).get(key)!;
const invitationToken = () =>
  delivered[delivered.length - 1]!.text.match(/token=([a-f0-9]{64})/)![1];
async function request(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  institution?: string,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(institution
        ? {
            "X-Institution-Id": institution,
            "X-Institution-Context": "administration",
          }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function account(role: "ALUNO" | "PROFESSOR" | "ADMIN" = "ALUNO") {
  const user = await prisma.user.create({
    data: {
      nome: "Isolated integration fixture",
      termsVersion: '2026-11-13.1', privacyVersion: '2026-11-22.1', legalAcceptedAt: new Date(),
      email: randomUUID() + "@example.invalid",
      role,
      senhaHash: await bcrypt.hash(password, 4),
      emailVerifiedAt: new Date(),
    },
  });
  return {
    ...user,
    token: (
      await request("POST", "/auth/login", undefined, {
        email: user.email,
        senha: password,
      })
    ).body.token as string,
  };
}
async function approved(registrationNumber = institutionApplication.registrationNumber as string) {
  const owner = await account(),
    admin = await account("ADMIN");
  const created = await request("POST", "/institutions/requests", owner.token, {
    ...institutionApplication,
    registrationNumber,
    name: "Isolated legal course " + randomUUID(),
    responsibleName: "Isolated owner",
    tradeName: "Isolated course",
    representativePosition: "Director",
    contactEmail: "institution@example.invalid",
    phone: "11999999999",
    description: "Isolated institutional integration test",
  });
  expect(created.status).toBe(201);
  expect(created.body.status).toBe("PENDING");
  const id = created.body.id as string;
  expect(
    (
      await request(
        "GET",
        "/institutions/" + id + "/summary?page=1",
        owner.token,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        "PATCH",
        "/institutions/admin/institutions/" + id,
        admin.token,
        { status: "ACTIVE", reason: "Approved isolated fixture" },
      )
    ).status,
  ).toBe(200);
  owner.token = (
    await request("POST", "/auth/login", undefined, {
      email: owner.email,
      senha: password,
    })
  ).body.token;
  return {
    owner,
    admin,
    id,
    actor: {
      userId: owner.id,
      role: "ALUNO",
      institutionId: id,
      institutionAdmin: true,
    },
  };
}
beforeAll(async () => {
  await assertDisposableDatabase(prisma);
  const controller = new AuthController(
    new AuthService(),
    new PasswordRecoveryService(
      undefined,
      {
        isConfigured: true,
        sendPasswordRecovery: async (e) => {
          recovery.push(e.resetUrl);
        },
      },
      "http://127.0.0.1:5173",
    ),
    new EmailVerificationService(
      undefined,
      {
        isConfigured: true,
        sendEmailVerification: async (e) => {
          verification.push(e.verifyUrl);
        },
      },
      "http://127.0.0.1:5173",
    ),
  );
  const app = express();
  app.use(cors({ origin: "http://127.0.0.1:5187" }));
  app.use(express.json());
  let authRouter = createAuthRoutes(controller);
  resetAuthRoutes = () => { authRouter = createAuthRoutes(controller); };
  app.use("/auth", (req, res, next) => authRouter(req, res, next));
  let institutionRouter = createInstitutionRoutes(institutionService, onboarding);
  resetInstitutionRoutes = () => { institutionRouter = createInstitutionRoutes(institutionService, onboarding); };
  app.use("/institutions", (req,res,next) => institutionRouter(req,res,next));
  app.use("/students/me", studentHistoryRoutes);
  app.use("/profile/photo", profilePhotoRoutes);
  app.use(
    ["/questoes", "/turmas", "/avaliacoes", "/reports", "/goals"],
    requireAuth,
    denyGlobalAcademicAccess,
  );
  app.use("/turmas", classRoutes);
  app.use("/avaliacoes", examRoutes);
  app.use("/atividades", activityRoutes);
  app.use("/questoes", questaoRoutes);
  app.use("/reports", reportRoutes);
  app.use("/goals", goalRoutes);
  app.use(errorHandler);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
beforeEach(async () => {
  resetAuthRoutes(); // Cada teste tem uma janela de limite de requisições nova; os limites de produção continuam intactos.
  resetInstitutionRoutes();
  vi.stubEnv("INSTITUTIONS_ENABLED", "true");
  vi.stubEnv("INSTITUTION_TEACHER_MANAGEMENT_ENABLED", "false");
  vi.stubEnv("INSTITUTION_EXAM_MANAGEMENT_ENABLED", "false");
  vi.stubEnv("ADMINISTRATION_ENABLED", "false");
  vi.stubEnv("INSTITUTION_REGISTRATION_ENABLED", "false");
  vi.stubEnv("APP_PUBLIC_URL", "http://127.0.0.1:5173");
  vi.stubEnv("INITIAL_DIAGNOSTIC_REQUIRED", "false");
  vi.stubEnv("CORS_ORIGINS", "http://127.0.0.1:5187");
  await limparBanco();
  delivered.length = verification.length = recovery.length = 0;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

describe("institutional flows with real isolated PostgreSQL", () => {
  it('activates only administration with real counts and denies non-admin identities', async () => {
    vi.stubEnv('INSTITUTIONS_ENABLED', 'false');
    vi.stubEnv('ADMINISTRATION_ENABLED', 'true');
    const admin = await account('ADMIN'), student = await account(), teacher = await account('PROFESSOR');
    const availability = await request('GET', '/institutions/availability', admin.token);
    expect(availability.body.enabled).toBe(false);
    expect(availability.body.administrationEnabled).toBe(true);
    const summary = await request('GET', '/institutions/admin/summary', admin.token);
    expect(summary.status).toBe(200);
    expect(summary.body.users).toBe(await prisma.user.count({where:{deletedAt:null}}));
    expect(summary.body.institutions).toBe(await prisma.institution.count());
    expect((await request('GET', '/institutions/admin/users?page=1', admin.token)).status).toBe(200);
    for (const user of [student, teacher]) {
      expect((await request('GET', '/institutions/admin/summary', user.token)).status).toBe(403);
      expect((await request('GET', '/institutions/admin/users?page=1', user.token)).status).toBe(403);
    }
    expect((await request('GET', '/institutions/admin/summary')).status).toBe(401);
    expect(delivered).toHaveLength(0);
  });
  it.each(['ALUNO','PROFESSOR','ADMIN'] as const)('login, refresh and logout preserve profile %s', async role => {
    const user = await account(role);
    for (let refresh = 0; refresh < 2; refresh++) {
      expect((await request('GET','/auth/session',user.token)).body.user.role).toBe(role);
    }
    expect((await request('POST','/auth/logout',user.token)).status).toBe(200);
    expect((await request('GET','/auth/session',user.token)).status).toBe(401);
    const relogin = await request('POST','/auth/login',undefined,{email:user.email,senha:password});
    expect(relogin.status).toBe(200);
    expect((await request('GET','/auth/session',relogin.body.token)).body.user.role).toBe(role);
  });

  it('allows approved institutional read access while keeping all operational writes disabled', async () => {
    const { owner, id } = await approved();
    owner.token = (await request('POST','/auth/login',undefined,{email:owner.email,senha:password})).body.token;
    vi.stubEnv('INSTITUTIONS_ENABLED','false');
    vi.stubEnv('ADMINISTRATION_ENABLED','false');
    vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','false');
    resetInstitutionRoutes();
    const session = await request('GET','/auth/session',owner.token);
    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({registrationIntent:'INSTITUTION',institutionalStatus:'ACTIVE',nextStep:'DASHBOARD',user:{role:'ALUNO'}});
    expect(session.body.administration).toMatchObject({enabled:false,readOnly:true,memberships:[{institutionId:id,role:'INSTITUTION_ADMIN'}]});
    expect((await request('GET','/institutions/availability',owner.token)).body.enabled).toBe(false);
    expect((await request('GET',`/institutions/${id}/summary?page=1`,owner.token)).status).toBe(200);
    const before = await prisma.turma.count();
    expect((await request('POST','/turmas',owner.token,{nome:'Must not be created'},id)).status).toBe(503);
    expect(await prisma.turma.count()).toBe(before);
    expect((await request('POST',`/institutions/${id}/invitations`,owner.token,{email:'blocked@example.invalid'},id)).status).toBe(503);
  });

  it('enables isolated teacher invitations and class assignment without the global institutions flag', async () => {
    const { owner, id } = await approved();
    const other = await approved('11222333000181');
    const classResult = await request('POST','/turmas',owner.token,{nome:'Scoped teacher operations class'},id);
    expect(classResult.status).toBe(201);
    const classId = classResult.body.turma.id as string;
    const teacher = await account();
    vi.stubEnv('INSTITUTIONS_ENABLED','false');
    vi.stubEnv('INSTITUTION_TEACHER_MANAGEMENT_ENABLED','true');
    vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED','false');
    vi.stubEnv('TEACHER_INVITATIONS_MODE','institutional');
    vi.stubEnv('ADMINISTRATION_ENABLED','false');
    vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','false');
    resetInstitutionRoutes();
    const availability = await request('GET','/institutions/availability');
    expect(availability.body).toMatchObject({enabled:false,capabilities:{teacherManagement:true,teacherInvitations:true,examManagement:false,institutionalOperations:false}});
    const sent = await request('POST',`/institutions/${id}/invitations`,owner.token,{email:teacher.email,message:'Convite de teste isolado'},id);
    expect(sent.status).toBe(201);
    expect(delivered[delivered.length - 1]?.text).toContain('Convite de teste isolado');
    const pending = await request('GET',`/institutions/${id}/invitations?page=1&status=PENDING`,owner.token,undefined,id);
    expect(pending.status).toBe(200);
    expect(pending.body.items).toHaveLength(1);
    expect(pending.body.items[0].email).toBe(teacher.email);
    expect((await request('POST',`/institutions/${other.id}/invitations`,owner.token,{email:randomUUID()+'@example.invalid'},other.id)).status).toBe(403);
    const invitationTokenValue = invitationToken();
    expect((await request('POST','/institutions/invitations/accept',teacher.token,{token:invitationTokenValue})).status).toBe(200);
    const membership = await prisma.institutionalMembership.findUniqueOrThrow({where:{institutionId_userId_role:{institutionId:id,userId:teacher.id,role:'TEACHER'}}});
    expect(membership.active).toBe(true);
    expect((await request('PUT',`/turmas/${classId}/teachers/${teacher.id}`,owner.token,{assigned:true},id)).status).toBe(200);
    expect((await prisma.turma.findUniqueOrThrow({where:{id:classId},select:{professores:{select:{id:true}}} })).professores.map(person=>person.id)).toContain(teacher.id);
    vi.stubEnv('INSTITUTION_EXAM_MANAGEMENT_ENABLED','true');
    const examCapability = await request('GET','/institutions/availability');
    expect(examCapability.body.capabilities).toMatchObject({examManagement:true,teacherManagement:true,institutionalOperations:false});
    const question = await request('POST','/questoes',teacher.token,questaoValida({turmaId:classId,publica:false}));
    expect(question.status).toBe(201);
    const exam = await request('POST','/avaliacoes',owner.token,{titulo:'Institutional assessment',descricao:'One authorized question',duracaoSegundos:1800,turmaIds:[classId],questaoIds:[question.body.id],responsibleTeacherId:teacher.id},id);
    expect(exam.status,JSON.stringify(exam.body)).toBe(201);
    expect(exam.body.autorId).toBe(teacher.id);
    expect((await request('POST',`/avaliacoes/${exam.body.id}/publish`,owner.token,{},id)).status).toBe(200);
    expect((await request('GET','/avaliacoes?page=1',owner.token,undefined,id)).body.items).toEqual(expect.arrayContaining([expect.objectContaining({id:exam.body.id,publishedAt:expect.any(String)})]));
    expect((await request('POST','/avaliacoes',owner.token,{titulo:'Cross institution',descricao:'',duracaoSegundos:null,turmaIds:[classId],questaoIds:[question.body.id]},other.id)).status).toBe(403);
  });

  it('returns pending application status without exposing student or administrative operations', async () => {
    const owner = await account();
    await prisma.user.update({where:{id:owner.id},data:{registrationIntent:'INSTITUTION'}});
    await prisma.institution.create({data:{
      name:'Pending isolated institution '+randomUUID(),responsibleName:'Pending owner',ownerId:owner.id,
      email:owner.email,phone:'11999999999',description:'Pending institutional status integration test',status:'PENDING',
    }});
    vi.stubEnv('INSTITUTIONS_ENABLED','false');
    vi.stubEnv('ADMINISTRATION_ENABLED','false');
    vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','false');
    resetInstitutionRoutes();
    const session = await request('GET','/auth/session',owner.token);
    expect(session.body).toMatchObject({registrationIntent:'INSTITUTION',institutionalStatus:'PENDING',user:{role:'ALUNO'}});
    expect(session.body.administration).toMatchObject({enabled:false,readOnly:true,memberships:[]});
  });

  it('rejects an application by ADMIN without granting institutional privileges', async () => {
    const owner = await account(), admin = await account('ADMIN');
    const application = await request('POST','/institutions/requests',owner.token,institutionApplication);
    expect(application.status).toBe(201);
    expect((await request('PATCH','/institutions/admin/institutions/'+application.body.id,admin.token,{status:'REJECTED',reason:'Representação não comprovada no teste isolado'})).status).toBe(200);
    expect((await request('GET','/auth/session',owner.token)).body.administration.memberships).toEqual([]);
    expect((await request('POST','/institutions/'+application.body.id+'/invitations',owner.token,{email:'teacher@example.invalid'})).status).toBe(403);
  });
  it('keeps approved owners isolated from another institution', async () => {
    const first = await approved(), second = await approved('11222333000181');
    expect((await request('GET','/institutions/'+second.id+'/summary?page=1',first.owner.token)).status).toBe(403);
    expect((await request('POST','/institutions/'+second.id+'/invitations',first.owner.token,{email:'teacher@example.invalid'})).status).toBe(403);
    expect((await request('GET','/institutions/'+first.id+'/summary?page=1',second.owner.token)).status).toBe(403);
  });
  it('persists institutional signup intent across confirmation and a new login without granting membership', async () => {
    const email = randomUUID().toUpperCase() + '@Example.invalid';
    const registration = await request('POST', '/auth/register', undefined, {
      nome: 'Institution applicant', email, senha: password, confirmacaoSenha: password,
      acceptance, registrationIntent: 'INSTITUTION',
    });
    expect(registration.status).toBe(201);
    expect(registration.body.usuario.email).toBe(email.toLowerCase());
    expect((await request('POST', '/auth/register', undefined, {
      nome: 'Duplicate applicant', email: email.toLowerCase(), senha: password, confirmacaoSenha: password, acceptance,
    })).status).toBe(409);
    const pending = await request('GET', '/auth/session', registration.body.token);
    expect(pending.body).toMatchObject({ registrationIntent: 'INSTITUTION', user: { role: 'ALUNO', emailVerificado: false } });
    expect((await request('POST', '/institutions/requests', registration.body.token, {})).status).toBe(403);
    expect((await request('POST', '/auth/email-verification/confirm', undefined, { token: tokenFrom(verification[0]) })).status).toBe(200);
    const login = await request('POST', '/auth/login', undefined, { email, senha: password });
    expect(login.status).toBe(200);
    const session = await request('GET', '/auth/session', login.body.token);
    expect(session.body).toMatchObject({ registrationIntent: 'INSTITUTION', user: { role: 'ALUNO', emailVerificado: true } });
    expect(session.body.administration.memberships).toEqual([]);
    expect(await prisma.institution.count()).toBe(0);
  });
  it('deactivates without deleting history, revokes sessions and consumes outstanding tokens', async () => {
    const user = await account();
    await prisma.metaDiaria.create({ data: { alunoId: user.id, data: new Date('2026-11-11'), metaQuestoes: 5 } });
    await prisma.authToken.create({ data: { userId: user.id, type: 'EMAIL_VERIFICATION', tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
    await request('POST', '/auth/password-recovery', undefined, { email: user.email });
    expect((await request('POST', '/auth/conta/desativacao', user.token, { senhaAtual: password })).status).toBe(422);
    expect((await request('POST', '/auth/conta/desativacao', user.token, { senhaAtual: 'wrong', confirmation: 'DESATIVAR' })).status).toBe(400);
    expect((await request('DELETE', '/auth/conta', user.token, { senhaAtual: password })).status).toBe(400);
    expect((await request('POST', '/auth/conta/desativacao', user.token, { senhaAtual: password, confirmation: 'DESATIVAR' })).status).toBe(200);
    expect((await request('GET', '/auth/session', user.token)).status).toBe(401);
    expect((await request('POST', '/auth/login', undefined, { email: user.email, senha: password })).status).toBe(401);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.email).toBe(user.email);
    expect(stored.sessionVersion).toBe(1);
    expect(await prisma.metaDiaria.count({ where: { alunoId: user.id } })).toBe(1);
    expect(await prisma.authToken.count({ where: { userId: user.id, usedAt: null } })).toBe(0);
    expect(await prisma.passwordRecoveryToken.count({ where: { userId: user.id, consumedAt: null } })).toBe(0);
  });
  it('blocks institutional owners even while feature flags are off', async () => {
    const { owner, id } = await approved();
    vi.stubEnv('INSTITUTIONS_ENABLED', 'false');
    expect((await request('POST', '/auth/conta/desativacao', owner.token, { senhaAtual: password, confirmation: 'DESATIVAR' })).status).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).deletedAt).toBeNull();
    expect((await prisma.institution.findUniqueOrThrow({ where: { id } })).status).toBe('ACTIVE');
  });
  it('retains application details for ADMIN review without promoting the requester', async () => {
    const { owner, id, admin } = await approved();
    const listing = await request('GET', '/institutions/admin/institutions?page=1', admin.token);
    expect(listing.status).toBe(200);
    expect(listing.body.items.find((item: {id: string}) => item.id === id)).toMatchObject({
      tradeName: 'Isolated course', representativePosition: 'Director', contactEmail: 'institution@example.invalid', street: 'Rua de teste', representationDeclaration: true,
    });
    expect((await request('GET', '/auth/session', owner.token)).body.user.role).toBe('ALUNO');
  });
  it("renders the twelve institutional modules through real frontend/API/database without mocked sessions", async () => {
    const { id, owner, admin, actor } = await approved();
    const teacher = await account(),
      student = await account();
    await institutionService.invite(actor, id, teacher.email);
    await institutionService.accept(
      { userId: teacher.id, role: "ALUNO" },
      invitationToken(),
    );
    await new Promise<void>((resolve, reject) => {
      let output = '';
      const capture = (chunk: Buffer) => {
        output = (output + chunk.toString()
          .split(password).join('[REDACTED]')
          .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[DATABASE_URL]')
          .replace(/[a-f0-9]{64}/gi, '[REDACTED]')
          .replace(/[\w.+-]+@[\w.-]+/g, '[EMAIL]')).slice(-24000);
      };
      const child = spawn(
        process.execPath,
        [path.resolve("../frontend/tests/test-institution-db.mjs")],
        {
          cwd: path.resolve("../frontend"),
          windowsHide: true,
          env: {
            ...process.env,
            JURISSIM_DB_UI_API: base,
            JURISSIM_DB_UI_OWNER: owner.email,
            JURISSIM_DB_UI_PASSWORD: password,
            JURISSIM_DB_UI_INSTITUTION: id,
            JURISSIM_DB_UI_ADMIN: admin.email,
            JURISSIM_DB_UI_TEACHER: teacher.email,
            JURISSIM_DB_UI_STUDENT: student.email,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      child.stdout.on("data", (chunk) => { capture(chunk); process.stdout.write(chunk); });
      child.stderr.on("data", (chunk) => { capture(chunk); process.stderr.write(chunk); });
      child.once("error", reject);
      child.once("close", (code, signal) =>
        code === 0
          ? resolve()
          : reject(new Error(`Isolated real-database browser flow failed (exit=${code}; signal=${signal}):\n${output}`)),
      );
    });
  }, 90000);
  it("registers, confirms email, recovers password and revokes sessions without an institution", async () => {
    const email = randomUUID() + "@example.invalid";
    expect(
      (
        await request("POST", "/auth/register", undefined, {
          nome: "Isolated student",
          email,
          senha: password,
          confirmacaoSenha: password,
          acceptance,
          role: "PROFESSOR",
        })
      ).status,
    ).toBe(400);
    const registration = await request("POST", "/auth/register", undefined, {
      nome: "Isolated student",
      email,
      senha: password,
      confirmacaoSenha: password,
      acceptance,
    });
    expect(registration.status).toBe(201);
    expect(verification).toHaveLength(1);
    expect(
      (
        await request("POST", "/auth/email-verification/confirm", undefined, {
          token: tokenFrom(verification[0]),
        })
      ).status,
    ).toBe(200);
    const login = await request("POST", "/auth/login", undefined, {
      email,
      senha: password,
    });
    expect(login.status).toBe(200);
    const token = login.body.token;
    const session = await request("GET", "/auth/session", token);
    expect(session.body.user.role).toBe("ALUNO");
    expect(session.body.administration.memberships).toHaveLength(0);
    expect(
      (
        await request("POST", "/goals", token, {
          date: "2026-11-06",
          targetQuestions: 10,
        })
      ).status,
    ).toBe(201);
    expect(
      (await request("POST", "/auth/password-recovery", undefined, { email }))
        .status,
    ).toBe(202);
    expect(recovery).toHaveLength(1);
    expect(
      (
        await request("POST", "/auth/password-reset", undefined, {
          token: tokenFrom(recovery[0]),
          senha: changedPassword,
          confirmacaoSenha: changedPassword,
        })
      ).status,
    ).toBe(200);
    expect((await request("GET", "/auth/session", token)).status).toBe(401);
    const next = await request("POST", "/auth/login", undefined, {
      email,
      senha: changedPassword,
    });
    expect(next.status).toBe(200);
    expect(
      (await request("POST", "/auth/logout", next.body.token)).status,
    ).toBe(200);
    expect(
      (await request("GET", "/auth/session", next.body.token)).status,
    ).toBe(401);
    expect(await prisma.metaDiaria.count()).toBe(1);
  });
  it("approves a pending request and exposes only authorized institutional data and account notifications", async () => {
    const { owner, admin, id } = await approved(),
      outsider = await account();
    const session = await request("GET", "/auth/session", owner.token);
    expect(session.body.user.role).toBe("ALUNO");
    expect(
      session.body.administration.memberships.some(
        (m: any) => m.institutionId === id && m.role === "INSTITUTION_ADMIN",
      ),
    ).toBe(true);
    const summary = await request(
      "GET",
      "/institutions/" + id + "/summary?page=1",
      owner.token,
    );
    expect(summary.status).toBe(200);
    expect(summary.body.indicators.students).toBe(0);
    expect(
      (
        await request(
          "GET",
          "/institutions/" + id + "/summary?page=1",
          outsider.token,
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("GET", "/institutions/admin/summary", owner.token)).status,
    ).toBe(403);
    expect(
      (await request("GET", "/institutions/notifications?page=1", owner.token))
        .body.items.length,
    ).toBeGreaterThan(0);
    expect(
      (
        await request(
          "GET",
          "/institutions/" + id + "/logs?page=1",
          owner.token,
        )
      ).body.items.length,
    ).toBeGreaterThan(0);
    for (const route of [
      "/turmas",
      "/avaliacoes",
      "/reports/classes",
      "/questoes",
    ])
      expect((await request("GET", route, admin.token)).status).toBe(403);
    await expect(prisma.administrativeEvent.deleteMany()).rejects.toThrow();
    const modes = await prisma.$queryRaw<
      { mode: string }[]
    >`SELECT current_setting('session_replication_role') AS mode`;
    expect(modes[0].mode).toBe("origin");
  });
  it("completes first invitation access with real proof/password persistence and rejects reuse", async () => {
    const { id, actor } = await approved();
    const email = randomUUID() + "@example.invalid";
    await institutionService.invite(actor, id, email, undefined, {
      name: "Invited isolated teacher",
      message: "Mensagem institucional de teste isolado",
    });
    expect(delivered[delivered.length - 1]?.text).toContain("Mensagem institucional de teste isolado");
    const token = invitationToken();
    await onboarding.start(token, "Invited isolated teacher", acceptance);
    const proof = delivered[delivered.length - 1]!.text.match(
      /confirmacao=([a-f0-9]{64})/,
    )![1];
    const pending = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(pending.emailVerifiedAt).toBeNull();
    expect(pending.role).toBe("ALUNO");
    await onboarding.complete(token, proof, password, password);
    const prepared = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(prepared.role).toBe("ALUNO");
    expect(prepared.registrationIntent).toBe("TEACHER_INVITATION");
    expect(await prisma.institutionalMembership.count({ where: { userId: prepared.id } })).toBe(0);
    expect((await prisma.teacherInvitation.findUniqueOrThrow({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } })).status).toBe("PENDING");
    await institutionService.accept({ userId: prepared.id, role: "ALUNO" }, token);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.id).toBe(pending.id);
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.role).toBe("PROFESSOR");
    expect(await bcrypt.compare(password, user.senhaHash!)).toBe(true);
    expect(
      await prisma.institutionalMembership.count({
        where: {
          userId: user.id,
          institutionId: id,
          active: true,
          role: "TEACHER",
        },
      }),
    ).toBe(1);
    await expect(
      onboarding.complete(token, proof, password, password),
    ).rejects.toMatchObject({ statusCode: 409 });
    const login = await request("POST", "/auth/login", undefined, {
      email,
      senha: password,
    });
    expect(login.status).toBe(200);
    expect(
      (await request("GET", "/auth/session", login.body.token)).body.user.role,
    ).toBe("PROFESSOR");
  });
  it("accepts or declines using the existing identity without replacing its academic data or password", async () => {
    const { id, actor } = await approved();
    const existing = await account();
    await institutionService.invite(actor, id, existing.email);
    const token = invitationToken();
    expect(
      (
        await request(
          "POST",
          "/institutions/invitations/accept",
          existing.token,
          { token },
        )
      ).status,
    ).toBe(200);
    const saved = await prisma.user.findUniqueOrThrow({
      where: { id: existing.id },
    });
    expect(saved.senhaHash).toBe(existing.senhaHash);
    expect(saved.email).toBe(existing.email);
    expect(saved.role).toBe("PROFESSOR");
    const declining = await account();
    await institutionService.invite(actor, id, declining.email);
    const decline = invitationToken();
    expect(
      (
        await request(
          "POST",
          "/institutions/invitations/decline",
          declining.token,
          { token: decline },
        )
      ).status,
    ).toBe(200);
    expect(
      await prisma.institutionalMembership.count({
        where: { userId: declining.id },
      }),
    ).toBe(0);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: declining.id } }))
        .role,
    ).toBe("ALUNO");
  });
  it("rotates expired invitation tokens, rejects duplicates and foreign identities, and preserves an existing professor account", async () => {
    const { id, actor, owner } = await approved();
    const existing = await account('PROFESSOR'), foreign = await account();
    const original = await prisma.user.findUniqueOrThrow({where:{id:existing.id}});
    await institutionService.invite(actor,id,existing.email);
    const first = invitationToken();
    const record = await prisma.teacherInvitation.findUniqueOrThrow({where:{tokenHash:createHash('sha256').update(first).digest('hex')}});
    await expect(institutionService.invite(actor,id,existing.email)).rejects.toMatchObject({statusCode:409});
    expect((await request('POST','/institutions/invitations/accept',foreign.token,{token:first})).status).toBe(403);
    await prisma.teacherInvitation.update({where:{id:record.id},data:{expiresAt:new Date(0),createdAt:new Date(Date.now()-120_000)}});
    expect((await request('POST','/institutions/invitations/accept',existing.token,{token:first})).status).toBe(409);
    expect((await request('POST',`/institutions/${id}/invitations/${record.id}/resend`,owner.token)).status).toBe(200);
    const second = invitationToken();
    expect(second).not.toBe(first);
    expect((await request('POST','/institutions/invitations/accept',existing.token,{token:first})).status).toBe(409);
    const replacement = await prisma.teacherInvitation.findUniqueOrThrow({where:{tokenHash:createHash('sha256').update(second).digest('hex')}});
    expect((await request('DELETE',`/institutions/${id}/invitations/${replacement.id}`,owner.token)).status).toBe(200);
    expect((await request('POST','/institutions/invitations/accept',existing.token,{token:second})).status).toBe(409);
    await institutionService.invite(actor,id,existing.email);
    const usable = invitationToken();
    expect((await request('POST','/institutions/invitations/accept',existing.token,{token:usable})).status).toBe(200);
    const saved=await prisma.user.findUniqueOrThrow({where:{id:existing.id}});
    expect(saved).toMatchObject({id:original.id,email:original.email,senhaHash:original.senhaHash,role:'PROFESSOR'});
    expect(await prisma.institutionalMembership.count({where:{userId:existing.id,institutionId:id,role:'TEACHER',active:true}})).toBe(1);
    await institutionService.accept({userId:existing.id,role:'PROFESSOR'},usable);
    expect(await prisma.institutionalMembership.count({where:{userId:existing.id,institutionId:id,role:'TEACHER',active:true}})).toBe(1);
  });
  it("creates institutional classes/exams, approves a student and revokes the teacher without losing history", async () => {
    const { id, actor, owner } = await approved(),
      teacher = await account(),
      student = await account();
    await institutionService.invite(actor, id, teacher.email);
    await institutionService.accept(
      { userId: teacher.id, role: "ALUNO" },
      invitationToken(),
    );
    teacher.token = (
      await request("POST", "/auth/login", undefined, {
        email: teacher.email,
        senha: password,
      })
    ).body.token;
    const created = await request(
      "POST",
      "/turmas",
      owner.token,
      { nome: "Institution-owned class" },
      id,
    );
    expect(created.status).toBe(201);
    const classId = created.body.turma.id;
    expect(
      await prisma.institutionalClass.findUnique({ where: { classId } }),
    ).toMatchObject({ institutionId: id });
    expect(
      (
        await request(
          "PUT",
          `/turmas/${classId}/teachers/${teacher.id}`,
          owner.token,
          { assigned: true },
          id,
        )
      ).status,
    ).toBe(200);
    const question = await request(
      "POST",
      "/questoes",
      teacher.token,
      questaoValida({ turmaId: classId, publica: false }),
    );
    expect(question.status, `question creation failed: ${JSON.stringify(question.body)}`).toBe(201);
    const activity = await request("POST", "/atividades", owner.token, {
      classId,
      titulo: "Isolated institutional activity",
      descricao: "Activity created by the authorized institution owner",
      questaoIds: [question.body.id],
      dueAt: null,
      maxPoints: 10,
    }, id);
    expect(activity.status, `activity creation failed: ${JSON.stringify(activity.body)}`).toBe(201);
    expect((await request("POST", `/atividades/${activity.body.id}/publish`, owner.token, {}, id)).status).toBe(200);
    const exam = await request(
      "POST",
      "/avaliacoes",
      owner.token,
      {
        titulo: "Isolated assessment",
        descricao: "",
        duracaoSegundos: null,
        turmaIds: [classId],
        questaoIds: [question.body.id],
        responsibleTeacherId: teacher.id,
      },
      id,
    );
    expect(exam.status).toBe(201);
    expect(exam.body.autorId).toBe(teacher.id);
    expect(
      (
        await request(
          "POST",
          `/avaliacoes/${exam.body.id}/publish`,
          owner.token,
          {},
          id,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request("POST", "/turmas/join", student.token, {
          code: created.body.inviteCode,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "POST",
          `/avaliacoes/${exam.body.id}/attempts`,
          student.token,
          {},
        )
      ).status,
    ).toBe(404);
    const pending = await request(
      "GET",
      `/turmas/${classId}/requests?page=1`,
      owner.token,
      undefined,
      id,
    );
    expect(pending.status).toBe(200);
    expect(pending.body.items[0].status).toBe("PENDING");
    expect(
      (
        await request(
          "PATCH",
          `/turmas/${classId}/requests/${pending.body.items[0].id}`,
          owner.token,
          { approve: true },
          id,
        )
      ).status,
    ).toBe(200);
    const attempt = await request(
      "POST",
      `/avaliacoes/${exam.body.id}/attempts`,
      student.token,
      {},
    );
    expect(attempt.status).toBe(200);
    const right = question.body.alternativas.find((o: any) => o.correta).id;
    expect(
      (
        await request(
          "PUT",
          `/avaliacoes/attempts/${attempt.body.id}/answers/${question.body.id}`,
          student.token,
          { selectedOptionId: right },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "POST",
          `/avaliacoes/attempts/${attempt.body.id}/finalize`,
          student.token,
          {},
        )
      ).body.overallPercentage,
    ).toBe(100);
    const visibleActivities = await request("GET", `/atividades?classId=${classId}`, student.token);
    expect(visibleActivities.status).toBe(200);
    expect(visibleActivities.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: activity.body.id, status: "PUBLISHED", canStart: true })]));
    const activityAttempt = await request("POST", `/avaliacoes/${activity.body.id}/attempts`, student.token, {});
    expect(activityAttempt.status).toBe(200);
    expect((await request("PUT", `/avaliacoes/attempts/${activityAttempt.body.id}/answers/${question.body.id}`, student.token, { selectedOptionId: right })).status).toBe(200);
    expect((await request("POST", `/avaliacoes/attempts/${activityAttempt.body.id}/finalize`, student.token, {})).body.overallPercentage).toBe(100);
    const activityResults = await request("GET", `/atividades/${activity.body.id}/results`, owner.token, undefined, id);
    expect(activityResults.status).toBe(200);
    expect(activityResults.body.results.items).toEqual(expect.arrayContaining([expect.objectContaining({ studentId: student.id, percentage: 100 })]));
    const liveInstitutionSummary = await request("GET", `/institutions/${id}/summary?page=1`, owner.token, undefined, id);
    expect(liveInstitutionSummary.status).toBe(200);
    expect(liveInstitutionSummary.body.indicators).toMatchObject({
      publishedExams: 1,
    });
    expect(liveInstitutionSummary.body.indicators).not.toHaveProperty("publishedActivities");
    expect(liveInstitutionSummary.body.indicators).not.toHaveProperty("completedActivities");
    expect(liveInstitutionSummary.body.indicators).not.toHaveProperty("participationRate");
    expect(
      (
        await request(
          "GET",
          `/reports/classes/${classId}?page=1&examPage=1`,
          owner.token,
          undefined,
          id,
        )
      ).status,
    ).toBe(200);
    const before = {
      questions: await prisma.questao.count(),
      attempts: await prisma.simulado.count(),
      answers: await prisma.resposta.count(),
      exams: await prisma.avaliacao.count(),
    };
    expect(
      (
        await request(
          "PUT",
          `/turmas/${classId}/teachers/${teacher.id}`,
          owner.token,
          { assigned: false },
          id,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("GET", "/turmas?page=1", teacher.token)).body.items,
    ).toHaveLength(0);
    expect(
      (
        await request("PATCH", "/turmas/" + classId, teacher.token, {
          nome: "Forbidden",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          "GET",
          `/reports/classes/${classId}?page=1&examPage=1`,
          teacher.token,
        )
      ).status,
    ).toBe(404);
    expect({
      questions: await prisma.questao.count(),
      attempts: await prisma.simulado.count(),
      answers: await prisma.resposta.count(),
      exams: await prisma.avaliacao.count(),
    }).toEqual(before);
    expect(
      await prisma.questao.findUnique({ where: { id: question.body.id } }),
    ).toMatchObject({ autorId: teacher.id, turmaId: classId });
  });
});
