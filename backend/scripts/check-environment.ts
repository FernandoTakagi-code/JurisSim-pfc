import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import {
  checkBackendEnvironment,
  checkFrontendEnvironment,
  type EnvironmentValues,
} from "../src/config/environment-check";

const flags = new Set(process.argv.slice(2));
if (
  [...flags].some(
    (flag) =>
      !["--production", "--backend-only", "--frontend-only"].includes(flag),
  ) ||
  (flags.has("--backend-only") && flags.has("--frontend-only"))
) {
  console.error(
    "Uso: npm run config:check -- [--production] [--backend-only|--frontend-only]",
  );
  process.exit(1);
}
const production =
  flags.has("--production") || process.env.NODE_ENV === "production";
const root = path.resolve(__dirname, "../..");
function load(folder: string): EnvironmentValues {
  let values: EnvironmentValues = {};
  for (const name of [
    ".env",
    ".env.local",
    ...(production ? [".env.production", ".env.production.local"] : []),
  ]) {
    const file = path.join(root, folder, name);
    if (existsSync(file)) values = { ...values, ...parse(readFileSync(file)) };
  }
  return { ...values, ...process.env }; // Hosting/Actions variables override local files.
}
let failures = 0;
for (const folder of ["backend", "frontend"]) {
  if (
    (folder === "backend" && flags.has("--frontend-only")) ||
    (folder === "frontend" && flags.has("--backend-only"))
  )
    continue;
  const result =
    folder === "backend"
      ? checkBackendEnvironment(load(folder), production)
      : checkFrontendEnvironment(load(folder), production);
  console.log(
    `${folder}: ${result.errors.length ? "configuração incompleta" : "configuração válida"} (${production ? "produção" : "local"})`,
  );
  for (const message of result.errors) {
    console.error(`ERRO ${message}`);
    failures++;
  }
  for (const message of result.warnings) console.log(`AVISO ${message}`);
}
console.log(
  "Verificação de formato concluída, sem conectar ao banco nem exibir valores. Não certifica credenciais, migrations ou disponibilidade dos serviços.",
);
process.exitCode = failures ? 1 : 0;
