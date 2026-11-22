import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import versions from '../../legal-versions.json';
import { inventorySelect } from '../../repositories/prisma-initial-diagnostic-repository';
import { ownerPracticeContentValid } from '../questions/owner-practice-release';
import { isPracticeSelectable } from '../questions/question-practice-pilot';

// Dados de demonstração para o painel do ADMIN. Tudo é identificável e removível:
// e-mails no domínio reservado .invalid (nunca recebe e-mail), contas sem senha e turmas/avaliações com prefixo.
export const DEMO_EMAIL_DOMAIN = '@exemplo.invalid';
export const DEMO_PREFIX = '[DEMO]';
const DAY = 86_400_000;

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Lucas', 'Mariana', 'Mateus', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Thiago', 'Vitória', 'Yuri', 'Beatriz', 'Caio', 'Fernanda', 'Gustavo', 'Júlia', 'Leonardo', 'Camila', 'Pedro'];
const LAST = ['Almeida', 'Barbosa', 'Cardoso', 'Costa', 'Dias', 'Ferreira', 'Gomes', 'Lima', 'Martins', 'Melo', 'Moreira', 'Nascimento', 'Oliveira', 'Pereira', 'Ribeiro', 'Rocha', 'Santos', 'Silva', 'Souza', 'Teixeira'];

export type DemoPlan = ReturnType<typeof planDemoData>;
type PlanInput = { students: number; teachers: number; months: number; now: Date; seed: number };

