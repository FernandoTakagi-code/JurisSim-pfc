-- Extensao aditiva da Trilha B. Nao remove nem altera dados existentes.
CREATE TYPE "TipoMetricaDiagnostico" AS ENUM ('DISCIPLINA', 'ASSUNTO', 'NIVEL', 'ASSUNTO_E_NIVEL');

CREATE TABLE "QuestaoSimulado" (
    "id" TEXT NOT NULL, "posicao" INTEGER NOT NULL, "simuladoId" TEXT NOT NULL, "questaoId" TEXT NOT NULL,
    CONSTRAINT "QuestaoSimulado_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DesempenhoDiagnostico" (
    "id" TEXT NOT NULL, "simuladoId" TEXT NOT NULL, "tipo" "TipoMetricaDiagnostico" NOT NULL,
    "disciplina" TEXT NOT NULL, "assunto" TEXT, "nivel" "Nivel", "acertos" INTEGER NOT NULL,
    "totalQuestoes" INTEGER NOT NULL, "percentual" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "DesempenhoDiagnostico_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TrilhaAdaptativa" (
    "id" TEXT NOT NULL, "simuladoId" TEXT NOT NULL, "disciplinaPrioritaria" TEXT NOT NULL,
    "assuntoPrioritario" TEXT, "nivelRecomendado" "Nivel" NOT NULL, "quantidadeRecomendada" INTEGER NOT NULL,
    "justificativa" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrilhaAdaptativa_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Resposta" ADD COLUMN "questaoSimuladoId" TEXT;

CREATE UNIQUE INDEX "QuestaoSimulado_simuladoId_questaoId_key" ON "QuestaoSimulado"("simuladoId", "questaoId");
CREATE UNIQUE INDEX "QuestaoSimulado_simuladoId_posicao_key" ON "QuestaoSimulado"("simuladoId", "posicao");
CREATE UNIQUE INDEX "Resposta_questaoSimuladoId_key" ON "Resposta"("questaoSimuladoId");
CREATE INDEX "DesempenhoDiagnostico_simuladoId_tipo_idx" ON "DesempenhoDiagnostico"("simuladoId", "tipo");
CREATE UNIQUE INDEX "TrilhaAdaptativa_simuladoId_key" ON "TrilhaAdaptativa"("simuladoId");

ALTER TABLE "QuestaoSimulado" ADD CONSTRAINT "QuestaoSimulado_simuladoId_fkey" FOREIGN KEY ("simuladoId") REFERENCES "Simulado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestaoSimulado" ADD CONSTRAINT "QuestaoSimulado_questaoId_fkey" FOREIGN KEY ("questaoId") REFERENCES "Questao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Resposta" ADD CONSTRAINT "Resposta_questaoSimuladoId_fkey" FOREIGN KEY ("questaoSimuladoId") REFERENCES "QuestaoSimulado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DesempenhoDiagnostico" ADD CONSTRAINT "DesempenhoDiagnostico_simuladoId_fkey" FOREIGN KEY ("simuladoId") REFERENCES "Simulado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrilhaAdaptativa" ADD CONSTRAINT "TrilhaAdaptativa_simuladoId_fkey" FOREIGN KEY ("simuladoId") REFERENCES "Simulado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
