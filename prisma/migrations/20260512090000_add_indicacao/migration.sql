-- CreateTable
CREATE TABLE "indicacoes" (
    "id" TEXT NOT NULL,
    "indicadorId" TEXT NOT NULL,
    "indicadoEmail" TEXT,
    "indicadoUsuarioId" TEXT,
    "codigo" TEXT NOT NULL,
    "pedidoConvertidoId" TEXT,
    "cupomRecompensaId" TEXT,
    "recompensaValor" DECIMAL(8,2),
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indicacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "indicacoes_codigo_key" ON "indicacoes"("codigo");

-- CreateIndex
CREATE INDEX "indicacoes_indicadorId_idx" ON "indicacoes"("indicadorId");

-- CreateIndex
CREATE INDEX "indicacoes_indicadoUsuarioId_idx" ON "indicacoes"("indicadoUsuarioId");

-- AddForeignKey
ALTER TABLE "indicacoes" ADD CONSTRAINT "indicacoes_indicadorId_fkey" FOREIGN KEY ("indicadorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicacoes" ADD CONSTRAINT "indicacoes_indicadoUsuarioId_fkey" FOREIGN KEY ("indicadoUsuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
