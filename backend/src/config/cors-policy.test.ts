import { describe, expect, it } from 'vitest';
import { corsOriginsFromEnvironment, isAllowedCorsOrigin, isValidCorsPreflight } from './cors-policy';

describe('política CORS', () => {
  it('usa somente o frontend local conhecido como fallback fora de produção', () => {
    const origins = corsOriginsFromEnvironment({ NODE_ENV: 'test' });
    expect(origins).toEqual(['http://localhost:5173']);
    expect(isAllowedCorsOrigin('http://localhost:5173', origins)).toBe(true);
    expect(isAllowedCorsOrigin('http://localhost:5174', origins)).toBe(false);
  });

  it('aceita origens HTTPS exatas configuradas e elimina duplicatas', () => {
    const origins = corsOriginsFromEnvironment({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://jurissim.example, https://staging.jurissim.example,https://jurissim.example',
    });
    expect(origins).toEqual(['https://jurissim.example', 'https://staging.jurissim.example']);
    expect(isAllowedCorsOrigin('https://staging.jurissim.example', origins)).toBe(true);
    expect(isAllowedCorsOrigin('https://other.example', origins)).toBe(false);
  });

  it('exige configuração explícita em produção', () => {
    expect(() => corsOriginsFromEnvironment({ NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
    expect(() => corsOriginsFromEnvironment({ NODE_ENV: 'production', CORS_ORIGINS: ' ' })).toThrow(/CORS_ORIGINS/);
  });

  it.each([
    '*', 'null', 'https://site.example/path', 'https://site.example?query=1', 'ftp://site.example',
    'https://user:password@site.example', 'https://site.example,',
  ])('rejeita configuração não exata ou insegura: %s', value => {
    expect(() => corsOriginsFromEnvironment({ NODE_ENV: 'production', CORS_ORIGINS: value })).toThrow();
  });

  it('valida métodos e cabeçalhos usados pelo frontend nos preflights', () => {
    expect(isValidCorsPreflight('PUT', 'authorization, content-type, x-jurissim-local-demo')).toBe(true);
    expect(isValidCorsPreflight('OPTIONS', 'Content-Type')).toBe(true);
    expect(isValidCorsPreflight('TRACE', 'authorization')).toBe(false);
    expect(isValidCorsPreflight('put', 'authorization')).toBe(false);
    expect(isValidCorsPreflight('DELETE', 'x-unapproved-header')).toBe(false);
    expect(isValidCorsPreflight(undefined, 'content-type')).toBe(false);
  });
});
