// Read-only verification of the named real class. No authentication tokens are
// fabricated and no membership, attempt, answer or production row is changed.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { ClassExamService } from '../src/services/assessments/class-exam-service';

async function main() {
  const turma = await prisma.turma.findFirst({ where: { nome: 'Teste 1' }, select: { id: true, archivedAt: true,
    alunos: { where: { deletedAt: null }, select: { id: true } }, _count: { select: { professores: true } } } });
  if (!turma) { console.log(JSON.stringify({ classFound: false })); return; }
  const service = new ClassExamService();
  const student = turma.alunos[0];
  if (student) {
    const details = await service.studentClassDetails({ userId: student.id, role: 'ALUNO' }, turma.id);
    console.log(JSON.stringify({ classFound: true, active: !turma.archivedAt, enrolledStudents: turma.alunos.length,
      professors: turma._count.professores, detailsLoaded: true, publishedExamsOnPage: details.exams.length,
      completedOnPage: details.exams.filter(e => e.attempt?.status === 'COMPLETED').length, hasMore: details.hasMore }));
  } else console.log(JSON.stringify({ classFound: true, enrolledStudents: 0 }));
  try { await service.studentClassDetails({ userId: randomUUID(), role: 'ALUNO' }, turma.id); throw new Error('Unauthorized class access was accepted'); }
  catch (error) { if ((error as { statusCode?: number }).statusCode !== 404) throw error; console.log(JSON.stringify({ nonMemberBlocked: true })); }
}
main().catch(error => { console.log(JSON.stringify({ error: error instanceof Error ? error.name : 'unknown', code: (error as { code?: string }).code })); process.exitCode = 1; }).finally(() => prisma.$disconnect());
