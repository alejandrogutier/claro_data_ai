-- AlterTable
ALTER TABLE "public"."SocialSyncRun"
ADD COLUMN "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "currentPhase" TEXT,
ADD COLUMN "phaseStatus" JSONB;

-- CreateTable
CREATE TABLE "public"."SocialReconciliationSnapshot" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "s3Rows" INTEGER NOT NULL DEFAULT 0,
    "dbRows" INTEGER NOT NULL DEFAULT 0,
    "deltaRows" INTEGER NOT NULL DEFAULT 0,
    "s3MinDate" TIMESTAMP(3),
    "s3MaxDate" TIMESTAMP(3),
    "dbMinDate" TIMESTAMP(3),
    "dbMaxDate" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialReconciliationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SocialAccountDailyAggregate" (
    "id" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "posts" INTEGER NOT NULL DEFAULT 0,
    "exposureTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "engagementTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "erGlobal" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "positivos" INTEGER NOT NULL DEFAULT 0,
    "negativos" INTEGER NOT NULL DEFAULT 0,
    "neutrales" INTEGER NOT NULL DEFAULT 0,
    "unknowns" INTEGER NOT NULL DEFAULT 0,
    "sentimientoNeto" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "riesgoActivo" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAccountDailyAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialSyncRun_queuedAt_createdAt_idx" ON "public"."SocialSyncRun"("queuedAt", "createdAt");

-- CreateIndex
CREATE INDEX "SocialReconciliationSnapshot_runId_createdAt_idx" ON "public"."SocialReconciliationSnapshot"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialReconciliationSnapshot_channel_createdAt_idx" ON "public"."SocialReconciliationSnapshot"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "SocialReconciliationSnapshot_status_createdAt_idx" ON "public"."SocialReconciliationSnapshot"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccountDailyAggregate_date_channel_accountName_key" ON "public"."SocialAccountDailyAggregate"("date", "channel", "accountName");

-- CreateIndex
CREATE INDEX "SocialAccountDailyAggregate_date_channel_idx" ON "public"."SocialAccountDailyAggregate"("date", "channel");

-- CreateIndex
CREATE INDEX "SocialAccountDailyAggregate_accountName_date_idx" ON "public"."SocialAccountDailyAggregate"("accountName", "date");

-- AddForeignKey
ALTER TABLE "public"."SocialReconciliationSnapshot"
ADD CONSTRAINT "SocialReconciliationSnapshot_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "public"."SocialSyncRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
