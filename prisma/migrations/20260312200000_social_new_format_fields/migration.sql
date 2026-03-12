-- Add reel/video engagement metrics to SocialPostMetric
ALTER TABLE "SocialPostMetric" ADD COLUMN IF NOT EXISTS "saves" DECIMAL(18,2);
ALTER TABLE "SocialPostMetric" ADD COLUMN IF NOT EXISTS "avgWatchTimeMs" INTEGER;
ALTER TABLE "SocialPostMetric" ADD COLUMN IF NOT EXISTS "totalWatchTimeMs" BIGINT;

-- Create SocialStoryDailyMetric for IG Stories daily aggregates
CREATE TABLE IF NOT EXISTS "SocialStoryDailyMetric" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "channel" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "storyViews" INTEGER NOT NULL DEFAULT 0,
    "storyReach" INTEGER NOT NULL DEFAULT 0,
    "storyFollows" INTEGER NOT NULL DEFAULT 0,
    "storyShares" INTEGER NOT NULL DEFAULT 0,
    "storyReplies" INTEGER NOT NULL DEFAULT 0,
    "storyTotalActions" INTEGER NOT NULL DEFAULT 0,
    "storyCompletionRate" DECIMAL(8,4),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialStoryDailyMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SocialStoryDailyMetric_date_channel_accountName_key"
    ON "SocialStoryDailyMetric"("date", "channel", "accountName");

CREATE INDEX IF NOT EXISTS "SocialStoryDailyMetric_channel_date_idx"
    ON "SocialStoryDailyMetric"("channel", "date");
