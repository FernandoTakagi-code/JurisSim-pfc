CREATE TABLE "ClassActivity" (
  "id" TEXT NOT NULL,
  "evaluationId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "maxPoints" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "closedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "ClassActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassActivity_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Avaliacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassActivity_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClassActivity_evaluationId_key" ON "ClassActivity"("evaluationId");
CREATE INDEX "ClassActivity_classId_dueAt_id_idx" ON "ClassActivity"("classId", "dueAt", "id");
ALTER TABLE "ClassActivity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ClassActivity" FROM PUBLIC;

CREATE TABLE "ClassExamSettings" (
  "evaluationId" TEXT NOT NULL,
  "expectedQuestions" INTEGER NOT NULL,
  "closedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "ClassExamSettings_pkey" PRIMARY KEY ("evaluationId"),
  CONSTRAINT "ClassExamSettings_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Avaliacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassExamSettings_quantity_check" CHECK ("expectedQuestions" BETWEEN 1 AND 80)
);
ALTER TABLE "ClassExamSettings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ClassExamSettings" FROM PUBLIC;
