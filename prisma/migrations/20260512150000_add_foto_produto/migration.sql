-- CreateEnum
CREATE TYPE "TipoFotoProduto" AS ENUM ('PRINCIPAL', 'CORTADO', 'DETALHE');

-- CreateTable
CREATE TABLE "fotos_produto" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tipo" "TipoFotoProduto" NOT NULL DEFAULT 'DETALHE',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotos_produto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fotos_produto_produtoId_ordem_idx" ON "fotos_produto"("produtoId", "ordem");

-- AddForeignKey
ALTER TABLE "fotos_produto" ADD CONSTRAINT "fotos_produto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
