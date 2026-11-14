import { Prisma } from '@prisma/client';
import { ApiError } from '../errors/api-error';

export function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === 'P2034' || (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code)));
}

// PostgreSQL aborts the conflicting transaction before retry. Run its entire
// callback again, including ownership/state checks and row locking, never only
// the failed SQL statement. Unknown commit/network errors are not retried.
export async function withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (!isSerializationConflict(error)) throw error;
      if (attempt === 4) throw new ApiError(503, 'Há outro envio em andamento. Aguarde e tente novamente.', 1);
      await new Promise<void>(resolve => setTimeout(resolve, 15 * 2 ** attempt + Math.floor(Math.random() * 10)));
    }
  }
}