/** Gerador pseudoaleatório com semente (mulberry32): o mesmo plano para a mesma semente. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function planDemoData({ students, teachers, months, now, seed }: PlanInput) {
  if (!Number.isInteger(students) || students < 1 || students > 20000) throw new RangeError('Quantidade de alunos inválida (1 a 20000).');
  if (!Number.isInteger(teachers) || teachers < 0 || teachers > 2000) throw new RangeError('Quantidade de professores inválida.');
  if (!Number.isInteger(months) || months < 1 || months > 24) throw new RangeError('Período inválido (1 a 24 meses).');
  const rnd = random(seed);
  const end = now.getTime();
  const span = months * 30 * DAY;
  const start = end - span;
  // Raiz quadrada concentra mais cadastros nos meses recentes (crescimento).
  const createdAt = () => new Date(start + Math.sqrt(rnd()) * span);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
  const users = [
    ...Array.from({ length: students }, (_, i) => ({ role: 'ALUNO' as const, index: i + 1 })),
    ...Array.from({ length: teachers }, (_, i) => ({ role: 'PROFESSOR' as const, index: i + 1 })),
  ].map(({ role, index }) => ({
    role,
    nome: `${pick(FIRST)} ${pick(LAST)}`,
    email: `demo.${role === 'ALUNO' ? 'aluno' : 'professor'}.${String(index).padStart(5, '0')}${DEMO_EMAIL_DOMAIN}`,
    createdAt: createdAt(),
  }));

  const studentsList = users.filter(u => u.role === 'ALUNO');
  const classes = ['Turma A — OAB 1ª fase', 'Turma B — OAB 1ª fase', 'Turma C — Revisão intensiva'].map((name, c) => {
    const createdAtClass = new Date(start + (0.1 + 0.15 * c) * span);
    // Cada aluno pertence a no máximo uma turma (i % 3); metade deles participa, então ~50% do total.
    const studentEmails = studentsList.filter((_, i) => i % 3 === c && rnd() < 0.5).map(u => u.email);
    const exams = [0, 1, 2].map(k => {
      const publishedAt = new Date(createdAtClass.getTime() + (0.15 + 0.25 * k) * (end - createdAtClass.getTime()));
      const examKey = `${c}-${k}`;
      const attempts = studentEmails.flatMap(email => {
        const user = studentsList.find(u => u.email === email)!;
        if (rnd() > 0.7) return [];
        const from = Math.max(publishedAt.getTime(), user.createdAt.getTime());
        if (from >= end) return [];
        const finishedAt = new Date(from + rnd() * Math.min(20 * DAY, end - from));
        const skill = 0.35 + rnd() * 0.55;
        return [{ studentEmail: email, examKey, finishedAt, correct: Array.from({ length: 5 }, () => rnd() < skill) }];
      });
      return { examKey, titulo: `${DEMO_PREFIX} Simulado ${k + 1} — ${name}`, publishedAt, attempts };
    });
    return { nome: `${DEMO_PREFIX} ${name}`, createdAt: createdAtClass, studentEmails, exams };
  });
  return { users, classes };
}

const chunk = <T,>(list: T[], size = 1000) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

export async function countDemoData(db: PrismaClient) {
  const [users, classes, exams, attempts] = await Promise.all([
    db.user.count({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } } }),
    db.turma.count({ where: { nome: { startsWith: DEMO_PREFIX } } }),
    db.avaliacao.count({ where: { titulo: { startsWith: DEMO_PREFIX } } }),
    db.simulado.count({ where: { aluno: { email: { endsWith: DEMO_EMAIL_DOMAIN } } } }),
  ]);
  return { users, classes, exams, attempts };
}

/** Grava o plano. Recusa se já houver dados de demonstração (remova antes para gerar de novo). */
export async function createDemoData(db: PrismaClient, plan: DemoPlan) {
  if ((await countDemoData(db)).users) throw new Error('Já existem dados de demonstração. Remova-os antes de gerar de novo.');
  // Avaliação publicada tira a questão do treino; por isso a demonstração usa só questões públicas
  // que não podem ir para o treino (nem liberadas nem liberáveis pelo proprietário).
  const questions = await db.questao.findMany({
    where: { publica: true, turmaId: null, alternativas: { some: { correta: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: inventorySelect,
  });
  const usable = questions.filter(q => q.alternativas.length === 4 && q.alternativas.filter(a => a.correta).length === 1
    && !ownerPracticeContentValid(q) && !isPracticeSelectable(q)).slice(0, 60);
  if (usable.length < 5) throw new Error('São necessárias ao menos 5 questões com 4 alternativas no banco.');

  for (const part of chunk(plan.users)) {
    await db.user.createMany({ data: part.map(u => ({ nome: u.nome, email: u.email, role: u.role, createdAt: u.createdAt,
      emailVerifiedAt: u.createdAt, legalAcceptedAt: u.createdAt, termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion })) });
  }
  const ids = new Map((await db.user.findMany({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } }, select: { id: true, email: true } })).map(u => [u.email, u.id]));
  const teacherId = ids.get(plan.users.find(u => u.role === 'PROFESSOR')?.email ?? '') ?? ids.get(plan.users[0].email)!;

  let examIndex = 0, attempts = 0, answers = 0;
  for (const c of plan.classes) {
    const turma = await db.turma.create({ data: { nome: c.nome, createdAt: c.createdAt, codigoConvite: `DEMO-${randomUUID().slice(0, 8).toUpperCase()}`,
      professores: { connect: { id: teacherId } }, alunos: { connect: c.studentEmails.map(email => ({ id: ids.get(email)! })) } }, select: { id: true } });
    for (const exam of c.exams) {
      const chosen = Array.from({ length: 5 }, (_, i) => usable[(examIndex * 5 + i) % usable.length]);
      examIndex++;
      const avaliacao = await db.avaliacao.create({ data: { titulo: exam.titulo, autorId: teacherId, publishedAt: exam.publishedAt, createdAt: exam.publishedAt,
        turmas: { connect: { id: turma.id } }, questoes: { create: chosen.map((q, i) => ({ questaoId: q.id, posicao: i + 1 })) } }, select: { id: true } });
      const simulados: { id: string; tipo: 'AVALIACAO'; avaliacaoId: string; alunoId: string; iniciadoEm: Date; finalizadoEm: Date }[] = [];
      const links: { id: string; simuladoId: string; questaoId: string; posicao: number }[] = [];
      const respostas: { simuladoId: string; questaoId: string; questaoSimuladoId: string; alternativaEscolhidaId: string; correta: boolean; respondidoEm: Date }[] = [];
      for (const attempt of exam.attempts) {
        const simuladoId = randomUUID();
        simulados.push({ id: simuladoId, tipo: 'AVALIACAO', avaliacaoId: avaliacao.id, alunoId: ids.get(attempt.studentEmail)!,
          iniciadoEm: new Date(attempt.finishedAt.getTime() - 15 * 60_000), finalizadoEm: attempt.finishedAt });
        chosen.forEach((q, i) => {
          const linkId = randomUUID();
          const right = q.alternativas.find(a => a.correta)!;
          const wrong = q.alternativas.filter(a => !a.correta)[i % 3];
          links.push({ id: linkId, simuladoId, questaoId: q.id, posicao: i + 1 });
          respostas.push({ simuladoId, questaoId: q.id, questaoSimuladoId: linkId, alternativaEscolhidaId: attempt.correct[i] ? right.id : wrong.id,
            correta: attempt.correct[i], respondidoEm: new Date(attempt.finishedAt.getTime() - (5 - i) * 60_000) });
        });
      }
      for (const part of chunk(simulados)) await db.simulado.createMany({ data: part });
      for (const part of chunk(links)) await db.questaoSimulado.createMany({ data: part });
      for (const part of chunk(respostas)) await db.resposta.createMany({ data: part });
      attempts += simulados.length; answers += respostas.length;
    }
  }
  return { ...(await countDemoData(db)), answers, createdAttempts: attempts };
}

/** Vincula uma conta real de PROFESSOR às turmas [DEMO], para o painel dela mostrar alunos e avaliações. O --remove desfaz. */
export async function linkDemoTeacher(db: PrismaClient, email: string) {
  const teacher = await db.user.findUnique({ where: { email }, select: { id: true, role: true, deletedAt: true } });
  if (!teacher || teacher.deletedAt || teacher.role !== 'PROFESSOR') throw new Error('Conta de PROFESSOR não encontrada com esse e-mail.');
  const turmas = await db.turma.findMany({ where: { nome: { startsWith: DEMO_PREFIX } }, select: { id: true } });
  if (!turmas.length) throw new Error('Não há turmas de demonstração. Rode --apply antes.');
  for (const t of turmas) await db.turma.update({ where: { id: t.id }, data: { professores: { connect: { id: teacher.id } } } });
  // O professor só vê as avaliações que ele mesmo criou; as [DEMO] passam para ele.
  const exams = await db.avaliacao.updateMany({ where: { titulo: { startsWith: DEMO_PREFIX }, turmas: { some: { id: { in: turmas.map(t => t.id) } } } }, data: { autorId: teacher.id } });
  return { teacher: email, classes: turmas.length, exams: exams.count };
}

/**
 * Liga os dados de demonstração à instituição de quem administra (INSTITUTION_ADMIN): os professores fake viram
 * docentes ativos e as turmas [DEMO] passam a ser da instituição (com isso, os alunos delas também). O --remove desfaz.
 */
export async function linkDemoInstitution(db: PrismaClient, adminEmail: string) {
  const memberships = await db.institutionalMembership.findMany({ where: { role: 'INSTITUTION_ADMIN', active: true, institution: { status: 'ACTIVE' }, user: { email: adminEmail, deletedAt: null } }, select: { institutionId: true, institution: { select: { name: true } } } });
  if (memberships.length !== 1) throw new Error(memberships.length ? 'Essa conta administra mais de uma instituição.' : 'Nenhuma instituição ativa administrada por esse e-mail.');
  const { institutionId, institution } = memberships[0];
  const teachers = await db.user.findMany({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN }, role: 'PROFESSOR' }, select: { id: true } });
  const turmas = await db.turma.findMany({ where: { nome: { startsWith: DEMO_PREFIX } }, select: { id: true, institutionalClass: { select: { institutionId: true } } } });
  if (!turmas.length) throw new Error('Não há dados de demonstração. Rode --apply antes.');
  if (turmas.some(t => t.institutionalClass && t.institutionalClass.institutionId !== institutionId)) throw new Error('As turmas [DEMO] já estão em outra instituição. Rode --remove e --apply antes.');
  await db.$transaction([
    db.institutionalMembership.createMany({ data: teachers.map(t => ({ institutionId, userId: t.id, role: 'TEACHER' })), skipDuplicates: true }),
    db.institutionalClass.createMany({ data: turmas.map(t => ({ classId: t.id, institutionId })), skipDuplicates: true }),
  ]);
  const students = await db.user.count({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN }, turmasComoAluno: { some: { id: { in: turmas.map(t => t.id) } } } } });
  return { institution: institution.name, teachers: teachers.length, classes: turmas.length, students };
}

