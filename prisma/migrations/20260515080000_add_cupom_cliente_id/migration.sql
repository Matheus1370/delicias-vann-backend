-- AlterTable
ALTER TABLE "cupons" ADD COLUMN "clienteId" TEXT;

-- CreateIndex
CREATE INDEX "cupons_clienteId_idx" ON "cupons"("clienteId");

-- AddForeignKey
ALTER TABLE "cupons" ADD CONSTRAINT "cupons_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
