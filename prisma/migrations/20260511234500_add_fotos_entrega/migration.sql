-- CreateTable
CREATE TABLE "fotos_entrega" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "legenda" TEXT,
    "enviadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotos_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fotos_entrega_pedidoId_idx" ON "fotos_entrega"("pedidoId");

-- AddForeignKey
ALTER TABLE "fotos_entrega" ADD CONSTRAINT "fotos_entrega_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
