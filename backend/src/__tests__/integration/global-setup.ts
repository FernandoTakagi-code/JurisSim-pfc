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
    const requiredQuestionMigrations = [
      '20261021100000_question_import_provenance',
      '20261021110000_initial_diagnostic_identity',
      '20261021120000_question_eligibility_metadata',
      '20261021130000_question_practice_sessions',
      '20261028120000_question_practice_topic',
      '20261030120000_diagnostic_review_snapshot',
    ];
    const applied = await client.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
    if (JSON.stringify(expected.slice(-requiredQuestionMigrations.length)) !== JSON.stringify(requiredQuestionMigrations)
      || JSON.stringify(applied.map(row => row.migration_name)) !== JSON.stringify(expected)) {
      throw new Error('O banco descartável precisa conter todas as migrations locais aplicadas, na ordem atual; o setup não cria nem redefine seu schema.');
    }
  } finally { await client.$disconnect(); }
}
