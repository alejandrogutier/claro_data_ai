-- Align engagement semantics with visible interactions (likes + comments + shares).
UPDATE "public"."SocialPostMetric"
SET
  "engagementTotal" = COALESCE("likes", 0) + COALESCE("comments", 0) + COALESCE("shares", 0),
  "updatedAt" = NOW();

-- Rebuild daily aggregates to keep dashboard snapshots consistent with the new interaction definition.
TRUNCATE TABLE "public"."SocialAccountDailyAggregate";

WITH daily AS (
  SELECT
    DATE_TRUNC('day', COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt"))::date AS agg_date,
    spm."channel" AS channel,
    spm."accountName" AS account_name,
    COUNT(*)::int AS posts,
    COALESCE(SUM(spm."exposure"), 0)::numeric(18,2) AS exposure_total,
    COALESCE(SUM(spm."engagementTotal"), 0)::numeric(18,2) AS engagement_total,
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(cls."sentimiento", '')) IN ('positive', 'positivo') THEN 1 ELSE 0 END), 0)::int AS positivos,
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(cls."sentimiento", '')) IN ('negative', 'negativo') THEN 1 ELSE 0 END), 0)::int AS negativos,
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(cls."sentimiento", '')) IN ('neutral', 'neutro') THEN 1 ELSE 0 END), 0)::int AS neutrales
  FROM "public"."SocialPostMetric" spm
  JOIN "public"."ContentItem" ci ON ci."id" = spm."contentItemId"
  LEFT JOIN LATERAL (
    SELECT c."sentimiento"
    FROM "public"."Classification" c
    WHERE c."contentItemId" = ci."id"
    ORDER BY c."isOverride" DESC, c."updatedAt" DESC, c."createdAt" DESC
    LIMIT 1
  ) cls ON TRUE
  WHERE ci."sourceType" = CAST('social' AS "public"."SourceType")
  GROUP BY 1, 2, 3
)
INSERT INTO "public"."SocialAccountDailyAggregate"
  ("id", "date", "channel", "accountName", "posts", "exposureTotal", "engagementTotal", "erGlobal", "positivos", "negativos", "neutrales", "unknowns", "sentimientoNeto", "riesgoActivo", "createdAt", "updatedAt")
SELECT
  (
    SUBSTRING(md5(CONCAT_WS('|', daily.agg_date::text, daily.channel, daily.account_name)) FOR 8) || '-' ||
    SUBSTRING(md5(CONCAT_WS('|', daily.agg_date::text, daily.channel, daily.account_name)) FROM 9 FOR 4) || '-' ||
    SUBSTRING(md5(CONCAT_WS('|', daily.agg_date::text, daily.channel, daily.account_name)) FROM 13 FOR 4) || '-' ||
    SUBSTRING(md5(CONCAT_WS('|', daily.agg_date::text, daily.channel, daily.account_name)) FROM 17 FOR 4) || '-' ||
    SUBSTRING(md5(CONCAT_WS('|', daily.agg_date::text, daily.channel, daily.account_name)) FROM 21 FOR 12)
  )::uuid AS id,
  daily.agg_date::timestamp AS "date",
  daily.channel,
  daily.account_name,
  daily.posts,
  daily.exposure_total,
  daily.engagement_total,
  CASE
    WHEN daily.exposure_total > 0 THEN ROUND((daily.engagement_total / daily.exposure_total) * 100, 4)::numeric(9,4)
    ELSE 0::numeric(9,4)
  END AS "erGlobal",
  daily.positivos,
  daily.negativos,
  daily.neutrales,
  GREATEST(daily.posts - (daily.positivos + daily.negativos + daily.neutrales), 0) AS unknowns,
  ROUND(
    ((daily.positivos - daily.negativos)::numeric / GREATEST((daily.positivos + daily.negativos + daily.neutrales), 1)) * 100,
    4
  )::numeric(9,4) AS "sentimientoNeto",
  ROUND(
    (daily.negativos::numeric / GREATEST((daily.positivos + daily.negativos + daily.neutrales), 1)) * 100,
    4
  )::numeric(9,4) AS "riesgoActivo",
  NOW(),
  NOW()
FROM daily;
