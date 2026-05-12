-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN "janelaReembolsoHoras" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "pedidos" ADD COLUMN "valorReembolso" DECIMAL(10,2);
ALTER TABLE "pedidos" ADD COLUMN "valorCreditoFuturo" DECIMAL(10,2);
