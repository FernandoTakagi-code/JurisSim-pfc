import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const model = () => ({ count: vi.fn().mockResolvedValue(0) });
  return {
    user: model(), institution: model(), institutionalMembership: model(), turma: model(),
    administrativeEvent: model(), avaliacao: model(), classActivity: model(), simulado: model(),
    $queryRaw: vi.fn(),
  };
});
vi.mock('../../../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../../../src/services/assessments/class-lifecycle', () => ({
  visibleClasses: vi.fn().mockResolvedValue({}),
  classActivitiesReady: vi.fn().mockResolvedValue(true),
}));

import { InstitutionService } from '../../../src/services/institutions/institution-service';
import { parseSummaryPeriod } from '../../../src/services/institutions/admin-summary-period';

const admin = { userId: '00000000-0000-4000-8000-000000000001', role: 'ADMIN' } as never;
const now = new Date('2026-11-21T15:00:00Z');
const service = new InstitutionService();
const rawSql = () => (db.$queryRaw.mock.calls as unknown as [TemplateStringsArray, ...unknown[]][]).map(([strings, ...values]) =>
  `${strings.join('?')} ${JSON.stringify(values)}`);

beforeEach(() => {
  for (const model of Object.values(db)) if ('count' in model) model.count.mockClear().mockResolvedValue(0);
  db.$queryRaw.mockReset().mockImplementation(async (strings: TemplateStringsArray) =>
    strings.join('').includes('"Simulado"') ? [] : strings.join('').includes('AS profile') ? [] : [{ day: '2026-11-20', bucket: '2026-11-01', count: 2 }]);
});

describe('summary do administrador', () => {
  it('sem período mantém as consultas e o formato atuais', async () => {
    const result = await service.summary(admin);
    expect(result.period).toBeNull();
    expect(db.user.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(db.institution.count).toHaveBeenCalledWith();
    expect(rawSql().join('\n')).not.toContain('America/Sao_Paulo');
    expect(result.registrationsByDay[0]).toMatchObject({ day: '2026-11-20', count: 2 });
  });

  it('com período filtra todos os indicadores pelas datas de criação, publicação e conclusão', async () => {
    const period = parseSummaryPeriod({ from: '2021-11-12', to: '2026-11-21', groupBy: 'month' }, now)!;
    const range = { gte: period.startUtc, lt: period.endUtcExclusive };
    const result = await service.summary(admin, period);
    expect(db.user.count).toHaveBeenCalledWith({ where: { deletedAt: null, createdAt: range } });
    expect(db.user.count).toHaveBeenCalledWith({ where: { deletedAt: null, role: 'ALUNO', registrationIntent: null, createdAt: range } });
    expect(db.institution.count).toHaveBeenCalledWith({ where: { createdAt: range } });
    expect(db.institution.count).toHaveBeenCalledWith({ where: { status: 'PENDING', createdAt: range } });
    expect(db.institutionalMembership.count).toHaveBeenCalledWith({ where: expect.objectContaining({ createdAt: range, active: true, role: 'TEACHER' }) });
    expect(db.turma.count).toHaveBeenCalledWith({ where: expect.objectContaining({ archivedAt: null, createdAt: range }) });
    expect(db.avaliacao.count).toHaveBeenCalledWith({ where: expect.objectContaining({ publishedAt: range }) });
    expect(db.classActivity.count).toHaveBeenCalledWith({ where: expect.objectContaining({ avaliacao: { publishedAt: range } }) });
    expect(db.simulado.count).toHaveBeenCalledWith({ where: expect.objectContaining({ finalizadoEm: range }) });
    expect(result.period).toEqual({ from: '2021-11-12', to: '2026-11-21', groupBy: 'month' });
  });

  it('agrupa as séries e a distribuição pelo período no fuso de São Paulo', async () => {
    const period = parseSummaryPeriod({ from: '2026-01-01', to: '2026-11-21', groupBy: 'week' }, now)!;
    await service.summary(admin, period);
    const sql = rawSql();
    const series = sql.filter(s => s.includes('date_trunc'));
    expect(series).toHaveLength(3);
    for (const s of series) {
      expect(s).toContain('America/Sao_Paulo');
      expect(s).toContain('"week"');
      expect(s).toContain(JSON.stringify(period.startUtc).slice(1, -1));
    }
    const distribution = sql.find(s => s.includes('AS profile'))!;
    expect(distribution).toContain(JSON.stringify(period.startUtc).slice(1, -1));
  });
});
