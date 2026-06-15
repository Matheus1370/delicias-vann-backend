-- CreateEnum
CREATE TYPE "MovimentacaoVitrineTipo" AS ENUM ('ENTRADA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'QUEBRA_DESPERDICIO', 'SAIDA_VENDA');

-- CreateTable
CREATE TABLE "movimentacoes_vitrine" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "tipo" "MovimentacaoVitrineTipo" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "motivo" TEXT,
    "vendaId" TEXT,
    "operadorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_vitrine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimentacoes_vitrine_produtoId_createdAt_idx" ON "movimentacoes_vitrine"("produtoId", "createdAt");

-- AddForeignKey
ALTER TABLE "movimentacoes_vitrine" ADD CONSTRAINT "movimentacoes_vitrine_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
