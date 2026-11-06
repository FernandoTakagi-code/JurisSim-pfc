import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inspectInstitutionActivation,
  assertInstitutionActivationReady,
  InstitutionActivationBlocked,
} from "./institution-activation";
const findMany = vi.fn();
const db = { user: { findMany } } as never;
const teacher = (extra = {}) => ({
  id: "fixture-teacher",
  emailVerifiedAt: new Date(),
  institutionalMemberships: [{ institutionId: "legitimate" }],
  turmasComoProfessor: [],
  ...extra,
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INSTITUTIONS_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());
describe("institution activation gate", () => {
  it("does not touch any new table or change legacy behavior when disabled", async () => {
    vi.stubEnv("INSTITUTIONS_ENABLED", "false");
    expect(await assertInstitutionActivationReady(db)).toMatchObject({
      checked: false,
      ready: true,
    });
    expect(findMany).not.toHaveBeenCalled();
  });
  it("refuses activation with nine unverified/unaffiliated legacy teachers", async () => {
    findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) =>
        teacher({
          id: String(i),
          emailVerifiedAt: null,
          institutionalMemberships: [],
        }),
      ),
    );
    await expect(assertInstitutionActivationReady(db)).rejects.toBeInstanceOf(
      InstitutionActivationBlocked,
    );
    const result = await inspectInstitutionActivation(db);
    expect(result).toMatchObject({
      ready: false,
      teachers: 9,
      pendingTeachers: 9,
      unverifiedEmails: 9,
      missingMemberships: 9,
    });
  });
  it.each([
    { emailVerifiedAt: null },
    { institutionalMemberships: [] },
    { turmasComoProfessor: [{ institutionalClass: null }] },
    {
      turmasComoProfessor: [
        { institutionalClass: { institutionId: "unrelated" } },
      ],
    },
  ])(
    "requires verification, a real active membership and access to every existing class",
    async (extra) => {
      findMany.mockResolvedValue([teacher(extra)]);
      expect(await inspectInstitutionActivation(db)).toMatchObject({
        ready: false,
        pendingTeachers: 1,
      });
    },
  );
  it("queries only active teacher identities and memberships of active institutions", async () => {
    findMany.mockResolvedValue([]);
    await inspectInstitutionActivation(db);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: "PROFESSOR", deletedAt: null },
        select: expect.objectContaining({
          institutionalMemberships: {
            where: {
              active: true,
              role: "TEACHER",
              institution: { status: "ACTIVE" },
            },
            select: { institutionId: true },
          },
        }),
      }),
    );
  });
  it("accepts regularized teachers, including memberships in several institutions", async () => {
    findMany.mockResolvedValue([
      teacher({
        institutionalMemberships: [
          { institutionId: "one" },
          { institutionId: "two" },
        ],
        turmasComoProfessor: [
          { institutionalClass: { institutionId: "one" } },
          { institutionalClass: { institutionId: "two" } },
        ],
      }),
    ]);
    expect(await assertInstitutionActivationReady(db)).toMatchObject({
      ready: true,
      pendingTeachers: 0,
      teachers: 1,
    });
  });
  it("cannot mark readiness on database failure and does not expose identity in errors", async () => {
    findMany.mockResolvedValue([
      teacher({ id: "private-id", emailVerifiedAt: null }),
    ]);
    await expect(assertInstitutionActivationReady(db)).rejects.not.toThrow(
      "private-id",
    );
    findMany.mockRejectedValue(new Error("database unavailable"));
    await expect(assertInstitutionActivationReady(db)).rejects.toThrow(
      "database unavailable",
    );
  });
  it("does not write, confirm emails, grant memberships or mutate fixture accounts", async () => {
    const accounts = [
      teacher({ emailVerifiedAt: null, institutionalMemberships: [] }),
    ];
    const before = JSON.stringify(accounts);
    findMany.mockResolvedValue(accounts);
    await inspectInstitutionActivation(db);
    expect(JSON.stringify(accounts)).toBe(before);
    expect(Object.keys(db as object)).toEqual(["user"]);
  });
});
