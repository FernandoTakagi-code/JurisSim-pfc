-- Existing accounts remain without acceptance; never fabricate historical consent.
BEGIN;
ALTER TABLE "User" ADD COLUMN "legalAcceptedAt" TIMESTAMP(3),
ADD COLUMN "termsVersion" TEXT,
ADD COLUMN "privacyVersion" TEXT;

CREATE TYPE "AuditAction" AS ENUM ('ACEITE_TERMOS_E_PRIVACIDADE');
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" "AuditAction" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "termsVersion" TEXT NOT NULL,
  "privacyVersion" TEXT NOT NULL,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_userId_occurredAt_idx" ON "AuditLog"("userId", "occurredAt");
COMMIT;
