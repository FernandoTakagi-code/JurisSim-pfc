import { expect, it } from 'vitest';
import { validRegistrationNumber, institutionRequestSchema } from './institution-registration-validation';
import { institutionApplication } from '../__tests__/fixtures/institution-request';

it.each(['12ABC34501DE35', '11222333000181'])('accepts a valid numeric/alphanumeric check digit: %s', value => {
  expect(validRegistrationNumber(value)).toBe(true);
});
it.each(['12ABC34501DE34', '11222333000182', '00000000000000', '11111111111111', '12abc34501de35', '123', '12ABC34501DEAB'])('rejects invalid registration numbers: %s', value => {
  expect(validRegistrationNumber(value)).toBe(false);
});
it('normalizes CNPJ/CEP and accepts optional omissions and number S/N', () => {
  expect(institutionRequestSchema.parse(institutionApplication)).toMatchObject({ registrationNumber: '12ABC34501DE35', postalCode: '01001000', number: 'S/N' });
});
it.each(['name','tradeName','registrationNumber','institutionType','postalCode','street','number','district','city','state','contactEmail','phone','responsibleName','representativePosition','representativePhone','representationDeclaration','representationEvidence'])('requires %s', field => {
  const data: Record<string, unknown> = {...institutionApplication}; delete data[field];
  expect(institutionRequestSchema.safeParse(data).success).toBe(false);
});
it('requires a website or an explicit declaration, exclusively', () => {
  expect(institutionRequestSchema.safeParse({...institutionApplication, noWebsite: undefined}).success).toBe(false);
  expect(institutionRequestSchema.safeParse({...institutionApplication, website:'https://example.invalid'}).success).toBe(false);
  expect(institutionRequestSchema.safeParse({...institutionApplication, noWebsite:false, website:'https://example.invalid'}).success).toBe(true);
});
it.each([{postalCode:'123'},{state:'XX'},{website:'javascript:alert(1)'},{website:'https://user:secret@example.invalid'},{representationDeclaration:false},{representationDeclaration:'true'},{phone:'abc'},{registrationNumber:''},{ownerId:'injected'},{status:'ACTIVE'}])('rejects invalid data or privilege injection: %o', override => {
  expect(institutionRequestSchema.safeParse({...institutionApplication,...override}).success).toBe(false);
});
