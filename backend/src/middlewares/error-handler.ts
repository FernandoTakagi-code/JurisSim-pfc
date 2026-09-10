import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../errors/api-error';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ApiError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  if (error instanceof ZodError) {
    response.status(422).json({ message: 'Dados invalidos.', issues: error.issues });
    return;
  }
  console.error(error);
  response.status(500).json({ message: 'Erro interno do servidor.' });
};
