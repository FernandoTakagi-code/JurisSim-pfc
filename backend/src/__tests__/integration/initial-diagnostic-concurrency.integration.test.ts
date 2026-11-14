import { afterAll, beforeEach, expect, it } from 'vitest';
import { criarUsuario, encerrar, limparBanco, prisma } from './helpers';
import { InitialDiagnosticService } from '../../services/initial-diagnostic-service';
import { InitialDiagnosticResolutionService } from '../../services/initial-diagnostic-resolution-service';
import { getInitialDiagnosticComposition } from '../../services/initial-diagnostic-composition';
import { PrismaInitialDiagnosticRepository } from '../../repositories/prisma-initial-diagnostic-repository';
import { PrismaInitialDiagnosticResolutionRepository } from '../../repositories/prisma-initial-diagnostic-resolution-repository';

beforeEach(limparBanco);
afterAll(() => encerrar());

it('preserves all 30 answers and one result when a student resends and finalizes concurrently', async () => {
  const student = await criarUsuario('ALUNO'), author = await criarUsuario('PROFESSOR');
  for (const [slotIndex, slot] of getInitialDiagnosticComposition('AUTORAL_30').entries()) {
    for (let index = 0; index < slot.quantity; index++) await prisma.questao.create({ data: {
      enunciado: `CONCURRENCY_FIXTURE_ONLY ${slotIndex}-${index} conteúdo sintético.`, disciplina: slot.discipline,
      assunto: 'Fixture', nivel: slot.level, origem: 'IA', publica: true, fundamentacaoJuridica: 'Fixture técnica.', autorId: author.id,
      revisaoJuridicaEm: new Date(), revisorJuridicoId: author.id, revisaoPedagogicaEm: new Date(), revisorPedagogicoId: author.id,
      liberadaAcervoEm: new Date(), liberadaAcervoPorId: author.id,
      alternativas: { create: (['A', 'B', 'C', 'D'] as const).map(letra => ({ letra, texto: 'Fixture ' + letra, correta: letra === 'A' })) },
    } });
  }
  const allocation = new InitialDiagnosticService(new PrismaInitialDiagnosticRepository(prisma), () => 0, 'AUTORAL_30');
  const allocated = await allocation.getOrCreate(student.id);
  if (allocated.status === 'INSUFFICIENT') throw new Error('Synthetic diagnostic missing');
  const id = allocated.attempt.id;
  const peers = await Promise.all(Array.from({ length: 5 }, () => criarUsuario('ALUNO')));
  const peerAttempts = await Promise.all(peers.flatMap(peer => [allocation.getOrCreate(peer.id), allocation.getOrCreate(peer.id)]));
  for (const peer of peers) {
    expect(await prisma.diagnosticoInicial.count({ where: { alunoId: peer.id } })).toBe(1);
    expect(await prisma.simulado.count({ where: { alunoId: peer.id } })).toBe(1);
  }
  expect(peerAttempts).toHaveLength(10);
  const resolution = new InitialDiagnosticResolutionService(new PrismaInitialDiagnosticResolutionRepository(prisma));
  const questions = await resolution.getQuestions(student.id, id);
  for (const question of questions) await resolution.saveAnswer(student.id, id, question.id, question.alternatives[0].id);
  const last = questions[29];
  const resent = await Promise.all(Array.from({ length: 4 }, () => resolution.saveAnswer(student.id, id, last.id, last.alternatives[0].id)));
  expect(resent).toHaveLength(4);
  expect(await prisma.resposta.count({ where: { simuladoId: id } })).toBe(30);
  const outcomes = await Promise.allSettled([resolution.saveAnswer(student.id, id, last.id, last.alternatives[0].id),
    ...Array.from({ length: 3 }, () => resolution.finalize(student.id, id))]);
  if (outcomes[0].status === 'rejected') expect(outcomes[0].reason).toMatchObject({ statusCode: 409 });
  const results = outcomes.slice(1).map(outcome => { if (outcome.status !== 'fulfilled') throw outcome.reason; return outcome.value as Awaited<ReturnType<typeof resolution.finalize>>; });
  expect(results.every(result => result.correctAnswers === 30 && result.overallPercentage === 100)).toBe(true);
  expect(await prisma.trilhaAdaptativa.count({ where: { simuladoId: id } })).toBe(1);
  expect(await prisma.auditLog.count({ where: { userId: student.id, resourceId: id, action: 'DIAGNOSTICO_FINALIZADO' } })).toBe(1);
  expect((await resolution.getResult(student.id, id)).correctAnswers).toBe(30);
  await expect(resolution.saveAnswer(student.id, id, last.id, last.alternatives[1].id)).rejects.toMatchObject({ statusCode: 409 });
  const other = await criarUsuario('ALUNO');
  await expect(resolution.getResult(other.id, id)).rejects.toMatchObject({ statusCode: 404 });
});
