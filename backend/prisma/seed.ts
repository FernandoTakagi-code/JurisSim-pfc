import 'dotenv/config';
import { Nivel, PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

export const TEST_STUDENT_ID = '11111111-1111-4111-8111-111111111111';
const TEST_AUTHOR_ID = '22222222-2222-4222-8222-222222222222';

type SeedQuestion = {
  discipline: string;
  topic: string;
  level: Nivel;
  statement: string;
  correctAnswer: string;
  legalBasis: string;
};

const questions: SeedQuestion[] = [
  { discipline: 'Direito Constitucional', topic: 'Controle de constitucionalidade', level: 'BASICO', statement: 'O controle de constitucionalidade busca verificar a compatibilidade das leis com a Constituicao?', correctAnswer: 'Sim, para preservar a supremacia da Constituicao.', legalBasis: 'Constituicao Federal, arts. 102 e 103.' },
  { discipline: 'Direito Constitucional', topic: 'Direitos fundamentais', level: 'BASICO', statement: 'O habeas corpus protege a liberdade de locomocao?', correctAnswer: 'Sim, diante de ilegalidade ou abuso de poder.', legalBasis: 'Constituicao Federal, art. 5, LXVIII.' },
  { discipline: 'Direito Constitucional', topic: 'Poder constituinte', level: 'INTERMEDIARIO', statement: 'Uma emenda constitucional pode abolir a separacao dos Poderes?', correctAnswer: 'Nao, porque a separacao dos Poderes e clausula petrea.', legalBasis: 'Constituicao Federal, art. 60, paragrafo 4, III.' },
  { discipline: 'Direito Constitucional', topic: 'Organizacao do Estado', level: 'INTERMEDIARIO', statement: 'O municipio pode legislar sobre interesse local?', correctAnswer: 'Sim, respeitadas as competencias constitucionais.', legalBasis: 'Constituicao Federal, art. 30, I.' },
  { discipline: 'Direito Constitucional', topic: 'Defesa do Estado', level: 'AVANCADO', statement: 'Medidas do estado de defesa dependem de limites constitucionais expressos?', correctAnswer: 'Sim, por serem medidas excepcionais.', legalBasis: 'Constituicao Federal, arts. 136 a 141.' },
  { discipline: 'Direito Civil', topic: 'Personalidade', level: 'BASICO', statement: 'A personalidade civil da pessoa natural comeca, em regra, com o nascimento com vida?', correctAnswer: 'Sim, sem prejuizo dos direitos do nascituro.', legalBasis: 'Codigo Civil, art. 2.' },
  { discipline: 'Direito Civil', topic: 'Negocios juridicos', level: 'BASICO', statement: 'Capacidade, objeto licito e forma admitida sao requisitos de validade do negocio juridico?', correctAnswer: 'Sim, em regra.', legalBasis: 'Codigo Civil, art. 104.' },
  { discipline: 'Direito Civil', topic: 'Direitos reais', level: 'INTERMEDIARIO', statement: 'A propriedade deve atender a sua funcao social?', correctAnswer: 'Sim, o direito de propriedade nao e absoluto.', legalBasis: 'Codigo Civil, art. 1.228, paragrafo 1.' },
  { discipline: 'Direito Civil', topic: 'Inadimplemento', level: 'INTERMEDIARIO', statement: 'A mora culposa pode gerar perdas e danos?', correctAnswer: 'Sim, quando houver prejuizo nos termos da lei.', legalBasis: 'Codigo Civil, arts. 389 e 395.' },
  { discipline: 'Direito Civil', topic: 'Prescricao', level: 'AVANCADO', statement: 'A prescricao extingue a pretensao, e nao o direito material em si?', correctAnswer: 'Sim, essa e a regra do Codigo Civil.', legalBasis: 'Codigo Civil, art. 189.' },
  { discipline: 'Direito Penal', topic: 'Legalidade penal', level: 'BASICO', statement: 'Ha crime sem lei anterior que o defina?', correctAnswer: 'Nao, em respeito ao principio da legalidade.', legalBasis: 'Codigo Penal, art. 1.' },
  { discipline: 'Direito Penal', topic: 'Iter criminis', level: 'BASICO', statement: 'A tentativa exige inicio de execucao e nao consumacao por circunstancia alheia a vontade do agente?', correctAnswer: 'Sim.', legalBasis: 'Codigo Penal, art. 14, II.' },
  { discipline: 'Direito Penal', topic: 'Excludentes de ilicitude', level: 'INTERMEDIARIO', statement: 'A legitima defesa exige agressao injusta atual ou iminente?', correctAnswer: 'Sim, alem dos demais requisitos legais.', legalBasis: 'Codigo Penal, art. 25.' },
  { discipline: 'Direito Penal', topic: 'Culpabilidade', level: 'INTERMEDIARIO', statement: 'O erro inevitavel sobre a ilicitude pode isentar de pena?', correctAnswer: 'Sim, se o erro for inevitavel.', legalBasis: 'Codigo Penal, art. 21.' },
  { discipline: 'Direito Penal', topic: 'Concurso de crimes', level: 'AVANCADO', statement: 'Uma unica conduta que produz dois crimes pode caracterizar concurso formal?', correctAnswer: 'Sim, presentes os requisitos legais.', legalBasis: 'Codigo Penal, art. 70.' },
  { discipline: 'Direito Administrativo', topic: 'Principios administrativos', level: 'BASICO', statement: 'A administracao publica deve observar o principio da legalidade?', correctAnswer: 'Sim.', legalBasis: 'Constituicao Federal, art. 37, caput.' },
  { discipline: 'Direito Administrativo', topic: 'Licitacoes', level: 'BASICO', statement: 'A licitacao busca assegurar isonomia e selecionar proposta vantajosa?', correctAnswer: 'Sim.', legalBasis: 'Lei 14.133/2021, art. 5.' },
  { discipline: 'Direito Administrativo', topic: 'Responsabilidade civil do Estado', level: 'INTERMEDIARIO', statement: 'O dano causado por agente publico pode gerar responsabilidade objetiva do Estado?', correctAnswer: 'Sim, observados dano e nexo causal.', legalBasis: 'Constituicao Federal, art. 37, paragrafo 6.' },
  { discipline: 'Direito Administrativo', topic: 'Atos administrativos', level: 'INTERMEDIARIO', statement: 'A administracao pode anular ato ilegal?', correctAnswer: 'Sim, respeitados os limites legais.', legalBasis: 'Sumula 473 do STF.' },
  { discipline: 'Direito Administrativo', topic: 'Servicos publicos', level: 'AVANCADO', statement: 'A concessao de servico publico exige licitacao como regra?', correctAnswer: 'Sim, salvo excecoes legais.', legalBasis: 'Constituicao Federal, art. 175.' },
  { discipline: 'Direito do Trabalho', topic: 'Relacao de emprego', level: 'BASICO', statement: 'Pessoalidade, subordinacao, onerosidade e nao eventualidade caracterizam a relacao de emprego?', correctAnswer: 'Sim, em conjunto.', legalBasis: 'CLT, arts. 2 e 3.' },
  { discipline: 'Direito do Trabalho', topic: 'Jornada de trabalho', level: 'BASICO', statement: 'A jornada normal e, em regra, limitada a oito horas diarias?', correctAnswer: 'Sim, salvo regimes legais especificos.', legalBasis: 'Constituicao Federal, art. 7, XIII.' },
  { discipline: 'Direito do Trabalho', topic: 'Contrato de trabalho', level: 'INTERMEDIARIO', statement: 'A alteracao contratual lesiva ao empregado e valida?', correctAnswer: 'Nao, salvo hipoteses legais sem prejuizo.', legalBasis: 'CLT, art. 468.' },
  { discipline: 'Direito do Trabalho', topic: 'Extincao do contrato', level: 'INTERMEDIARIO', statement: 'A dispensa sem justa causa gera direito a aviso-previo?', correctAnswer: 'Sim, na forma da lei.', legalBasis: 'CLT, art. 487.' },
  { discipline: 'Direito do Trabalho', topic: 'Remuneracao', level: 'AVANCADO', statement: 'A equiparacao salarial depende de trabalho de igual valor, entre outros requisitos?', correctAnswer: 'Sim.', legalBasis: 'CLT, art. 461.' },
  { discipline: 'Etica Profissional', topic: 'Funcao da advocacia', level: 'BASICO', statement: 'O advogado e indispensavel a administracao da justica?', correctAnswer: 'Sim.', legalBasis: 'Constituicao Federal, art. 133.' },
  { discipline: 'Etica Profissional', topic: 'Inscricao profissional', level: 'BASICO', statement: 'A inscricao na OAB e requisito para exercer advocacia no Brasil?', correctAnswer: 'Sim, observadas as condicoes legais.', legalBasis: 'Lei 8.906/1994, arts. 3 e 8.' },
  { discipline: 'Etica Profissional', topic: 'Sigilo profissional', level: 'INTERMEDIARIO', statement: 'O advogado deve preservar o sigilo profissional?', correctAnswer: 'Sim, salvo justa causa ou dever legal.', legalBasis: 'Lei 8.906/1994, art. 34, VII.' },
  { discipline: 'Etica Profissional', topic: 'Publicidade profissional', level: 'INTERMEDIARIO', statement: 'A publicidade da advocacia deve ser informativa e discreta?', correctAnswer: 'Sim, sem captacao indevida de clientela.', legalBasis: 'Codigo de Etica e Disciplina da OAB, arts. 39 a 47.' },
  { discipline: 'Etica Profissional', topic: 'Mandato', level: 'AVANCADO', statement: 'O advogado que renuncia ao mandato pode ter dever temporario de continuar representando o cliente?', correctAnswer: 'Sim, para evitar prejuizo imediato.', legalBasis: 'Lei 8.906/1994, art. 5, paragrafo 3.' },
];

function fixedId(prefix: string, number: number) {
  return `00000000-0000-4000-8000-${prefix}${number.toString().padStart(11, '0')}`;
}

function alternatives(question: SeedQuestion, questionIndex: number) {
  return [
    { id: fixedId('4', questionIndex * 4 + 1), texto: question.correctAnswer, correta: true },
    { id: fixedId('4', questionIndex * 4 + 2), texto: 'Nao, essa afirmacao nao corresponde a regra aplicavel.', correta: false },
    { id: fixedId('4', questionIndex * 4 + 3), texto: 'Sim, mas somente por decisao administrativa sem fundamento legal.', correta: false },
    { id: fixedId('4', questionIndex * 4 + 4), texto: 'A materia nao possui previsao juridica.', correta: false },
  ];
}

function ensureLocalDatabase() {
  if (process.env.SEED_LOCAL_DATABASE !== 'true') {
    throw new Error('Defina SEED_LOCAL_DATABASE=true para confirmar o uso do seed local.');
  }

  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL ou DIRECT_URL nao foi configurada.');

  const hostname = new URL(databaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(`Seed bloqueado: o host '${hostname}' nao e local.`);
  }
}

async function main() {
  ensureLocalDatabase();

  await prisma.user.upsert({
    where: { email: 'autor.teste@jurissim.local' },
    update: { id: TEST_AUTHOR_ID, nome: 'Autor de Questoes Local', senhaHash: 'senha-nao-utilizada-em-testes', role: Role.PROFESSOR },
    create: { id: TEST_AUTHOR_ID, nome: 'Autor de Questoes Local', email: 'autor.teste@jurissim.local', senhaHash: 'senha-nao-utilizada-em-testes', role: Role.PROFESSOR },
  });

  await prisma.user.upsert({
    where: { email: 'aluno.teste@jurissim.local' },
    update: { id: TEST_STUDENT_ID, nome: 'Aluno de Teste Local', senhaHash: 'senha-nao-utilizada-em-testes', role: Role.ALUNO },
    create: { id: TEST_STUDENT_ID, nome: 'Aluno de Teste Local', email: 'aluno.teste@jurissim.local', senhaHash: 'senha-nao-utilizada-em-testes', role: Role.ALUNO },
  });

  for (const [index, question] of questions.entries()) {
    const questionId = fixedId('3', index + 1);
    await prisma.questao.upsert({
      where: { id: questionId },
      update: {
        enunciado: question.statement,
        disciplina: question.discipline,
        assunto: question.topic,
        nivel: question.level,
        fundamentacaoJuridica: question.legalBasis,
        publica: true,
        autorId: TEST_AUTHOR_ID,
      },
      create: {
        id: questionId,
        enunciado: question.statement,
        disciplina: question.discipline,
        assunto: question.topic,
        nivel: question.level,
        fundamentacaoJuridica: question.legalBasis,
        publica: true,
        autorId: TEST_AUTHOR_ID,
      },
    });

    await prisma.alternativa.deleteMany({ where: { questaoId: questionId } });
    await prisma.alternativa.createMany({ data: alternatives(question, index).map((alternative) => ({ ...alternative, questaoId: questionId })) });
  }

  console.log(`${questions.length} questoes e dois usuarios locais foram preparados.`);
  console.log(`Aluno de teste: ${TEST_STUDENT_ID}`);
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
