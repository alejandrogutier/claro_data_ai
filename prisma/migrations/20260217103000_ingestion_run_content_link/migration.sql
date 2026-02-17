-- CreateTable
CREATE TABLE "public"."IngestionRunContentLink" (
    "id" UUID NOT NULL,
    "ingestionRunId" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionRunContentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestionRunContentLink_ingestionRunId_canonicalUrl_key"
ON "public"."IngestionRunContentLink"("ingestionRunId", "canonicalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionRunContentLink_ingestionRunId_contentItemId_key"
ON "public"."IngestionRunContentLink"("ingestionRunId", "contentItemId");

-- CreateIndex
CREATE INDEX "IngestionRunContentLink_contentItemId_idx"
ON "public"."IngestionRunContentLink"("contentItemId");

-- CreateIndex
CREATE INDEX "IngestionRunContentLink_createdAt_idx"
ON "public"."IngestionRunContentLink"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."IngestionRunContentLink"
ADD CONSTRAINT "IngestionRunContentLink_ingestionRunId_fkey"
FOREIGN KEY ("ingestionRunId") REFERENCES "public"."IngestionRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IngestionRunContentLink"
ADD CONSTRAINT "IngestionRunContentLink_contentItemId_fkey"
FOREIGN KEY ("contentItemId") REFERENCES "public"."ContentItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
