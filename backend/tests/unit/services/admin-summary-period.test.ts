import { describe, expect, it } from 'vitest';
import { parseSummaryPeriod, saoPauloDayStartUtc } from '../../../src/services/institutions/admin-summary-period';

describe('parseSummaryPeriod', () => {
  const now = new Date('2026-11-21T15:00:00Z');

  it('sem from/to retorna null', () => expect(parseSummaryPeriod({}, now)).toBeNull());

  it('converte limites do dia de São Paulo para UTC', () => {
    expect(parseSummaryPeriod({ from: '2021-11-12', to: '2026-11-21', groupBy: 'month' }, now)).toEqual({
      from: '2021-11-12', to: '2026-11-21', groupBy: 'month',
      startUtc: new Date('2021-11-12T03:00:00.000Z'), endUtcExclusive: new Date('2026-11-22T03:00:00.000Z'),
    });
  });

  it('considera o horário de verão histórico de São Paulo', () => {
    // Em 2018 o horário de verão começou em 04/11; meia-noite local era 02:00 UTC.
    expect(saoPauloDayStartUtc('2018-12-01')).toEqual(new Date('2018-12-01T02:00:00.000Z'));
    expect(saoPauloDayStartUtc('2026-11-12')).toEqual(new Date('2026-11-12T03:00:00.000Z'));
  });

  it('sem groupBy sugere: dia até 62, semana até 366, mês acima', () => {
    expect(parseSummaryPeriod({ from: '2026-09-21', to: '2026-11-21' }, now)!.groupBy).toBe('day');
    expect(parseSummaryPeriod({ from: '2026-09-20', to: '2026-11-21' }, now)!.groupBy).toBe('week');
    expect(parseSummaryPeriod({ from: '2025-11-21', to: '2026-11-21' }, now)!.groupBy).toBe('week');
    expect(parseSummaryPeriod({ from: '2025-11-20', to: '2026-11-21' }, now)!.groupBy).toBe('month');
  });

  it('aceita "hoje" em São Paulo mesmo quando já é amanhã em UTC', () => {
    const lateNight = new Date('2026-11-22T01:00:00Z'); // 21/11 às 22h em São Paulo
    expect(parseSummaryPeriod({ from: '2026-11-01', to: '2026-11-21' }, lateNight)).not.toBeNull();
    expect(() => parseSummaryPeriod({ from: '2026-11-01', to: '2026-11-22' }, lateNight)).toThrow();
  });

  it.each([
    [{ from: '2026-11-01' }],
    [{ to: '2026-11-01' }],
    [{ from: '2026-13-40', to: '2026-11-21' }],
    [{ from: '2026-02-30', to: '2026-11-21' }],
    [{ from: '21/11/2026', to: '2026-11-21' }],
    [{ from: ['2026-11-01'], to: '2026-11-21' }],
    [{ from: '2026-11-21', to: '2026-11-01' }],
    [{ from: '2026-11-01', to: '2026-11-22' }],
    [{ from: '1999-12-31', to: '2026-11-21' }],
    [{ from: '2026-11-01', to: '2026-11-21', groupBy: 'year' }],
  ])('rejeita %j com 400', (query) => {
    expect(() => parseSummaryPeriod(query, now)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('recusa agrupar por dia acima de 366 dias com a mensagem do spec', () => {
    expect(() => parseSummaryPeriod({ from: '2021-11-12', to: '2026-11-21', groupBy: 'day' }, now))
      .toThrow('Para períodos acima de 1 ano, agrupe por semana ou mês.');
  });

  it('aceita agrupar por dia em exatamente 366 dias', () => {
    expect(parseSummaryPeriod({ from: '2025-11-21', to: '2026-11-21', groupBy: 'day' }, now)!.groupBy).toBe('day');
  });
});
