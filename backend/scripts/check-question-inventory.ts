import { PrismaClient } from '@prisma/client';
import { INITIAL_DIAGNOSTIC_COMPOSITION, INITIAL_DIAGNOSTIC_DISCIPLINES } from '../src/services/initial-diagnostic-composition';
import { PrismaInitialDiagnosticRepository } from '../src/repositories/prisma-initial-diagnostic-repository';
import { PrismaQuestionPracticeRepository } from '../src/repositories/prisma-question-practice-repository';
import type { PracticeQuestion } from '../src/services/question-practice-service';
import { resolveInventoryCheckDatabaseUrl } from '../src/config/inventory-check-database-url';
import { diagnoseInventoryCheckError } from '../src/config/inventory-check-error';

async function main() {
 const databaseUrl = resolveInventoryCheckDatabaseUrl();
 if (!databaseUrl) {
  console.error('Defina INVENTORY_CHECK_DATABASE_URL ou DATABASE_URL em backend/.env. Nenhuma variável é carregada globalmente.');
  process.exitCode = 2;
 } else {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    // PostgreSQL enforces read-only behavior for every statement in this transaction.
    await db.$transaction(async transaction => {
      await transaction.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const repository = new PrismaInitialDiagnosticRepository(transaction as unknown as PrismaClient);
      const practice = new PrismaQuestionPracticeRepository(transaction as unknown as PrismaClient);
      const inventory = await repository.listEligibleInventory();
      const shortages = INITIAL_DIAGNOSTIC_COMPOSITION.flatMap(slot => {
        const available = inventory.filter(question => question.discipline === slot.discipline
          && question.level === slot.level && question.origin === slot.origin).length;
        return available < slot.quantity ? [{ ...slot, available, deficit: slot.quantity - available }] : [];
      });

      console.log(`Diagnostico inicial: ${shortages.length === 0 ? 'APTO' : 'INSUFICIENTE'} (${INITIAL_DIAGNOSTIC_COMPOSITION.reduce((sum, item) => sum + item.quantity, 0)} questoes exigidas).`);
      for (const discipline of INITIAL_DIAGNOSTIC_DISCIPLINES) {
        const rows = inventory.filter(question => question.discipline === discipline);
        console.log(`  ${discipline}: ${rows.length} elegiveis para diagnostico`);
      }
      if (shortages.length) {
        console.log('Slots insuficientes (disciplina / nivel / origem / disponiveis / exigidas):');
        for (const item of shortages) console.log(`  ${item.discipline} / ${item.level} / ${item.origin} / ${item.available} / ${item.quantity}`);
      }

      console.log('Pratica personalizada (contagem de questoes ineditas nao pode ser determinada sem a identidade do aluno):');
      let allDisciplinesReady = true;
      for (const discipline of INITIAL_DIAGNOSTIC_DISCIPLINES) {
        const rows: PracticeQuestion[] = await practice.listEligibleQuestions(discipline);
        const topics = new Map<string, number>();
        for (const question of rows) topics.set(question.topic, (topics.get(question.topic) ?? 0) + 1);
        const topicList = [...topics].sort(([left], [right]) => left.localeCompare(right, 'pt-BR'));
        const practiceReady = topicList.some(([, count]) => count >= 5);
        allDisciplinesReady &&= practiceReady;
        console.log(`  ${discipline}: ${rows.length} questoes; assuntos com >=5 / >=10 / >=20: ${topicList.filter(([, count]) => count >= 5).length} / ${topicList.filter(([, count]) => count >= 10).length} / ${topicList.filter(([, count]) => count >= 20).length}`);
        for (const [topic, count] of topicList) console.log(`    ${topic}: ${count} (maximo praticavel: ${Math.min(20, Math.floor(count / 5) * 5)})`);
      }
      console.log(`Pratica: ${allDisciplinesReady ? 'HA PELO MENOS UM ASSUNTO COM 5 QUESTOES EM CADA DISCIPLINA' : 'HA DISCIPLINA SEM ASSUNTO COM 5 QUESTOES'}.`);
      if (shortages.length || !allDisciplinesReady) process.exitCode = 1;
    }, { timeout: 120_000 });
  } catch (error) {
    // The classifier returns only a fixed category and message, never driver text.
    const diagnostic = diagnoseInventoryCheckError(error);
    console.error(`Falha na validação somente de leitura [${diagnostic.category}]: ${diagnostic.message}`);
    process.exitCode = 2;
  } finally {
    try { await db.$disconnect(); } catch { /* Never expose driver or connection details during cleanup. */ }
  }
 }
}

void main();
