-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CLIENTE_EMPRESA' AFTER 'CLIENTE';

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "cnpj" VARCHAR(18) NOT NULL,
    "nomeFantasia" TEXT,
    "contatoPadraoId" TEXT NOT NULL,
    "condicaoPagamento" TEXT,
    "descontoPadrao" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");

-- CreateIndex
CREATE INDEX "empresas_contatoPadraoId_idx" ON "empresas"("contatoPadraoId");

-- CreateIndex
CREATE INDEX "empresas_status_idx" ON "empresas"("status");

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_contatoPadraoId_fkey" FOREIGN KEY ("contatoPadraoId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN "empresaId" TEXT;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
