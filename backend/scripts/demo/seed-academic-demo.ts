import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { PrismaClient, Nivel, OrigemQuestao, SituacaoDireitos, SituacaoQuestaoOficial, Role } from '@prisma/client';
import versions from '../../src/legal-versions.json';
import { INITIAL_DIAGNOSTIC_COMPOSITION, INITIAL_DIAGNOSTIC_DISCIPLINES } from '../../src/services/initial-diagnostic-composition';

const DATABASE_NAME = 'jurissim_demo';
const DATABASE_PORT = 55432;
const PASSWORD = 'Demo@JurisSim2026';
const prisma = new PrismaClient();
const levels: Nivel[] = ['BASICO', 'INTERMEDIARIO', 'AVANCADO'];
const letters = ['A', 'B', 'C', 'D'] as const;

function assertIsDisposableDemoDatabase() {
  assert.equal(process.env.NODE_ENV, 'development', 'demo seed requires NODE_ENV=development');
  assert.equal(process.env.JURISSIM_DEMO_MODE, 'true', 'demo seed requires JURISSIM_DEMO_MODE=true');
  assert.ok(process.env.JURISSIM_DEMO_SYSTEM_ID, 'missing expected disposable PostgreSQL identity');
  const rawUrl = process.env.DATABASE_URL;
  assert.ok(rawUrl, 'missing explicit DATABASE_URL');
  const url = new URL(rawUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, String(DATABASE_PORT));
  assert.equal(url.pathname, `/${DATABASE_NAME}`);
  const expectedDirectUrl = new URL(process.env.DIRECT_URL ?? '');
  assert.equal(expectedDirectUrl.href, url.href, 'DATABASE_URL and DIRECT_URL must be this same disposable database');
}

