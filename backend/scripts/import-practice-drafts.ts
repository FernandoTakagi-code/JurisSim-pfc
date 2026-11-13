import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { resolveInventoryCheckDatabaseUrl } from '../src/config/inventory-check-database-url';
import { importPracticeDrafts, preparePracticeDraftImport } from '../src/services/practice-draft-import';

async function main() {
  const args = process.argv.slice(2), flags = new Map<string, string>();
  const allowed = new Set(['--input', '--operator-id', '--target-id', '--receipt', '--apply']);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!allowed.has(flag) || flags.has(flag)) throw new Error('Argumento inválido.');
    if (flag === '--apply') { flags.set(flag, 'true'); continue; }
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error('Argumento sem valor.');
    flags.set(flag, value);
  }
  const input = JSON.parse(readFileSync(resolve(flags.get('--input') ?? 'scripts/drafts/authorial-practice-60.draft.json'), 'utf8'));
  const plan = preparePracticeDraftImport(input);
  const url = resolveInventoryCheckDatabaseUrl();
  if (!url) throw new Error('Destino não configurado.');
  const target = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('Protocolo inválido.');
  const targetId = createHash('sha256').update([target.hostname, target.port, target.pathname, target.username].join('|')).digest('hex');
  console.log(JSON.stringify({ questions: 60, status: 'RASCUNHO_PRIVADO', approvals: 0, hash: plan.hash, targetId }));
  if (!flags.has('--apply')) { console.log('Prévia sem conexão ou escrita.'); return; }
  if (flags.get('--target-id') !== targetId || !flags.get('--operator-id') || !flags.get('--receipt')) throw new Error('Destino, responsável ou recibo ausente.');
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const result = await importPracticeDrafts(db, input, flags.get('--operator-id')!);
    const rows = await db.questao.findMany({ where: { loteImportacaoId: result.batchId }, select: { id: true, publica: true, revisaoJuridicaEm: true, revisorJuridicoId: true, revisaoPedagogicaEm: true, revisorPedagogicoId: true, liberadaAcervoEm: true, liberadaAcervoPorId: true, fonteReferencia: true, alternativas: { select: { correta: true } } } });
    const privatePending = rows.filter(q => !q.publica && !q.revisaoJuridicaEm && !q.revisorJuridicoId && !q.revisaoPedagogicaEm && !q.revisorPedagogicoId && !q.liberadaAcervoEm && !q.liberadaAcervoPorId).length;
    const validOptions = rows.filter(q => q.alternativas.length === 4 && q.alternativas.filter(a => a.correta).length === 1).length;
    const receipt = { verifiedAt: new Date().toISOString(), ...result, batchHash: plan.hash, stored: rows.length, privatePending, validOptions, publishedByThisCommand: 0, totalQuestionsInDatabase: await db.questao.count() };
    writeFileSync(resolve(flags.get('--receipt')!), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ batchId: result.batchId, imported: result.imported, recovered: result.recovered, stored: rows.length, privatePending, validOptions, published: 0 }));
    if (rows.length !== 60 || privatePending !== 60 || validOptions !== 60) throw new Error('Verificação posterior inconsistente; consulte o recibo.');
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Operação recusada ou verificação falhou; detalhes de conexão omitidos. Consulte o recibo, se criado, antes de repetir.'); process.exitCode = 1; });
