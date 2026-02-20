-- CreateEnum
CREATE TYPE "public"."AnalysisRunScope" AS ENUM ('overview', 'channel', 'competitors', 'custom');

-- AlterTable
ALTER TABLE "public"."AnalysisRun"
ADD COLUMN "scope" "public"."AnalysisRunScope" NOT NULL DEFAULT 'custom',
ADD COLUMN "triggerType" "public"."TriggerType" NOT NULL DEFAULT 'manual',
ADD COLUMN "sourceType" "public"."SourceType" NOT NULL DEFAULT 'news',
ADD COLUMN "filters" JSONB,
ADD COLUMN "requestId" TEXT,
ADD COLUMN "requestedByUserId" UUID,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "windowStart" TIMESTAMP(3),
ADD COLUMN "windowEnd" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "public"."AnalysisRun"
SET
  "windowStart" = COALESCE("startedAt", "createdAt") - INTERVAL '7 days',
  "windowEnd" = COALESCE("completedAt", "startedAt", "createdAt");

ALTER TABLE "public"."AnalysisRun"
ALTER COLUMN "windowStart" SET NOT NULL,
ALTER COLUMN "windowEnd" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisRun_idempotencyKey_key" ON "public"."AnalysisRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AnalysisRun_scope_createdAt_idx" ON "public"."AnalysisRun"("scope", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisRun_requestedByUserId_createdAt_idx" ON "public"."AnalysisRun"("requestedByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."AnalysisRun"
ADD CONSTRAINT "AnalysisRun_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
