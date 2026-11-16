-- Class materials and announcements. Rows are retained with class history;
-- only active class members or assigned staff can read them through the API.
CREATE TABLE "MaterialTurma" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "professorId" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL DEFAULT '',
  "url" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaterialTurma_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaterialTurma_url_check" CHECK ("url" ~ '^https://')
);
CREATE INDEX "MaterialTurma_classId_createdAt_id_idx" ON "MaterialTurma"("classId", "createdAt", "id");
CREATE INDEX "MaterialTurma_professorId_updatedAt_idx" ON "MaterialTurma"("professorId", "updatedAt");
ALTER TABLE "MaterialTurma" ADD CONSTRAINT "MaterialTurma_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialTurma" ADD CONSTRAINT "MaterialTurma_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AvisoTurma" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "professorId" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "conteudo" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvisoTurma_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AvisoTurma_classId_createdAt_id_idx" ON "AvisoTurma"("classId", "createdAt", "id");
CREATE INDEX "AvisoTurma_professorId_updatedAt_idx" ON "AvisoTurma"("professorId", "updatedAt");
ALTER TABLE "AvisoTurma" ADD CONSTRAINT "AvisoTurma_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AvisoTurma" ADD CONSTRAINT "AvisoTurma_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
