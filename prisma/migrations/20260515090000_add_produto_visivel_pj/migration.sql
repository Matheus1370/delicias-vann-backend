-- AlterTable
ALTER TABLE "produtos" ADD COLUMN "visivelPJ" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "produtos_visivelPJ_ativo_idx" ON "produtos"("visivelPJ", "ativo");
