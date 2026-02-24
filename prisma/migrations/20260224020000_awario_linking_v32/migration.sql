-- AlterTable
ALTER TABLE "public"."AwarioAlertBinding"
ADD COLUMN "syncState" TEXT NOT NULL DEFAULT 'pending_backfill',
ADD COLUMN "lastSyncAt" TIMESTAMP(3),
ADD COLUMN "lastSyncError" TEXT,
ADD COLUMN "backfillStartedAt" TIMESTAMP(3),
ADD COLUMN "backfillCompletedAt" TIMESTAMP(3),
ADD COLUMN "backfillCursor" TEXT;

-- Backfill existing bindings to avoid retroactive mass historical sync after deploy
UPDATE "public"."AwarioAlertBinding" b
SET
  "syncState" = CASE
    WHEN LOWER(COALESCE(b."status", 'active')) = 'paused' THEN 'paused'
    WHEN LOWER(COALESCE(b."status", 'active')) = 'archived' THEN 'archived'
    ELSE 'active'
  END,
  "backfillCompletedAt" = COALESCE(
    b."backfillCompletedAt",
    CASE
      WHEN LOWER(COALESCE(b."status", 'active')) IN ('active', 'paused', 'archived')
        THEN COALESCE(b."updatedAt", b."createdAt", NOW())
      ELSE NULL
    END
  );

-- CreateIndex
CREATE INDEX "AwarioAlertBinding_status_syncState_idx" ON "public"."AwarioAlertBinding"("status", "syncState");

-- CreateIndex
CREATE INDEX "AwarioAlertBinding_backfillCompletedAt_idx" ON "public"."AwarioAlertBinding"("backfillCompletedAt");

-- CreateIndex
CREATE INDEX "AwarioAlertBinding_lastSyncAt_idx" ON "public"."AwarioAlertBinding"("lastSyncAt");
