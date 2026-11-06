// Read-only inspection: never changes the flag or approves a transition.
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { inspectInstitutionActivation } from "../src/services/institution-activation";
dotenv.config({ quiet: true });
const db = new PrismaClient();
async function main() {
  const status = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return inspectInstitutionActivation(tx, true);
  });
  console.log(JSON.stringify(status));
  if (!status.ready) process.exitCode = 2;
}
main()
  .catch(() => {
    console.error(
      "Não foi possível verificar a transição institucional. Nenhuma ativação realizada.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
