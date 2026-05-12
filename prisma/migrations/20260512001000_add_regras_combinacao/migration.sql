-- CreateTable
CREATE TABLE "regras_combinacao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "condicao" JSONB NOT NULL,
    "mensagem" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regras_combinacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regras_combinacao_ativa_idx" ON "regras_combinacao"("ativa");
