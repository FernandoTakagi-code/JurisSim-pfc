// Run manually by an authorized operator after migration. Never creates users,
// passwords or a public bootstrap endpoint. The target confirms their own email.
require("dotenv").config({ quiet: true });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const userId = process.env.ADMIN_PROVISION_USER_ID;
  if (
    !process.argv.includes("--bootstrap-first-admin") ||
    !/^[a-f0-9-]{36}$/i.test(userId ?? "")
  )
    throw new Error(
      "Defina ADMIN_PROVISION_USER_ID e use --bootstrap-first-admin.",
    );
  if (process.env.INSTITUTIONS_ENABLED !== "true")
    throw new Error("Aplique a migration autorizada antes de ativar o módulo.");
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(710911)`;
      if (await tx.user.count({ where: { role: "ADMIN", deletedAt: null } }))
        throw new Error(
          "Já existe administrador geral. Use o painel autorizado.",
        );
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null, emailVerifiedAt: { not: null } },
        select: { id: true },
      });
      if (
        !user ||
        (await tx.accountControl.findUnique({ where: { userId } }))?.suspended
      )
        throw new Error(
          "Conta deve existir, estar ativa e ter e-mail confirmado.",
        );
      await tx.user.update({
        where: { id: userId },
        data: { role: "ADMIN", sessionVersion: { increment: 1 } },
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
    },
    { isolationLevel: "Serializable" },
  );
  console.log(
    "Administrador provisionado. Entre novamente com a identidade existente pela área administrativa.",
  );
}
main()
  .catch(() => {
    console.error(
      "Provisionamento recusado. Confira autorização, migration, identidade confirmada e existência de administrador.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
