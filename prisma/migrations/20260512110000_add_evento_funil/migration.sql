-- CreateTable
CREATE TABLE "eventos_funil" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "etapa" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_funil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventos_funil_sessaoId_createdAt_idx" ON "eventos_funil"("sessaoId", "createdAt");

-- CreateIndex
CREATE INDEX "eventos_funil_etapa_createdAt_idx" ON "eventos_funil"("etapa", "createdAt");
