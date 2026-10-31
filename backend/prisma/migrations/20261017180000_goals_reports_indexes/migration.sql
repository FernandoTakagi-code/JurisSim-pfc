-- Additive indexes only. Keep all goals, responses and earlier migrations intact.
CREATE INDEX "MetaDiaria_alunoId_data_id_idx" ON "MetaDiaria"("alunoId", "data", "id");
CREATE INDEX "Resposta_simuladoId_respondidoEm_idx" ON "Resposta"("simuladoId", "respondidoEm");
