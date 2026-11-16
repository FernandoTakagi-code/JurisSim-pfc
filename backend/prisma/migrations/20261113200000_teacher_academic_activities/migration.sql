-- New isolated professor-owned question/activity domain. Existing question bank
-- rows and migration files are untouched.
CREATE TABLE "QuestaoDocente" (
  "id" TEXT NOT NULL,
  "autorId" TEXT NOT NULL,
  "institutionId" TEXT,
  "tipo" TEXT NOT NULL,
  "enunciado" TEXT NOT NULL,
  "disciplina" TEXT NOT NULL,
  "assunto" TEXT NOT NULL,
  "nivel" "Nivel",
  "fundamentacao" TEXT,
  "arquivadaEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestaoDocente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuestaoDocente_tipo_check" CHECK ("tipo" IN ('OBJETIVA', 'DISSERTATIVA'))
);
CREATE INDEX "QuestaoDocente_autorId_arquivadaEm_updatedAt_idx" ON "QuestaoDocente"("autorId", "arquivadaEm", "updatedAt");
CREATE INDEX "QuestaoDocente_institutionId_arquivadaEm_idx" ON "QuestaoDocente"("institutionId", "arquivadaEm");
ALTER TABLE "QuestaoDocente" ADD CONSTRAINT "QuestaoDocente_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AlternativaDocente" (
  "id" TEXT NOT NULL,
  "questaoId" TEXT NOT NULL,
  "letra" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "correta" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "AlternativaDocente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AlternativaDocente_letra_check" CHECK ("letra" IN ('A', 'B', 'C', 'D', 'E'))
);
CREATE UNIQUE INDEX "AlternativaDocente_questaoId_letra_key" ON "AlternativaDocente"("questaoId", "letra");
CREATE INDEX "AlternativaDocente_questaoId_idx" ON "AlternativaDocente"("questaoId");
ALTER TABLE "AlternativaDocente" ADD CONSTRAINT "AlternativaDocente_questaoId_fkey" FOREIGN KEY ("questaoId") REFERENCES "QuestaoDocente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "QuestaoDocenteTurma" (
  "questaoId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  CONSTRAINT "QuestaoDocenteTurma_pkey" PRIMARY KEY ("questaoId", "classId")
);
CREATE INDEX "QuestaoDocenteTurma_classId_idx" ON "QuestaoDocenteTurma"("classId");
ALTER TABLE "QuestaoDocenteTurma" ADD CONSTRAINT "QuestaoDocenteTurma_questaoId_fkey" FOREIGN KEY ("questaoId") REFERENCES "QuestaoDocente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestaoDocenteTurma" ADD CONSTRAINT "QuestaoDocenteTurma_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Atividade" (
  "id" TEXT NOT NULL,
  "professorId" TEXT NOT NULL,
  "institutionId" TEXT,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
  "prazo" TIMESTAMP(3),
  "publicadaEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Atividade_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Atividade_status_check" CHECK ("status" IN ('RASCUNHO', 'PUBLICADA', 'ARQUIVADA'))
);
CREATE INDEX "Atividade_professorId_status_updatedAt_idx" ON "Atividade"("professorId", "status", "updatedAt");
CREATE INDEX "Atividade_institutionId_status_idx" ON "Atividade"("institutionId", "status");
ALTER TABLE "Atividade" ADD CONSTRAINT "Atividade_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AtividadeTurma" (
  "atividadeId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  CONSTRAINT "AtividadeTurma_pkey" PRIMARY KEY ("atividadeId", "classId")
);
CREATE INDEX "AtividadeTurma_classId_idx" ON "AtividadeTurma"("classId");
ALTER TABLE "AtividadeTurma" ADD CONSTRAINT "AtividadeTurma_atividadeId_fkey" FOREIGN KEY ("atividadeId") REFERENCES "Atividade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AtividadeTurma" ADD CONSTRAINT "AtividadeTurma_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AtividadeQuestao" (
  "id" TEXT NOT NULL,
  "atividadeId" TEXT NOT NULL,
  "questaoId" TEXT,
  "questaoDocenteId" TEXT,
  "posicao" INTEGER NOT NULL,
  "pontos" DECIMAL(8,2) NOT NULL DEFAULT 1,
  "conteudoSnapshot" JSONB NOT NULL,
  CONSTRAINT "AtividadeQuestao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AtividadeQuestao_source_check" CHECK (("questaoId" IS NOT NULL) <> ("questaoDocenteId" IS NOT NULL)),
  CONSTRAINT "AtividadeQuestao_pontos_check" CHECK ("pontos" > 0)
);
CREATE UNIQUE INDEX "AtividadeQuestao_atividadeId_posicao_key" ON "AtividadeQuestao"("atividadeId", "posicao");
CREATE UNIQUE INDEX "AtividadeQuestao_atividadeId_questaoId_key" ON "AtividadeQuestao"("atividadeId", "questaoId");
CREATE UNIQUE INDEX "AtividadeQuestao_atividadeId_questaoDocenteId_key" ON "AtividadeQuestao"("atividadeId", "questaoDocenteId");
CREATE INDEX "AtividadeQuestao_questaoId_idx" ON "AtividadeQuestao"("questaoId");
CREATE INDEX "AtividadeQuestao_questaoDocenteId_idx" ON "AtividadeQuestao"("questaoDocenteId");
ALTER TABLE "AtividadeQuestao" ADD CONSTRAINT "AtividadeQuestao_atividadeId_fkey" FOREIGN KEY ("atividadeId") REFERENCES "Atividade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AtividadeQuestao" ADD CONSTRAINT "AtividadeQuestao_questaoId_fkey" FOREIGN KEY ("questaoId") REFERENCES "Questao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AtividadeQuestao" ADD CONSTRAINT "AtividadeQuestao_questaoDocenteId_fkey" FOREIGN KEY ("questaoDocenteId") REFERENCES "QuestaoDocente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EntregaAtividade" (
  "id" TEXT NOT NULL,
  "atividadeId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
  "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enviadaEm" TIMESTAMP(3),
  "corrigidaEm" TIMESTAMP(3),
  "liberadaEm" TIMESTAMP(3),
  CONSTRAINT "EntregaAtividade_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EntregaAtividade_status_check" CHECK ("status" IN ('RASCUNHO', 'ENVIADA', 'CORRIGIDA', 'LIBERADA'))
);
CREATE UNIQUE INDEX "EntregaAtividade_atividadeId_alunoId_key" ON "EntregaAtividade"("atividadeId", "alunoId");
CREATE INDEX "EntregaAtividade_atividadeId_status_enviadaEm_idx" ON "EntregaAtividade"("atividadeId", "status", "enviadaEm");
CREATE INDEX "EntregaAtividade_alunoId_iniciadaEm_idx" ON "EntregaAtividade"("alunoId", "iniciadaEm");
ALTER TABLE "EntregaAtividade" ADD CONSTRAINT "EntregaAtividade_atividadeId_fkey" FOREIGN KEY ("atividadeId") REFERENCES "Atividade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntregaAtividade" ADD CONSTRAINT "EntregaAtividade_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RespostaAtividade" (
  "id" TEXT NOT NULL,
  "entregaId" TEXT NOT NULL,
  "atividadeQuestaoId" TEXT NOT NULL,
  "respostaObjetiva" TEXT,
  "respostaDissertativa" TEXT,
  "correta" BOOLEAN,
  "pontos" DECIMAL(8,2),
  "feedback" TEXT,
  "respondidaEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RespostaAtividade_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RespostaAtividade_one_answer_check" CHECK (NOT ("respostaObjetiva" IS NOT NULL AND "respostaDissertativa" IS NOT NULL)),
  CONSTRAINT "RespostaAtividade_pontos_check" CHECK ("pontos" IS NULL OR "pontos" >= 0)
);
CREATE UNIQUE INDEX "RespostaAtividade_entregaId_atividadeQuestaoId_key" ON "RespostaAtividade"("entregaId", "atividadeQuestaoId");
CREATE INDEX "RespostaAtividade_atividadeQuestaoId_idx" ON "RespostaAtividade"("atividadeQuestaoId");
ALTER TABLE "RespostaAtividade" ADD CONSTRAINT "RespostaAtividade_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "EntregaAtividade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RespostaAtividade" ADD CONSTRAINT "RespostaAtividade_atividadeQuestaoId_fkey" FOREIGN KEY ("atividadeQuestaoId") REFERENCES "AtividadeQuestao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Freeze official-bank assessment content at publication/migration time. The
-- professor-owned question links remain a separate relation and never mutate
-- the official question-bank contracts.
ALTER TABLE "AvaliacaoQuestao" ADD COLUMN "conteudoSnapshot" JSONB;

