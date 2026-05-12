-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN "horaFestaPrevista" TIMESTAMP(3);
ALTER TABLE "pedidos" ADD COLUMN "bufferHorasAntes" INTEGER NOT NULL DEFAULT 2;
