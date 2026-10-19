import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('groq-sdk', () => ({ default: class {
  chat = { completions: { create: mocks.create } };
} }));

const trail = { priorityDiscipline: 'Civil', priorityTopic: null, recommendedLevel: 'BASICO', reason: 'Revisar fundamentos.' };

beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Feedback IA: fallback e confidencialidade dos logs', () => {
  it('mantém fallback local sem chamar provedor quando não há configuração', async () => {
    vi.stubEnv('GROQ_API_KEY', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { gerarJustificativaComIA } = await import('./feedback-service');
    expect(await gerarJustificativaComIA(trail)).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('não registra objeto, credenciais, corpo ou metadados de falha do provedor', async () => {
    vi.stubEnv('GROQ_API_KEY', 'fixture-only-not-a-real-key');
    const error = Object.assign(new Error('fixture-private-body'), {
      headers: { authorization: 'fixture-private-header' }, request: { student: 'fixture-private-student' },
    });
    mocks.create.mockRejectedValue(error);
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gerarJustificativaComIA } = await import('./feedback-service');
    expect(await gerarJustificativaComIA(trail)).toBeNull();
    expect(logger).toHaveBeenCalledExactlyOnceWith('Erro ao gerar feedback com IA.');
  });

  it('preserva texto do provedor e fallback para resposta vazia', async () => {
    vi.stubEnv('GROQ_API_KEY', 'fixture-only-not-a-real-key');
    mocks.create.mockResolvedValueOnce({ choices: [{ message: { content: '  Revise Civil.  ' } }] })
      .mockResolvedValueOnce({ choices: [] });
    const { gerarJustificativaComIA } = await import('./feedback-service');
    expect(await gerarJustificativaComIA(trail)).toBe('Revise Civil.');
    expect(await gerarJustificativaComIA(trail)).toBeNull();
  });
});
