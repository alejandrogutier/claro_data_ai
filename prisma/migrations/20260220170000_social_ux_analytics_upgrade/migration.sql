-- AlterTable
ALTER TABLE "public"."SocialPostMetric"
ADD COLUMN "campaignTaxonomyId" UUID;

-- CreateTable
CREATE TABLE "public"."Hashtag" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hashtag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SocialPostHashtag" (
    "id" UUID NOT NULL,
    "socialPostMetricId" UUID NOT NULL,
    "hashtagId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPostHashtag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SocialPostStrategy" (
    "id" UUID NOT NULL,
    "socialPostMetricId" UUID NOT NULL,
    "taxonomyEntryId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPostStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SocialKpiTarget" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "baselineEr" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "momentumPct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "autoGrowthPct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "targetEr" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "overrideReason" TEXT,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialKpiTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hashtag_slug_key" ON "public"."Hashtag"("slug");

-- CreateIndex
CREATE INDEX "Hashtag_display_idx" ON "public"."Hashtag"("display");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostHashtag_socialPostMetricId_hashtagId_key" ON "public"."SocialPostHashtag"("socialPostMetricId", "hashtagId");

-- CreateIndex
CREATE INDEX "SocialPostHashtag_hashtagId_createdAt_idx" ON "public"."SocialPostHashtag"("hashtagId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostStrategy_socialPostMetricId_taxonomyEntryId_key" ON "public"."SocialPostStrategy"("socialPostMetricId", "taxonomyEntryId");

-- CreateIndex
CREATE INDEX "SocialPostStrategy_taxonomyEntryId_createdAt_idx" ON "public"."SocialPostStrategy"("taxonomyEntryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialKpiTarget_year_channel_key" ON "public"."SocialKpiTarget"("year", "channel");

-- CreateIndex
CREATE INDEX "SocialKpiTarget_year_source_idx" ON "public"."SocialKpiTarget"("year", "source");

-- CreateIndex
CREATE INDEX "SocialPostMetric_campaignTaxonomyId_publishedAt_idx" ON "public"."SocialPostMetric"("campaignTaxonomyId", "publishedAt");

-- AddForeignKey
ALTER TABLE "public"."SocialPostMetric"
ADD CONSTRAINT "SocialPostMetric_campaignTaxonomyId_fkey"
FOREIGN KEY ("campaignTaxonomyId") REFERENCES "public"."TaxonomyEntry"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPostHashtag"
ADD CONSTRAINT "SocialPostHashtag_socialPostMetricId_fkey"
FOREIGN KEY ("socialPostMetricId") REFERENCES "public"."SocialPostMetric"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPostHashtag"
ADD CONSTRAINT "SocialPostHashtag_hashtagId_fkey"
FOREIGN KEY ("hashtagId") REFERENCES "public"."Hashtag"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPostStrategy"
ADD CONSTRAINT "SocialPostStrategy_socialPostMetricId_fkey"
FOREIGN KEY ("socialPostMetricId") REFERENCES "public"."SocialPostMetric"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPostStrategy"
ADD CONSTRAINT "SocialPostStrategy_taxonomyEntryId_fkey"
FOREIGN KEY ("taxonomyEntryId") REFERENCES "public"."TaxonomyEntry"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialKpiTarget"
ADD CONSTRAINT "SocialKpiTarget_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
