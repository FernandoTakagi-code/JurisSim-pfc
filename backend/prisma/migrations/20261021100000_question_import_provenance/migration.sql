-- Additive question-import metadata only. Existing questions keep their content,
-- alternatives, authors and diagnostic/exam/answer relationships unchanged.
-- Historical rows receive NULL metadata and NULL fingerprints. Do not backfill
-- fingerprints here: pre-existing duplicate groups require a reviewed plan first.
-- The deployment runner must apply this migration in one outer transaction.

DO $preflight$
BEGIN
  IF to_regclass('public."User"') IS NULL OR to_regclass('public."Questao"') IS NULL THEN
    RAISE EXCEPTION 'Question import migration prerequisite missing: expected User and Questao tables.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'Question import migration prerequisite missing: expected anon and authenticated roles.';
  END IF;
  IF to_regclass('public."LoteImportacao"') IS NOT NULL THEN
    RAISE EXCEPTION 'LoteImportacao already exists; manual schema review required.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Questao'
      AND column_name IN ('fonteNome', 'fonteReferencia', 'licencaOuAutorizacao', 'loteImportacaoId', 'fingerprint')
  ) THEN
    RAISE EXCEPTION 'Question import columns already exist; manual schema review required.';
  END IF;
END;
$preflight$;

ALTER TABLE public."Questao"
  ADD COLUMN "fonteNome" TEXT,
  ADD COLUMN "fonteReferencia" TEXT,
  ADD COLUMN "licencaOuAutorizacao" TEXT,
  ADD COLUMN "loteImportacaoId" TEXT,
  ADD COLUMN "fingerprint" TEXT;

CREATE TABLE public."LoteImportacao" (
  "id" TEXT NOT NULL,
  "administradorId" TEXT NOT NULL,
  "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "arquivoHash" CHAR(64) NOT NULL,
  "totalQuestoes" INTEGER NOT NULL,
  CONSTRAINT "LoteImportacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Questao_fingerprint_key" ON public."Questao"("fingerprint");
CREATE INDEX "LoteImportacao_administradorId_importadoEm_idx"
  ON public."LoteImportacao"("administradorId", "importadoEm");

ALTER TABLE public."Questao"
  ADD CONSTRAINT "Questao_loteImportacaoId_fkey"
  FOREIGN KEY ("loteImportacaoId") REFERENCES public."LoteImportacao"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public."LoteImportacao"
  ADD CONSTRAINT "LoteImportacao_administradorId_fkey"
  FOREIGN KEY ("administradorId") REFERENCES public."User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep provenance data server-only, consistent with the backend-owned tables.
ALTER TABLE public."LoteImportacao" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."LoteImportacao" FROM PUBLIC, anon, authenticated;
