import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient, Role } from '@prisma/client';
import { fingerprintQuestionContent } from '../src/services/question-fingerprint';
import { INITIAL_DIAGNOSTIC_COMPOSITION } from '../src/services/initial-diagnostic-composition';
import { validateQuestionBatch, type Manifest, type Question } from '../src/services/eligible-question-batch';

async function apply(manifest: Manifest, questions: Question[], fileBytes: Buffer) {
  if (process.env.NODE_ENV === 'production' || !['development', 'homologation'].includes(process.env.JURISSIM_QUESTION_IMPORT_STAGE ?? '')) {
    throw new Error('apply bloqueado: defina JURISSIM_QUESTION_IMPORT_STAGE=development|homologation; production é sempre recusado.');
  }
  const databaseUrl = process.env.QUESTION_IMPORT_DATABASE_URL?.trim();
  const administratorId = process.env.QUESTION_IMPORT_ADMIN_ID?.trim();
  const expectedHost = process.env.QUESTION_IMPORT_ALLOWED_HOST?.trim().toLowerCase();
  if (!databaseUrl || !administratorId || !expectedHost) throw new Error('apply bloqueado: faltam variáveis de destino/administrador permitidas.');
  const target = new URL(databaseUrl);
  if (target.hostname.toLowerCase() !== expectedHost || (target.searchParams.get('schema') || 'public') !== 'public') {
    throw new Error('apply bloqueado: host/schema difere da allowlist configurada.');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$transaction(async tx => {
      const reviewerIds = [...new Set(questions.flatMap(q => [q.legalReview.reviewerId, q.pedagogicalReview.reviewerId,
        q.release.releasedById, ...(q.oab ? [q.oab.rightsVerifiedById] : [])]))];
      const users = await tx.user.findMany({ where: { id: { in: [administratorId, ...reviewerIds] }, deletedAt: null }, select: { id: true, role: true } });
      const userMap = new Map(users.map(user => [user.id, user.role]));
      if (userMap.get(administratorId) !== Role.ADMIN) throw new Error('apply bloqueado: administrador não validado.');
      const reviewerRoles = new Set<Role>([Role.ADMIN, Role.PROFESSOR]);
      for (const q of questions) {
        if (!reviewerRoles.has(userMap.get(q.legalReview.reviewerId) as Role)
          || !reviewerRoles.has(userMap.get(q.pedagogicalReview.reviewerId) as Role)
          || userMap.get(q.release.releasedById) !== Role.ADMIN
          || (q.oab && userMap.get(q.oab.rightsVerifiedById) !== Role.ADMIN)) {
          throw new Error('apply bloqueado: identidade/papel de revisor, liberador ou verificador não validado.');
        }
      }
      const fingerprints = questions.map(q => fingerprintQuestionContent({ enunciado: q.enunciado, disciplina: q.disciplina,
        assunto: q.assunto, nivel: q.nivel, alternativas: [...q.alternativas].sort((a,b) => a.letra.localeCompare(b.letra))
          .map(({ texto, correta }) => ({ texto, correta })) }));
      const duplicates = await tx.questao.findMany({ where: { fingerprint: { in: fingerprints } }, select: { id: true }, take: 1 });
      if (duplicates.length) throw new Error('apply bloqueado: fingerprint já existente; nenhuma questão foi criada.');
      const batch = await tx.loteImportacao.create({ data: { administradorId: administratorId, arquivoHash: createHash('sha256').update(fileBytes).digest('hex'), totalQuestoes: questions.length }, select: { id: true } });
      for (const q of questions) {
        await tx.questao.create({ data: {
          enunciado: q.enunciado.trim(), disciplina: q.disciplina, assunto: q.assunto.trim(), nivel: q.nivel,
          fundamentacaoJuridica: q.fundamentacaoJuridica.trim(), publica: true, turmaId: null, autorId: administratorId,
          fingerprint: fingerprintQuestionContent({ enunciado: q.enunciado, disciplina: q.disciplina, assunto: q.assunto, nivel: q.nivel,
            alternativas: [...q.alternativas].sort((a,b) => a.letra.localeCompare(b.letra)).map(({ texto, correta }) => ({ texto, correta })) }),
          loteImportacaoId: batch.id, origem: q.origem,
          fonteNome: q.source.name.trim(), fonteReferencia: q.source.reference.trim(), licencaOuAutorizacao: q.source.licenseOrAuthorization.trim(),
          revisaoJuridicaEm: new Date(q.legalReview.reviewedAt), revisorJuridicoId: q.legalReview.reviewerId,
          revisaoPedagogicaEm: new Date(q.pedagogicalReview.reviewedAt), revisorPedagogicoId: q.pedagogicalReview.reviewerId,
          liberadaAcervoEm: new Date(q.release.releasedAt), liberadaAcervoPorId: q.release.releasedById,
          ...(q.oab ? { situacaoQuestaoOficial: q.oab.officialStatus, situacaoDireitos: q.oab.rightsStatus,
            direitosVerificadosEm: new Date(q.oab.rightsVerifiedAt), direitosVerificadosPorId: q.oab.rightsVerifiedById,
            oabExame: q.oab.exam.trim(), oabEdicao: q.oab.edition.trim(), oabTipoProva: q.oab.examType.trim(),
            oabNumeroQuestao: q.oab.questionNumber, fonteOficialUrl: q.oab.officialUrl.trim() } : {}),
          alternativas: { create: q.alternativas.map(a => ({ letra: a.letra, texto: a.texto.trim(), correta: a.correta })) },
        } });
      }
    }, { isolationLevel: 'Serializable', timeout: 120_000 });
  } finally { await prisma.$disconnect(); }
}

async function main() {
  const args = process.argv.slice(2);
  const applyRequested = args.includes('--apply');
  const inputIndex = args.indexOf('--input');
  const file = inputIndex >= 0 ? args[inputIndex + 1] : undefined;
  if (!file || !file.trim()) {
    console.error('Uso: npx tsx scripts/import-eligible-question-batch.ts --input <lote.json> [--apply]');
    process.exitCode = 2; return;
  }
  let bytes: Buffer;
  let manifest: Manifest;
  try { bytes = readFileSync(file); manifest = JSON.parse(bytes.toString('utf8')) as Manifest; }
  catch { console.error('Lote JSON ausente ou inválido; nenhum banco foi consultado.'); process.exitCode = 2; return; }
  const result = validateQuestionBatch(manifest);
  const total = INITIAL_DIAGNOSTIC_COMPOSITION.reduce((sum, slot) => sum + slot.quantity, 0);
  console.log(`Lote: ${result.valid.length} itens elegíveis localmente; diagnóstico exige ${total}.`);
  if (result.errors.length) {
    console.log(`Validação recusada: ${result.errors.length} pendências.`);
    for (const error of result.errors) console.log(`  ${error}`);
    process.exitCode = 1; return;
  }
  console.log(`Cobertura validada: ${manifest.practiceTopics.length} assuntos-alvo, mínimo 5 questões por assunto.`);
  if (!applyRequested) { console.log('Prévia somente local; nenhuma conexão ou gravação realizada.'); return; }
  try {
    await apply(manifest, result.valid, bytes!);
    console.log(`Importação atômica concluída: ${result.valid.length} questões novas.`);
  } catch (error) {
    // Prisma/driver error messages may include connection details; never print them.
    console.error('Importação recusada; detalhes técnicos foram omitidos para proteger dados de conexão.');
    process.exitCode = 2;
  }
}

if (require.main === module) void main();
