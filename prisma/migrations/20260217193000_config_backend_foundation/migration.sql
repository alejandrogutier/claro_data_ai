-- CreateTable
CREATE TABLE "public"."ConnectorConfig" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequencyMinutes" INTEGER NOT NULL DEFAULT 15,
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "latencyP95Ms" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConnectorSyncRun" (
    "id" UUID NOT NULL,
    "connectorId" UUID NOT NULL,
    "status" "public"."RunStatus" NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "metrics" JSONB,
    "errorMessage" TEXT,
    "triggeredByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OwnedAccount" (
    "id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "businessLine" TEXT,
    "macroRegion" TEXT,
    "language" TEXT NOT NULL DEFAULT 'es',
    "teamOwner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "campaignTags" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Competitor" (
    "id" UUID NOT NULL,
    "brandName" TEXT NOT NULL,
    "aliases" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaxonomyEntry" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxonomyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorConfig_provider_key" ON "public"."ConnectorConfig"("provider");

-- CreateIndex
CREATE INDEX "ConnectorConfig_enabled_provider_idx" ON "public"."ConnectorConfig"("enabled", "provider");

-- CreateIndex
CREATE INDEX "ConnectorSyncRun_connectorId_createdAt_idx" ON "public"."ConnectorSyncRun"("connectorId", "createdAt");

-- CreateIndex
CREATE INDEX "ConnectorSyncRun_status_createdAt_idx" ON "public"."ConnectorSyncRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OwnedAccount_platform_handle_key" ON "public"."OwnedAccount"("platform", "handle");

-- CreateIndex
CREATE INDEX "OwnedAccount_status_platform_idx" ON "public"."OwnedAccount"("status", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_brandName_key" ON "public"."Competitor"("brandName");

-- CreateIndex
CREATE INDEX "Competitor_status_priority_idx" ON "public"."Competitor"("status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "TaxonomyEntry_kind_key_key" ON "public"."TaxonomyEntry"("kind", "key");

-- CreateIndex
CREATE INDEX "TaxonomyEntry_kind_isActive_sortOrder_idx" ON "public"."TaxonomyEntry"("kind", "isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "public"."ConnectorSyncRun"
ADD CONSTRAINT "ConnectorSyncRun_connectorId_fkey"
FOREIGN KEY ("connectorId") REFERENCES "public"."ConnectorConfig"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConnectorSyncRun"
ADD CONSTRAINT "ConnectorSyncRun_triggeredByUserId_fkey"
FOREIGN KEY ("triggeredByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
