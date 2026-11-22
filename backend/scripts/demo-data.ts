// Dados de demonstração para o painel do ADMIN: contas sem senha (@exemplo.invalid), turmas e avaliações [DEMO]
// com tentativas concluídas. Tudo é removível com --remove.
//
//   npx.cmd tsx scripts/demo-data.ts                       prévia (não conecta no banco)
//   npx.cmd tsx scripts/demo-data.ts --status              quantos dados de demonstração existem
//   npx.cmd tsx scripts/demo-data.ts --apply               grava (2000 alunos e 40 professores por padrão)
//   npx.cmd tsx scripts/demo-data.ts --remove              apaga só os dados de demonstração
//   opções: --students 2000 --teachers 40 --months 6 --seed 2026
import { PrismaClient } from '@prisma/client';
import { resolveInventoryCheckDatabaseUrl } from '../src/config/inventory-check-database-url';
import { countDemoData, createDemoData, planDemoData, removeDemoData } from '../src/services/demo/demo-data';

function parseArgs(argv: string[]) {
  const switches = new Set(['--status', '--apply', '--remove']);
  const values = new Set(['--students', '--teachers', '--months', '--seed']);
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flags.has(flag) || (!switches.has(flag) && !values.has(flag))) throw new Error(`Argumento inválido: ${flag}`);
    if (switches.has(flag)) { flags.set(flag, 'true'); continue; }
    const value = argv[++i];
    if (!value || !/^\d+$/.test(value)) throw new Error(`Valor inválido para ${flag}`);
    flags.set(flag, value);
  }
  if ([...switches].filter(s => flags.has(s)).length > 1) throw new Error('Use só um entre --status, --apply e --remove.');
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const plan = planDemoData({
    students: Number(flags.get('--students') ?? 2000), teachers: Number(flags.get('--teachers') ?? 40),
    months: Number(flags.get('--months') ?? 6), now: new Date(), seed: Number(flags.get('--seed') ?? 2026),
  });
  const attempts = plan.classes.reduce((total, c) => total + c.exams.reduce((sum, e) => sum + e.attempts.length, 0), 0);
  if (!['--status', '--apply', '--remove'].some(s => flags.has(s))) {
    const byMonth = new Map<string, number>();
    for (const u of plan.users) byMonth.set(u.createdAt.toISOString().slice(0, 7), (byMonth.get(u.createdAt.toISOString().slice(0, 7)) ?? 0) + 1);
    console.log(`PRÉVIA (não conecta no banco): ${plan.users.filter(u => u.role === 'ALUNO').length} alunos, ${plan.users.filter(u => u.role === 'PROFESSOR').length} professores, ${plan.classes.length} turmas, ${plan.classes.length * 3} avaliações, ${attempts} tentativas concluídas (${attempts * 5} respostas).`);
    console.log('Cadastros por mês:');
    for (const [month, count] of [...byMonth].sort()) console.log(`  ${month}  ${count}`);
    console.log(`Exemplo de conta: ${plan.users[0].nome} <${plan.users[0].email}> (sem senha)`);
    console.log('\nPara gravar: --apply   |   para apagar depois: --remove');
    return;
  }
  const url = resolveInventoryCheckDatabaseUrl();
  if (!url) throw new Error('DATABASE_URL não encontrado em backend/.env.');
  const target = new URL(url);
  console.log(`Banco: ${target.hostname}:${target.port || '5432'}${target.pathname}`);
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    if (flags.has('--status')) { console.log('Dados de demonstração no banco:', await countDemoData(db)); return; }
    if (flags.has('--remove')) { console.log('REMOVIDO:', await removeDemoData(db)); return; }
    console.log('Gravando... (pode levar alguns minutos)');
    console.log('GRAVADO:', await createDemoData(db, plan));
  } finally { await db.$disconnect(); }
}

main().catch(error => { console.error(`Erro: ${error instanceof Error ? error.message : 'falha inesperada'}`); process.exitCode = 1; });
