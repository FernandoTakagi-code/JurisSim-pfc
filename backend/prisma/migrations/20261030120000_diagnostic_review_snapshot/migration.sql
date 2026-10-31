-- Preserve the exact question version shown in newly created diagnostics.
-- Historical rows remain NULL and use their still-linked question content.
ALTER TABLE "QuestaoSimulado"
ADD COLUMN "conteudoSnapshot" JSONB;
