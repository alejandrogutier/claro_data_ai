-- CreateEnum
CREATE TYPE "public"."IncidentStatus" AS ENUM ('open', 'acknowledged', 'in_progress', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "public"."IncidentSeverity" AS ENUM ('SEV1', 'SEV2', 'SEV3', 'SEV4');

-- CreateTable
CREATE TABLE "public"."Incident" (
    "id" UUID NOT NULL,
    "scope" "public"."TermScope" NOT NULL,
    "severity" "public"."IncidentSeverity" NOT NULL,
    "status" "public"."IncidentStatus" NOT NULL DEFAULT 'open',
    "riskScore" DECIMAL(5,2) NOT NULL,
    "classifiedItems" INTEGER NOT NULL DEFAULT 0,
    "ownerUserId" UUID,
    "slaDueAt" TIMESTAMP(3) NOT NULL,
    "cooldownUntil" TIMESTAMP(3) NOT NULL,
    "signalVersion" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IncidentNote" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IncidentEvaluationRun" (
    "id" UUID NOT NULL,
    "triggerType" "public"."TriggerType" NOT NULL,
    "status" "public"."RunStatus" NOT NULL DEFAULT 'queued',
    "metrics" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "IncidentEvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Incident_scope_status_createdAt_idx" ON "public"."Incident"("scope", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Incident_severity_status_createdAt_idx" ON "public"."Incident"("severity", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Incident_ownerUserId_status_idx" ON "public"."Incident"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "Incident_cooldownUntil_idx" ON "public"."Incident"("cooldownUntil");

-- CreateIndex
CREATE INDEX "IncidentNote_incidentId_createdAt_idx" ON "public"."IncidentNote"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentNote_authorUserId_createdAt_idx" ON "public"."IncidentNote"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentEvaluationRun_status_createdAt_idx" ON "public"."IncidentEvaluationRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentEvaluationRun_triggerType_createdAt_idx" ON "public"."IncidentEvaluationRun"("triggerType", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."Incident"
ADD CONSTRAINT "Incident_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IncidentNote"
ADD CONSTRAINT "IncidentNote_incidentId_fkey"
FOREIGN KEY ("incidentId") REFERENCES "public"."Incident"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IncidentNote"
ADD CONSTRAINT "IncidentNote_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "public"."User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
