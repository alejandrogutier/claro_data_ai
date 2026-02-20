-- CreateEnum
CREATE TYPE "public"."ReportRunStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'pending_review');

-- CreateEnum
CREATE TYPE "public"."ReportScheduleFrequency" AS ENUM ('daily', 'weekly');

-- CreateTable
CREATE TABLE "public"."ReportTemplate" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sections" JSONB,
    "filters" JSONB,
    "confidenceThreshold" DECIMAL(4,3) NOT NULL DEFAULT 0.650,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReportSchedule" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" "public"."ReportScheduleFrequency" NOT NULL,
    "dayOfWeek" INTEGER,
    "timeLocal" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "recipients" JSONB,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReportRun" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "scheduleId" UUID,
    "status" "public"."ReportRunStatus" NOT NULL DEFAULT 'queued',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "sourceType" "public"."SourceType" NOT NULL DEFAULT 'news',
    "confidence" DECIMAL(4,3),
    "summary" JSONB,
    "recommendations" JSONB,
    "blockedReason" TEXT,
    "exportJobId" UUID,
    "idempotencyKey" TEXT,
    "requestedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportTemplate_name_key" ON "public"."ReportTemplate"("name");

-- CreateIndex
CREATE INDEX "ReportTemplate_isActive_createdAt_idx" ON "public"."ReportTemplate"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "ReportSchedule_enabled_nextRunAt_idx" ON "public"."ReportSchedule"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "ReportSchedule_templateId_createdAt_idx" ON "public"."ReportSchedule"("templateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRun_idempotencyKey_key" ON "public"."ReportRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ReportRun_status_createdAt_idx" ON "public"."ReportRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReportRun_templateId_createdAt_idx" ON "public"."ReportRun"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportRun_scheduleId_createdAt_idx" ON "public"."ReportRun"("scheduleId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."ReportTemplate"
ADD CONSTRAINT "ReportTemplate_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportSchedule"
ADD CONSTRAINT "ReportSchedule_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "public"."ReportTemplate"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportSchedule"
ADD CONSTRAINT "ReportSchedule_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportRun"
ADD CONSTRAINT "ReportRun_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "public"."ReportTemplate"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportRun"
ADD CONSTRAINT "ReportRun_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "public"."ReportSchedule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportRun"
ADD CONSTRAINT "ReportRun_exportJobId_fkey"
FOREIGN KEY ("exportJobId") REFERENCES "public"."ExportJob"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportRun"
ADD CONSTRAINT "ReportRun_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
