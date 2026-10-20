import { z } from 'zod';
import { ApiError } from '../errors/api-error';
import { passwordError } from '../password-policy';

export const passwordSchema = z.string().superRefine((value, context) => {
  const message = passwordError(value);
  if (message) context.addIssue({ code: 'custom', message });
});

export function assertValidPassword(value: string) {
  const message = passwordError(value);
  if (message) throw new ApiError(400, message);
}
