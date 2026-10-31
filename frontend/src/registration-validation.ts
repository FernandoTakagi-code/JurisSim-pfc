import { passwordError } from '../../backend/src/password-policy';

export type RegistrationFields = {
  name: string;
  email: string;
  password: string;
  confirmation: string;
  accepted: boolean;
};

export type RegistrationValidation = {
  name?: string;
  email?: string;
  password?: string;
  confirmation?: string;
  acceptance?: string;
  firstError?: string;
  valid: boolean;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function validateRegistration(fields: RegistrationFields): RegistrationValidation {
  const errors: Omit<RegistrationValidation, 'firstError' | 'valid'> = {};
  const name = fields.name.trim();
  const email = fields.email.trim();

  if (name.length < 2) errors.name = 'Informe seu nome completo (pelo menos 2 caracteres).';
  else if (name.length > 120) errors.name = 'O nome deve ter no máximo 120 caracteres.';

  if (!email) errors.email = 'Informe seu e-mail.';
  else if (email.length > 254) errors.email = 'O e-mail deve ter no máximo 254 caracteres.';
  else if (!emailPattern.test(email)) errors.email = 'Digite um endereço de e-mail válido.';

  errors.password = passwordError(fields.password);
  if (!fields.password) errors.password = 'Informe sua senha.';
  if (!fields.confirmation) errors.confirmation = 'Confirme sua senha.';
  else if (fields.password !== fields.confirmation) errors.confirmation = 'As senhas não coincidem.';
  if (!fields.accepted) errors.acceptance = 'Aceite os Termos de Uso e a Política de Privacidade.';

  const firstError = errors.name || errors.email || errors.password || errors.confirmation || errors.acceptance;
  return { ...errors, firstError, valid: !firstError };
}
