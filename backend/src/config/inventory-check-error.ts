export type InventoryCheckErrorCategory = 'CONNECTION' | 'AUTHENTICATION' | 'PERMISSION' | 'MIGRATIONS_OR_SCHEMA' | 'TIMEOUT' | 'QUERY';

export interface SanitizedInventoryCheckError {
  category: InventoryCheckErrorCategory;
  message: string;
}

const SAFE_MESSAGES: Record<InventoryCheckErrorCategory, string> = {
  CONNECTION: 'Não foi possível alcançar o PostgreSQL. Verifique host, porta e TLS.',
  AUTHENTICATION: 'A autenticação foi rejeitada pelo PostgreSQL. Verifique usuário e senha.',
  PERMISSION: 'O usuário não tem permissões de leitura necessárias.',
  MIGRATIONS_OR_SCHEMA: 'Tabelas ou colunas esperadas não existem. Verifique se as migrations foram aplicadas.',
  TIMEOUT: 'A validação excedeu o tempo limite ou o pool de conexões está esgotado.',
  QUERY: 'Uma consulta falhou por erro de dados ou compatibilidade; detalhes omitidos.',
};

function errorCodes(error: unknown): Set<string> {
  const found = new Set<string>();
  const visited = new Set<object>();
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 5 || visited.has(value)) return;
    visited.add(value);
    const record = value as Record<string, unknown>;
    for (const key of ['code', 'originalCode', 'sqlState', 'sqlstate', 'errorCode']) {
      if (typeof record[key] === 'string') found.add((record[key] as string).toUpperCase());
    }
    visit(record.meta, depth + 1);
    visit(record.cause, depth + 1);
    visit(record.originalError, depth + 1);
  };
  visit(error, 0);
  return found;
}

function privateErrorText(error: unknown): string {
  const parts: string[] = [];
  const visited = new Set<object>();
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 5 || visited.has(value)) return;
    visited.add(value);
    const record = value as Record<string, unknown>;
    if (typeof record.message === 'string') parts.push(record.message);
    visit(record.cause, depth + 1);
    visit(record.originalError, depth + 1);
  };
  if (typeof error === 'string') parts.push(error);
  else visit(error, 0);
  return parts.join(' ').toLowerCase();
}

export function diagnoseInventoryCheckError(error: unknown): SanitizedInventoryCheckError {
  const codes = errorCodes(error);
  const text = privateErrorText(error);
  let category: InventoryCheckErrorCategory = 'QUERY';

  if (['P1000', '28P01', '28000'].some(code => codes.has(code))
    || /password authentication failed|authentication failed|no password supplied/.test(text)) {
    category = 'AUTHENTICATION';
  } else if (['42501', 'P1010'].some(code => codes.has(code))
    || /permission denied|insufficient privilege/.test(text)) {
    category = 'PERMISSION';
  } else if (['P2021', 'P2022', '42P01', '42703'].some(code => codes.has(code))
    || /relation .* does not exist|column .* does not exist|undefined table|undefined column/.test(text)) {
    category = 'MIGRATIONS_OR_SCHEMA';
  } else if (['P1002', 'P1008', 'P2024', '57014'].some(code => codes.has(code))
    || /timed out|timeout|statement timeout|canceling statement due to user request/.test(text)) {
    category = 'TIMEOUT';
  } else if (['P1001', 'P1011', 'P1017'].some(code => codes.has(code))
    || [...codes].some(code => code.startsWith('08'))
    || /econnrefused|ehostunreach|enetunreach|enotfound|connection reset|can't reach database server/.test(text)) {
    category = 'CONNECTION';
  }

  return { category, message: SAFE_MESSAGES[category] };
}
