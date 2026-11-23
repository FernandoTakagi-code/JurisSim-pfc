import type { Prisma, PrismaClient } from '@prisma/client';
import { inventorySelect } from '../../repositories/prisma-initial-diagnostic-repository';
import { ownerManifestSelectionDigest, type OwnerPracticeManifest } from './owner-practice-publication';
import { ownerPracticeAuthorizedIds, ownerPracticeContentValid, ownerPracticeDigest, ownerPracticeScope } from './owner-practice-release';

const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('pt-BR');

/**
 * Monta um novo lote de liberação pelo proprietário (somente leitura): questões públicas de IA,
 * com conteúdo completo, fora de avaliações publicadas, sem enunciado duplicado e ainda não liberadas.
 * O resultado é o mesmo formato de manifesto aceito por publishOwnerPractice.
 */
export async function planOwnerPracticeBatch(db: PrismaClient, options: { perDiscipline?: number } = {}) {
  const rows = await db.questao.findMany({
    where: ownerPracticeScope as Prisma.QuestaoWhereInput,
    orderBy: [{ disciplina: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { ...inventorySelect, avaliacoes: { select: { avaliacao: { select: { publishedAt: true } } } } },
  });
  const all = await db.questao.findMany({ select: { id: true, enunciado: true } });
  const counts = new Map<string, number>();
  for (const q of all) counts.set(normalize(q.enunciado), (counts.get(normalize(q.enunciado)) ?? 0) + 1);
  const valid = rows.filter(q => ownerPracticeContentValid(q) && !q.avaliacoes.some(a => a.avaliacao.publishedAt)
    && counts.get(normalize(q.enunciado)) === 1);
  const released = await withOwnerFlag(() => ownerPracticeAuthorizedIds(db, valid));
  const perDiscipline = new Map<string, number>();
  const chosen = valid.filter(q => {
    if (released.has(q.id)) return false;
    const n = perDiscipline.get(q.disciplina) ?? 0;
    if (options.perDiscipline && n >= options.perDiscipline) return false;
    perDiscipline.set(q.disciplina, n + 1);
    return true;
  });
  const questions = chosen.map(q => ({ id: q.id, contentDigest: ownerPracticeDigest(q) }));
  const manifest: OwnerPracticeManifest & { discipline: Record<string, number> } = {
    candidateCount: questions.length,
    selectionSha256: ownerManifestSelectionDigest(questions),
    questions,
    discipline: Object.fromEntries(perDiscipline),
  };
  return { manifest, alreadyReleased: released.size, topics: chosen.map(q => ({ id: q.id, disciplina: q.disciplina, assunto: q.assunto })) };
}

// A verificação de "já liberada" só roda com a flag ligada; liga apenas durante a consulta.
async function withOwnerFlag<T>(fn: () => Promise<T>) {
  const previous = process.env.QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED;
  process.env.QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED = 'true';
  try { return await fn(); } finally {
    if (previous === undefined) delete process.env.QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED;
    else process.env.QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED = previous;
  }
}
