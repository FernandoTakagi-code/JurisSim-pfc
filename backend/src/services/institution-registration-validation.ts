import { z } from 'zod';
import { validRegistrationNumber, institutionStates } from '../institution-registration';
export { validRegistrationNumber, institutionStates, representationDeclarationVersion } from '../institution-registration';

const phone = z.string().trim().max(25).regex(/^\+?[\d ()-]+$/, 'Informe um telefone válido.').refine(v => v.replace(/\D/g, '').length >= 10, 'Informe DDD e telefone.');
const optionalText = (max: number) => z.preprocess(v => v === '' ? undefined : v, z.string().trim().max(max).optional());
const institutionRequestFields = z.object({
  name: z.string().trim().min(2).max(180),
  registrationNumber: z.string().trim().max(25).transform(v => v.replace(/[.\/\-\s]/g, '').toUpperCase()).refine(validRegistrationNumber, 'Informe um CNPJ com dígitos verificadores válidos.'),
  tradeName: z.string().trim().min(2).max(180),
  noWebsite: z.boolean().optional(),
  institutionType: z.enum(['ENSINO_SUPERIOR','CURSO_PREPARATORIO','OUTRA_ORGANIZACAO']),
  postalCode: z.string().trim().transform(v => v.replace(/-/g, '')).refine(v => /^\d{8}$/.test(v), 'Informe um CEP com oito dígitos.'),
  street: z.string().trim().min(2).max(180),
  number: z.string().trim().min(1).max(20),
  addressComplement: optionalText(120),
  district: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  state: z.enum(institutionStates),
  contactEmail: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  phone,
  website: z.preprocess(v => v === '' ? undefined : v, z.string().trim().url().max(500).refine(v => {
    const url = new URL(v); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password;
  }, 'Use um endereço público HTTP ou HTTPS, sem credenciais.').optional()),
  responsibleName: z.string().trim().min(2).max(120),
  representativePosition: z.string().trim().min(2).max(120),
  representativePhone: phone,
  representationDeclaration: z.literal(true),
  representationEvidence: z.string().trim().min(10).max(1000),
  description: z.string().trim().min(10).max(1900).optional(),
}).strict();
const websiteChoice = (v: {website?: string; noWebsite?: boolean}) => Boolean(v.website) !== (v.noWebsite === true);
const websiteError = {message: 'Informe o site ou declare que a instituição não possui site.', path: ['website']};
export const institutionRequestSchema = institutionRequestFields.refine(websiteChoice, websiteError);
// Used only by the administrative fixture service; never by the public route.
export const institutionFixtureSchema = institutionRequestFields.omit({registrationNumber:true}).refine(websiteChoice, websiteError);
