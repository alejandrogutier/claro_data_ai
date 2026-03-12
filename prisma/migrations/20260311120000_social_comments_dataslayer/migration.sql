-- AlterTable: Make awarioMentionId and awarioAlertId optional for Dataslayer comments
ALTER TABLE "SocialPostComment" ALTER COLUMN "awarioMentionId" DROP NOT NULL;
ALTER TABLE "SocialPostComment" ALTER COLUMN "awarioAlertId" DROP NOT NULL;

-- AddColumn: dataslayerHash for Dataslayer comment dedup
ALTER TABLE "SocialPostComment" ADD COLUMN "dataslayerHash" TEXT;

-- CreateIndex: unique on dataslayerHash (partial, non-null only)
CREATE UNIQUE INDEX "SocialPostComment_dataslayerHash_key" ON "SocialPostComment"("dataslayerHash");

-- Update sentimentSource default for existing rows that were awario
-- (no-op for existing data, just schema default change)
ALTER TABLE "SocialPostComment" ALTER COLUMN "sentimentSource" SET DEFAULT 'unknown';