/** Remove somente os dados de demonstração (e-mails .invalid e turmas/avaliações com o prefixo). */
export async function removeDemoData(db: PrismaClient) {
  return db.$transaction(async tx => {
    const users = (await tx.user.findMany({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } }, select: { id: true } })).map(u => u.id);
    // Avaliações [DEMO] de autor fake ou repassadas a um professor real pelo --link-teacher (sempre ligadas a turmas [DEMO]).
    const exams = (await tx.avaliacao.findMany({ where: { titulo: { startsWith: DEMO_PREFIX }, OR: [{ autorId: { in: users } }, { turmas: { some: { nome: { startsWith: DEMO_PREFIX } } } }] }, select: { id: true } })).map(a => a.id);
    const simulados = (await tx.simulado.findMany({ where: { OR: [{ alunoId: { in: users } }, { avaliacaoId: { in: exams } }] }, select: { id: true } })).map(s => s.id);
    const respostas = await tx.resposta.deleteMany({ where: { simuladoId: { in: simulados } } });
    await tx.questaoSimulado.deleteMany({ where: { simuladoId: { in: simulados } } });
    await tx.simulado.deleteMany({ where: { id: { in: simulados } } });
    await tx.avaliacaoQuestao.deleteMany({ where: { avaliacaoId: { in: exams } } });
    for (const id of exams) await tx.avaliacao.update({ where: { id }, data: { turmas: { set: [] } } });
    await tx.avaliacao.deleteMany({ where: { id: { in: exams } } });
    const turmas = (await tx.turma.findMany({ where: { nome: { startsWith: DEMO_PREFIX } }, select: { id: true } })).map(t => t.id);
    // Vínculos criados pelo --link-institution.
    await tx.institutionalClass.deleteMany({ where: { classId: { in: turmas } } });
    await tx.institutionalMembership.deleteMany({ where: { userId: { in: users } } });
    for (const id of turmas) await tx.turma.update({ where: { id }, data: { alunos: { set: [] }, professores: { set: [] } } });
    await tx.turma.deleteMany({ where: { id: { in: turmas } } });
    const removedUsers = await tx.user.deleteMany({ where: { id: { in: users } } });
    return { users: removedUsers.count, classes: turmas.length, exams: exams.length, attempts: simulados.length, answers: respostas.count };
  }, { timeout: 300_000 });
}
