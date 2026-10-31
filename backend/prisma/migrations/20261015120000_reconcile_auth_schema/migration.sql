-- Reconcile the committed migration history with schema.prisma.
-- Additive only: retain historical audit labels and all existing rows.
-- Requires PostgreSQL 12+ (ADD VALUE inside a transaction). New labels are
-- not used until this transaction has committed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "User"
  ALTER COLUMN "senhaHash" DROP NOT NULL,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

CREATE TABLE "AuthToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "type" "AuthTokenType" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");
CREATE INDEX "AuthToken_tokenHash_idx" ON "AuthToken"("tokenHash");

ALTER TYPE "AuditAction" ADD VALUE 'EMAIL_CONFIRMADO';
ALTER TYPE "AuditAction" ADD VALUE 'SENHA_REDEFINIDA';
ALTER TYPE "AuditAction" ADD VALUE 'CONTA_EXCLUIDA';
ALTER TYPE "AuditAction" ADD VALUE 'RECUPERACAO_SENHA_SOLICITADA';

COMMIT;
