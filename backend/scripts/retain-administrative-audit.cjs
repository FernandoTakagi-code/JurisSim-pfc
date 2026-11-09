// Private maintenance; no HTTP endpoint can change or purge audit history.
require("dotenv").config({ quiet: true });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const days = Number(process.env.AUDIT_RETENTION_DAYS ?? "180");
  if (!Number.isInteger(days) || days < 30 || days > 3650)
    throw new Error("Retenção inválida.");
  if (!process.argv.includes("--apply-retention"))
    throw new Error("Exige --apply-retention e autorização operacional.");
  const cutoff = new Date(Date.now() - days * 86400000);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('jurissim.audit_retention_cutoff', ${cutoff.toISOString()}, true)`;
    const removed = await tx.administrativeEvent.deleteMany({
      where: { occurredAt: { lt: cutoff } },
    });
    await tx.administrativeEvent.create({
      data: { event: "AUDIT_RETENTION_APPLIED", result: "SUCCESS" },
    });
    return removed.count;
  });
  console.log(
    `Retenção aplicada: ${result} evento(s) expirado(s) removido(s).`,
  );
}
main()
  .catch(() => {
    console.error(
      "Retenção não executada. Verifique configuração, permissões e autorização operacional.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
