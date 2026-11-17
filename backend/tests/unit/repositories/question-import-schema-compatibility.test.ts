import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

describe('compatibilidade do schema Prisma de importação', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const migration = readFileSync('prisma/migrations/20261021100000_question_import_provenance/migration.sql', 'utf8');

  it('declara metadados opcionais e fingerprint nullable com unicidade', () => {
    const questionModel = schema.match(/model Questao \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(questionModel).toMatch(/fonteNome\s+String\?/);
    expect(questionModel).toMatch(/fonteReferencia\s+String\?/);
    expect(questionModel).toMatch(/licencaOuAutorizacao\s+String\?/);
    expect(questionModel).toMatch(/loteImportacaoId\s+String\?/);
    expect(questionModel).toMatch(/fingerprint\s+String\?\s+@unique/);
    expect(migration).toMatch(/ADD COLUMN "fingerprint" TEXT/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX "Questao_fingerprint_key"/);
    const generatedQuestion = Prisma.dmmf.datamodel.models.find(model => model.name === 'Questao');
    expect(generatedQuestion?.fields.find(field => field.name === 'fingerprint')).toMatchObject({ isRequired: false, isUnique: true });
    expect(Prisma.dmmf.datamodel.models.some(model => model.name === 'LoteImportacao')).toBe(true);
  });

  it('preserva relações antigas e declara lote com admin, data, hash e questões', () => {
    const questionModel = schema.match(/model Questao \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(questionModel).toMatch(/alternativas\s+Alternativa\[\]/);
    expect(questionModel).toMatch(/autor\s+User/);
    expect(questionModel).toMatch(/turma\s+Turma\?/);
    expect(questionModel).toMatch(/diagnosticos\s+QuestaoSimulado\[\]/);
    expect(questionModel).toMatch(/respostas\s+Resposta\[\]/);
    expect(questionModel).toMatch(/avaliacoes\s+AvaliacaoQuestao\[\]/);
    const batchModel = schema.match(/model LoteImportacao \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(batchModel).toMatch(/administradorId\s+String/);
    expect(batchModel).toMatch(/importadoEm\s+DateTime/);
    expect(batchModel).toMatch(/arquivoHash\s+String\s+@db\.Char\(64\)/);
    expect(batchModel).toMatch(/totalQuestoes\s+Int/);
    expect(batchModel).toMatch(/administrador\s+User/);
    expect(batchModel).toMatch(/questoes\s+Questao\[\]/);
    expect(migration).not.toMatch(/\b(DELETE FROM|DROP TABLE|DROP COLUMN)\b/i);
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES.*anon, authenticated/s);
  });
});
