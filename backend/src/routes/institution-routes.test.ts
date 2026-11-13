import { institutionApplication } from '../__tests__/fixtures/institution-request';
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
const mocks = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  });
  return {
    user: vi.fn(),
    db: {
      user: model(),
      accountControl: model(),
      institutionalMembership: model(),
      institution: model(),
      administrativeEvent: model(),
      administrativeNotification: model(),
      turma: model(),
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
      $transaction: vi.fn(),
    },
  };
});
vi.mock("../lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("../repositories/auth-repository", () => ({
  AuthRepository: class {
    findByIdForAuth = mocks.user;
  },
}));
import { createInstitutionRoutes } from "./institution-routes";
import { errorHandler } from "../middlewares/error-handler";

const userId = "00000000-0000-4000-8000-000000000091",
  institutionId = "00000000-0000-4000-8000-000000000092";
const secret = "institution-http-contract-test-secret-over-32-characters";
let server: Server, base: string;
let router = createInstitutionRoutes();
const token = () =>
  jwt.sign({ id: userId, role: "ADMIN", sessionVersion: 0 }, secret, {
    expiresIn: "1h",
  });
const request = (
  path: string,
  method = "GET",
  body?: unknown,
  authenticated = true,
) =>
  fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Authorization: `Bearer ${token()}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/institutions", (req,res,next) => router(req,res,next));
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/institutions`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  router = createInstitutionRoutes();
  vi.resetAllMocks();
  vi.stubEnv("INSTITUTIONS_ENABLED", "true");
  vi.stubEnv('ADMINISTRATION_ENABLED','false');
  vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','false');
  vi.stubEnv("JWT_SECRET", secret);
  mocks.user.mockResolvedValue({
    id: userId,
    role: "ALUNO",
    emailVerifiedAt: new Date(),
    sessionVersion: 0,
  });
  mocks.db.accountControl.findUnique.mockResolvedValue(null);
  mocks.db.institutionalMembership.findMany.mockResolvedValue([]);
  mocks.db.institutionalMembership.findFirst.mockResolvedValue(null);
  mocks.db.administrativeEvent.findMany.mockResolvedValue([]);
  mocks.db.$transaction.mockImplementation(async (work) => work(mocks.db));
});
afterEach(() => vi.unstubAllEnvs());

it("keeps old databases usable while the additive module awaits authorization", async () => {
  vi.stubEnv("INSTITUTIONS_ENABLED", "false");
  expect(
    await (await request("/availability", "GET", undefined, false)).json(),
  ).toMatchObject({ enabled: false, registrationEnabled:false, administrationEnabled:false });
  expect((await request("/admin/summary")).status).toBe(503);
  expect(mocks.db.accountControl.findUnique).not.toHaveBeenCalled();
});
it.each([
  "/admin/summary",
  "/admin/users",
  "/admin/institutions",
  "/admin/logs",
  "/mine",
  "/notifications",
])("requires authentication for %s", async (path) => {
  expect((await request(path, "GET", undefined, false)).status).toBe(401);
});
it.each([
  "/admin/summary",
  "/admin/users",
  "/admin/institutions",
  "/admin/logs",
])(
  "uses the actual account role instead of the forged ADMIN claim: %s",
  async (path) => {
    expect((await request(path)).status).toBe(403);
  },
);
it("allows the current global administrator to query persistent audit events", async () => {
  mocks.user.mockResolvedValue({
    id: userId,
    role: "ADMIN",
    emailVerifiedAt: new Date(),
    sessionVersion: 0,
  });
  const response = await request("/admin/logs?page=2&severity=ERROR");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.db.administrativeEvent.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ severity: "ERROR" }),
      skip: 25,
      take: 26,
    }),
  );
});
it("enforces institutional audit ownership", async () => {
  expect((await request(`/${institutionId}/logs`)).status).toBe(403);
  expect(mocks.db.administrativeEvent.findMany).not.toHaveBeenCalled();
  mocks.db.institutionalMembership.findFirst.mockResolvedValue({
    id: "member",
  });
  expect((await request(`/${institutionId}/logs`)).status).toBe(200);
  expect(mocks.db.administrativeEvent.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ institutionId }),
    }),
  );
});
it("rejects changing institutional scope through the query string", async () => {
  expect(
    (await request(`/${institutionId}/logs?institutionId=${userId}`)).status,
  ).toBe(422);
  expect(mocks.db.administrativeEvent.findMany).not.toHaveBeenCalled();
});
it.each([
  "?page=0",
  "?page=10001",
  "?from=2026-11-04T00:00:00Z&to=2026-11-01T00:00:00Z",
  "?severity=CRITICAL",
  "?token=secret",
])("rejects invalid/unbounded log filters %s", async (query) => {
  mocks.user.mockResolvedValue({
    id: userId,
    role: "ADMIN",
    emailVerifiedAt: new Date(),
    sessionVersion: 0,
  });
  expect((await request("/admin/logs" + query)).status).toBe(422);
  expect(mocks.db.administrativeEvent.findMany).not.toHaveBeenCalled();
});
it("does not accept public privilege or owner injection in institutional requests", async () => {
  expect(
    (
      await request("/requests", "POST", {
        name: "Curso",
        responsibleName: "Ana",
        phone: "11999999999",
        description: "Curso preparatório",
        ownerId: userId,
        status: "ACTIVE",
      })
    ).status,
  ).toBe(422);
  expect(mocks.db.institution.create).not.toHaveBeenCalled();
});
it("requires verified email before an institutional request", async () => {
  mocks.user.mockResolvedValue({
    id: userId,
    role: "ALUNO",
    emailVerifiedAt: null,
    sessionVersion: 0,
  });
  // Invalid request proves limited-auth reached validation, not a verified-only guard.
  expect((await request("/requests", "POST", {})).status).toBe(403);
  expect((await request("/admin/summary")).status).toBe(403);
});
it("blocks suspended and session-revoked accounts", async () => {
  mocks.db.accountControl.findUnique.mockResolvedValue({ suspended: true });
  expect((await request("/mine")).status).toBe(403);
  mocks.db.accountControl.findUnique.mockResolvedValue(null);
  mocks.user.mockResolvedValue({
    id: userId,
    role: "ADMIN",
    emailVerifiedAt: new Date(),
    sessionVersion: 1,
  });
  expect((await request("/admin/summary")).status).toBe(401);
});

