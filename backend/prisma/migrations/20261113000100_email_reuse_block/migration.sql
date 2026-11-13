-- H4.24. Prepared only; do not apply to the shared Supabase project.
-- A row survives user anonymization so an administrative block cannot be
-- bypassed by registering the same normalized address concurrently.
CREATE TABLE "EmailReuseBlock" (
  "id" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "reason" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  CONSTRAINT "EmailReuseBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailReuseBlock_emailNormalized_key" ON "EmailReuseBlock"("emailNormalized");
CREATE INDEX "EmailReuseBlock_revokedAt_idx" ON "EmailReuseBlock"("revokedAt");