async function main() {
  assertIsDisposableDemoDatabase();
  const identity = await prisma.$queryRaw<Array<{ database: string; address: string; port: number; systemId: string }>>`
    SELECT current_database() AS database, inet_server_addr()::text AS address,
      inet_server_port() AS port, (pg_control_system()).system_identifier::text AS "systemId"`;
  assert.equal(identity.length, 1);
  assert.equal(identity[0].database, DATABASE_NAME);
  assert.ok(['127.0.0.1', '127.0.0.1/32'].includes(identity[0].address));
  assert.equal(Number(identity[0].port), DATABASE_PORT);
  assert.equal(identity[0].systemId, process.env.JURISSIM_DEMO_SYSTEM_ID);

  const [users, questions, classes] = await Promise.all([
    prisma.user.count(), prisma.questao.count(), prisma.turma.count(),
  ]);
  assert.deepEqual({ users, questions, classes }, { users: 0, questions: 0, classes: 0 },
    'demo fixture loader only runs against the fresh, empty demo database');

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const acceptedAt = new Date();
  const common = { senhaHash: passwordHash, emailVerifiedAt: acceptedAt, legalAcceptedAt: acceptedAt,
    termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion };
  const admin = await prisma.user.create({ data: { ...common, nome: 'ADMIN DEMONSTRAÇÃO — conta técnica, sem revisão humana',
    email: 'admin.demo@jurissim.local', role: Role.ADMIN } });
  const teacher = await prisma.user.create({ data: { ...common, nome: 'Professor DEMONSTRAÇÃO',
    email: 'professor.demo@jurissim.local', role: Role.PROFESSOR } });
  const student = await prisma.user.create({ data: { ...common, nome: 'Aluno DEMONSTRAÇÃO',
    email: 'aluno.demo@jurissim.local', role: Role.ALUNO } });
  const classroom = await prisma.turma.create({ data: {
    nome: 'Turma DEMONSTRAÇÃO — conteúdo sintético', codigoConvite: 'DEMO-ACADEMICO-2026',
    professores: { connect: { id: teacher.id } }, alunos: { connect: { id: student.id } },
  } });

  let syntheticOabSlot = 0;
  const seededQuestions: { id: string; disciplina: string; assunto: string; nivel: Nivel; origem: OrigemQuestao }[] = [];
  async function createDemoQuestion(discipline: string, level: Nivel, origin: OrigemQuestao, sequence: number) {
    const isSimulatedOab = origin === OrigemQuestao.OAB_OFICIAL;
    if (isSimulatedOab) syntheticOabSlot++;
    const topic = `Demonstração técnica — ${discipline}`;
    const demoOrigin = isSimulatedOab
      ? 'SLOT OAB SIMULADO — NÃO É QUESTÃO OFICIAL'
      : 'ORIGEM IA SIMULADA — NÃO É CONTEÚDO JURÍDICO VALIDADO';
    const stamp = `[DEMONSTRAÇÃO: ITEM TOTALMENTE SINTÉTICO. ${demoOrigin}. NÃO IMPORTAR FORA DESTA BASE LOCAL.]`;
    const correctLetter = letters[(sequence + syntheticOabSlot) % letters.length];
    const question = await prisma.questao.create({ data: {
      enunciado: `${stamp} Este item existe apenas para exercitar seleção, navegação e resposta da interface. Disciplina de teste: ${discipline}; nível de teste: ${level}. Escolha a alternativa marcada como gabarito sintético.`,
      disciplina: discipline, assunto: topic, nivel: level,
      fundamentacaoJuridica: 'FEEDBACK DE DEMONSTRAÇÃO: o gabarito abaixo foi criado para testar a interface. Esta explicação não é fundamentação jurídica, revisão ou aconselhamento.',
      publica: true, autorId: admin.id, origem: origin,
      fonteNome: isSimulatedOab ? 'DEMONSTRAÇÃO — simulação técnica de slot OAB; não é OAB' : 'DEMONSTRAÇÃO — fixture sintética local assistida por IA',
      fonteReferencia: 'DEMO ONLY — conteúdo sintético, sem texto, alternativa, prova ou gabarito oficial de terceiros.',
      licencaOuAutorizacao: 'Conteúdo totalmente sintético, autorizado somente para esta instância local de demonstração; não autoriza conteúdo OAB nem material de terceiros.',
      revisaoJuridicaEm: acceptedAt, revisorJuridicoId: admin.id,
      revisaoPedagogicaEm: acceptedAt, revisorPedagogicoId: admin.id,
      liberadaAcervoEm: acceptedAt, liberadaAcervoPorId: admin.id,
      ...(isSimulatedOab ? {
        situacaoDireitos: SituacaoDireitos.AUTORIZADA,
        direitosVerificadosEm: acceptedAt, direitosVerificadosPorId: admin.id,
        oabExame: 'SIMULAÇÃO TÉCNICA — não corresponde a exame OAB',
        oabEdicao: 'DEMO ONLY', oabTipoProva: 'SLOT SINTÉTICO — NÃO OFICIAL',
        oabNumeroQuestao: syntheticOabSlot,
        fonteOficialUrl: `https://demo.invalid/jurissim/oab-slot-simulado-${syntheticOabSlot}`,
        situacaoQuestaoOficial: SituacaoQuestaoOficial.VALIDA,
      } : {}),
      alternativas: { create: letters.map(letter => ({
        letra: letter,
        correta: letter === correctLetter,
        texto: letter === correctLetter
          ? `GABARITO SINTÉTICO ${letter} — fixture DEMONSTRAÇÃO.`
          : `Distrator sintético ${letter} — fixture DEMONSTRAÇÃO.`,
      })) },
    }, select: { id: true } });
    seededQuestions.push({ id: question.id, disciplina: discipline, assunto: topic, nivel: level, origem: origin });
    return question.id;
  }

  let sequence = 0;
  for (const slot of INITIAL_DIAGNOSTIC_COMPOSITION) {
    for (let n = 0; n < slot.quantity; n++) {
      sequence++;
      await createDemoQuestion(slot.discipline, slot.level as Nivel, slot.origin as OrigemQuestao, sequence);
    }
  }
  const diagnosticCount = sequence;
  // Extra synthetic AI fixtures let practice and the adaptive trail have enough
  // distinct items at a single declared topic without changing the 30-slot mix.
  for (const discipline of INITIAL_DIAGNOSTIC_DISCIPLINES) {
    for (let n = 0; n < 5; n++) {
      sequence++;
      await createDemoQuestion(discipline, Nivel.INTERMEDIARIO, OrigemQuestao.IA, sequence);
    }
  }

  const evaluationQuestions = seededQuestions.filter(q => q.origem === OrigemQuestao.IA).slice(0, 5);
  await prisma.avaliacao.create({ data: {
    titulo: 'Simulado DEMONSTRAÇÃO — conteúdo sintético',
    descricao: 'Avaliação local de interface. Todas as questões são artificiais e não validadas juridicamente.',
    publishedAt: acceptedAt, autorId: teacher.id,
    turmas: { connect: { id: classroom.id } },
    questoes: { create: evaluationQuestions.map((q, index) => ({ posicao: index + 1, questaoId: q.id })) },
  } });

  const [eligible, practiceByDiscipline] = await Promise.all([
    prisma.questao.count({ where: { publica: true, turmaId: null, origem: { in: ['IA', 'OAB_OFICIAL'] },
      revisaoJuridicaEm: { not: null }, revisorJuridicoId: { not: null }, revisaoPedagogicaEm: { not: null },
      revisorPedagogicoId: { not: null }, liberadaAcervoEm: { not: null }, liberadaAcervoPorId: { not: null },
      OR: [{ origem: 'IA' }, { origem: 'OAB_OFICIAL', situacaoQuestaoOficial: 'VALIDA',
        situacaoDireitos: { in: ['AUTORIZADA', 'DOMINIO_PUBLICO_VERIFICADO'] }, direitosVerificadosEm: { not: null },
        direitosVerificadosPorId: { not: null }, oabExame: { not: null }, oabEdicao: { not: null }, oabTipoProva: { not: null },
        oabNumeroQuestao: { not: null }, fonteOficialUrl: { not: null }, fonteNome: { not: null }, fonteReferencia: { not: null },
        licencaOuAutorizacao: { not: null } }] } }),
    Promise.all(INITIAL_DIAGNOSTIC_DISCIPLINES.map(async discipline => ({ discipline,
      count: await prisma.questao.count({ where: { disciplina: discipline, assunto: `Demonstração técnica — ${discipline}`, publica: true } }) }))),
  ]);
  assert.equal(diagnosticCount, 30);
  assert.equal(eligible, 55);
  assert.equal(syntheticOabSlot, 15);
  assert.ok(practiceByDiscipline.every(item => item.count >= 5));
  console.log(JSON.stringify({ status: 'DEMONSTRAÇÃO LOCAL', database: DATABASE_NAME, users: 3,
    class: classroom.nome, diagnosticSlots: diagnosticCount, simulatedOabSlots: syntheticOabSlot,
    extraPracticeFixtures: 25, inventoryEligibleOnlyInDemoDatabase: eligible,
    practiceTopicsAtLeastFive: practiceByDiscipline, noOfficialOabContent: true }, null, 2));
  console.log(`Contas locais: aluno.demo@jurissim.local / ${PASSWORD}; professor.demo@jurissim.local / ${PASSWORD}; admin.demo@jurissim.local / ${PASSWORD}`);
}

main().catch(error => { console.error('DEMONSTRAÇÃO LOCAL recusada ou falhou:', error instanceof Error ? error.message : 'erro inesperado'); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
