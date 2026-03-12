-- Social Orphan Remediation
-- Fixes orphaned ContentItems created by canonicalUrl format change (commit 07cfe18).
-- Transfers classifications from orphaned CIs to active CIs, then deletes orphans.
-- Idempotent: safe to re-run.

DO $$
DECLARE
  orphan_count BIGINT := 0;
  classifications_transferred BIGINT := 0;
  topic_classifications_deleted BIGINT := 0;
  orphans_deleted BIGINT := 0;
BEGIN
  -- Count orphans for diagnostics
  SELECT COUNT(*) INTO orphan_count
  FROM "public"."ContentItem" ci
  WHERE ci."sourceType" = 'social'
    AND ci."canonicalUrl" LIKE 'social://%'
    AND NOT EXISTS (
      SELECT 1 FROM "public"."SocialPostMetric" spm
      WHERE spm."contentItemId" = ci."id"
    );

  RAISE NOTICE 'social_orphan_remediation: found % orphaned ContentItems', orphan_count;

  IF orphan_count = 0 THEN
    RAISE NOTICE 'social_orphan_remediation: nothing to do';
    RETURN;
  END IF;

  -- Step 1: Transfer sentiment classifications from orphaned CIs to active CIs.
  -- Match orphans to active CIs by parsing channel+externalPostId from canonicalUrl.
  WITH orphan_mapping AS (
    SELECT
      ci."id" AS orphan_ci_id,
      spm."contentItemId" AS active_ci_id
    FROM "public"."ContentItem" ci
    JOIN "public"."SocialPostMetric" spm
      ON spm."channel" = SPLIT_PART(REPLACE(ci."canonicalUrl", 'social://', ''), '/', 1)
      AND spm."externalPostId" = SUBSTRING(ci."canonicalUrl" FROM 'social://[^/]+/(.+)')
    WHERE ci."sourceType" = 'social'
      AND ci."canonicalUrl" LIKE 'social://%'
      AND NOT EXISTS (
        SELECT 1 FROM "public"."SocialPostMetric" spm2
        WHERE spm2."contentItemId" = ci."id"
      )
  ),
  transferred AS (
    INSERT INTO "public"."Classification"
      ("id", "contentItemId", "categoria", "sentimiento", "etiquetas", "confianza",
       "promptVersion", "modelId", "isOverride", "overriddenByUserId", "overrideReason",
       "metadata", "createdAt", "updatedAt")
    SELECT
      gen_random_uuid(), om.active_ci_id, c."categoria", c."sentimiento", c."etiquetas",
      c."confianza", c."promptVersion", c."modelId", c."isOverride",
      c."overriddenByUserId", c."overrideReason", c."metadata", c."createdAt", NOW()
    FROM "public"."Classification" c
    JOIN orphan_mapping om ON om.orphan_ci_id = c."contentItemId"
    WHERE om.active_ci_id IS NOT NULL
    ON CONFLICT ("contentItemId", "promptVersion", "modelId") DO UPDATE SET
      "sentimiento" = EXCLUDED."sentimiento",
      "confianza" = EXCLUDED."confianza",
      "categoria" = EXCLUDED."categoria",
      "etiquetas" = EXCLUDED."etiquetas",
      "metadata" = EXCLUDED."metadata",
      "updatedAt" = NOW()
    RETURNING 1
  )
  SELECT COUNT(*) INTO classifications_transferred FROM transferred;

  RAISE NOTICE 'social_orphan_remediation: transferred % classifications', classifications_transferred;

  -- Step 2: Delete orphan topic classifications (only 7 exist, cannot easily re-link
  -- because socialPostMetricId FK also needs updating and may conflict).
  DELETE FROM "public"."SocialPostTopicClassification" stc
  WHERE NOT EXISTS (
    SELECT 1 FROM "public"."SocialPostMetric" spm
    WHERE spm."contentItemId" = stc."contentItemId"
  );
  GET DIAGNOSTICS topic_classifications_deleted = ROW_COUNT;

  RAISE NOTICE 'social_orphan_remediation: deleted % orphan topic classifications', topic_classifications_deleted;

  -- Step 3: Delete orphaned ContentItems.
  -- CASCADE will clean up remaining Classification rows on these CIs.
  WITH deleted AS (
    DELETE FROM "public"."ContentItem" ci
    WHERE ci."sourceType" = 'social'
      AND ci."canonicalUrl" LIKE 'social://%'
      AND NOT EXISTS (
        SELECT 1 FROM "public"."SocialPostMetric" spm
        WHERE spm."contentItemId" = ci."id"
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO orphans_deleted FROM deleted;

  RAISE NOTICE 'social_orphan_remediation: deleted % orphaned ContentItems', orphans_deleted;
  RAISE NOTICE 'social_orphan_remediation: COMPLETE classifications_moved=% topics_removed=% orphans_deleted=%',
    classifications_transferred, topic_classifications_deleted, orphans_deleted;
END;
$$;
