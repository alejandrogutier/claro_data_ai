-- AlterTable
ALTER TABLE "public"."TrackedTerm"
ADD COLUMN "description" TEXT,
ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "definition" JSONB,
ADD COLUMN "execution" JSONB,
ADD COLUMN "compiledDefinition" JSONB,
ADD COLUMN "currentRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "updatedByUserId" UUID;

-- AlterTable
ALTER TABLE "public"."ContentItem"
ADD COLUMN "queryIdSnapshot" UUID,
ADD COLUMN "queryNameSnapshot" TEXT,
ADD COLUMN "queryScopeSnapshot" "public"."TermScope";

-- CreateTable
CREATE TABLE "public"."TrackedTermRevision" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "execution" JSONB NOT NULL,
    "compiledDefinition" JSONB,
    "changedByUserId" UUID,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedTermRevision_pkey" PRIMARY KEY ("id")
);

-- Backfill definition/execution/current revision defaults for existing tracked terms
UPDATE "public"."TrackedTerm" t
SET
  "definition" = COALESCE(
    t."definition",
    jsonb_build_object(
      'kind', 'group',
      'op', 'AND',
      'rules', jsonb_build_array(
        jsonb_build_object(
          'kind', 'keyword',
          'field', 'any',
          'match', 'phrase',
          'value', t."name"
        )
      )
    )
  ),
  "execution" = COALESCE(
    t."execution",
    jsonb_build_object(
      'providers_allow', '[]'::jsonb,
      'providers_deny', '[]'::jsonb,
      'countries_allow', '[]'::jsonb,
      'countries_deny', '[]'::jsonb,
      'domains_allow', '[]'::jsonb,
      'domains_deny', '[]'::jsonb
    )
  ),
  "compiledDefinition" = COALESCE(
    t."compiledDefinition",
    jsonb_build_object(
      'query', t."name",
      'keywords', jsonb_build_array(t."name"),
      'maxDepth', 1,
      'ruleCount', 1
    )
  ),
  "currentRevision" = COALESCE(NULLIF(t."currentRevision", 0), 1);

-- Seed revision history baseline (revision=1) for existing terms
INSERT INTO "public"."TrackedTermRevision"
  ("id", "termId", "revision", "definition", "execution", "compiledDefinition", "changedByUserId", "changeReason", "createdAt")
SELECT
  (
    substr(md5(t."id"::text || ':rev:1'), 1, 8) || '-' ||
    substr(md5(t."id"::text || ':rev:1'), 9, 4) || '-' ||
    '4' || substr(md5(t."id"::text || ':rev:1'), 14, 3) || '-' ||
    'a' || substr(md5(t."id"::text || ':rev:1'), 18, 3) || '-' ||
    substr(md5(t."id"::text || ':rev:1'), 21, 12)
  )::uuid,
  t."id",
  1,
  COALESCE(
    t."definition",
    jsonb_build_object(
      'kind', 'group',
      'op', 'AND',
      'rules', jsonb_build_array(
        jsonb_build_object(
          'kind', 'keyword',
          'field', 'any',
          'match', 'phrase',
          'value', t."name"
        )
      )
    )
  ),
  COALESCE(
    t."execution",
    jsonb_build_object(
      'providers_allow', '[]'::jsonb,
      'providers_deny', '[]'::jsonb,
      'countries_allow', '[]'::jsonb,
      'countries_deny', '[]'::jsonb,
      'domains_allow', '[]'::jsonb,
      'domains_deny', '[]'::jsonb
    )
  ),
  t."compiledDefinition",
  NULL,
  'baseline_backfill_v2',
  COALESCE(t."updatedAt", t."createdAt", NOW())
FROM "public"."TrackedTerm" t
;

-- Backfill snapshots to preserve historical scope/name after hard deletes
UPDATE "public"."ContentItem" ci
SET
  "queryIdSnapshot" = COALESCE(ci."queryIdSnapshot", ci."termId"),
  "queryNameSnapshot" = COALESCE(ci."queryNameSnapshot", t."name"),
  "queryScopeSnapshot" = COALESCE(ci."queryScopeSnapshot", t."scope")
FROM "public"."TrackedTerm" t
WHERE ci."termId" = t."id";

-- CreateIndex
CREATE INDEX "TrackedTerm_priority_scope_isActive_idx" ON "public"."TrackedTerm"("priority", "scope", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedTermRevision_termId_revision_key" ON "public"."TrackedTermRevision"("termId", "revision");

-- CreateIndex
CREATE INDEX "TrackedTermRevision_termId_createdAt_idx" ON "public"."TrackedTermRevision"("termId", "createdAt");

-- CreateIndex
CREATE INDEX "TrackedTermRevision_changedByUserId_createdAt_idx" ON "public"."TrackedTermRevision"("changedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentItem_queryScopeSnapshot_publishedAt_idx" ON "public"."ContentItem"("queryScopeSnapshot", "publishedAt");

-- CreateIndex
CREATE INDEX "ContentItem_queryIdSnapshot_idx" ON "public"."ContentItem"("queryIdSnapshot");

-- AddForeignKey
ALTER TABLE "public"."TrackedTerm"
ADD CONSTRAINT "TrackedTerm_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrackedTermRevision"
ADD CONSTRAINT "TrackedTermRevision_termId_fkey"
FOREIGN KEY ("termId") REFERENCES "public"."TrackedTerm"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrackedTermRevision"
ADD CONSTRAINT "TrackedTermRevision_changedByUserId_fkey"
FOREIGN KEY ("changedByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
