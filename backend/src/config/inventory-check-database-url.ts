import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { resolve } from 'node:path';

/** Resolve the checker URL without loading backend/.env into process.env. */
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
    // Parse only the selected assignment; unrelated .env values never enter
    // process.env or the returned object.
    databaseUrl = parse(line).DATABASE_URL?.trim() || databaseUrl;
  }
  return databaseUrl;
}
