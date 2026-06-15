-- CreateTable
CREATE TABLE "bolos_inspiracao" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "fotoUrl" TEXT NOT NULL,
    "tagsMassa" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tagsRecheio" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tagsCobertura" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tagsTopo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ocasiao" TEXT,
    "publicado" BOOLEAN NOT NULL DEFAULT true,
    "pedidoOrigemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bolos_inspiracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bolos_inspiracao_pedidoOrigemId_key" ON "bolos_inspiracao"("pedidoOrigemId");
CREATE INDEX "bolos_inspiracao_publicado_createdAt_idx" ON "bolos_inspiracao"("publicado", "createdAt" DESC);
CREATE INDEX "bolos_inspiracao_ocasiao_publicado_idx" ON "bolos_inspiracao"("ocasiao", "publicado");
