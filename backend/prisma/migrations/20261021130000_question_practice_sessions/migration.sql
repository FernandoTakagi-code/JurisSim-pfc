CREATE TABLE "SessaoPratica" (
    "id" TEXT NOT NULL,
    "simuladoId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "disciplina" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessaoPratica_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SessaoPratica_simuladoId_key" UNIQUE ("simuladoId"),
    CONSTRAINT "SessaoPratica_simuladoId_alunoId_key" UNIQUE ("simuladoId", "alunoId"),
    CONSTRAINT "SessaoPratica_simuladoId_alunoId_fkey" FOREIGN KEY ("simuladoId", "alunoId") REFERENCES "Simulado"("id", "alunoId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SessaoPratica_alunoId_criadaEm_idx" ON "SessaoPratica"("alunoId", "criadaEm");