-- CreateTable
CREATE TABLE "public"."SocialSyncRun" (
    "id" UUID NOT NULL,
    "triggerType" "public"."TriggerType" NOT NULL,
    "status" "public"."RunStatus" NOT NULL DEFAULT 'queued',
    "requestId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "metrics" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SocialSyncObject" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "eTag" TEXT NOT NULL,
    "lastModified" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialSyncObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SocialPostMetric" (
    "id" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "externalPostId" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "postType" TEXT,
    "publishedAt" TIMESTAMP(3),
    "exposure" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "engagementTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "impressions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reach" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "clicks" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "likes" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "comments" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "shares" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "views" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "diagnostics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPostMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SocialDashboardSetting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "focusAccount" TEXT,
    "targetQuarterlySovPp" DECIMAL(6,2) NOT NULL DEFAULT 5.00,
    "targetShs" DECIMAL(6,2) NOT NULL DEFAULT 70.00,
    "riskThreshold" DECIMAL(6,2) NOT NULL DEFAULT 60.00,
    "sentimentDropThreshold" DECIMAL(6,2) NOT NULL DEFAULT 10.00,
    "erDropThreshold" DECIMAL(6,2) NOT NULL DEFAULT 5.00,
    "alertCooldownMinutes" INTEGER NOT NULL DEFAULT 60,
    "metadata" JSONB,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialDashboardSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialSyncRun_status_createdAt_idx" ON "public"."SocialSyncRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SocialSyncRun_triggerType_createdAt_idx" ON "public"."SocialSyncRun"("triggerType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialSyncObject_bucket_objectKey_eTag_lastModified_key" ON "public"."SocialSyncObject"("bucket", "objectKey", "eTag", "lastModified");

-- CreateIndex
CREATE INDEX "SocialSyncObject_runId_createdAt_idx" ON "public"."SocialSyncObject"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostMetric_contentItemId_key" ON "public"."SocialPostMetric"("contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostMetric_channel_externalPostId_key" ON "public"."SocialPostMetric"("channel", "externalPostId");

-- CreateIndex
CREATE INDEX "SocialPostMetric_channel_publishedAt_idx" ON "public"."SocialPostMetric"("channel", "publishedAt");

-- CreateIndex
CREATE INDEX "SocialPostMetric_accountName_publishedAt_idx" ON "public"."SocialPostMetric"("accountName", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialDashboardSetting_key_key" ON "public"."SocialDashboardSetting"("key");

-- AddForeignKey
ALTER TABLE "public"."SocialSyncObject"
ADD CONSTRAINT "SocialSyncObject_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "public"."SocialSyncRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPostMetric"
ADD CONSTRAINT "SocialPostMetric_contentItemId_fkey"
FOREIGN KEY ("contentItemId") REFERENCES "public"."ContentItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialDashboardSetting"
ADD CONSTRAINT "SocialDashboardSetting_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
