BEGIN;

-- CreateTable
-- Additive migration. Apply only after explicit authorization for the shared DB.
-- Existing users, enrollment, questions, attempts and histories are untouched.
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "responsibleName" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionalMembership" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstitutionalMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherInvitation" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "acceptedById" TEXT,

    CONSTRAINT "TeacherInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionalClass" (
    "classId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,

    CONSTRAINT "InstitutionalClass_pkey" PRIMARY KEY ("classId")
);

-- CreateTable
CREATE TABLE "ClassJoinRequest" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ClassJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountControl" (
    "userId" TEXT NOT NULL,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountControl_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AdministrativeEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event" TEXT NOT NULL,
    "actorId" TEXT,
    "institutionId" TEXT,
    "resourceId" TEXT,
    "result" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',

    CONSTRAINT "AdministrativeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdministrativeNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "AdministrativeNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Institution_registrationNumber_key" ON "Institution"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_email_key" ON "Institution"("email");

-- CreateIndex
CREATE INDEX "Institution_ownerId_status_idx" ON "Institution"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Institution_status_createdAt_id_idx" ON "Institution"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "InstitutionalMembership_userId_active_idx" ON "InstitutionalMembership"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionalMembership_institutionId_userId_role_key" ON "InstitutionalMembership"("institutionId", "userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherInvitation_tokenHash_key" ON "TeacherInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "TeacherInvitation_institutionId_createdAt_id_idx" ON "TeacherInvitation"("institutionId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "InstitutionalClass_institutionId_idx" ON "InstitutionalClass"("institutionId");

-- CreateIndex
CREATE INDEX "ClassJoinRequest_classId_status_createdAt_id_idx" ON "ClassJoinRequest"("classId", "status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ClassJoinRequest_classId_studentId_key" ON "ClassJoinRequest"("classId", "studentId");

-- CreateIndex
CREATE INDEX "AdministrativeEvent_institutionId_occurredAt_id_idx" ON "AdministrativeEvent"("institutionId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "AdministrativeEvent_actorId_occurredAt_id_idx" ON "AdministrativeEvent"("actorId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "AdministrativeEvent_event_occurredAt_id_idx" ON "AdministrativeEvent"("event", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "AdministrativeNotification_userId_createdAt_id_idx" ON "AdministrativeNotification"("userId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "Institution" ADD CONSTRAINT "Institution_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionalMembership" ADD CONSTRAINT "InstitutionalMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionalMembership" ADD CONSTRAINT "InstitutionalMembership_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherInvitation" ADD CONSTRAINT "TeacherInvitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherInvitation" ADD CONSTRAINT "TeacherInvitation_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionalClass" ADD CONSTRAINT "InstitutionalClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionalClass" ADD CONSTRAINT "InstitutionalClass_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassJoinRequest" ADD CONSTRAINT "ClassJoinRequest_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassJoinRequest" ADD CONSTRAINT "ClassJoinRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountControl" ADD CONSTRAINT "AccountControl_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrativeEvent" ADD CONSTRAINT "AdministrativeEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrativeEvent" ADD CONSTRAINT "AdministrativeEvent_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrativeNotification" ADD CONSTRAINT "AdministrativeNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- State invariants and duplicate pending invitations under concurrent requests.
ALTER TABLE "Institution" ADD CONSTRAINT "Institution_status_check" CHECK (status IN ('EMAIL_PENDING','PENDING','ACTIVE','REJECTED','SUSPENDED'));
ALTER TABLE "InstitutionalMembership" ADD CONSTRAINT "InstitutionalMembership_role_check" CHECK (role IN ('INSTITUTION_ADMIN','TEACHER'));
ALTER TABLE "TeacherInvitation" ADD CONSTRAINT "TeacherInvitation_status_check" CHECK (status IN ('PENDING','ACCEPTED','CANCELLED'));
ALTER TABLE "ClassJoinRequest" ADD CONSTRAINT "ClassJoinRequest_status_check" CHECK (status IN ('PENDING','APPROVED','REJECTED','REMOVED'));
ALTER TABLE "AdministrativeEvent" ADD CONSTRAINT "AdministrativeEvent_severity_check" CHECK (severity IN ('INFO','WARN','ERROR'));
CREATE UNIQUE INDEX "TeacherInvitation_pending_email_key" ON "TeacherInvitation" ("institutionId",email) WHERE status = 'PENDING';
CREATE UNIQUE INDEX "Institution_name_normalized_key" ON "Institution" (lower(btrim(name)));

-- All access goes through the trusted backend. No browser role receives table
-- access, even when Supabase's default grants cover newly created tables.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Institution','InstitutionalMembership','TeacherInvitation','InstitutionalClass','ClassJoinRequest','AccountControl','AdministrativeEvent','AdministrativeNotification'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', table_name);
    END IF;
  END LOOP;
END $$;

-- Append-only audit history. The private maintenance command may delete only
-- records older than its configured retention cutoff (minimum 30 days).
CREATE FUNCTION jurissim_protect_administrative_events() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cutoff timestamptz;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    RAISE EXCEPTION 'Administrative audit records are append-only';
  END IF;
  cutoff := nullif(current_setting('jurissim.audit_retention_cutoff', true), '')::timestamptz;
  IF cutoff IS NULL OR cutoff > CURRENT_TIMESTAMP - interval '30 days' OR OLD."occurredAt" >= cutoff AT TIME ZONE 'UTC' THEN
    RAISE EXCEPTION 'Administrative audit deletion requires approved retention maintenance';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER "AdministrativeEvent_immutable" BEFORE UPDATE OR DELETE ON "AdministrativeEvent"
FOR EACH ROW EXECUTE FUNCTION jurissim_protect_administrative_events();
CREATE TRIGGER "AdministrativeEvent_no_truncate" BEFORE TRUNCATE ON "AdministrativeEvent"
FOR EACH STATEMENT EXECUTE FUNCTION jurissim_protect_administrative_events();

COMMIT;
