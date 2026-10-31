import { describe, expect, it, vi } from 'vitest';
import { QuestionImportRepository, type QuestionImportDatabase, type QuestionImportTransaction } from '../repositories/question-import-repository';
import { QUESTION_CSV_HEADERS, previewQuestionCsv } from './question-csv-preview';
import { QuestionImportService } from './question-import-service';

const adminId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const headers = QUESTION_CSV_HEADERS.join(',');
const row = ['"Questão original para demonstrar persistência atômica"', 'Direito Civil', 'Contratos', 'BASICO', 'Explicação original e didática', 'Opção A', 'Opção B', '', '', '', 'A', 'true', 'JurisSim', 'Referência fictícia', 'Autorização declarada para demonstração'].join(',');
const csv = (...rows: string[]) => `${headers}\n${rows.join('\n')}`;

type PersistedQuestion = Record<string, any> & { id: string; fingerprint: string };
type StoreState = { batches: Record<string, any>[]; questions: PersistedQuestion[]; nextId: number };

class MockImportDatabase implements QuestionImportDatabase {
  state: StoreState = { batches: [], questions: [], nextId: 0 };
  failAlternativeAt?: number;
  private lock: Promise<void> = Promise.resolve();

  async transaction<T>(operation: (transaction: QuestionImportTransaction) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.lock;
    this.lock = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const draft = structuredClone(this.state);
    let alternativeWrites = 0;
    const tx: QuestionImportTransaction = {
      findExistingFingerprints: async fingerprints => new Set(draft.questions.filter(q => fingerprints.includes(q.fingerprint)).map(q => q.fingerprint)),
      createBatch: async data => {
        const batch = { ...data, id: `batch-${++draft.nextId}` };
        draft.batches.push(batch);
        return batch;
      },
      createQuestionWithAlternatives: async data => {
        const id = `question-${++draft.nextId}`;
        draft.questions.push({ ...data, id });
        alternativeWrites += data.alternativas.length;
        if (this.failAlternativeAt && alternativeWrites >= this.failAlternativeAt) throw new Error('falha simulada ao gravar alternativas');
        return { id };
      },
    };
    try {
      const result = await operation(tx);
      this.state = draft;
      return result;
    } finally {
      release();
    }
  }
}

function harness(database = new MockImportDatabase()) {
  const authorizer = { assertAdmin: vi.fn(async (id: string) => { if (id !== adminId) throw new Error('ADMIN obrigatório'); }) };
  const repository = new QuestionImportRepository(database);
  return { database, authorizer, repository, service: new QuestionImportService(repository, authorizer) };
}

describe('persistência preparada da importação CSV', () => {
  it('persiste lote, fonte, administrador, hash e alternativas em uma única transação', async () => {
    const { database, service } = harness();
    const result = await service.confirm(csv(row), adminId);
    expect(result.imported).toBe(1);
    expect(database.state.batches).toHaveLength(1);
    expect(database.state.batches[0]).toMatchObject({ administradorId: adminId, importadoEm: expect.any(Date), totalQuestoes: 1, arquivoHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(database.state.questions[0]).toMatchObject({
      autorId: adminId, loteImportacaoId: result.batchId, publica: true, fonteNome: 'JurisSim',
      fonteReferencia: 'Referência fictícia', licencaOuAutorizacao: 'Autorização declarada para demonstração',
      alternativas: [{ correta: true }, { correta: false }],
    });
    expect(database.state.questions[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejeita o lote inteiro quando há duplicata dentro do CSV, antes de abrir transação', async () => {
    const { database, service } = harness();
    await expect(service.confirm(csv(row, row), adminId)).rejects.toMatchObject({ statusCode: 422 });
    expect(database.state.batches).toHaveLength(0);
    expect(database.state.questions).toHaveLength(0);
  });

  it('rejeita duplicata existente e não cria lote parcial', async () => {
    const database = new MockImportDatabase();
    const preview = previewQuestionCsv(csv(row));
    const question = preview.rows[0].question!;
    const fingerprint = (await import('./question-csv-preview')).questionFingerprint(question);
    database.state.questions.push({ id: 'existing', fingerprint, enunciado: question.enunciado, preserved: true });
    const { service } = harness(database);
    await expect(service.confirm(csv(row), adminId)).rejects.toMatchObject({ statusCode: 409 });
    expect(database.state.batches).toHaveLength(0);
    expect(database.state.questions).toEqual([{ id: 'existing', fingerprint, enunciado: question.enunciado, preserved: true }]);
  });

  it('converte conflito de índice único em conflito controlado sem repetir a transação', async () => {
    const database = new MockImportDatabase();
    const transaction = vi.spyOn(database, 'transaction').mockRejectedValue(Object.assign(new Error('unique index'), { code: 'P2002' }));
    const { service } = harness(database);
    await expect(service.confirm(csv(row), adminId)).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(database.state.batches).toHaveLength(0);
    expect(database.state.questions).toHaveLength(0);
  });

  it('reverte lote e questões anteriores se a criação de alternativas falhar', async () => {
    const database = new MockImportDatabase();
    database.failAlternativeAt = 3;
    const { service } = harness(database);
    await expect(service.confirm(csv(row, row.replace('Questão original', 'Outra questão original')), adminId)).rejects.toThrow(/alternativas/);
    expect(database.state.batches).toHaveLength(0);
    expect(database.state.questions).toHaveLength(0);
  });

  it('preserva questões existentes quando um lote distinto é confirmado', async () => {
    const database = new MockImportDatabase();
    const existing = { id: 'preexisting', fingerprint: 'f'.repeat(64), enunciado: 'Questão antiga', respostas: ['preservar'] };
    database.state.questions.push(existing);
    const { service } = harness(database);
    await service.confirm(csv(row), adminId);
    expect(database.state.questions[0]).toEqual(existing);
    expect(database.state.questions).toHaveLength(2);
  });

  it('serializa confirmações concorrentes e permite apenas uma cópia', async () => {
    const { service, database } = harness();
    const outcomes = await Promise.allSettled([service.confirm(csv(row), adminId), service.confirm(csv(row), adminId)]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
    expect(database.state.batches).toHaveLength(1);
    expect(database.state.questions).toHaveLength(1);
  });

  it('revalida ADMIN no início e antes de persistir, sem confiar em papel do CSV', async () => {
    const { service, authorizer, database } = harness();
    authorizer.assertAdmin.mockRejectedValueOnce(new Error('ADMIN obrigatório'));
    await expect(service.confirm(csv(row), otherId)).rejects.toThrow('ADMIN obrigatório');
    expect(database.state.questions).toHaveLength(0);

    authorizer.assertAdmin.mockReset().mockResolvedValueOnce().mockRejectedValueOnce(new Error('papel revogado'));
    await expect(service.confirm(csv(row), adminId)).rejects.toThrow('papel revogado');
    expect(authorizer.assertAdmin).toHaveBeenCalledTimes(2);
    expect(database.state.batches).toHaveLength(0);
  });
});
