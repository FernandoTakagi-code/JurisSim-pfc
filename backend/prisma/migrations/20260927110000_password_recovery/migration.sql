ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_RECOVERY_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_RECOVERY_COMPLETED';

CREATE TABLE "PasswordRecoveryToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordRecoveryToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordRecoveryToken_tokenHash_key" ON "PasswordRecoveryToken"("tokenHash");
CREATE INDEX "PasswordRecoveryToken_userId_createdAt_idx" ON "PasswordRecoveryToken"("userId", "createdAt");
CREATE INDEX "PasswordRecoveryToken_expiresAt_idx" ON "PasswordRecoveryToken"("expiresAt");

ALTER TABLE "PasswordRecoveryToken"
ADD CONSTRAINT "PasswordRecoveryToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
