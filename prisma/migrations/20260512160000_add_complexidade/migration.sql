-- AlterEnum
ALTER TYPE "PedidoStatus" ADD VALUE 'AGUARDANDO_AVALIACAO_COMPLEXIDADE' BEFORE 'AGUARDANDO_PAGAMENTO';

-- AlterTable
ALTER TABLE "itens_pedido"
  ADD COLUMN "imagensReferencia" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "custoComplexidade" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "complexidadeNotas" TEXT,
  ADD COLUMN "complexidadeAvaliadaEm" TIMESTAMP(3);
