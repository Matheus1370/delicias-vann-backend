ALTER TABLE "produtos" ADD COLUMN "precoPorKg" DECIMAL(10,2);

ALTER TABLE "opcoes_montagem" ADD COLUMN "precoExtraPorKg" DECIMAL(8,2) NOT NULL DEFAULT 0;

ALTER TABLE "itens_pedido" ADD COLUMN "pesoKg" DECIMAL(5,2);
