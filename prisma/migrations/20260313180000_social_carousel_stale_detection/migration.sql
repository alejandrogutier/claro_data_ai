-- Add isCarouselSlide flag for TikTok carousel slide detection
-- TikTok API returns each carousel slide as a separate Video ID;
-- slides are merged into parent post and marked isCarouselSlide = TRUE
ALTER TABLE "SocialPostMetric" ADD COLUMN IF NOT EXISTS "isCarouselSlide" BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index for efficient carousel filtering
CREATE INDEX IF NOT EXISTS "SocialPostMetric_isCarouselSlide_idx"
    ON "SocialPostMetric"("isCarouselSlide") WHERE "isCarouselSlide" = TRUE;

-- Add lastSeenInS3 timestamp to track when a post was last present in S3 files
-- Used to detect stale posts that have rotated out of Dataslayer extraction windows
ALTER TABLE "SocialPostMetric" ADD COLUMN IF NOT EXISTS "lastSeenInS3" TIMESTAMP;

-- Add isStale flag for posts no longer present in S3
-- Posts not seen in S3 for 30+ days are marked as stale and excluded from dashboards
ALTER TABLE "SocialPostMetric" ADD COLUMN IF NOT EXISTS "isStale" BOOLEAN NOT NULL DEFAULT FALSE;

-- Composite index for stale post queries
CREATE INDEX IF NOT EXISTS "SocialPostMetric_isStale_lastSeenInS3_idx"
    ON "SocialPostMetric"("isStale", "lastSeenInS3");