const registration = institutionApplication;
it.each(['registrationNumber','institutionType','postalCode','street','number','district','city','state','representativePosition','representativePhone','contactEmail','representationDeclaration','representationEvidence'] as const)('requires institutional analysis field %s', async field => {
  const body: Record<string, unknown> = { ...registration };
  delete body[field];
  expect((await request('/requests','POST',body)).status).toBe(422);
  expect(mocks.db.institution.create).not.toHaveBeenCalled();
});
it('receives a first request with no prior membership and with valid CNPJ while full operations are off',async()=>{
  vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','true');
  mocks.db.user.findUnique.mockResolvedValue({email:'owner@example.invalid',emailVerifiedAt:new Date(),deletedAt:null});
  mocks.db.institution.create.mockResolvedValue({id:institutionId,status:'PENDING'});
  expect((await request('/requests','POST',registration)).status).toBe(201);
  expect(mocks.db.institution.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({ownerId:userId,status:'PENDING',email:'owner@example.invalid',description:expect.stringContaining('Curso preparatório')})}));
  expect(mocks.db.institutionalMembership.upsert).not.toHaveBeenCalled();
  expect((await request(`/${institutionId}/invitations`)).status).toBe(503);
  expect((await request('/invitations/accept','POST',{token:'a'.repeat(64)})).status).toBe(503);
});
it('rejects duplicate applications before creating memberships or another institution',async()=>{
  mocks.db.user.findUnique.mockResolvedValue({email:'owner@example.invalid',emailVerifiedAt:new Date()});
  mocks.db.institution.findFirst.mockResolvedValue({id:institutionId});
  expect((await request('/requests','POST',registration)).status).toBe(409);
  expect(mocks.db.institution.create).not.toHaveBeenCalled();
  expect(mocks.db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
it('permits global read/control scopes without activating institutional teacher requirements',async()=>{
  vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('ADMINISTRATION_ENABLED','true');
  mocks.user.mockResolvedValue({id:userId,role:'ADMIN',emailVerifiedAt:new Date(),sessionVersion:0});
  mocks.db.user.count.mockResolvedValue(9);mocks.db.institution.count.mockResolvedValue(0);mocks.db.institutionalMembership.count.mockResolvedValue(0);mocks.db.turma.count.mockResolvedValue(0);mocks.db.administrativeEvent.count.mockResolvedValue(0);
  expect((await request('/admin/summary')).status).toBe(200);
  expect((await request(`/admin/classes/${institutionId}`,'PATCH',{institutionId})).status).toBe(403);
  expect((await request(`/${institutionId}/invitations`,'POST',{email:'teacher@example.invalid'})).status).toBe(503);
  expect(mocks.db.institutionalMembership.findMany).not.toHaveBeenCalled();
});
it('enforces account suspension with global administration enabled and full operations disabled',async()=>{
  vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('ADMINISTRATION_ENABLED','true');
  mocks.db.accountControl.findUnique.mockResolvedValue({suspended:true});
  expect((await request('/notifications')).status).toBe(403);
});
it.each([{...registration,institutionType:'ADMIN'},{...registration,registrationNumber:'123'},{...registration,phone:'abc'},{...registration,email:'other@example.invalid'}])('rejects invalid registration or contact identity injection',async body=>{
  expect((await request('/requests','POST',body)).status).toBe(422);
  expect(mocks.db.institution.create).not.toHaveBeenCalled();
});
it.each(['ACTIVE','REJECTED'] as const)('allows ADMIN decision %s with only registration enabled, without global promotion',async status=>{
  vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','true');
  mocks.user.mockResolvedValue({id:userId,role:'ADMIN',emailVerifiedAt:new Date(),sessionVersion:0});
  mocks.db.institution.findUnique.mockResolvedValue({...institutionApplication, registrationNumber:'12ABC34501DE35',description:'Declara\u00e7\u00e3o: institui\u00e7\u00e3o sem site oficial.',id:institutionId,ownerId:userId,status:'PENDING'});
  mocks.db.user.findUnique.mockResolvedValue({emailVerifiedAt:new Date(),deletedAt:null});
  mocks.db.institution.update.mockResolvedValue({id:institutionId,status});
  expect((await request(`/admin/institutions/${institutionId}`,'PATCH',{status,reason:'Documentação conferida'})).status).toBe(200);
  expect(mocks.db.user.update).not.toHaveBeenCalled();
  if(status==='ACTIVE') expect(mocks.db.institutionalMembership.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({role:'INSTITUTION_ADMIN'})}));
  else expect(mocks.db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
