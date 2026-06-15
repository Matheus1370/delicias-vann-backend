-- CreateTable
CREATE TABLE "janelas_sazonais" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "antecedenciaMinDias" INTEGER NOT NULL DEFAULT 0,
    "bloquearCustomizacao" BOOLEAN NOT NULL DEFAULT false,
    "capacidadeReduzida" DECIMAL(3,2),
    "aviso" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "janelas_sazonais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "janelas_sazonais_inicio_fim_idx" ON "janelas_sazonais"("inicio", "fim");
CREATE INDEX "janelas_sazonais_ativa_idx" ON "janelas_sazonais"("ativa");
