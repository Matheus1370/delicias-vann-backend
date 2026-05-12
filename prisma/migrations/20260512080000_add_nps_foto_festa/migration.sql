-- AlterTable
ALTER TABLE "avaliacoes" ADD COLUMN "notaNPS" INTEGER;
ALTER TABLE "avaliacoes" ADD COLUMN "fotoFesta" TEXT;
ALTER TABLE "avaliacoes" ADD COLUMN "permiteUsoFoto" BOOLEAN NOT NULL DEFAULT false;
