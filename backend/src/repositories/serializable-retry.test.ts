import { Prisma } from '@prisma/client';
import { afterEach, expect, it, vi } from 'vitest';
import { withSerializableRetry } from './serializable-retry';

const conflict = (code: string, sqlstate?: string) => new Prisma.PrismaClientKnownRequestError('Synthetic transaction conflict', { code, clientVersion: 'fixture', meta: { code: sqlstate } });
afterEach(() => vi.useRealTimers());
it.each([['P2034', undefined], ['P2010', '40001'], ['P2010', '40P01']])('restarts the whole aborted transaction for %s/%s', async (code, sqlstate) => {
  vi.useFakeTimers();
  const operation = vi.fn().mockRejectedValueOnce(conflict(code, sqlstate)).mockResolvedValue('saved-after-rechecking-owner');
  const result = withSerializableRetry(operation);
  await vi.runAllTimersAsync();
  expect(await result).toBe('saved-after-rechecking-owner'); expect(operation).toHaveBeenCalledTimes(2);
});
it.each([conflict('P2002'), conflict('P2010', '23505'), new Error('connection lost after unknown commit'), { code: 'P2034' }])('does not repeat a permanent or ambiguous failure', async error => {
  const operation = vi.fn().mockRejectedValue(error);
  await expect(withSerializableRetry(operation)).rejects.toBe(error); expect(operation).toHaveBeenCalledTimes(1);
});
it('bounds retries and returns a temporary response instead of an internal error', async () => {
  vi.useFakeTimers(); const operation = vi.fn().mockRejectedValue(conflict('P2010', '40001'));
  const result = expect(withSerializableRetry(operation)).rejects.toMatchObject({ statusCode: 503, retryAfter: 1 });
  await vi.runAllTimersAsync(); await result; expect(operation).toHaveBeenCalledTimes(5);
});