-- Freeze currently known historical content at migration time. New publications
-- will snapshot under a row lock in application code.
UPDATE "AvaliacaoQuestao" aq SET "conteudoSnapshot" = jsonb_build_object(
  'tipo', 'OBJETIVA', 'enunciado', q."enunciado", 'disciplina', q."disciplina",
  'assunto', q."assunto", 'nivel', q."nivel"::text,
  'alternativas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a."id", 'letra', a."letra", 'texto', a."texto", 'correta', a."correta") ORDER BY a."letra") FROM "Alternativa" a WHERE a."questaoId" = q."id"), '[]'::jsonb)
) FROM "Questao" q WHERE q."id" = aq."questaoId";

-- Existing assessment attempts receive the immutable version captured for the
-- published evaluation, so later edits to the shared bank do not rewrite an
-- in-progress or historical attempt.
UPDATE "QuestaoSimulado" qs SET "conteudoSnapshot" = aq."conteudoSnapshot"
FROM "Simulado" s JOIN "AvaliacaoQuestao" aq ON aq."avaliacaoId" = s."avaliacaoId"
WHERE s."id" = qs."simuladoId" AND aq."questaoId" = qs."questaoId"
  AND s."avaliacaoId" IS NOT NULL AND aq."conteudoSnapshot" IS NOT NULL;

