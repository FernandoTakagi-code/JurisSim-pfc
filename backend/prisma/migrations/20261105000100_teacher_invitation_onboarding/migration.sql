-- Additive only. Review and authorize separately before applying to a shared DB.
BEGIN;
-- Widen the existing state constraint; every previously valid state stays valid.
ALTER TABLE "TeacherInvitation" DROP CONSTRAINT "TeacherInvitation_status_check";
ALTER TABLE "TeacherInvitation" ADD CONSTRAINT "TeacherInvitation_status_check"
  CHECK (status IN ('PENDING','ACCEPTED','CANCELLED','DECLINED'));
ALTER TABLE "TeacherInvitation" ADD COLUMN "invitedName" TEXT;
CREATE TABLE "TeacherInvitationClass" (
  "invitationId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  CONSTRAINT "TeacherInvitationClass_pkey" PRIMARY KEY ("invitationId", "classId"),
  CONSTRAINT "TeacherInvitationClass_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "TeacherInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeacherInvitationClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TeacherInvitationClass_classId_idx" ON "TeacherInvitationClass"("classId");
CREATE TABLE "InvitationOnboarding" (
  "id" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "proofHash" TEXT NOT NULL,
  "initialPasswordHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sendAttempts" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvitationOnboarding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvitationOnboarding_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "TeacherInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InvitationOnboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InvitationOnboarding_invitationId_key" ON "InvitationOnboarding"("invitationId");
CREATE UNIQUE INDEX "InvitationOnboarding_userId_key" ON "InvitationOnboarding"("userId");
CREATE UNIQUE INDEX "InvitationOnboarding_proofHash_key" ON "InvitationOnboarding"("proofHash");
ALTER TABLE "TeacherInvitationClass" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvitationOnboarding" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TeacherInvitationClass", "InvitationOnboarding" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "TeacherInvitationClass", "InvitationOnboarding" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "TeacherInvitationClass", "InvitationOnboarding" FROM authenticated;
  END IF;
END $$;
COMMIT;
