-- CreateTable
CREATE TABLE "configuracoes_entrega" (
    "id" TEXT NOT NULL,
    "modalidade" "EntregaModalidade" NOT NULL,
    "valorFreteBase" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "valorMinimoPedido" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "valorFreteGratisAcimaDe" DECIMAL(10,2),
    "raioKm" INTEGER,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_entrega_modalidade_key" ON "configuracoes_entrega"("modalidade");
