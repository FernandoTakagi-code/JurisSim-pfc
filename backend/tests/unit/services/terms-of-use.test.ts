import { beforeEach, describe, expect, it, vi } from 'vitest';
import versions from '../../../src/legal-versions.json';
import initialTerms from '../../../src/terms-of-use/initial-terms.json';

const db = vi.hoisted(() => {
  const tx = {
    termsOfUseVersion: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    administrativeEvent: { create: vi.fn() },
    user: { update: vi.fn() },
  };
  return {
    tx,
    termsOfUseVersion: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    user: { count: vi.fn() },
    $transaction: vi.fn(),
  };
});
vi.mock('../../../src/lib/prisma', () => ({ prisma: db }));
vi.unmock('../../../src/services/accounts/terms-of-use');

import {
  currentLegalVersions, currentTermsOfUse, nextTermsVersion, publishTermsOfUse, resetTermsCache, termsOfUseOverview, termsOfUseVersion,
} from '../../../src/services/accounts/terms-of-use';

const current = { version: '2026-11-13.1', publishedAt: new Date('2026-11-13T03:00:00Z'), sections: [{ title: '1. Atual', body: 'Texto atual' }] };

beforeEach(() => {
  vi.clearAllMocks();
  resetTermsCache();
  db.termsOfUseVersion.findFirst.mockResolvedValue(current);
  db.tx.termsOfUseVersion.findFirst.mockResolvedValue(current);
  db.tx.termsOfUseVersion.findMany.mockResolvedValue([]);
  db.tx.termsOfUseVersion.create.mockImplementation(async ({ data }) => ({ ...data, publishedAt: new Date() }));
  db.$transaction.mockImplementation(async (work) => work(db.tx));
});

describe('número da versão', () => {
  it('usa a data de São Paulo e começa em .1', () => {
    expect(nextTermsVersion([], new Date('2026-11-22T01:00:00Z'))).toBe('2026-11-21.1');
  });
  it('continua a sequência do dia', () => {
    expect(nextTermsVersion(['2026-11-21.1', '2026-11-21.2'], new Date('2026-11-21T15:00:00Z'))).toBe('2026-11-21.3');
    expect(nextTermsVersion(['2026-11-21.9', '2026-11-21.10'], new Date('2026-11-21T15:00:00Z'))).toBe('2026-11-21.11');
  });
});

describe('versão em vigor', () => {
  it('combina a versão dos Termos do banco com a do Aviso de Privacidade do código', async () => {
    expect(await currentLegalVersions()).toEqual({ termsVersion: '2026-11-13.1', privacyVersion: versions.privacyVersion });
    expect(await currentTermsOfUse()).toEqual(current);
  });
  it('consulta o banco uma única vez enquanto o cache vale', async () => {
    await currentLegalVersions(); await currentLegalVersions(); await currentTermsOfUse();
    expect(db.termsOfUseVersion.findFirst).toHaveBeenCalledTimes(1);
  });
  it('falha de forma clara se a tabela não tiver nenhuma versão', async () => {
    db.termsOfUseVersion.findFirst.mockResolvedValue(null);
    await expect(currentLegalVersions()).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('publicação', () => {
  const sections = [{ title: '1. Novo', body: 'Texto novo' }];

  it.each([
    [[]],
    [Array.from({ length: 41 }, () => ({ title: 'a', body: 'b' }))],
    [[{ title: '', body: 'b' }]],
    [[{ title: '   ', body: 'b' }]],
    [[{ title: 'x'.repeat(121), body: 'b' }]],
    [[{ title: 'a', body: 'x'.repeat(5001) }]],
    [[{ title: '<b>a</b>', body: 'b' }]],
    [[{ title: 'a', body: 'texto com <script>' }]],
    [[{ title: 'a', body: 'b', extra: 1 }]],
    ['não é lista'],
  ])('recusa seções inválidas %#', async (input) => {
    await expect(publishTermsOfUse('admin-1', input)).rejects.toMatchObject({ statusCode: 400 });
    expect(db.tx.termsOfUseVersion.create).not.toHaveBeenCalled();
  });

  it('publica, registra o evento e o aceite de quem publicou na mesma transação', async () => {
    const result = await publishTermsOfUse('admin-1', sections);
    expect(result.version).toMatch(/^\d{4}-\d{2}-\d{2}\.1$/);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.tx.termsOfUseVersion.create).toHaveBeenCalledWith({ data: { version: result.version, sections, publishedById: 'admin-1' } });
    expect(db.tx.administrativeEvent.create).toHaveBeenCalledWith({ data: { event: 'TERMS_OF_USE_PUBLISHED', actorId: 'admin-1', resourceId: result.version, result: 'SUCCESS' } });
    const update = db.tx.user.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'admin-1' });
    expect(update.data).toMatchObject({ termsVersion: result.version, privacyVersion: versions.privacyVersion });
    expect(update.data.legalAcceptedAt).toBeInstanceOf(Date);
    expect(update.data.auditLogs.create).toEqual({
      action: 'ACEITE_TERMOS_E_PRIVACIDADE', occurredAt: update.data.legalAcceptedAt,
      termsVersion: result.version, privacyVersion: versions.privacyVersion,
    });
  });

  it('remove espaços nas bordas antes de salvar', async () => {
    await publishTermsOfUse('admin-1', [{ title: '  1. Novo ', body: ' Texto novo  ' }]);
    expect(db.tx.termsOfUseVersion.create.mock.calls[0][0].data.sections).toEqual(sections);
  });

  it('recusa publicar texto idêntico ao em vigor', async () => {
    await expect(publishTermsOfUse('admin-1', current.sections)).rejects.toMatchObject({ statusCode: 409 });
    expect(db.tx.termsOfUseVersion.create).not.toHaveBeenCalled();
  });

  it('usa o próximo número quando outra publicação vence a corrida', async () => {
    db.tx.termsOfUseVersion.create
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
      .mockImplementation(async ({ data }) => ({ ...data, publishedAt: new Date() }));
    db.tx.termsOfUseVersion.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ version: 'X.1' }]);
    const result = await publishTermsOfUse('admin-1', sections);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(result.version.endsWith('.2')).toBe(true);
  });

  it('invalida o cache depois de publicar', async () => {
    await currentLegalVersions();
    const result = await publishTermsOfUse('admin-1', sections);
    db.termsOfUseVersion.findFirst.mockResolvedValue({ ...current, version: result.version });
    expect((await currentLegalVersions()).termsVersion).toBe(result.version);
  });
});

