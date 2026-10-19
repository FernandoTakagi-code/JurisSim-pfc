import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../errors/api-error';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ApiError) {
    if (error.retryAfter) response.set('Retry-After', String(error.retryAfter));
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  if (error instanceof ZodError) {
    response.status(422).json({ message: 'Dados invalidos.', issues: error.issues });
    return;
  }
  if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
    response.status(error.type === 'entity.too.large' ? 413 : 400).json({ message: 'Corpo da solicitação inválido ou muito grande.' });
    return;
  }

  console.error('Erro interno do servidor.');
  response.status(500).json({ message: 'Erro interno do servidor.' });
};
