-- Separate link/attempt records let an instructor reuse only their own
-- objective questions in exams without inserting into the official bank.
CREATE TABLE "AvaliacaoQuestaoDocente" (
  "id" TEXT NOT NULL,
  "avaliacaoId" TEXT NOT NULL,
  "questaoDocenteId" TEXT NOT NULL,
  "posicao" INTEGER NOT NULL,
  "conteudoSnapshot" JSONB,
  CONSTRAINT "AvaliacaoQuestaoDocente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AvaliacaoQuestaoDocente_avaliacaoId_questaoDocenteId_key" ON "AvaliacaoQuestaoDocente"("avaliacaoId", "questaoDocenteId");
CREATE UNIQUE INDEX "AvaliacaoQuestaoDocente_avaliacaoId_posicao_key" ON "AvaliacaoQuestaoDocente"("avaliacaoId", "posicao");
CREATE INDEX "AvaliacaoQuestaoDocente_questaoDocenteId_idx" ON "AvaliacaoQuestaoDocente"("questaoDocenteId");
ALTER TABLE "AvaliacaoQuestaoDocente" ADD CONSTRAINT "AvaliacaoQuestaoDocente_avaliacaoId_fkey" FOREIGN KEY ("avaliacaoId") REFERENCES "Avaliacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AvaliacaoQuestaoDocente" ADD CONSTRAINT "AvaliacaoQuestaoDocente_questaoDocenteId_fkey" FOREIGN KEY ("questaoDocenteId") REFERENCES "QuestaoDocente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "QuestaoSimuladoDocente" (
  "id" TEXT NOT NULL,
  "posicao" INTEGER NOT NULL,
  "simuladoId" TEXT NOT NULL,
  "questaoDocenteId" TEXT NOT NULL,
  "conteudoSnapshot" JSONB NOT NULL,
  CONSTRAINT "QuestaoSimuladoDocente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestaoSimuladoDocente_simuladoId_questaoDocenteId_key" ON "QuestaoSimuladoDocente"("simuladoId", "questaoDocenteId");
CREATE UNIQUE INDEX "QuestaoSimuladoDocente_simuladoId_posicao_key" ON "QuestaoSimuladoDocente"("simuladoId", "posicao");
CREATE INDEX "QuestaoSimuladoDocente_questaoDocenteId_idx" ON "QuestaoSimuladoDocente"("questaoDocenteId");
ALTER TABLE "QuestaoSimuladoDocente" ADD CONSTRAINT "QuestaoSimuladoDocente_simuladoId_fkey" FOREIGN KEY ("simuladoId") REFERENCES "Simulado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestaoSimuladoDocente" ADD CONSTRAINT "QuestaoSimuladoDocente_questaoDocenteId_fkey" FOREIGN KEY ("questaoDocenteId") REFERENCES "QuestaoDocente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RespostaSimuladoDocente" (
  "id" TEXT NOT NULL,
  "questaoSimuladoDocenteId" TEXT NOT NULL,
  "alternativaEscolhidaId" TEXT,
  "correta" BOOLEAN NOT NULL,
  "respondidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RespostaSimuladoDocente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RespostaSimuladoDocente_questaoSimuladoDocenteId_key" ON "RespostaSimuladoDocente"("questaoSimuladoDocenteId");
ALTER TABLE "RespostaSimuladoDocente" ADD CONSTRAINT "RespostaSimuladoDocente_questaoSimuladoDocenteId_fkey" FOREIGN KEY ("questaoSimuladoDocenteId") REFERENCES "QuestaoSimuladoDocente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
