import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { resolve } from 'node:path';

/** Resolve a URL do verificador sem carregar backend/.env em process.env. */
export function resolveInventoryCheckDatabaseUrl(
  dedicatedUrl = process.env.INVENTORY_CHECK_DATABASE_URL,
  envPath = resolve(__dirname, '../../.env'),
): string | undefined {
  const override = dedicatedUrl?.trim();
  if (override) return override;

  let databaseUrl: string | undefined;
  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch {
    return undefined;
  }
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    if (!/^\s*(?:export\s+)?DATABASE_URL\s*=/.test(line)) continue;
    // Interpreta apenas a atribuição selecionada; valores não relacionados do .env nunca entram
    // em process.env nem no objeto retornado.
    databaseUrl = parse(line).DATABASE_URL?.trim() || databaseUrl;
  }
  return databaseUrl;
}
