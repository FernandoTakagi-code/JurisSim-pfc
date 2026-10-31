-- Additive class/exam management; preserve all prior rows and migrations.
ALTER TYPE "TipoSimulado" ADD VALUE 'AVALIACAO';
ALTER TABLE "Turma" ADD COLUMN "archivedAt" TIMESTAMP(3), ADD COLUMN "conviteExpiraEm" TIMESTAMP(3);
CREATE TABLE "Avaliacao" (
  "id" TEXT NOT NULL, "titulo" TEXT NOT NULL, "descricao" TEXT NOT NULL DEFAULT '',
  "duracaoSegundos" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3), "autorId" TEXT NOT NULL,
  CONSTRAINT "Avaliacao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Avaliacao_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "AvaliacaoQuestao" (
  "id" TEXT NOT NULL, "avaliacaoId" TEXT NOT NULL, "questaoId" TEXT NOT NULL, "posicao" INTEGER NOT NULL,
  CONSTRAINT "AvaliacaoQuestao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AvaliacaoQuestao_avaliacaoId_fkey" FOREIGN KEY ("avaliacaoId") REFERENCES "Avaliacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AvaliacaoQuestao_questaoId_fkey" FOREIGN KEY ("questaoId") REFERENCES "Questao"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AvaliacaoQuestao_avaliacaoId_questaoId_key" ON "AvaliacaoQuestao"("avaliacaoId", "questaoId");
CREATE UNIQUE INDEX "AvaliacaoQuestao_avaliacaoId_posicao_key" ON "AvaliacaoQuestao"("avaliacaoId", "posicao");
CREATE INDEX "AvaliacaoQuestao_questaoId_idx" ON "AvaliacaoQuestao"("questaoId");
CREATE INDEX "Avaliacao_autorId_createdAt_id_idx" ON "Avaliacao"("autorId", "createdAt", "id");
CREATE TABLE "_AvaliacaoToTurma" (
  "A" TEXT NOT NULL, "B" TEXT NOT NULL,
  CONSTRAINT "_AvaliacaoToTurma_AB_pkey" PRIMARY KEY ("A", "B"),
  CONSTRAINT "_AvaliacaoToTurma_A_fkey" FOREIGN KEY ("A") REFERENCES "Avaliacao"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "_AvaliacaoToTurma_B_fkey" FOREIGN KEY ("B") REFERENCES "Turma"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "_AvaliacaoToTurma_B_index" ON "_AvaliacaoToTurma"("B");
ALTER TABLE "Simulado" ADD COLUMN "avaliacaoId" TEXT;
ALTER TABLE "Simulado" ADD CONSTRAINT "Simulado_avaliacaoId_fkey" FOREIGN KEY ("avaliacaoId") REFERENCES "Avaliacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Simulado_avaliacaoId_alunoId_key" ON "Simulado"("avaliacaoId", "alunoId");
