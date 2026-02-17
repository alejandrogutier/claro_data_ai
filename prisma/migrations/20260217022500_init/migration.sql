-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('Admin', 'Analyst', 'Viewer');

-- CreateEnum
CREATE TYPE "public"."SourceType" AS ENUM ('news', 'social');

-- CreateEnum
CREATE TYPE "public"."ContentState" AS ENUM ('active', 'archived', 'hidden');

-- CreateEnum
CREATE TYPE "public"."RunStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "public"."TriggerType" AS ENUM ('scheduled', 'manual');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'Viewer',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrackedTerm" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxArticlesPerRun" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IngestionRun" (
    "id" UUID NOT NULL,
    "triggerType" "public"."TriggerType" NOT NULL,
    "status" "public"."RunStatus" NOT NULL DEFAULT 'queued',
    "termId" UUID,
    "language" TEXT NOT NULL DEFAULT 'es',
    "maxArticlesPerTerm" INTEGER NOT NULL DEFAULT 100,
    "requestId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "metrics" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IngestionRunItem" (
    "id" UUID NOT NULL,
    "ingestionRunId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "public"."RunStatus" NOT NULL,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "persistedCount" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContentItem" (
    "id" UUID NOT NULL,
    "sourceType" "public"."SourceType" NOT NULL,
    "termId" UUID,
    "provider" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourceId" TEXT,
    "state" "public"."ContentState" NOT NULL DEFAULT 'active',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "canonicalUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "language" TEXT,
    "category" TEXT,
    "publishedAt" TIMESTAMP(3),
    "sourceScore" DECIMAL(3,2) NOT NULL DEFAULT 0.50,
    "rawPayloadS3Key" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Classification" (
    "id" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "categoria" TEXT NOT NULL,
    "sentimiento" TEXT NOT NULL,
    "etiquetas" JSONB,
    "confianza" DECIMAL(4,3),
    "promptVersion" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "overriddenByUserId" UUID,
    "overrideReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Classification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AnalysisRun" (
    "id" UUID NOT NULL,
    "termId" UUID,
    "status" "public"."RunStatus" NOT NULL DEFAULT 'queued',
    "inputCount" INTEGER NOT NULL DEFAULT 0,
    "modelId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AnalysisRunItem" (
    "id" UUID NOT NULL,
    "analysisRunId" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContentStateEvent" (
    "id" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "previousState" "public"."ContentState" NOT NULL,
    "nextState" "public"."ContentState" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reason" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentStateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SourceWeight" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceName" TEXT,
    "weight" DECIMAL(3,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "requestId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExportJob" (
    "id" UUID NOT NULL,
    "requestedByUserId" UUID,
    "status" "public"."RunStatus" NOT NULL DEFAULT 'queued',
    "filters" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "s3Key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DigestRun" (
    "id" UUID NOT NULL,
    "digestDate" TIMESTAMP(3) NOT NULL,
    "recipientScope" TEXT NOT NULL,
    "status" "public"."RunStatus" NOT NULL DEFAULT 'queued',
    "recipientsCount" INTEGER NOT NULL DEFAULT 0,
    "s3Key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DigestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "public"."User"("role");

-- CreateIndex
CREATE INDEX "TrackedTerm_isActive_idx" ON "public"."TrackedTerm"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedTerm_name_language_key" ON "public"."TrackedTerm"("name", "language");

-- CreateIndex
CREATE INDEX "IngestionRun_status_createdAt_idx" ON "public"."IngestionRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IngestionRun_triggerType_createdAt_idx" ON "public"."IngestionRun"("triggerType", "createdAt");

-- CreateIndex
CREATE INDEX "IngestionRunItem_ingestionRunId_idx" ON "public"."IngestionRunItem"("ingestionRunId");

-- CreateIndex
CREATE INDEX "IngestionRunItem_provider_createdAt_idx" ON "public"."IngestionRunItem"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "ContentItem_termId_publishedAt_idx" ON "public"."ContentItem"("termId", "publishedAt");

-- CreateIndex
CREATE INDEX "ContentItem_state_createdAt_idx" ON "public"."ContentItem"("state", "createdAt");

-- CreateIndex
CREATE INDEX "ContentItem_sourceType_provider_idx" ON "public"."ContentItem"("sourceType", "provider");

-- CreateIndex
CREATE INDEX "ContentItem_category_idx" ON "public"."ContentItem"("category");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_canonicalUrl_key" ON "public"."ContentItem"("canonicalUrl");

-- CreateIndex
CREATE INDEX "Classification_categoria_sentimiento_idx" ON "public"."Classification"("categoria", "sentimiento");

-- CreateIndex
CREATE INDEX "Classification_createdAt_idx" ON "public"."Classification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Classification_contentItemId_promptVersion_modelId_key" ON "public"."Classification"("contentItemId", "promptVersion", "modelId");

-- CreateIndex
CREATE INDEX "AnalysisRun_status_createdAt_idx" ON "public"."AnalysisRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisRun_termId_createdAt_idx" ON "public"."AnalysisRun"("termId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisRunItem_contentItemId_idx" ON "public"."AnalysisRunItem"("contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisRunItem_analysisRunId_contentItemId_key" ON "public"."AnalysisRunItem"("analysisRunId", "contentItemId");

-- CreateIndex
CREATE INDEX "ContentStateEvent_contentItemId_createdAt_idx" ON "public"."ContentStateEvent"("contentItemId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentStateEvent_actorUserId_createdAt_idx" ON "public"."ContentStateEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SourceWeight_provider_idx" ON "public"."SourceWeight"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "SourceWeight_provider_sourceName_key" ON "public"."SourceWeight"("provider", "sourceName");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "public"."AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "public"."AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "ExportJob_status_createdAt_idx" ON "public"."ExportJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DigestRun_status_createdAt_idx" ON "public"."DigestRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DigestRun_digestDate_recipientScope_key" ON "public"."DigestRun"("digestDate", "recipientScope");

-- AddForeignKey
ALTER TABLE "public"."IngestionRun" ADD CONSTRAINT "IngestionRun_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."TrackedTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IngestionRunItem" ADD CONSTRAINT "IngestionRunItem_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "public"."IngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentItem" ADD CONSTRAINT "ContentItem_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."TrackedTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Classification" ADD CONSTRAINT "Classification_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "public"."ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Classification" ADD CONSTRAINT "Classification_overriddenByUserId_fkey" FOREIGN KEY ("overriddenByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AnalysisRun" ADD CONSTRAINT "AnalysisRun_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."TrackedTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AnalysisRunItem" ADD CONSTRAINT "AnalysisRunItem_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "public"."AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AnalysisRunItem" ADD CONSTRAINT "AnalysisRunItem_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "public"."ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentStateEvent" ADD CONSTRAINT "ContentStateEvent_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "public"."ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentStateEvent" ADD CONSTRAINT "ContentStateEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExportJob" ADD CONSTRAINT "ExportJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Post-migration indexes for search use-cases
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "ContentItem_fts_idx"
ON "public"."ContentItem"
USING GIN (
  to_tsvector(
    'simple',
    COALESCE("title", '') || ' ' || COALESCE("summary", '') || ' ' || COALESCE("content", '')
  )
);
