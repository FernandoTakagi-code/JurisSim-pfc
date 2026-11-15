// Read-only diagnostics: never starts attempts or changes editorial records.
import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { prisma } from '../src/lib/prisma';
import { inventoryWhere, inventorySelect, toEligibleCandidate } from '../src/repositories/prisma-initial-diagnostic-repository';
import { QuestionPracticeService } from '../src/services/question-practice-service';
import { PrismaQuestionPracticeRepository } from '../src/repositories/prisma-question-practice-repository';
import { IndividualExamService } from '../src/services/individual-exam-service';
import { PrismaIndividualExamRepository } from '../src/repositories/prisma-individual-exam-repository';
import { DiagnosticService } from '../src/services/diagnostic-service';
import { InitialDiagnosticResolutionService } from '../src/services/initial-diagnostic-resolution-service';
import { PrismaInitialDiagnosticResolutionRepository } from '../src/repositories/prisma-initial-diagnostic-resolution-repository';

async function measure(name: string, run: () => Promise<unknown>) {
  const start = performance.now();
  try { console.log(JSON.stringify({ name, result: await run(), ms: Math.round(performance.now() - start) })); }
  catch (error) { console.log(JSON.stringify({ name, ms: Math.round(performance.now() - start), error: error instanceof Error ? error.name : 'unknown', code: (error as { code?: string }).code })); }
}
async function main() {
  await measure('schema', () => prisma.$queryRaw`SELECT to_regclass('public."SessaoPratica"')::text AS practice, to_regclass('public."SessaoSimuladoIndividual"')::text AS exam, to_regclass('public."DiagnosticoInicial"')::text AS diagnostic`);
  await measure('inventory', async () => {
    const rows = await prisma.questao.findMany({ where: inventoryWhere, select: inventorySelect });
    const eligible = rows.filter(row => toEligibleCandidate(row));
    return { matchingEditorialFilters: rows.length, eligible: eligible.length, disciplines: Object.fromEntries([...new Set(eligible.map(q => q.disciplina))].map(d => [d, eligible.filter(q => q.disciplina === d).length])) };
  });
  await measure('editorial-counts', () => prisma.$queryRaw`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE publica)::int AS public,
    count(*) FILTER (WHERE "revisaoJuridicaEm" IS NOT NULL AND "revisorJuridicoId" IS NOT NULL)::int AS legal_review,
    count(*) FILTER (WHERE "revisaoPedagogicaEm" IS NOT NULL AND "revisorPedagogicoId" IS NOT NULL)::int AS pedagogical_review,
    count(*) FILTER (WHERE "liberadaAcervoEm" IS NOT NULL AND "liberadaAcervoPorId" IS NOT NULL)::int AS released
    FROM "Questao"`);
  await measure('indexes', () => prisma.$queryRaw`SELECT tablename, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('Simulado','QuestaoSimulado','Resposta','Questao','SessaoPratica','SessaoSimuladoIndividual')`);
  const latest = await prisma.simulado.findFirst({ where: { tipo: 'DIAGNOSTICO', finalizadoEm: { not: null } }, orderBy: { finalizadoEm: 'desc' }, select: { id: true, alunoId: true, diagnosticoInicial: { select: { id: true } } } });
  if (!latest) return;
  for (let sample = 1; sample <= 3; sample++) {
    await measure(`practice-${sample}`, async () => {
      const value = await new QuestionPracticeService(new PrismaQuestionPracticeRepository()).availability(latest.alunoId, 'Direito Civil', null);
      return { availableCount: value.availableCount, quantities: value.availableQuantities };
    });
    await measure(`exam-${sample}`, async () => {
      const value = await new IndividualExamService(new PrismaIndividualExamRepository()).availability(latest.alunoId);
      return { canStart: value.canStart, disciplines: value.disciplines };
    });
    await measure(`result-${sample}`, async () => {
      const value = latest.diagnosticoInicial
        ? await new InitialDiagnosticResolutionService(new PrismaInitialDiagnosticResolutionRepository()).getResult(latest.alunoId, latest.id)
        : await new DiagnosticService().getResult(latest.id, latest.alunoId);
      return { loaded: Boolean(value), initial: Boolean(latest.diagnosticoInicial) };
    });
  }
  const initial = await prisma.diagnosticoInicial.findFirst({ where: { simulado: { finalizadoEm: { not: null } } },
    orderBy: { simulado: { finalizadoEm: 'desc' } }, select: { alunoId: true, simuladoId: true } });
  if (initial) await measure('initial-historical-result', async () => {
    const result = await new InitialDiagnosticResolutionService(new PrismaInitialDiagnosticResolutionRepository()).getResult(initial.alunoId, initial.simuladoId);
    return { loaded: Boolean(result), hasRecommendation: Boolean(result.trail) };
  });
}
main().finally(() => prisma.$disconnect());
