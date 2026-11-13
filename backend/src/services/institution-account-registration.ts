import { z } from 'zod';
import { institutionRequestSchema } from './institution-registration-validation';
import { passwordSchema } from './password-policy';
import { acceptanceSchema } from './legal-acceptance';

const email=z.string().trim().email().max(254).transform(value=>value.toLowerCase());
export const institutionAccountRegistrationSchema=z.object({
  institution:institutionRequestSchema,
  email, emailConfirmation:email,
  senha:passwordSchema, confirmacaoSenha:z.string().min(1).max(128),
  acceptance:acceptanceSchema,
}).strict().refine(value=>value.email===value.emailConfirmation,{path:['emailConfirmation'],message:'Os e-mails não coincidem.'})
  .refine(value=>value.senha===value.confirmacaoSenha,{path:['confirmacaoSenha'],message:'As senhas não coincidem.'});
