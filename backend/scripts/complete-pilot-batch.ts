// Completa o lote piloto do simulado individual com rascunhos de treino (scripts/drafts/authorial-practice-*.draft.json).
// Sem --apply, apenas lê o banco (transação somente leitura) e mostra o plano. Nada é publicado nem aprovado.
//
//   npx.cmd tsx scripts/complete-pilot-batch.ts --list-batches
//   npx.cmd tsx scripts/complete-pilot-batch.ts --batch-id <lote> --disciplines "Direito Administrativo,Direito Civil" --target 10
//   npx.cmd tsx scripts/complete-pilot-batch.ts --batch-id <lote> --disciplines "..." --target 10 --operator-email <admin> --apply
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { resolveInventoryCheckDatabaseUrl } from '../src/config/inventory-check-database-url';
import { INITIAL_DIAGNOSTIC_DISCIPLINES } from '../src/services/diagnostics/initial-diagnostic-config';
import { completePilotBatch, pilotBatchCounts, planPilotBatchCompletion } from '../src/services/questions/pilot-batch-completion';

const DRAFT_FILES = ['authorial-practice-60', 'authorial-practice-expansion-60'];

function parseArgs(argv: string[]) {
  const allowed = new Set(['--list-batches', '--batch-id', '--disciplines', '--target', '--operator-email', '--apply']);
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!allowed.has(flag) || flags.has(flag)) throw new Error(`Argumento inválido: ${flag}`);
    if (flag === '--apply' || flag === '--list-batches') { flags.set(flag, 'true'); continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Argumento sem valor: ${flag}`);
    flags.set(flag, value);
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const url = resolveInventoryCheckDatabaseUrl();
  if (!url) throw new Error('DATABASE_URL não encontrado em backend/.env.');
  const target = new URL(url);
  console.log(`Banco: ${target.hostname}:${target.port || '5432'}${target.pathname}`);
  const db = new PrismaClient({ datasources: { db: { url } } });
  const disciplines = [...INITIAL_DIAGNOSTIC_DISCIPLINES];
  try {
    if (flags.has('--list-batches')) {
      const batches = await db.loteImportacao.findMany({ orderBy: { importadoEm: 'asc' }, select: { id: true, importadoEm: true, totalQuestoes: true } });
      for (const batch of batches) {
        const counts = await pilotBatchCounts(db, batch.id, disciplines);
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (!total) continue;
        console.log(`\nLote ${batch.id} (importado em ${batch.importadoEm.toISOString().slice(0, 10)})`);
        for (const [discipline, count] of Object.entries(counts)) console.log(`  ${discipline.padEnd(24)} ${count}`);
      }
      console.log('\nSomente leitura: nada foi gravado.');
      return;
    }
    const batchId = flags.get('--batch-id');
    if (!batchId) throw new Error('Informe --batch-id (use --list-batches para ver os lotes).');
    const selected = (flags.get('--disciplines') ?? '').split(',').map(d => d.trim()).filter(Boolean);
    if (!selected.length) throw new Error('Informe --disciplines, separadas por vírgula.');
    const goal = Number(flags.get('--target') ?? '10');
    const drafts = DRAFT_FILES.map(name => JSON.parse(readFileSync(resolve(__dirname, 'drafts', `${name}.draft.json`), 'utf8')));

    if (!flags.has('--apply')) {
      const plan = await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const existing = await tx.questao.findMany({ select: { enunciado: true, fingerprint: true } });
        if (!await tx.loteImportacao.findUnique({ where: { id: batchId }, select: { id: true } })) throw new Error('Lote piloto não encontrado.');
        return planPilotBatchCompletion(drafts, {
          current: await pilotBatchCounts(tx, batchId, selected),
          existingFingerprints: new Set(existing.flatMap(q => q.fingerprint ? [q.fingerprint] : [])),
          existingStatements: new Set(existing.map(q => q.enunciado)), disciplines: selected, target: goal,
        });
      });
      console.log('\nPRÉVIA (nada foi gravado):');
      for (const p of plan) {
        console.log(`  ${p.discipline}: tem ${p.current}, vai acrescentar ${p.items.length} -> ${p.current + p.items.length}`);
        for (const { question } of p.items) console.log(`    ${question._draftSlot}  ${question.nivel.padEnd(13)} ${question.assunto}`);
      }
      console.log('\nPara gravar, repita o comando com --operator-email <e-mail de uma conta ADMIN> --apply');
      return;
    }
    const email = flags.get('--operator-email');
    if (!email) throw new Error('Informe --operator-email com o e-mail de uma conta ADMIN.');
    const operator = await db.user.findFirst({ where: { email: { equals: email.trim(), mode: 'insensitive' }, deletedAt: null, role: 'ADMIN' }, select: { id: true } });
    if (!operator) throw new Error('Nenhuma conta ADMIN ativa com esse e-mail.');
    const result = await completePilotBatch(db, drafts, { batchId, operatorId: operator.id, disciplines: selected, target: goal });
    console.log(`\nGRAVADO: ${result.added} questões acrescentadas ao lote ${result.batchId}.`);
    for (const discipline of selected) console.log(`  ${discipline}: ${result.before[discipline]} -> ${result.after[discipline]}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => { console.error(`Erro: ${error instanceof Error ? error.message : 'falha inesperada'}`); process.exitCode = 1; });
