CREATE OR REPLACE FUNCTION "public"."_claro_parse_awario_timestamp"(raw_value TEXT)
RETURNS TIMESTAMP(3)
LANGUAGE plpgsql
AS $$
DECLARE
  trimmed TEXT;
  numeric_value NUMERIC;
  parsed TIMESTAMPTZ;
BEGIN
  IF raw_value IS NULL THEN
    RETURN NULL;
  END IF;

  trimmed := btrim(raw_value);
  IF trimmed = '' THEN
    RETURN NULL;
  END IF;

  IF trimmed ~ '^[0-9]+(\\.[0-9]+)?$' THEN
    numeric_value := trimmed::NUMERIC;
    IF numeric_value >= 1000000000000 THEN
      RETURN to_timestamp((numeric_value / 1000.0)::DOUBLE PRECISION);
    ELSIF numeric_value >= 1000000000 THEN
      RETURN to_timestamp(numeric_value::DOUBLE PRECISION);
    END IF;
  END IF;

  BEGIN
    parsed := trimmed::TIMESTAMPTZ;
    RETURN parsed::TIMESTAMP(3);
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

DO $$
DECLARE
  fallback_rows BIGINT := 0;
  candidates_with_real_id BIGINT := 0;
  updated_published_at BIGINT := 0;
  updated_awario_ids BIGINT := 0;
  deleted_duplicates BIGINT := 0;
BEGIN
  UPDATE "public"."AwarioMentionFeedItem" item
  SET
    "publishedAt" = COALESCE(
      "publishedAt",
      "public"."_claro_parse_awario_timestamp"(item."rawPayload"->>'published_at'),
      "public"."_claro_parse_awario_timestamp"(item."rawPayload"->>'date'),
      "public"."_claro_parse_awario_timestamp"(item."rawPayload"->>'created_at')
    ),
    "updatedAt" = NOW()
  WHERE
    item."publishedAt" IS NULL
    AND COALESCE(
      "public"."_claro_parse_awario_timestamp"(item."rawPayload"->>'published_at'),
      "public"."_claro_parse_awario_timestamp"(item."rawPayload"->>'date'),
      "public"."_claro_parse_awario_timestamp"(item."rawPayload"->>'created_at')
    ) IS NOT NULL;

  GET DIAGNOSTICS updated_published_at = ROW_COUNT;

  SELECT COUNT(*)
  INTO fallback_rows
  FROM "public"."AwarioMentionFeedItem" item
  WHERE item."awarioMentionId" ~ ':mention:[0-9]+$';

  SELECT COUNT(*)
  INTO candidates_with_real_id
  FROM "public"."AwarioMentionFeedItem" item
  WHERE
    item."awarioMentionId" ~ ':mention:[0-9]+$'
    AND COALESCE(
      NULLIF(BTRIM(item."rawPayload"->>'id'), ''),
      NULLIF(BTRIM(item."rawPayload"->>'mention_id'), ''),
      NULLIF(BTRIM(item."rawPayload"->>'mentionId'), '')
    ) IS NOT NULL;

  WITH replacement AS (
    SELECT
      item."id",
      item."bindingId",
      COALESCE(
        NULLIF(BTRIM(item."rawPayload"->>'id'), ''),
        NULLIF(BTRIM(item."rawPayload"->>'mention_id'), ''),
        NULLIF(BTRIM(item."rawPayload"->>'mentionId'), '')
      ) AS resolved_id
    FROM "public"."AwarioMentionFeedItem" item
    WHERE item."awarioMentionId" ~ ':mention:[0-9]+$'
  )
  UPDATE "public"."AwarioMentionFeedItem" item
  SET
    "awarioMentionId" = replacement.resolved_id,
    "updatedAt" = NOW()
  FROM replacement
  WHERE
    item."id" = replacement."id"
    AND replacement.resolved_id IS NOT NULL
    AND item."awarioMentionId" <> replacement.resolved_id
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."AwarioMentionFeedItem" conflict
      WHERE
        conflict."bindingId" = replacement."bindingId"
        AND conflict."awarioMentionId" = replacement.resolved_id
        AND conflict."id" <> item."id"
    );

  GET DIAGNOSTICS updated_awario_ids = ROW_COUNT;

  WITH duplicated AS (
    SELECT ranked."id"
    FROM (
      SELECT
        item."id",
        ROW_NUMBER() OVER (
          PARTITION BY item."bindingId", item."awarioMentionId"
          ORDER BY
            COALESCE(item."firstSeenAt", item."createdAt") ASC,
            item."createdAt" ASC,
            item."id" ASC
        ) AS row_num
      FROM "public"."AwarioMentionFeedItem" item
    ) ranked
    WHERE ranked.row_num > 1
  )
  DELETE FROM "public"."AwarioMentionFeedItem" item
  USING duplicated
  WHERE item."id" = duplicated."id";

  GET DIAGNOSTICS deleted_duplicates = ROW_COUNT;

  RAISE NOTICE
    'awario_feed_backfill_v5 stats: published_at_updated=%, fallback_rows=%, candidates_with_real_id=%, awario_ids_updated=%, awario_id_updates_omitted=%, duplicate_rows_deleted=%',
    updated_published_at,
    fallback_rows,
    candidates_with_real_id,
    updated_awario_ids,
    GREATEST(candidates_with_real_id - updated_awario_ids, 0),
    deleted_duplicates;
END;
$$;

DROP FUNCTION IF EXISTS "public"."_claro_parse_awario_timestamp"(TEXT);
