-- Add an immutable pointer to each student's first completed diagnostic.
-- Only completed legacy DIAGNOSTICO rows are backfilled; in-progress attempts
-- and all existing attempts/questions/answers remain untouched.
-- The deployment runner must apply this migration in one outer transaction.

DO $preflight$
BEGIN
  IF to_regclass('public."User"') IS NULL
    OR to_regclass('public."Simulado"') IS NULL THEN
    RAISE EXCEPTION 'Initial diagnostic migration prerequisite missing: expected User and Simulado tables.';
  END IF;

  IF to_regclass('public."DiagnosticoInicial"') IS NOT NULL THEN
    RAISE EXCEPTION 'DiagnosticoInicial already exists; manual schema review required.';
  END IF;

  IF to_regclass('public."Simulado_id_alunoId_key"') IS NOT NULL THEN
    RAISE EXCEPTION 'Simulado_id_alunoId_key already exists; manual schema review required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Simulado'
      AND column_name = 'alunoId'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Simulado'
      AND column_name = 'tipo'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Simulado'
      AND column_name = 'finalizadoEm'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Simulado'
      AND column_name = 'iniciadoEm'
  ) THEN
    RAISE EXCEPTION 'Initial diagnostic migration prerequisite missing: expected diagnostic columns.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'Security prerequisite missing: expected anon and authenticated roles.';
  END IF;

  IF to_regprocedure('gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'Initial diagnostic migration prerequisite missing: gen_random_uuid() is unavailable.';
  END IF;
END;
$preflight$;

-- PostgreSQL needs a unique target for the composite owner-checking FK.
-- "id" is already a primary key; this additional index intentionally makes
-- the pair (id, alunoId) referenceable by DiagnosticoInicial.
CREATE UNIQUE INDEX "Simulado_id_alunoId_key"
  ON public."Simulado"("id", "alunoId");

CREATE TABLE public."DiagnosticoInicial" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "simuladoId" TEXT NOT NULL,
  CONSTRAINT "DiagnosticoInicial_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiagnosticoInicial_alunoId_key" UNIQUE ("alunoId"),
  CONSTRAINT "DiagnosticoInicial_simuladoId_key" UNIQUE ("simuladoId"),
  CONSTRAINT "DiagnosticoInicial_simuladoId_alunoId_key" UNIQUE ("simuladoId", "alunoId"),
  CONSTRAINT "DiagnosticoInicial_alunoId_fkey"
    FOREIGN KEY ("alunoId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DiagnosticoInicial_simuladoId_alunoId_fkey"
    FOREIGN KEY ("simuladoId", "alunoId")
    REFERENCES public."Simulado"("id", "alunoId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Link only the first completed diagnostic per student. The finalization time
-- is primary; start time and id break ties deterministically. An unfinished
-- legacy diagnostic does not receive an identity association.
WITH first_completed AS (
  SELECT DISTINCT ON (s."alunoId") s."alunoId", s."id" AS "simuladoId"
  FROM public."Simulado" s
  WHERE s."tipo" = 'DIAGNOSTICO'
    AND s."finalizadoEm" IS NOT NULL
  ORDER BY s."alunoId", s."finalizadoEm" ASC, s."iniciadoEm" ASC, s."id" ASC
)
INSERT INTO public."DiagnosticoInicial" ("id", "alunoId", "simuladoId")
SELECT gen_random_uuid()::text, "alunoId", "simuladoId"
FROM first_completed;

-- This identity contains student activity metadata and is backend-only.
ALTER TABLE public."DiagnosticoInicial" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES
  ON TABLE public."DiagnosticoInicial"
  FROM PUBLIC, anon, authenticated;
