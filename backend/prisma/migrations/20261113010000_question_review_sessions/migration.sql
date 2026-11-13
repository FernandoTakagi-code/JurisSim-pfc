-- Reviews are separate from Simulado/Resposta: they never rewrite original performance.
CREATE TABLE "SessaoRevisaoQuestao" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "disciplina" TEXT NOT NULL,
  "assunto" TEXT,
  "filtro" TEXT NOT NULL,
  "conteudo" JSONB NOT NULL,
  "respostas" JSONB NOT NULL DEFAULT '{}',
  "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizadaEm" TIMESTAMP(3),
  CONSTRAINT "SessaoRevisaoQuestao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessaoRevisaoQuestao_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SessaoRevisaoQuestao_filtro_check" CHECK ("filtro" IN ('all', 'incorrect')),
  CONSTRAINT "SessaoRevisaoQuestao_conteudo_check" CHECK (jsonb_typeof("conteudo")='array' AND jsonb_array_length("conteudo") BETWEEN 1 AND 20),
  CONSTRAINT "SessaoRevisaoQuestao_respostas_check" CHECK (jsonb_typeof("respostas")='object')
);
CREATE INDEX "SessaoRevisaoQuestao_alunoId_criadaEm_idx" ON "SessaoRevisaoQuestao"("alunoId", "criadaEm");
ALTER TABLE "SessaoRevisaoQuestao" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SessaoRevisaoQuestao" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "SessaoRevisaoQuestao" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "SessaoRevisaoQuestao" FROM authenticated; END IF;
END $$;
