-- CreateTable
CREATE TABLE "public"."SocialPostComment" (
    "id" UUID NOT NULL,
    "socialPostMetricId" UUID NOT NULL,
    "awarioMentionId" TEXT NOT NULL,
    "awarioAlertId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "parentExternalPostId" TEXT NOT NULL,
    "externalCommentId" TEXT,
    "externalReplyCommentId" TEXT,
    "commentUrl" TEXT,
    "authorName" TEXT,
    "authorProfileUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "text" TEXT,
    "sentiment" TEXT NOT NULL DEFAULT 'unknown',
    "sentimentSource" TEXT NOT NULL DEFAULT 'awario',
    "isSpam" BOOLEAN NOT NULL DEFAULT false,
    "relatedToPostText" BOOLEAN NOT NULL DEFAULT false,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DECIMAL(5,4),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPostComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SocialPostCommentOverride" (
    "id" UUID NOT NULL,
    "socialPostCommentId" UUID NOT NULL,
    "actorUserId" UUID,
    "requestId" TEXT,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPostCommentOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AwarioQueryProfile" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "queryText" TEXT NOT NULL,
    "sources" JSONB,
    "language" TEXT,
    "countries" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwarioQueryProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AwarioAlertBinding" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "connectorId" UUID,
    "awarioAlertId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "validationStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastValidatedAt" TIMESTAMP(3),
    "lastValidationError" TEXT,
    "metadata" JSONB,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwarioAlertBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostComment_awarioMentionId_key" ON "public"."SocialPostComment"("awarioMentionId");

-- CreateIndex
CREATE INDEX "SocialPostComment_socialPostMetricId_publishedAt_idx" ON "public"."SocialPostComment"("socialPostMetricId", "publishedAt");

-- CreateIndex
CREATE INDEX "SocialPostComment_channel_parentExternalPostId_idx" ON "public"."SocialPostComment"("channel", "parentExternalPostId");

-- CreateIndex
CREATE INDEX "SocialPostComment_sentiment_isSpam_relatedToPostText_idx" ON "public"."SocialPostComment"("sentiment", "isSpam", "relatedToPostText");

-- CreateIndex
CREATE INDEX "SocialPostCommentOverride_socialPostCommentId_createdAt_idx" ON "public"."SocialPostCommentOverride"("socialPostCommentId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialPostCommentOverride_actorUserId_createdAt_idx" ON "public"."SocialPostCommentOverride"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AwarioQueryProfile_status_createdAt_idx" ON "public"."AwarioQueryProfile"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AwarioQueryProfile_name_idx" ON "public"."AwarioQueryProfile"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AwarioAlertBinding_profileId_awarioAlertId_key" ON "public"."AwarioAlertBinding"("profileId", "awarioAlertId");

-- CreateIndex
CREATE INDEX "AwarioAlertBinding_connectorId_status_idx" ON "public"."AwarioAlertBinding"("connectorId", "status");

-- CreateIndex
CREATE INDEX "AwarioAlertBinding_validationStatus_updatedAt_idx" ON "public"."AwarioAlertBinding"("validationStatus", "updatedAt");

-- AddForeignKey
ALTER TABLE "public"."SocialPostComment"
ADD CONSTRAINT "SocialPostComment_socialPostMetricId_fkey"
FOREIGN KEY ("socialPostMetricId") REFERENCES "public"."SocialPostMetric"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPostCommentOverride"
ADD CONSTRAINT "SocialPostCommentOverride_socialPostCommentId_fkey"
FOREIGN KEY ("socialPostCommentId") REFERENCES "public"."SocialPostComment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPostCommentOverride"
ADD CONSTRAINT "SocialPostCommentOverride_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AwarioQueryProfile"
ADD CONSTRAINT "AwarioQueryProfile_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AwarioQueryProfile"
ADD CONSTRAINT "AwarioQueryProfile_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AwarioAlertBinding"
ADD CONSTRAINT "AwarioAlertBinding_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "public"."AwarioQueryProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AwarioAlertBinding"
ADD CONSTRAINT "AwarioAlertBinding_connectorId_fkey"
FOREIGN KEY ("connectorId") REFERENCES "public"."ConnectorConfig"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AwarioAlertBinding"
ADD CONSTRAINT "AwarioAlertBinding_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AwarioAlertBinding"
ADD CONSTRAINT "AwarioAlertBinding_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
