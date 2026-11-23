const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIGRATION = "20261104000100_institutions_administration";

// Sem carregar env, clientes, endpoint HTTP ou segredos no momento da importação.
async function bootstrapFirstAdmin(prisma, userId) {
  if (typeof userId !== "string" || !UUID.test(userId))
    throw new Error("BOOTSTRAP_INVALID_ACCOUNT");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(710911)`;
      const migration =
        await tx.$queryRaw`SELECT migration_name FROM "_prisma_migrations"
      WHERE migration_name = ${MIGRATION} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      if (migration.length !== 1)
        throw new Error("BOOTSTRAP_MIGRATION_REQUIRED");
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          email: true,
          emailVerifiedAt: true,
          deletedAt: true,
        },
      });
      if (
        !user ||
        user.deletedAt ||
        !user.emailVerifiedAt ||
        !user.email ||
        (
          await tx.accountControl.findUnique({
            where: { userId },
            select: { suspended: true },
          })
        )?.suspended
      ) {
        throw new Error("BOOTSTRAP_CONFIRMED_ACTIVE_ACCOUNT_REQUIRED");
      }
      // Administradores excluídos não devem reabrir o procedimento de bootstrap.
      const admins = await tx.user.findMany({
        where: { role: "ADMIN" },
        select: { id: true },
      });
      const previous = await tx.administrativeEvent.findFirst({
        where: { event: "FIRST_ADMIN_PROVISIONED" },
        select: { actorId: true, resourceId: true, result: true },
      });
      if (
        user.role === "ADMIN" &&
        admins.length === 1 &&
        admins[0].id === userId &&
        previous?.actorId === userId &&
        previous.resourceId === userId &&
        previous.result === "SUCCESS"
      ) {
        return { status: "ALREADY_PROVISIONED" };
      }
      if (admins.length || previous)
        throw new Error("BOOTSTRAP_ALREADY_CLOSED");
      if (user.role !== "ALUNO")
        throw new Error("BOOTSTRAP_STUDENT_ACCOUNT_REQUIRED");
      await tx.user.update({
        where: { id: userId },
        data: {
          role: "ADMIN",
          sessionVersion: { increment: 1 },
        },
        select: { id: true },
      });
      await tx.administrativeEvent.create({
        data: {
          event: "FIRST_ADMIN_PROVISIONED",
          actorId: userId,
          resourceId: userId,
          result: "SUCCESS",
        },
      });
      return { status: "PROVISIONED" };
    },
    {
      // Cada instrução após o lock enxerga o commit da execução anterior.
      // O nível Serializable poderia manter um snapshot tirado antes da espera pelo lock.
      isolationLevel: "ReadCommitted",
      maxWait: 10000,
      timeout: 15000,
    },
  );
}
module.exports = { bootstrapFirstAdmin };
