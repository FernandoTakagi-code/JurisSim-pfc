import { corsOriginsFromEnvironment } from "./cors-policy";

export type EnvironmentValues = Record<string, string | undefined>;
type Report = { errors: string[]; warnings: string[] };
const placeholder = (value: string) =>
  /SUPABASE_.*HOST|USER:PASSWORD|your-|sua_chave|gere-uma-chave|PREENCHER/i.test(
    value,
  );
const loopback = (host: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(host.toLowerCase());
const flagNames = [
  "INITIAL_DIAGNOSTIC_REQUIRED",
  "INITIAL_DIAGNOSTIC_API_ENABLED",
  "INITIAL_DIAGNOSTIC_PILOT_ENABLED",
  "QUESTION_PRACTICE_SCHEMA_ENABLED",
  "QUESTION_PRACTICE_API_ENABLED",
  "QUESTION_PRACTICE_PILOT_ENABLED",
  "QUESTION_REVIEW_SCHEMA_ENABLED",
  "QUESTION_REVIEW_API_ENABLED",
  "INDIVIDUAL_EXAM_SCHEMA_ENABLED",
  "INDIVIDUAL_EXAM_API_ENABLED",
  "INDIVIDUAL_EXAM_PILOT_ENABLED",
  "INSTITUTIONS_ENABLED",
  "ADMINISTRATION_ENABLED",
  "INSTITUTION_REGISTRATION_ENABLED",
];
function publicUrl(value: string | undefined, production: boolean) {
  try {
    const url = new URL(value ?? "");
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (!production || (url.protocol === "https:" && !loopback(url.hostname)))
    );
  } catch {
    return false;
  }
}
export function checkBackendEnvironment(
  values: EnvironmentValues,
  production = false,
): Report {
  const errors: string[] = [],
    warnings: string[] = [];
  if (
    values.NODE_ENV &&
    !["development", "test", "production"].includes(values.NODE_ENV)
  )
    errors.push("NODE_ENV: use development, test ou production.");
  if (
    values.BREVO_EMAIL_TRANSPORT &&
    !["api", "smtp"].includes(values.BREVO_EMAIL_TRANSPORT)
  )
    errors.push("BREVO_EMAIL_TRANSPORT: use api ou smtp.");
  if (
    values.INITIAL_DIAGNOSTIC_COMPOSITION_MODE &&
    !["MISTA_15_15", "AUTORAL_30"].includes(
      values.INITIAL_DIAGNOSTIC_COMPOSITION_MODE,
    )
  )
    errors.push(
      "INITIAL_DIAGNOSTIC_COMPOSITION_MODE: use MISTA_15_15 ou AUTORAL_30.",
    );
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    try {
      const value = values[key] ?? "",
        url = new URL(value);
      if (
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        !url.hostname ||
        placeholder(value)
      )
        throw Error();
    } catch {
      errors.push(
        `${key}: informe uma URL PostgreSQL válida, sem os marcadores do modelo.`,
      );
    }
  }
  if (
    !values.JWT_SECRET ||
    values.JWT_SECRET.length < 32 ||
    placeholder(values.JWT_SECRET)
  )
    errors.push(
      "JWT_SECRET: gere uma chave privada com pelo menos 32 caracteres.",
    );
  if (
    (values.PORT && !/^\d+$/.test(values.PORT)) ||
    (values.PORT && (Number(values.PORT) < 1 || Number(values.PORT) > 65535))
  )
    errors.push("PORT: use um número entre 1 e 65535.");
  if (!publicUrl(values.APP_PUBLIC_URL, production))
    errors.push(
      "APP_PUBLIC_URL: informe a URL pública do frontend; produção exige HTTPS sem localhost.",
    );
  try {
    const origins = corsOriginsFromEnvironment({
      ...values,
      ...(production ? { NODE_ENV: "production" } : {}),
    });
    if (production && origins.some((o) => !publicUrl(o, true))) throw Error();
    if (
      values.APP_PUBLIC_URL &&
      !origins.includes(new URL(values.APP_PUBLIC_URL).origin)
    )
      errors.push("CORS_ORIGINS: inclua a origem exata de APP_PUBLIC_URL.");
  } catch {
    errors.push(
      "CORS_ORIGINS: informe origens exatas válidas, separadas por vírgula; produção exige HTTPS sem localhost.",
    );
  }
  for (const key of flagNames)
    if (values[key] !== undefined && !["true", "false"].includes(values[key]!))
      errors.push(`${key}: use true ou false.`);
  for (const prefix of [
    "QUESTION_PRACTICE",
    "QUESTION_REVIEW",
    "INDIVIDUAL_EXAM",
  ])
    if (
      values[`${prefix}_API_ENABLED`] === "true" &&
      values[`${prefix}_SCHEMA_ENABLED`] !== "true"
    )
      errors.push(
        `${prefix}: a API depende da flag de schema após aplicar a migration.`,
      );
  if (
    values.INITIAL_DIAGNOSTIC_REQUIRED === "true" &&
    values.INITIAL_DIAGNOSTIC_API_ENABLED !== "true"
  )
    errors.push(
      "INITIAL_DIAGNOSTIC_REQUIRED: habilite a API antes de exigir o diagnóstico.",
    );
  for (const prefix of [
    "INITIAL_DIAGNOSTIC",
    "QUESTION_PRACTICE",
    "INDIVIDUAL_EXAM",
  ])
    if (
      values[`${prefix}_PILOT_ENABLED`] === "true" &&
      !values[`${prefix}_PILOT_BATCH_ID`]?.trim() &&
      !values[`${prefix}_PILOT_BATCH_IDS`]?.trim()
    )
      errors.push(`${prefix}: o piloto depende de um lote configurado.`);
  if (
    production &&
    ["LOCAL_EMAIL_CAPTURE_ENABLED", "SEED_LOCAL_DATABASE"].some(
      (key) => values[key] === "true",
    )
  )
    errors.push(
      "LOCAL_EMAIL_CAPTURE_ENABLED/SEED_LOCAL_DATABASE: recursos locais devem ficar desativados em produção.",
    );
  const smtp = values.BREVO_EMAIL_TRANSPORT === "smtp";
  if (
    smtp
      ? !(values.BREVO_SMTP_USER && values.BREVO_SMTP_KEY)
      : !values.BREVO_API_KEY
  )
    warnings.push(
      "E-mail: configure o provedor no backend para confirmação de conta e recuperação de senha.",
    );
  return { errors, warnings };
}
export function checkFrontendEnvironment(
  values: EnvironmentValues,
  production = false,
): Report {
  const errors: string[] = [],
    warnings: string[] = [];
  if (!publicUrl(values.VITE_API_URL, production))
    errors.push(
      "VITE_API_URL: informe a URL pública da API; produção exige HTTPS sem localhost.",
    );
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith("VITE_")) continue;
    if (
      /SECRET|PASSWORD|DATABASE|DIRECT_URL|API_KEY|TOKEN|SMTP/i.test(key) &&
      value
    )
      errors.push(`${key}: credenciais não podem ser incluídas no frontend.`);
    if (
      (key.endsWith("_ENABLED") || key === "VITE_JURISSIM_DEMO_MODE") &&
      value !== undefined &&
      !["true", "false"].includes(value)
    )
      errors.push(`${key}: use true ou false.`);
  }
  if (production && values.VITE_JURISSIM_DEMO_MODE === "true")
    errors.push("VITE_JURISSIM_DEMO_MODE: mantenha desativado em produção.");
  return { errors, warnings };
}
