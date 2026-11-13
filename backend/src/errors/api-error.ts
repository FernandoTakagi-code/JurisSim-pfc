export class ApiError extends Error {
  constructor(public readonly statusCode: number, message: string, public readonly retryAfter?: number, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}