describe('correções da revisão final', () => {
  it('sem a tabela (migração ainda não aplicada) usa a versão inicial empacotada em vez de derrubar o sistema', async () => {
    db.termsOfUseVersion.findFirst.mockRejectedValue(Object.assign(new Error('missing table'), { code: 'P2021' }));
    expect(await currentTermsOfUse()).toEqual({ version: versions.termsVersion, publishedAt: new Date('2026-11-13T03:00:00.000Z'), sections: initialTerms });
    expect(await currentLegalVersions()).toEqual({ termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion });
  });

  it('sem a tabela, publicar responde 503 pedindo a migração', async () => {
    db.$transaction.mockRejectedValue(Object.assign(new Error('missing table'), { code: 'P2021' }));
    await expect(publishTermsOfUse('admin-1', [{ title: '1. Novo', body: 'Texto' }])).rejects.toMatchObject({ statusCode: 503 });
  });

  it('reconhece texto igual mesmo com as chaves do JSONB em outra ordem', async () => {
    db.tx.termsOfUseVersion.findFirst.mockResolvedValue({ sections: [{ body: 'Texto atual', title: '1. Atual' }] });
    await expect(publishTermsOfUse('admin-1', [{ title: '1. Atual', body: 'Texto atual' }])).rejects.toMatchObject({ statusCode: 409 });
    expect(db.tx.termsOfUseVersion.create).not.toHaveBeenCalled();
  });

  it('leitura sem cache traz a versão publicada por outra instância', async () => {
    await currentLegalVersions();
    db.termsOfUseVersion.findFirst.mockResolvedValue({ ...current, version: '2026-11-21.1' });
    expect((await currentLegalVersions()).termsVersion).toBe('2026-11-13.1');
    expect((await currentLegalVersions({ fresh: true })).termsVersion).toBe('2026-11-21.1');
    expect((await currentLegalVersions()).termsVersion).toBe('2026-11-21.1');
  });
});

describe('versão antiga', () => {
  it('retorna o texto de uma versão publicada', async () => {
    db.termsOfUseVersion.findUnique = vi.fn().mockResolvedValue(current);
    expect(await termsOfUseVersion('2026-11-13.1')).toEqual(current);
    expect(db.termsOfUseVersion.findUnique).toHaveBeenCalledWith({ where: { version: '2026-11-13.1' }, select: { version: true, publishedAt: true, sections: true } });
  });
  it('responde 404 para versão inexistente', async () => {
    db.termsOfUseVersion.findUnique = vi.fn().mockResolvedValue(null);
    await expect(termsOfUseVersion('2026-01-01.1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('visão do administrador', () => {
  it('traz a versão em vigor, o histórico e quantas contas aceitaram', async () => {
    db.termsOfUseVersion.findMany.mockResolvedValue([
      { version: '2026-11-21.1', publishedAt: new Date('2026-11-21T15:00:00Z'), publishedBy: { nome: 'Joao' } },
      { version: '2026-11-13.1', publishedAt: current.publishedAt, publishedBy: null },
    ]);
    db.user.count.mockResolvedValueOnce(14).mockResolvedValueOnce(19);
    const overview = await termsOfUseOverview();
    expect(overview.current).toEqual(current);
    expect(overview.history).toEqual([
      { version: '2026-11-21.1', publishedAt: new Date('2026-11-21T15:00:00Z'), publishedBy: 'Joao' },
      { version: '2026-11-13.1', publishedAt: current.publishedAt, publishedBy: null },
    ]);
    expect(overview.acceptedCount).toBe(14);
    expect(overview.activeAccounts).toBe(19);
    expect(db.user.count).toHaveBeenCalledWith({ where: { deletedAt: null, termsVersion: '2026-11-13.1' } });
    expect(db.user.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
  });
});
