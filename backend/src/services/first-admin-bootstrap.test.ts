import { beforeEach, describe, expect, it, vi } from "vitest";
const {
  bootstrapFirstAdmin,
} = require("../../scripts/lib/first-admin-bootstrap.cjs");
const id = "00000000-0000-4000-8000-000000000001";
let user: any, previous: any, admins: any[];
const tx = {
  $executeRaw: vi.fn(),
  $executeRawUnsafe: vi.fn(),
  $queryRaw: vi.fn(),
  user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  accountControl: { findUnique: vi.fn() },
  administrativeEvent: { findFirst: vi.fn(), create: vi.fn() },
};
const prisma = { $transaction: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks();
  user = {
    id,
    role: "ALUNO",
    email: "fixture@example.invalid",
    emailVerifiedAt: new Date(),
    deletedAt: null,
    sessionVersion: 5,
  };
  previous = null;
  admins = [];
  prisma.$transaction.mockImplementation(async (callback) => callback(tx));
  tx.$queryRaw.mockResolvedValue([
    { migration_name: "20261104000100_institutions_administration" },
  ]);
  tx.user.findUnique.mockImplementation(async () => user);
  tx.user.findMany.mockImplementation(async () => admins);
  tx.administrativeEvent.findFirst.mockImplementation(async () => previous);
  tx.user.update.mockImplementation(async () => {
    user.role = "ADMIN";
    user.sessionVersion++;
    admins = [{ id }];
    return { id };
  });
  tx.administrativeEvent.create.mockImplementation(async ({ data }) => {
    previous = data;
    return data;
  });
});
describe("first administrator bootstrap security", () => {
  it("uses executable transaction lock, fresh statement snapshots and bounded waiting", async () => {
    await bootstrapFirstAdmin(prisma, id);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted",
      maxWait: 10000,
      timeout: 15000,
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL lock_timeout = '5s'",
    );
  });
  it("is idempotent for the same proven bootstrap identity without revoking sessions twice", async () => {
    expect(await bootstrapFirstAdmin(prisma, id)).toEqual({
      status: "PROVISIONED",
    });
    expect(await bootstrapFirstAdmin(prisma, id)).toEqual({
      status: "ALREADY_PROVISIONED",
    });
    expect(user.sessionVersion).toBe(6);
    expect(tx.user.update).toHaveBeenCalledOnce();
    expect(tx.administrativeEvent.create).toHaveBeenCalledOnce();
  });
  it.each([undefined, "not-a-uuid", "------------------------------------"])(
    "rejects missing or malformed target %s before connecting",
    async (value) => {
      await expect(bootstrapFirstAdmin(prisma, value)).rejects.toThrow(
        "INVALID_ACCOUNT",
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each(["missing", "unverified", "deleted", "suspended", "teacher"])(
    "rejects account precondition %s",
    async (reason) => {
      if (reason === "missing") user = null;
      if (reason === "unverified") user.emailVerifiedAt = null;
      if (reason === "deleted") user.deletedAt = new Date();
      if (reason === "suspended")
        tx.accountControl.findUnique.mockResolvedValue({ suspended: true });
      if (reason === "teacher") user.role = "PROFESSOR";
      await expect(bootstrapFirstAdmin(prisma, id)).rejects.toThrow(
        "BOOTSTRAP_",
      );
      expect(tx.user.update).not.toHaveBeenCalled();
    },
  );
  it("refuses another administrator, even a deleted one", async () => {
    admins = [{ id: "another-existing-admin" }];
    await expect(bootstrapFirstAdmin(prisma, id)).rejects.toThrow(
      "ALREADY_CLOSED",
    );
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: { role: "ADMIN" },
      select: { id: true },
    });
  });
  it("refuses reopening after a previous bootstrap or a role changed outside bootstrap", async () => {
    previous = { actorId: id, resourceId: id, result: "SUCCESS" };
    await expect(bootstrapFirstAdmin(prisma, id)).rejects.toThrow(
      "ALREADY_CLOSED",
    );
    previous = null;
    user.role = "ADMIN";
    admins = [{ id }];
    await expect(bootstrapFirstAdmin(prisma, id)).rejects.toThrow(
      "ALREADY_CLOSED",
    );
  });
  it("requires the applied migration and never activates the feature", async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(bootstrapFirstAdmin(prisma, id)).rejects.toThrow(
      "MIGRATION_REQUIRED",
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it("updates only role/sessionVersion and writes one transactional audit event", async () => {
    await bootstrapFirstAdmin(prisma, id);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id },
      data: { role: "ADMIN", sessionVersion: { increment: 1 } },
      select: { id: true },
    });
    expect(tx.administrativeEvent.create).toHaveBeenCalledWith({
      data: {
        event: "FIRST_ADMIN_PROVISIONED",
        actorId: id,
        resourceId: id,
        result: "SUCCESS",
      },
    });
  });
  it("imports the CLI without constructing clients, reading env or provisioning", () => {
    const cli = require("../../scripts/provision-first-admin.cjs");
    expect(typeof cli.main).toBe("function");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
