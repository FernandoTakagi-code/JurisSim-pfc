// Novo lote de questões liberadas pelo proprietário para o TREINO do aluno (não é revisão jurídica).
//
//   npx.cmd tsx scripts/owner-practice-batch.ts                          prévia: só lê o banco e salva o manifesto em .local/
//   npx.cmd tsx scripts/owner-practice-batch.ts --per-discipline 20      prévia limitando a quantidade por disciplina
//   npx.cmd tsx scripts/owner-practice-batch.ts --apply --actor-email <email do ADMIN> --authorization-ref "<motivo>"
//   npx.cmd tsx scripts/publish-owner-practice.cjs --revoke-batch <batchId> ...   (desfazer, ferramenta existente)
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { resolveInventoryCheckDatabaseUrl } from '../src/config/inventory-check-database-url';
import { planOwnerPracticeBatch } from '../src/services/questions/owner-practice-batch';
import { publishOwnerPractice } from '../src/services/questions/owner-practice-publication';

const manifestFile = path.resolve(__dirname, '../.local/owner-practice-batch.json');

function parseArgs(argv: string[]) {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--apply') { flags.set(flag, 'true'); continue; }
    if (!['--per-discipline', '--actor-email', '--authorization-ref'].includes(flag) || !argv[i + 1] || flags.has(flag)) throw new Error(`Argumento inválido: ${flag}`);
    flags.set(flag, argv[++i]);
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
  try {
    if (!flags.has('--apply')) {
      const perDiscipline = flags.has('--per-discipline') ? Number(flags.get('--per-discipline')) : undefined;
      if (perDiscipline !== undefined && (!Number.isInteger(perDiscipline) || perDiscipline < 1)) throw new Error('--per-discipline inválido.');
      const { manifest, alreadyReleased } = await planOwnerPracticeBatch(db, { perDiscipline });
      fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
      fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, createdAt: new Date().toISOString() }, null, 2));
      console.log(`PRÉVIA (nada foi gravado no banco). Já liberadas antes: ${alreadyReleased}. Novas neste lote: ${manifest.candidateCount}.`);
      for (const [d, n] of Object.entries(manifest.discipline)) console.log(`  ${d}: ${n}`);
      console.log(`Manifesto salvo em ${manifestFile}`);
      if (manifest.candidateCount) console.log('Para liberar: --apply --actor-email <email do ADMIN> --authorization-ref "<motivo, 8+ caracteres>"');
      return;
    }
    if (!fs.existsSync(manifestFile)) throw new Error('Rode a prévia antes do --apply.');
    const email = flags.get('--actor-email'), ref = flags.get('--authorization-ref');
    if (!email || !ref) throw new Error('--apply exige --actor-email e --authorization-ref.');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (!manifest.candidateCount) throw new Error('O manifesto não tem questões novas.');
    const result = await publishOwnerPractice(db, manifest, email, ref);
    fs.writeFileSync(manifestFile.replace('.json', '-result.json'), JSON.stringify({ ...result, completedAt: new Date().toISOString() }, null, 2));
    console.log('LIBERADO:', result);
  } finally { await db.$disconnect(); }
}

main().catch(error => { console.error(`Erro: ${error instanceof Error ? error.message : 'falha inesperada'}`); process.exitCode = 1; });
