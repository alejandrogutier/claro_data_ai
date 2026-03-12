-- Add isReply flag to SocialPostMetric for X/Twitter reply detection
ALTER TABLE "SocialPostMetric" ADD COLUMN IF NOT EXISTS "isReply" BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index for efficient reply filtering
CREATE INDEX IF NOT EXISTS "SocialPostMetric_isReply_idx"
    ON "SocialPostMetric"("isReply") WHERE "isReply" = TRUE;
