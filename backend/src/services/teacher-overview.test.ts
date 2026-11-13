import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ turma: { count: vi.fn() }, user: { count: vi.fn() }, avaliacao: { count: vi.fn() }, $transaction: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: db }));
vi.mock('../config/institution-homologation', () => ({ homologationClassBoundary: () => undefined }));
import { ClassReportService } from './class-report-service';
beforeEach(() => {
  vi.clearAllMocks(); db.$transaction.mockImplementation(work => work(db));
  db.turma.count.mockResolvedValueOnce(42).mockResolvedValueOnce(40); db.user.count.mockResolvedValue(101); db.avaliacao.count.mockResolvedValue(30);
});
it('counts all pages, distinct student identities and exams within current delegated classes', async () => {
  const actor = { userId: 'teacher', role: 'PROFESSOR', institutionId: 'institution', allowedClassIds: ['class-a', 'class-b'] };
  expect(await new ClassReportService().overview(actor)).toEqual({ classes: 42, activeClasses: 40, students: 101, publishedExams: 30 });
  const where = { professores: { some: { id: 'teacher' } }, id: { in: actor.allowedClassIds } };
  expect(db.turma.count).toHaveBeenNthCalledWith(1, { where });
  expect(db.turma.count).toHaveBeenNthCalledWith(2, { where: { ...where, archivedAt: null } });
  expect(db.user.count).toHaveBeenCalledWith({ where: { role: 'ALUNO', deletedAt: null, turmasComoAluno: { some: where } } });
  expect(db.avaliacao.count).toHaveBeenCalledWith({ where: { publishedAt: { not: null }, turmas: { some: where } } });
  expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead' });
});
it('an empty delegated scope remains empty rather than falling back to all teacher classes', async () => {
  await new ClassReportService().overview({ userId: 'teacher', role: 'PROFESSOR', allowedClassIds: [] });
  expect(db.turma.count.mock.calls[0][0].where.id.in).toEqual([]);
});
it.each(['ALUNO', 'ADMIN'])('denies %s before persistence is invoked', async role => {
  await expect(new ClassReportService().overview({ userId: 'actor', role })).rejects.toMatchObject({ statusCode: 403 });
  expect(db.$transaction).not.toHaveBeenCalled();
});
