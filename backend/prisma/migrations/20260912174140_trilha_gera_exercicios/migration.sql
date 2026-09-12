/*
  Warnings:

  - A unique constraint covering the columns `[simuladoGeradoId]` on the table `TrilhaAdaptativa` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "TrilhaAdaptativa" ADD COLUMN     "simuladoGeradoId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "nivelAtual" "Nivel";

-- CreateIndex
CREATE UNIQUE INDEX "TrilhaAdaptativa_simuladoGeradoId_key" ON "TrilhaAdaptativa"("simuladoGeradoId");

-- AddForeignKey
ALTER TABLE "TrilhaAdaptativa" ADD CONSTRAINT "TrilhaAdaptativa_simuladoGeradoId_fkey" FOREIGN KEY ("simuladoGeradoId") REFERENCES "Simulado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
