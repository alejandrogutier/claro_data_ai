-- AlterTable
ALTER TABLE "public"."TrackedTerm"
ADD COLUMN "awarioBindingId" UUID;

-- CreateTable
CREATE TABLE "public"."AwarioMentionFeedItem" (
  "id" UUID NOT NULL,
  "bindingId" UUID NOT NULL,
  "termId" UUID NOT NULL,
  "awarioAlertId" TEXT NOT NULL,
  "awarioMentionId" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "medium" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "content" TEXT,
  "publishedAt" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AwarioMentionFeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedTerm_awarioBindingId_key" ON "public"."TrackedTerm"("awarioBindingId");

-- CreateIndex
CREATE UNIQUE INDEX "AwarioMentionFeedItem_bindingId_awarioMentionId_key"
ON "public"."AwarioMentionFeedItem"("bindingId", "awarioMentionId");

-- CreateIndex
CREATE INDEX "AwarioMentionFeedItem_termId_publishedAt_idx"
ON "public"."AwarioMentionFeedItem"("termId", "publishedAt");

-- CreateIndex
CREATE INDEX "AwarioMentionFeedItem_canonicalUrl_idx"
ON "public"."AwarioMentionFeedItem"("canonicalUrl");

-- CreateIndex
CREATE INDEX "AwarioMentionFeedItem_firstSeenAt_idx"
ON "public"."AwarioMentionFeedItem"("firstSeenAt");

-- AddForeignKey
ALTER TABLE "public"."TrackedTerm"
ADD CONSTRAINT "TrackedTerm_awarioBindingId_fkey"
FOREIGN KEY ("awarioBindingId") REFERENCES "public"."AwarioAlertBinding"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AwarioMentionFeedItem"
ADD CONSTRAINT "AwarioMentionFeedItem_bindingId_fkey"
FOREIGN KEY ("bindingId") REFERENCES "public"."AwarioAlertBinding"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AwarioMentionFeedItem"
ADD CONSTRAINT "AwarioMentionFeedItem_termId_fkey"
FOREIGN KEY ("termId") REFERENCES "public"."TrackedTerm"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
