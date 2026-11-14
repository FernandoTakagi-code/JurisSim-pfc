import { expect, it, vi } from 'vitest';
import { InitialDiagnosticController } from './initial-diagnostic-controller';
import { ApiError } from '../errors/api-error';

it('preserves temporary transaction failure status and Retry-After instead of returning 500', async () => {
  const service = { getOrCreate: vi.fn().mockRejectedValue(new ApiError(503, 'Envio em andamento.', 1)) };
  const response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
  await new InitialDiagnosticController(service as never, {} as never).startOrRecover({ auth: { userId: 'fixture' } } as never, response as never);
  expect(response.status).toHaveBeenCalledWith(503);
  expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '1');
  expect(response.json).toHaveBeenCalledWith({ message: 'Envio em andamento.' });
});
