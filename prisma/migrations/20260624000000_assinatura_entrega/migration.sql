-- AddColumn modalidadeEntrega com default compatível com dados existentes
ALTER TABLE "assinaturas"
  ADD COLUMN IF NOT EXISTS "modalidadeEntrega" "EntregaModalidade" NOT NULL DEFAULT 'RETIRADA_BALCAO',
  ADD COLUMN IF NOT EXISTS "enderecoEntregaId" TEXT;

-- AddForeignKey
ALTER TABLE "assinaturas"
  ADD CONSTRAINT "assinaturas_enderecoEntregaId_fkey"
  FOREIGN KEY ("enderecoEntregaId")
  REFERENCES "enderecos"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
