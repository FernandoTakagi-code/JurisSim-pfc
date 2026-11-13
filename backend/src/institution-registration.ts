// Shared, dependency-free registration checks. CNPJ DV follows Receita Federal's manual.
export function validRegistrationNumber(value: string): boolean {
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(value) || /^(.)\1{13}$/.test(value)) return false;
  const digit = (base: string) => {
    let sum = 0;
    for (let i = base.length - 1, weight = 2; i >= 0; i--, weight = weight === 9 ? 2 : weight + 1)
      sum += (base.charCodeAt(i) - 48) * weight;
    const remainder = sum % 11;
    return String(remainder < 2 ? 0 : 11 - remainder);
  };
  const first = digit(value.slice(0, 12));
  return value.slice(12) === first + digit(value.slice(0, 12) + first);
}

export const institutionStates = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const;
export const representationDeclarationVersion = '2026-11-11';

export const noWebsiteDeclaration = 'Declaração: instituição sem site oficial.';
export function institutionPendingFields(data: Record<string, unknown>): string[] {
  const required: Record<string, string> = {name:'Razão social', tradeName:'Nome fantasia', registrationNumber:'CNPJ', institutionType:'Tipo', postalCode:'CEP', street:'Logradouro', number:'Número', district:'Bairro', city:'Cidade', state:'UF', contactEmail:'E-mail institucional', phone:'Telefone institucional', responsibleName:'Responsável', representativePosition:'Cargo', representativePhone:'Telefone profissional', representationEvidence:'Comprovação de representação'};
  const missing = Object.entries(required).filter(([key]) => !String(data[key] ?? '').trim()).map(([,name]) => name);
  if (data.registrationNumber && !validRegistrationNumber(String(data.registrationNumber))) missing.push('CNPJ inválido');
  if (!data.representationDeclaration) missing.push('Declaração de responsabilidade');
  if (!data.website && !String(data.description ?? '').includes(noWebsiteDeclaration)) missing.push('Site ou declaração de inexistência');
  return missing;
}
