import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { parse } from 'dotenv';
import { resolveInventoryCheckDatabaseUrl } from '../src/config/inventory-check-database-url';

const defaultMigration = '20261112130000_individual_exam_sessions';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
async function main() {
  const args = process.argv.slice(2), flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--apply', '--target-id', '--operator-id', '--receipt', '--migration'].includes(flag) || flags.has(flag)) throw new Error('Argumento inválido.');
    if (flag === '--apply') { flags.set(flag, 'true'); continue; }
    const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('Argumento sem valor.'); flags.set(flag, value);
  }
  const migration = flags.get('--migration') ?? defaultMigration;
  const targets: Record<string, [string,string]> = {
    [defaultMigration]: ['SessaoSimuladoIndividual','SessaoIndividual_simuladoId_alunoId_fkey'],
    '20261112160000_private_practice_sessions': ['SessaoPratica','SessaoPratica_simuladoId_alunoId_fkey'],
    '20261113010000_question_review_sessions': ['SessaoRevisaoQuestao','SessaoRevisaoQuestao_alunoId_fkey'],
  };
  if (!targets[migration]) throw new Error('Migration não suportada por esta manutenção.');
  const [table, foreignKey] = targets[migration];
  const url = resolveInventoryCheckDatabaseUrl(); if (!url) throw new Error('Destino não configurado.');
  const target = new URL(url), targetId = sha([target.hostname, target.port, target.pathname, target.username].join('|'));
  const local = parse(fs.readFileSync(path.resolve('.env'), 'utf8'));
  const direct = local.DIRECT_URL?.trim() || url, directTarget = new URL(direct);
  if (target.hostname !== directTarget.hostname || target.pathname !== directTarget.pathname || target.username !== directTarget.username || (directTarget.searchParams.get('schema') ?? 'public') !== 'public') throw new Error('Destinos de consulta e migration divergem.');
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const files = fs.readdirSync('prisma/migrations').filter(name => fs.existsSync(path.join('prisma/migrations', name, 'migration.sql'))).sort();
    const applied = await db.$queryRaw<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`;
    if (applied.some(row => !row.finished_at && !row.rolled_back_at)) throw new Error('Há migration incompleta no destino.');
    const completed = applied.filter(row => row.finished_at && !row.rolled_back_at);
    // Other branches can have completed additive migrations in the shared bank.
    // Preserve those records; only the new local migration may be pending here.
    const externalMigrations: { name: string; checksum: string }[] = [];
    for (const row of completed) {
      const file = path.join('prisma/migrations', row.migration_name, 'migration.sql');
      if (!fs.existsSync(file)) { externalMigrations.push({ name: row.migration_name, checksum: row.checksum }); continue; }
      const content = fs.readFileSync(file, 'utf8');
      if (![sha(content), sha(content.replace(/\r\n/g, '\n'))].includes(row.checksum)) throw new Error(`Checksum divergente: ${row.migration_name}`);
    }
    const pending = files.filter(name => !completed.some(row => row.migration_name === name));
    if (pending.some(name => name !== migration)) throw new Error('Há outras migrations pendentes; aplicação automática recusada.');
    const before = await db.questao.count();
    console.log(JSON.stringify({ targetId, pending, externalMigrations, questionsBefore: before, writes: flags.has('--apply') ? 'SOLICITADAS' : 0 }));
    if (!flags.has('--apply')) return;
    if (flags.get('--target-id') !== targetId || !flags.get('--receipt')) throw new Error('Destino ou recibo ausente.');
    const operator = await db.user.findFirst({ where: { id: flags.get('--operator-id') ?? '', role: 'ADMIN', deletedAt: null }, select: { id: true } });
    if (!operator) throw new Error('Responsável ADMIN não encontrado.');
    if (pending.length) {
      const result = spawnSync(process.execPath, [path.resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
        cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url, DIRECT_URL: direct, PRISMA_HIDE_UPDATE_MESSAGE: 'true' }, encoding: 'utf8', windowsHide: true, timeout: 120_000,
      });
      // Prisma output may contain private connection identity. Never forward it.
      if (result.error || result.status !== 0) throw new Error('Prisma recusou a aplicação; saída de conexão omitida. Verifique o histórico antes de repetir.');
    }
    const [security] = await db.$queryRaw<{ rls: boolean; ownerForeignKey: boolean }[]>`SELECT c.relrowsecurity AS rls,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname=${foreignKey}) AS "ownerForeignKey"
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=${table}`;
    const confirmed = await db.$queryRaw<{ checksum: string }[]>`SELECT checksum FROM "_prisma_migrations" WHERE migration_name=${migration} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const after = await db.questao.count();
    const receipt = { appliedAt: new Date().toISOString(), migration, targetId, operatorId: operator.id, externalMigrationsPreserved: externalMigrations, appliedNow: pending.length === 1, migrationRecorded: confirmed.length === 1, rls: security?.rls, ownerForeignKey: security?.ownerForeignKey, questionsBefore: before, questionsAfter: after };
    fs.writeFileSync(path.resolve(flags.get('--receipt')!), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify(receipt));
    if (!receipt.migrationRecorded || !receipt.rls || !receipt.ownerForeignKey || before !== after) throw new Error('Verificação posterior inconsistente; consulte o recibo.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error && !/postgres|password|supabase|pooler/i.test(error.message) ? error.message : 'Operação recusada; detalhes privados omitidos.'); process.exitCode = 1; });
