// Read-only preparation. Does not publish, set review fields or connect to a
// database other than the existing configured PostgreSQL URL.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const backend = path.resolve(__dirname, '..');
const cfg = dotenv.parse(fs.readFileSync(path.join(backend, '.env')));
const connection = new URL(cfg.DIRECT_URL || cfg.DATABASE_URL);
connection.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasourceUrl: connection.toString() });
const normalize = text => text.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('pt-BR');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main() {
  try {
    const report = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const state = await tx.$queryRaw`SHOW transaction_read_only`;
      if (state[0].transaction_read_only !== 'on') throw Error('Read-only required');
      const rows = await tx.questao.findMany({ include: {
        alternativas: { orderBy: { letra: 'asc' } },
        avaliacoes: { select: { avaliacao: { select: { publishedAt: true } } } },
      }, orderBy: [{ disciplina: 'asc' }, { assunto: 'asc' }, { id: 'asc' }] });
      const statements = new Map();
      for (const q of rows) {
        const key = hash(normalize(q.enunciado));
        statements.set(key, [...(statements.get(key) || []), q.id]);
      }
      const questions = rows.map(q => {
        const problems = [];
        if (q.enunciado.trim().length < 10) problems.push('INVALID_STATEMENT');
        if (!q.disciplina.trim() || !q.assunto.trim()) problems.push('MISSING_DISCIPLINE_OR_TOPIC');
        if (!q.fundamentacaoJuridica.trim()) problems.push('MISSING_EXPLANATION');
        if (q.alternativas.length !== 4 || !['A','B','C','D'].every(letter => q.alternativas.some(a => a.letra === letter))) problems.push('INVALID_FOUR_ALTERNATIVES');
        if (q.alternativas.some(a => !a.texto.trim())) problems.push('EMPTY_OPTION');
        if (q.alternativas.filter(a => a.correta).length !== 1) problems.push('INVALID_ANSWER_KEY');
        if (new Set(q.alternativas.map(a => normalize(a.texto))).size !== q.alternativas.length) problems.push('DUPLICATE_OPTION_TEXT');
        const duplicateIds = statements.get(hash(normalize(q.enunciado)));
        if (duplicateIds.length > 1) problems.push('DUPLICATE_STATEMENT_REQUIRES_REVIEW');
        if (q.situacaoQuestaoOficial === 'ANULADA') problems.push('ANNULLED');
        const publicGlobal = q.publica && q.turmaId === null;
        const publishedExam = q.avaliacoes.some(link => link.avaliacao.publishedAt !== null);
        const structural = problems.length === 0;
        const candidate = publicGlobal && structural && !publishedExam;
        return {
          id: q.id, discipline: q.disciplina, topic: q.assunto, origin: q.origem,
          public: q.publica, classScoped: q.turmaId !== null, publishedExam,
          complete: structural, candidate, problems,
          duplicateIds: duplicateIds.length > 1 ? duplicateIds : [],
          legalReview: Boolean(q.revisaoJuridicaEm && q.revisorJuridicoId),
          pedagogicalReview: Boolean(q.revisaoPedagogicaEm && q.revisorPedagogicoId),
          released: Boolean(q.liberadaAcervoEm && q.liberadaAcervoPorId),
          pendingLicense: /pendente/i.test(q.licencaOuAutorizacao || ''),
          sourcePresent: Boolean(q.fonteNome?.trim() && q.fonteReferencia?.trim()),
          // A structural audit is not a legal opinion or proof of copyright.
          contentDigest: hash({ enunciado: q.enunciado, disciplina: q.disciplina, assunto: q.assunto,
            nivel: q.nivel, explicacao: q.fundamentacaoJuridica, origem: q.origem,
            alternativas: q.alternativas.map(a => ({ id:a.id, letra:a.letra, texto:a.texto, correta:a.correta })),
            fonteNome:q.fonteNome, fonteReferencia:q.fonteReferencia, licenca:q.licencaOuAutorizacao }),
          previousRelease: { liberadaAcervoEm: q.liberadaAcervoEm, liberadaAcervoPorId:q.liberadaAcervoPorId },
        };
      });
      const candidates = questions.filter(q => q.candidate);
      const byDiscipline = [...new Set(questions.map(q => q.discipline))].map(discipline => {
        const group = questions.filter(q => q.discipline === discipline), selected = group.filter(q => q.candidate);
        return { discipline, total:group.length, public:group.filter(q => q.public && !q.classScoped).length,
          candidates:selected.length, currentEligible:group.filter(q => q.public && !q.classScoped && q.complete && q.legalReview && q.pedagogicalReview && q.released).length,
          potentialQuantities:[5,10,20].filter(n => selected.length >= n),
          topics:[...new Set(selected.map(q => q.topic))].map(topic => ({topic,count:selected.filter(q => q.topic === topic).length})) };
      });
      return { capturedAt:new Date().toISOString(), readOnly:true, total:questions.length,
        candidates:candidates.length, private:questions.filter(q => !q.public).length,
        classScoped:questions.filter(q => q.classScoped).length, publishedExam:questions.filter(q => q.publishedExam).length,
        incompleteOrInconsistent:questions.filter(q => !q.complete).length,
        duplicateGroups:[...statements.values()].filter(ids => ids.length > 1),
        byDiscipline, questions,
        limitation:'Candidate means structural completeness only; owner authorization is not legal review or verified reproduction rights.' };
    }, { timeout:60000, isolationLevel:'RepeatableRead' });
    fs.mkdirSync(path.join(backend,'.local'),{recursive:true});
    fs.writeFileSync(path.join(backend,'.local/owner-release-audit.json'),JSON.stringify(report,null,2));
    const {questions,...summary}=report; console.log(JSON.stringify(summary,null,2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(JSON.stringify({failed:true,code:error.code || error.name}));process.exitCode=1; });
