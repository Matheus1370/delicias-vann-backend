-- CreateTable
CREATE TABLE "bastidor_posts" (
    "id" TEXT NOT NULL,
    "imagemUrl" TEXT NOT NULL,
    "legenda" TEXT,
    "linkInstagram" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bastidor_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bastidor_posts_ativo_ordem_idx" ON "bastidor_posts"("ativo", "ordem");
