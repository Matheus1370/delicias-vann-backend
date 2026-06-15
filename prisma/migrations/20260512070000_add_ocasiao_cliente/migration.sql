-- CreateTable
CREATE TABLE "ocasioes_cliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "diaMes" TEXT NOT NULL,
    "ano" INTEGER,
    "pedidoOriginalId" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ultimoLembreteAno" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ocasioes_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ocasioes_cliente_clienteId_diaMes_idx" ON "ocasioes_cliente"("clienteId", "diaMes");

-- CreateIndex
CREATE INDEX "ocasioes_cliente_ativa_diaMes_idx" ON "ocasioes_cliente"("ativa", "diaMes");

-- AddForeignKey
ALTER TABLE "ocasioes_cliente" ADD CONSTRAINT "ocasioes_cliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
