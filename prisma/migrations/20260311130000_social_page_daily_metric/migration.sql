-- CreateTable
CREATE TABLE "SocialPageDailyMetric" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "channel" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "newFollowers" INTEGER NOT NULL DEFAULT 0,
    "unfollows" INTEGER NOT NULL DEFAULT 0,
    "pageReach" INTEGER NOT NULL DEFAULT 0,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "postReach" INTEGER,
    "profileVisits" INTEGER,
    "desktopViews" INTEGER,
    "mobileViews" INTEGER,
    "engagements" INTEGER,
    "engagementRate" DECIMAL(9,4),
    "profileLikes" INTEGER,
    "videoCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPageDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialPageDailyMetric_date_channel_accountName_key" ON "SocialPageDailyMetric"("date", "channel", "accountName");

-- CreateIndex
CREATE INDEX "SocialPageDailyMetric_channel_date_idx" ON "SocialPageDailyMetric"("channel", "date");
