-- Additive indexes for student-scoped history pagination and completed results.
-- No existing records, tables, enums or historical migrations are changed.
CREATE INDEX "Simulado_alunoId_iniciadoEm_id_idx" ON "Simulado"("alunoId", "iniciadoEm", "id");
CREATE INDEX "Simulado_alunoId_finalizadoEm_id_idx" ON "Simulado"("alunoId", "finalizadoEm", "id");
