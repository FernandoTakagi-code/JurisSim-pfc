import { beforeEach, afterEach, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  control: vi.fn(),
  memberships: vi.fn(),
  classes: vi.fn(),
}));
vi.mock("../repositories/auth-repository", () => ({
  AuthRepository: class {
    findByIdForAuth = mocks.user;
  },
}));
vi.mock("../lib/prisma", () => ({
  prisma: {
    accountControl: { findUnique: mocks.control },
    institutionalMembership: { findMany: mocks.memberships },
    institutionalClass: { findMany: mocks.classes },
  },
}));
import { requireAuth, type AuthenticatedRequest } from "./auth-middleware";
const secret = "institution-middleware-test-secret-more-than-32";
const userId = "00000000-0000-4000-8000-000000000099";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INSTITUTIONS_ENABLED", "true");
  vi.stubEnv("JWT_SECRET", secret);
  mocks.user.mockResolvedValue({
    id: userId,
    role: "PROFESSOR",
    emailVerifiedAt: new Date(),
    sessionVersion: 0,
  });
  mocks.control.mockResolvedValue(null);
  mocks.memberships.mockResolvedValue([
    {
      institutionId: "first",
      role: "TEACHER",
      institution: { name: "Primeira" },
    },
    {
      institutionId: "second",
      role: "TEACHER",
      institution: { name: "Segunda" },
    },
  ]);
  mocks.classes.mockResolvedValue([{ classId: "class-second" }]);
});
afterEach(() => vi.unstubAllEnvs());
async function authenticate(institution?: string, originalUrl = "/turmas") {
  const token = jwt.sign(
    { id: userId, role: "ALUNO", sessionVersion: 0 },
    secret,
    { expiresIn: "1h" },
  );
  const req = {
    originalUrl,
    header: (key: string) =>
      key === "authorization" ? `Bearer ${token}` : institution,
  } as AuthenticatedRequest;
  const next = vi.fn();
  await requireAuth(req, {} as never, next);
  return { req, next };
}
it("requires explicit context when a teacher has multiple institutions", async () => {
  const { next } = await authenticate();
  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({ statusCode: 409 }),
  );
  expect(mocks.classes).not.toHaveBeenCalled();
});
it("selects only classes from a current verified teaching membership", async () => {
  const { req, next } = await authenticate("second");
  expect(req.auth).toEqual({
    userId,
    role: "PROFESSOR",
    institutionId: "second",
    allowedClassIds: ["class-second"],
  });
  expect(next).toHaveBeenCalledWith();
  expect(mocks.classes).toHaveBeenCalledWith({
    where: { institutionId: "second" },
    select: { classId: true },
  });
});
it("rejects a forged institution even if the JWT still exists", async () => {
  const { next } = await authenticate("unrelated");
  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({ statusCode: 403 }),
  );
  expect(mocks.classes).not.toHaveBeenCalled();
});
it("revocation leaves only student access while preserving the identity", async () => {
  mocks.memberships.mockResolvedValue([]);
  const { req, next } = await authenticate("first");
  expect(req.auth).toEqual({ userId, role: "ALUNO" });
  expect(next).toHaveBeenCalledWith();
  expect(mocks.classes).not.toHaveBeenCalled();
});
it("keeps session inspection accessible before a teacher selects a context", async () => {
  const { req, next } = await authenticate(undefined, "/auth/session");
  expect(req.auth?.role).toBe("PROFESSOR");
  expect(next).toHaveBeenCalledWith();
});
