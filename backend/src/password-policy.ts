// Pure module shared by the API and browser. Never trim or transform passwords.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export const passwordRequirements = [
  { id: 'length', label: 'Mínimo de 8 caracteres', message: 'A senha deve ter pelo menos 8 caracteres.', test: (value: string) => value.length >= PASSWORD_MIN_LENGTH },
  { id: 'uppercase', label: 'Pelo menos uma letra maiúscula', message: 'A senha deve conter pelo menos uma letra maiúscula.', test: (value: string) => /\p{Lu}/u.test(value) },
  { id: 'number', label: 'Pelo menos um número', message: 'A senha deve conter pelo menos um número.', test: (value: string) => /[0-9]/.test(value) },
  { id: 'special', label: 'Pelo menos um caractere especial', message: 'A senha deve conter pelo menos um caractere especial.', test: (value: string) => /[^\p{L}\p{N}\s]/u.test(value) },
] as const;

export function passwordError(value: string): string | undefined {
  const missing = passwordRequirements.find(requirement => !requirement.test(value));
  if (missing) return missing.message;
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) return 'A senha deve ter no máximo 72 bytes em UTF-8.';
  return undefined;
}

export function validPasswordConfirmation(password: string, confirmation: string): boolean {
  return passwordError(password) === undefined && password === confirmation;
}
