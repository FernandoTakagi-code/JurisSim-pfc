CREATE TABLE "ClassLifecycle" (
  "classId" TEXT NOT NULL,
  "createdById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "deletedById" TEXT,
  CONSTRAINT "ClassLifecycle_pkey" PRIMARY KEY ("classId"),
  CONSTRAINT "ClassLifecycle_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ClassLifecycle_deletedAt_idx" ON "ClassLifecycle"("deletedAt");
ALTER TABLE "ClassLifecycle" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ClassLifecycle" FROM PUBLIC;
-- Preserve legacy classes and unknown ownership. No backfill assumes authorship.
