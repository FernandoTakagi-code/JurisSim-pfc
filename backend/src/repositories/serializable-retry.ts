import { Prisma } from '@prisma/client';
import { ApiError } from '../errors/api-error';

export function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === 'P2034' || (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code)));
}

// O PostgreSQL aborta a transação em conflito antes da nova tentativa. Executa de novo
// o callback inteiro, incluindo as verificações de posse/estado e o lock de linhas, nunca
// apenas a instrução SQL que falhou. Erros desconhecidos de commit/rede não são repetidos.
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
