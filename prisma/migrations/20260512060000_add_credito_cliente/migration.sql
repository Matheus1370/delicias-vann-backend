-- CreateTable
CREATE TABLE "creditos_cliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "valorUsado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "motivo" TEXT NOT NULL,
    "pedidoOrigemId" TEXT,
    "expiraEm" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creditos_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creditos_cliente_clienteId_ativo_idx" ON "creditos_cliente"("clienteId", "ativo");

-- CreateIndex
CREATE INDEX "creditos_cliente_expiraEm_idx" ON "creditos_cliente"("expiraEm");

-- AddForeignKey
ALTER TABLE "creditos_cliente" ADD CONSTRAINT "creditos_cliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN "valorCreditoUsado" DECIMAL(10,2) NOT NULL DEFAULT 0;
