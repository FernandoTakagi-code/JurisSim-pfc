import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, expect, it } from 'vitest';
import { criarUsuario, prisma, limparBanco } from './helpers';
import { assertDisposableDatabase } from './disposable-database';
import { importPracticeDrafts } from "../../src/services/questions/practice-draft-import";
import { countDemoData, createDemoData, linkDemoInstitution, linkDemoTeacher, planDemoData, removeDemoData } from "../../src/services/demo/demo-data";
import { InstitutionService } from "../../src/services/institutions/institution-service";

beforeAll(async () => { await assertDisposableDatabase(prisma); await limparBanco(); });

it('gera contas e atividades de demonstração visíveis no painel do ADMIN e remove só elas', async () => {
  const admin = await criarUsuario('PROFESSOR'); await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  const realStudent = await criarUsuario('ALUNO');
  await importPracticeDrafts(prisma, JSON.parse(readFileSync(resolve('scripts/drafts/authorial-practice-60.draft.json'), 'utf8')), admin.id);
  // Questões públicas de professor: servem para a demonstração e nunca vão para o treino.
  for (let i = 0; i < 5; i++) await prisma.questao.create({ data: { enunciado: `Questão pública de professor para demonstração número ${i + 1}.`,
    disciplina: 'Direito Civil', assunto: 'Demonstração', nivel: 'BASICO', fundamentacaoJuridica: 'Fundamentação de teste.', autorId: admin.id,
    publica: true, origem: 'PROFESSOR', alternativas: { create: ['A', 'B', 'C', 'D'].map((letra, k) => ({ letra: letra as 'A', texto: `Alternativa ${letra} ${i}`, correta: k === 0 })) } } });
  const draftIds = (await prisma.questao.findMany({ where: { origem: 'IA' }, select: { id: true } })).map(q => q.id);
  const realQuestions = await prisma.questao.count();

  const plan = planDemoData({ students: 300, teachers: 6, months: 6, now: new Date(), seed: 7 });
  const created = await createDemoData(prisma, plan);
  expect(created).toMatchObject({ users: 306, classes: 3, exams: 9 });
  expect(created.attempts).toBeGreaterThan(50);
  expect(created.answers).toBe(created.attempts * 5);
  const demoUser = await prisma.user.findFirstOrThrow({ where: { email: plan.users[0].email } });
  expect(demoUser.senhaHash).toBeNull(); // não dá para entrar com contas de demonstração

  const summary = await new InstitutionService().summary({ userId: admin.id, role: 'ADMIN' } as never);
  expect(summary.users).toBe(308);
  expect(summary.classes).toBe(3);
  expect(summary.publishedExams).toBe(9);
  expect(summary.registrationsByDay.length).toBeGreaterThan(0);
  expect(summary.participationByDay.reduce((total: number, day: { students: number }) => total + day.students, 0)).toBeGreaterThan(0);

  expect(await prisma.avaliacaoQuestao.count({ where: { questaoId: { in: draftIds } } })).toBe(0); // nada do treino nas avaliações [DEMO]
  const realTeacher = await criarUsuario('PROFESSOR');
  expect(await linkDemoTeacher(prisma, realTeacher.email)).toEqual({ teacher: realTeacher.email, classes: 3, exams: 9 });
  expect(await prisma.avaliacao.count({ where: { autorId: realTeacher.id } })).toBe(9);
  expect(await prisma.turma.count({ where: { professores: { some: { id: realTeacher.id } } } })).toBe(3);
  await expect(linkDemoTeacher(prisma, realStudent.email)).rejects.toThrow('PROFESSOR');
  const responsible = await criarUsuario('ALUNO');
  const institution = await prisma.institution.create({ data: { name: 'Instituição de teste', responsibleName: 'Responsável', ownerId: responsible.id,
    email: `inst-${responsible.id}@teste.local`, phone: '11999999999', description: 'Teste', status: 'ACTIVE',
    memberships: { create: { userId: responsible.id, role: 'INSTITUTION_ADMIN' } } } });
  await expect(linkDemoInstitution(prisma, realStudent.email)).rejects.toThrow('Nenhuma instituição');
  const linked = await linkDemoInstitution(prisma, responsible.email);
  expect(linked).toMatchObject({ institution: 'Instituição de teste', teachers: 6, classes: 3 });
  expect(linked.students).toBe(300); // todos os alunos fake, igual ao total do painel do ADMIN
  expect(await prisma.simulado.count()).toBe(created.attempts); // matricular não cria tentativas
  expect(await prisma.institutionalMembership.count({ where: { institutionId: institution.id, role: 'TEACHER', active: true } })).toBe(6);
  expect(await prisma.institutionalClass.count({ where: { institutionId: institution.id } })).toBe(3);
  expect(await linkDemoInstitution(prisma, responsible.email)).toMatchObject({ teachers: 6, classes: 3 }); // repetir não duplica
  expect(await prisma.institutionalMembership.count({ where: { institutionId: institution.id, role: 'TEACHER' } })).toBe(6);
  await expect(createDemoData(prisma, plan)).rejects.toThrow('Já existem dados de demonstração.');

  const removed = await removeDemoData(prisma);
  expect(removed).toMatchObject({ users: 306, classes: 3, exams: 9, attempts: created.attempts, answers: created.answers });
  expect(await prisma.institutionalMembership.count({ where: { institutionId: institution.id } })).toBe(1); // só o responsável fica
  expect(await prisma.institutionalClass.count({ where: { institutionId: institution.id } })).toBe(0);
  expect(await countDemoData(prisma)).toEqual({ users: 0, classes: 0, exams: 0, attempts: 0 });
  expect(await prisma.user.count({ where: { id: { in: [admin.id, realStudent.id, realTeacher.id] } } })).toBe(3);
  expect(await prisma.questao.count()).toBe(realQuestions);
});
