// Internal operator CLI only. Imports never load env or connect.
const { bootstrapFirstAdmin } = require("./lib/first-admin-bootstrap.cjs");
async function main() {
  require("dotenv").config({ quiet: true });
  if (
    process.argv.length !== 3 ||
    process.argv[2] !== "--bootstrap-first-admin"
  )
    throw new Error("BOOTSTRAP_EXPLICIT_COMMAND_REQUIRED");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    // Migration readiness is independent of INSTITUTIONS_ENABLED.
    const result = await bootstrapFirstAdmin(
      prisma,
      process.env.ADMIN_PROVISION_USER_ID,
    );
    console.log(
      result.status === "ALREADY_PROVISIONED"
        ? "Administrador já provisionado. Nenhuma alteração realizada."
        : "Administrador provisionado. As sessões anteriores foram revogadas.",
    );
  } finally {
    await prisma.$disconnect();
  }
}
if (require.main === module)
  main().catch(() => {
    console.error(
      "Provisionamento recusado. Confira a conta confirmada, a migration e a autorização operacional.",
    );
    process.exitCode = 1;
  });
module.exports = { main };
