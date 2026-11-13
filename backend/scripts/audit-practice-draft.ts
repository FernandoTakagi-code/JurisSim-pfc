import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { criarQuestaoSchema } from '../src/schemas/questao-schemas';

// Offline editorial audit: never imports Prisma, environment files or server code.
// Run from backend: npx tsx scripts/audit-practice-draft.ts [--reference file] [--out file]
const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  assert(args[index + 1] && !args[index + 1].startsWith('--'), `${name}: missing path`);
  return path.resolve(args[index + 1]);
};
const draftPath = option('--input') ?? path.resolve(__dirname, 'drafts/authorial-practice-60.draft.json');
const raw = fs.readFileSync(draftPath, 'utf8');
const draft = JSON.parse(raw);
type Question = typeof draft.questions[number];
const questions: Question[] = draft.questions;
const counts = (values: string[]) => Object.fromEntries([...new Set(values)].map(key => [key, values.filter(v => v === key).length]));
const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('pt-BR');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
assert.equal(questions.length, 60);
assert.equal(new Set(questions.map(q => q._draftSlot)).size, 60);
assert.equal(new Set(questions.map(q => normalize(q.enunciado))).size, 60);
assert.equal(draft._draftMetadata.eligibleForImport, false);
assert.equal(draft._draftMetadata.importCompatible, false);
assert.equal(draft._draftMetadata.publicationStatus, 'NAO_PUBLICADO');
const disciplineCounts = counts(questions.map(q => q.disciplina));
assert.equal(Object.keys(disciplineCounts).length, 5);
assert(Object.values(disciplineCounts).every(n => n === 12));
const topicCounts = counts(questions.map(q => `${q.disciplina} / ${q.assunto}`));
assert.equal(Object.keys(topicCounts).length, 10);
assert(Object.values(topicCounts).every(n => n === 6));
for (const q of questions) {
  criarQuestaoSchema.parse({
    enunciado: q.enunciado, disciplina: q.disciplina, assunto: q.assunto, nivel: q.nivel,
    publica: q.publica, fundamentacaoJuridica: q.fundamentacaoJuridica,
    alternativas: q.alternativas.map((a: any) => ({ texto: a.texto, correta: a.correta })),
  });
  assert.deepEqual(q.alternativas.map((a: any) => a.letra), ['A', 'B', 'C', 'D']);
  assert.equal(q.alternativas.filter((a: any) => a.correta).length, 1);
  assert.equal(q.alternativas.find((a: any) => a.correta).letra, q.gabarito);
  assert(q.alternativas.every((a: any) => typeof a.comentario === 'string' && a.comentario.trim().length > 20));
  assert(q.habilidade?.trim() && q.justificativaNivel?.trim());
  assert.equal(q.origem, 'IA');
  assert.equal(q.status, 'RASCUNHO_PENDENTE_REVISAO_HUMANA');
  assert.equal(q.eligibleForImport, false);
  assert.equal(q.preliminaryReview.humanApproval, false);
  for (const review of [q.legalReview, q.pedagogicalReview]) {
    assert.deepEqual(review, { reviewerId: null, reviewedAt: null, evidenceRef: null, status: 'PENDENTE' });
  }
  assert.deepEqual(q.release, { releasedById: null, releasedAt: null, evidenceRef: null, status: 'PENDENTE' });
  assert(q.source.reference.length > 0);
  for (const ref of q.source.reference) {
    const url = new URL(ref.url);
    assert(['www2.camara.leg.br', 'legis.senado.gov.br'].includes(url.hostname));
    assert.equal(url.protocol, 'https:');
    assert(ref.article?.trim());
    assert.equal(ref.consultedOn, draft._draftMetadata.preparedOn);
  }
}
const referencePaths = [
  path.resolve(__dirname, 'drafts/authorial-practice-60.draft.json'),
  path.resolve(__dirname, 'drafts/authorial-question-bank-39.draft.json'),
  path.resolve(__dirname, 'drafts/authorial-diagnostic-30.draft.json'),
  path.resolve(__dirname, 'drafts/eligible-ai-questions-15.draft.json'),
  ...(option('--reference') ? [option('--reference')!] : []),
].filter(file => file !== draftPath);
const references: { id: string; statement: string }[] = [];
const referenceFiles = referencePaths.map(file => {
  const content = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(content);
  const items = Array.isArray(parsed) ? parsed : parsed.questions;
  assert(Array.isArray(items), `Invalid reference collection: ${path.basename(file)}`);
  for (const [i, q] of items.entries()) {
    assert(typeof q.enunciado === 'string');
    references.push({ id: `${path.basename(file)}#${q._draftSlot ?? i + 1}`, statement: q.enunciado });
  }
  return { file: path.basename(file), sha256: hash(content), count: items.length };
});
const referenceStatements = new Set(references.map(q => normalize(q.statement)));
const exactDuplicates = questions.filter(q => referenceStatements.has(normalize(q.enunciado))).map(q => q._draftSlot);
assert.deepEqual(exactDuplicates, [], 'Repeated normalized statement in existing reference material');

