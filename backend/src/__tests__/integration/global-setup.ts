import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { assertDisposableDatabase, disposableDatabaseConfig } from './disposable-database';

// Verify the cluster already created/migrated by the local harness.
// No reset, migration command, dotenv, or destructive SQL here.
export default async function setup() {
  const config = disposableDatabaseConfig();
  const client = new PrismaClient({ datasourceUrl: config.url });
  try {
    await assertDisposableDatabase(client);
    const expected = fs.readdirSync(path.resolve('prisma/migrations'))
      .filter(name => fs.existsSync(path.resolve('prisma/migrations', name, 'migration.sql'))).sort();
    const applied = await client.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
    if (expected.length !== 12 || JSON.stringify(applied.map(row => row.migration_name)) !== JSON.stringify(expected)) {
      throw new Error('O banco descartável precisa das 12 migrations reais; o setup não cria nem redefine seu schema.');
    }
  } finally { await client.$disconnect(); }
}
