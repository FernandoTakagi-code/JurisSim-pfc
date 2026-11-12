-- Own identity keeps individual mixed exams separate from practice and class assessments.
CREATE TABLE "SessaoSimuladoIndividual" (
  "id" TEXT NOT NULL,
  "simuladoId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessaoSimuladoIndividual_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessaoSimuladoIndividual_simuladoId_key" UNIQUE ("simuladoId"),
  CONSTRAINT "SessaoIndividual_simuladoId_alunoId_key" UNIQUE ("simuladoId", "alunoId"),
  CONSTRAINT "SessaoIndividual_simuladoId_alunoId_fkey" FOREIGN KEY ("simuladoId", "alunoId") REFERENCES "Simulado"("id", "alunoId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SessaoIndividual_alunoId_criadaEm_idx" ON "SessaoSimuladoIndividual"("alunoId", "criadaEm");

-- Session identities are accessed through the authenticated backend only.
ALTER TABLE "SessaoSimuladoIndividual" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SessaoSimuladoIndividual" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON TABLE "SessaoSimuladoIndividual" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON TABLE "SessaoSimuladoIndividual" FROM authenticated;
  END IF;
END $$;