// Lexical signal only: shared concepts and equivalent legal rules require human review.
const stop = new Set('a o as os de da do das dos e em no na nos nas um uma uns umas que se ao aos para por com sem qual quais segundo considerando sobre como pelo pela pelos pelas sua seu suas seus esse essa isso caso regra lei art'.split(' '));
const tokens = (text: string) => new Set(normalize(text).match(/[\p{L}\p{N}]+/gu)?.filter(t => t.length > 2 && !stop.has(t)) ?? []);
const similarity = (a: string, b: string) => {
  const x = tokens(a), y = tokens(b);
  const intersection = [...x].filter(t => y.has(t)).length;
  return intersection / new Set([...x, ...y]).size;
};
const pairs: { left: string; right: string; jaccard: number }[] = [];
for (const [i, q] of questions.entries()) {
  for (const r of references) pairs.push({ left: q._draftSlot, right: r.id, jaccard: similarity(q.enunciado, r.statement) });
  for (const r of questions.slice(0, i)) pairs.push({ left: q._draftSlot, right: r._draftSlot, jaccard: similarity(q.enunciado, r.enunciado) });
}
const topPairs = pairs.sort((a, b) => b.jaccard - a.jaccard).slice(0, 12).map(p => ({ ...p, jaccard: Number(p.jaccard.toFixed(4)) }));
const capacity = Object.entries(disciplineCounts).map(([discipline, count]) => ({ discipline, draftCount: count, initialPracticeQuantitiesAfterApproval: [5, 10, 20].filter(n => n <= count), shortfallFor20: Math.max(0, 20 - count) }));
const report = {
  checkedOn: draft._draftMetadata.preparedOn, draft: path.basename(draftPath), sha256: hash(raw),
  total: questions.length, disciplineCounts, topicCounts, levelCounts: counts(questions.map(q => q.nivel)), answerKeyCounts: counts(questions.map(q => q.gabarito)),
  structuralValidation: { passed: 60, fourDistinctOptionsAndOneKey: true, allOptionsCommented: true, actualCrudSchema: true, legalApprovalValidated: false },
  referenceFiles, referenceEntries: references.length, uniqueReferenceStatements: referenceStatements.size,
  exactNormalizedStatementDuplicates: exactDuplicates, topLexicalPairs: topPairs,
  originalityLimit: 'Comparação de enunciados locais; similaridade lexical não prova equivalência nem originalidade global. Sobreposição de conceitos continua pendente de revisão humana.',
  capacity, initialDraftsPerTopic: 6, initialBalancedMock30AfterApprovalAndImplementation: true,
  limitations: ['Capacidade teórica antes de respostas do aluno, com todos os 60 aprovados; atualmente zero deste lote está liberado.', 'Treino e simulado devem compartilhar exclusão de questões já respondidas; 10 em uma disciplina deixam 2 e inviabilizam um futuro simulado balanceado de 6 por disciplina.', 'Dois assuntos por disciplina não cobrem todo o programa da OAB.', 'O esquema comum do cadastro valida forma; não valida gabarito jurídico, nível, direitos ou elegibilidade de importação.'],
  httpRequests: 0, databaseWrites: 0, importedQuestions: 0, releasedQuestions: 0,
};
const output = option('--out');
if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ total: report.total, schemaPassed: 60, exactDuplicates: exactDuplicates.length, references: report.referenceEntries, released: 0, databaseWrites: 0, output: output ? path.basename(output) : null }));
