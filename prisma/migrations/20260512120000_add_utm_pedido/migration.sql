-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "pedidos" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "pedidos" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "pedidos" ADD COLUMN "utmContent" TEXT;

-- CreateIndex
CREATE INDEX "pedidos_utmSource_idx" ON "pedidos"("utmSource");
CREATE INDEX "pedidos_utmCampaign_idx" ON "pedidos"("utmCampaign");
