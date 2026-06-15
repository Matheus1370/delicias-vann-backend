-- AlterTable: array de enum com default em postgres usa o nome do tipo entre []
ALTER TABLE "produtos" ADD COLUMN "modalidadesPermitidas" "EntregaModalidade"[] DEFAULT ARRAY['RETIRADA_BALCAO','MOTOBOY_LOCAL','UBER_DIRECT','NOVENTA_NOVE_ENTREGAS']::"EntregaModalidade"[];
