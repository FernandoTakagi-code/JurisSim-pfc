import { describe, expect, it, vi } from 'vitest';
import { TrailRepository } from './trail-repository';

const candidate = (id: string) => ({ id, enunciado: 'Questão sintética completa para teste', disciplina: 'Direito Civil', assunto: 'Contratos',
  nivel: 'BASICO', fundamentacaoJuridica: 'Fundamento sintético', publica: true, turmaId: null, origem: 'IA',
  revisaoJuridicaEm: new Date(), revisorJuridicoId: 'synthetic', revisaoPedagogicaEm: new Date(), revisorPedagogicoId: 'synthetic',
  liberadaAcervoEm: new Date(), liberadaAcervoPorId: 'synthetic', situacaoQuestaoOficial: null,
  alternativas: ['A','B','C','D'].map((letra, i) => ({ id: id+letra, letra, texto: letra, correta: i===0 })),
});

describe('trail editorial selection', () => {
  it('excludes public but unreviewed, annulled and incomplete questions', async () => {
    const findMany = vi.fn().mockResolvedValue([candidate('valid'),
      { ...candidate('unreviewed'), revisaoJuridicaEm: null },
      { ...candidate('annulled'), situacaoQuestaoOficial: 'ANULADA' },
      { ...candidate('incomplete'), alternativas: [] }]);
    const repository = new TrailRepository({ questao: { findMany } } as never);
    expect(await repository.findQuestionsForTrail([{ disciplina: 'Direito Civil', assunto: null, nivel: null }], 10)).toEqual([{ id: 'valid' }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200, where: expect.objectContaining({ publica: true, turmaId: null, revisaoJuridicaEm: { not: null } }) }));
  });
  it('paginates past invalid content without silently reporting an empty eligible pool', async () => {
    const findMany = vi.fn().mockResolvedValueOnce(Array.from({ length: 200 }, (_, i) => ({ ...candidate('bad'+i), alternativas: [] })))
      .mockResolvedValueOnce([candidate('valid')]);
    const repository = new TrailRepository({ questao: { findMany } } as never);
    expect(await repository.findQuestionsForTrail([{ disciplina: 'Direito Civil', assunto: null, nivel: null }], 1)).toEqual([{ id: 'valid' }]);
    expect(findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 'bad199' }, skip: 1 });
  });
});
