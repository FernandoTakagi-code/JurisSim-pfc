-- Add structured question eligibility metadata without classifying legacy rows.
-- All new question/alternative attributes are nullable; no backfill is performed.
-- Prisma 6 does not wrap PostgreSQL migrations in a transaction automatically.
-- Keep the schema additions atomic; on failure, PostgreSQL rolls all of them back.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public."User"') IS NULL
    OR to_regclass('public."Questao"') IS NULL
    OR to_regclass('public."Alternativa"') IS NULL THEN
    RAISE EXCEPTION 'Question eligibility migration prerequisite missing: expected User, Questao and Alternativa tables.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname IN ('OrigemQuestao', 'SituacaoDireitos', 'SituacaoQuestaoOficial', 'LetraAlternativa')
  ) THEN
    RAISE EXCEPTION 'Question eligibility enum already exists; manual schema review required.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND (
      (table_name = 'Questao' AND column_name IN (
        'origem', 'revisaoJuridicaEm', 'revisorJuridicoId', 'revisaoPedagogicaEm',
        'revisorPedagogicoId', 'liberadaAcervoEm', 'liberadaAcervoPorId', 'situacaoDireitos',
        'direitosVerificadosEm', 'direitosVerificadosPorId', 'oabExame', 'oabEdicao',
        'oabTipoProva', 'oabNumeroQuestao', 'fonteOficialUrl', 'situacaoQuestaoOficial'
      )) OR (table_name = 'Alternativa' AND column_name = 'letra')
    )
  ) THEN
    RAISE EXCEPTION 'Question eligibility columns already exist; manual schema review required.';
  END IF;

  IF to_regclass('public."Questao_origem_disciplina_nivel_idx"') IS NOT NULL
    OR to_regclass('public."Alternativa_questaoId_letra_key"') IS NOT NULL THEN
    RAISE EXCEPTION 'Question eligibility index already exists; manual schema review required.';
  END IF;
END;
$preflight$;

CREATE TYPE public."OrigemQuestao" AS ENUM ('IA', 'OAB_OFICIAL', 'PROFESSOR');
CREATE TYPE public."SituacaoDireitos" AS ENUM (
  'NAO_VERIFICADO', 'AUTORIZADA', 'DOMINIO_PUBLICO_VERIFICADO', 'NEGADA'
);
CREATE TYPE public."SituacaoQuestaoOficial" AS ENUM ('VALIDA', 'ANULADA');
CREATE TYPE public."LetraAlternativa" AS ENUM ('A', 'B', 'C', 'D');

ALTER TABLE public."Questao"
  ADD COLUMN "origem" public."OrigemQuestao",
  ADD COLUMN "revisaoJuridicaEm" TIMESTAMP(3),
  ADD COLUMN "revisorJuridicoId" TEXT,
  ADD COLUMN "revisaoPedagogicaEm" TIMESTAMP(3),
  ADD COLUMN "revisorPedagogicoId" TEXT,
  ADD COLUMN "liberadaAcervoEm" TIMESTAMP(3),
  ADD COLUMN "liberadaAcervoPorId" TEXT,
  ADD COLUMN "situacaoDireitos" public."SituacaoDireitos",
  ADD COLUMN "direitosVerificadosEm" TIMESTAMP(3),
  ADD COLUMN "direitosVerificadosPorId" TEXT,
  ADD COLUMN "oabExame" TEXT,
  ADD COLUMN "oabEdicao" TEXT,
  ADD COLUMN "oabTipoProva" TEXT,
  ADD COLUMN "oabNumeroQuestao" INTEGER,
  ADD COLUMN "fonteOficialUrl" TEXT,
  ADD COLUMN "situacaoQuestaoOficial" public."SituacaoQuestaoOficial";

ALTER TABLE public."Alternativa"
  ADD COLUMN "letra" public."LetraAlternativa";

ALTER TABLE public."Questao"
  ADD CONSTRAINT "Questao_revisorJuridicoId_fkey"
    FOREIGN KEY ("revisorJuridicoId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Questao_revisorPedagogicoId_fkey"
    FOREIGN KEY ("revisorPedagogicoId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Questao_liberadaAcervoPorId_fkey"
    FOREIGN KEY ("liberadaAcervoPorId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Questao_direitosVerificadosPorId_fkey"
    FOREIGN KEY ("direitosVerificadosPorId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Questao_origem_disciplina_nivel_idx"
  ON public."Questao"("origem", "disciplina", "nivel");

-- PostgreSQL permits multiple NULL values in this unique index, preserving
-- historical alternatives without a letter while enforcing A-D uniqueness
-- whenever a letter is recorded.
CREATE UNIQUE INDEX "Alternativa_questaoId_letra_key"
  ON public."Alternativa"("questaoId", "letra");

-- Deliberately no unique OAB identity index is created here. Before adding one,
-- audit existing rows for duplicate (oabExame, oabEdicao, oabTipoProva,
-- oabNumeroQuestao) groups, reconcile them with reviewed source records, then
-- add a partial unique index for fully identified OAB_OFICIAL questions.
COMMIT;
