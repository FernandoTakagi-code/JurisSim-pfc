import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { importPracticeDrafts, preparePracticeDraftImport } from './practice-draft-import';

const input = () => JSON.parse(readFileSync(resolve(__dirname, '../../scripts/drafts/authorial-practice-60.draft.json'), 'utf8'));
function database(options: { role?: string; existing?: unknown; duplicates?: { enunciado: string; fingerprint: string | null }[] } = {}) {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    user: { findFirst: vi.fn(async () => ({ id: 'operator', role: options.role ?? 'ADMIN' })) },
    loteImportacao: { findFirst: vi.fn(async () => options.existing ?? null), create: vi.fn(async () => ({ id: 'batch' })) },
    questao: { findMany: vi.fn(async () => options.duplicates ?? []), create: vi.fn(async () => ({ id: `q${tx.questao.create.mock.calls.length}` })) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const db = { $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) };
  return { tx, db: db as unknown as PrismaClient };
}

describe('private practice draft maintenance import', () => {
  it('accepts the actual 60 draft questions and rejects invented approvals, incorrect keys and duplicate statements', () => {
    expect(preparePracticeDraftImport(input()).fingerprints).toHaveLength(60);
    const approved = input(); approved.questions[0].legalReview.reviewerId = 'fabricated';
    expect(() => preparePracticeDraftImport(approved)).toThrow();
    const key = input(); key.questions[0].gabarito = 'A';
    expect(() => preparePracticeDraftImport(key)).toThrow();
    const repeated = input(); repeated.questions[1].enunciado = ` ${repeated.questions[0].enunciado.toUpperCase()} `;
    expect(() => preparePracticeDraftImport(repeated)).toThrow();
    const alternative = input(); alternative.questions[0].alternativas[0].texto = alternative.questions[0].alternativas[1].texto;
    expect(() => preparePracticeDraftImport(alternative)).toThrow();
  });

  it('persists private items and preserves editorial provenance without creating human approvals', async () => {
    const { db, tx } = database();
    expect(await importPracticeDrafts(db, input(), 'operator')).toMatchObject({ imported: 60, batchId: 'batch', recovered: false });
    expect(tx.questao.create).toHaveBeenCalledTimes(60);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(60);
    for (const [call] of tx.questao.create.mock.calls as unknown as [{ data: Record<string, any> }][]) {
      expect(call.data).toMatchObject({ publica: false, origem: 'IA', turmaId: null, autorId: 'operator', loteImportacaoId: 'batch' });
      for (const field of ['revisaoJuridicaEm', 'revisorJuridicoId', 'revisaoPedagogicaEm', 'revisorPedagogicoId', 'liberadaAcervoEm', 'liberadaAcervoPorId']) expect(call.data).not.toHaveProperty(field);
      const metadata = JSON.parse(call.data.fonteReferencia.split('\n').slice(1).join('\n'));
      expect(metadata.comentarios).toHaveLength(4);
      expect(metadata.reference[0].url).toMatch(/^https:/);
      expect(metadata.preliminaryReview.humanApproval).toBe(false);
    }
  });

  it('requires an active admin and refuses preexisting normalized content before creating a batch', async () => {
    const denied = database({ role: 'ALUNO' });
    await expect(importPracticeDrafts(denied.db, input(), 'operator')).rejects.toThrow('não autorizado');
    expect(denied.tx.loteImportacao.create).not.toHaveBeenCalled();
    const duplicates = database({ duplicates: [{ enunciado: input().questions[0].enunciado.toUpperCase(), fingerprint: null }] });
    await expect(importPracticeDrafts(duplicates.db, input(), 'operator')).rejects.toThrow('já existente');
    expect(duplicates.tx.questao.create).not.toHaveBeenCalled();
    expect(duplicates.tx.loteImportacao.create).not.toHaveBeenCalled();
  });

  it('recovers the same complete batch without writing duplicates and refuses inconsistent retries', async () => {
    const { fingerprints } = preparePracticeDraftImport(input());
    const { db, tx } = database({ existing: { id: 'batch', questoes: fingerprints.map((fingerprint, index) => ({ id: `q${index}`, fingerprint })) } });
    expect(await importPracticeDrafts(db, input(), 'operator')).toMatchObject({ imported: 0, recovered: true, batchId: 'batch' });
    expect(tx.questao.create).not.toHaveBeenCalled();
    const broken = database({ existing: { id: 'batch', questoes: [{ id: 'q0', fingerprint: fingerprints[0] }] } });
    await expect(importPracticeDrafts(broken.db, input(), 'operator')).rejects.toThrow('inconsistente');
    expect(broken.tx.questao.create).not.toHaveBeenCalled();
  });
});
