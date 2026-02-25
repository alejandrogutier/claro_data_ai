import { randomUUID } from "crypto";
import {
  RdsDataClient,
  fieldDate,
  fieldString,
  sqlBoolean,
  sqlJson,
  sqlLong,
  sqlString,
  sqlTimestamp,
  sqlUuid
} from "./rdsData";
import {
  SOCIAL_TOPIC_TAXONOMY_KIND,
  SOCIAL_TOPIC_TAXONOMY_V1,
  type SocialTopicDefinition
} from "../socialTopics/taxonomy";

export type SocialTopicTriggerType = "manual" | "scheduled";

export type SocialTopicPendingItem = {
  contentItemId: string;
  socialPostMetricId: string;
};

export type SocialTopicPromptContent = {
  contentItemId: string;
  socialPostMetricId: string;
  channel: string;
  accountName: string;
  provider: string;
  language: string | null;
  title: string;
  summary: string | null;
  content: string | null;
  text: string | null;
  publishedAt: Date | null;
  createdAt: Date;
};

export type SocialTopicAssignmentInput = {
  key: string;
  rank: number;
  confidence: number;
  evidence?: Record<string, unknown> | null;
};

export type UpsertSocialTopicClassificationInput = {
  contentItemId: string;
  socialPostMetricId: string;
  taxonomyVersion: string;
  promptVersion: string;
  modelId: string;
  overallConfidence: number | null;
  needsReview: boolean;
  ambiguousDualContext: boolean;
  metadata?: Record<string, unknown>;
  topics: SocialTopicAssignmentInput[];
};

export type SocialTopicCoverageStatus = {
  totalPosts: number;
  classified: number;
  pending: number;
  inReview: number;
  lastRun: {
    runId: string | null;
    status: "completed" | "failed" | null;
    triggerType: SocialTopicTriggerType | null;
    requestedAt: string | null;
    from: string | null;
    to: string | null;
    limit: number | null;
    dryRun: boolean | null;
    selectedCount: number | null;
    enqueuedCount: number | null;
    errorMessage: string | null;
    createdAt: string;
  } | null;
};

export type SocialTopicBackfillAuditInput = {
  runId: string;
  requestId?: string | null;
  triggerType: SocialTopicTriggerType;
  requestedAt: string;
  from: Date;
  to: Date | null;
  limit: number;
  dryRun: boolean;
  selectedCount: number;
  enqueuedCount: number;
  status: "completed" | "failed";
  errorMessage?: string | null;
};

const parseDecimal = (value: string | null, fallback = 0): number => {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseJsonObject = (value: string | null): Record<string, unknown> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const toSafeDefinition = (item: SocialTopicDefinition): SocialTopicDefinition => ({
  key: item.key.trim(),
  label: item.label.trim(),
  description: item.description.trim(),
  sortOrder: Math.max(1, Math.floor(item.sortOrder))
});

class SocialTopicStore {
  constructor(private readonly rds: RdsDataClient) {}

  async ensureTaxonomySeed(): Promise<void> {
    for (const raw of SOCIAL_TOPIC_TAXONOMY_V1) {
      const item = toSafeDefinition(raw);
      await this.rds.execute(
        `
          INSERT INTO "public"."TaxonomyEntry"
            ("id", "kind", "key", "label", "description", "isActive", "sortOrder", "metadata", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), :kind, :key, :label, :description, TRUE, :sort_order, CAST(:metadata AS JSONB), NOW(), NOW())
          ON CONFLICT ("kind", "key") DO UPDATE SET
            "label" = EXCLUDED."label",
            "description" = EXCLUDED."description",
            "isActive" = EXCLUDED."isActive",
            "sortOrder" = EXCLUDED."sortOrder",
            "metadata" = EXCLUDED."metadata",
            "updatedAt" = NOW()
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("kind", SOCIAL_TOPIC_TAXONOMY_KIND),
          sqlString("key", item.key),
          sqlString("label", item.label),
          sqlString("description", item.description),
          sqlLong("sort_order", item.sortOrder),
          sqlJson("metadata", {
            taxonomy_version: "social-topics-v1",
            seed: "social-topic-store"
          })
        ]
      );
    }
  }

  async listPendingItems(input: {
    from: Date;
    to: Date | null;
    limit: number;
    taxonomyVersion: string;
    promptVersion: string;
    modelId: string;
  }): Promise<SocialTopicPendingItem[]> {
    const safeLimit = Math.min(5000, Math.max(1, Math.floor(input.limit)));
    const response = await this.rds.execute(
      `
        SELECT
          ci."id"::text,
          spm."id"::text
        FROM "public"."SocialPostMetric" spm
        JOIN "public"."ContentItem" ci ON ci."id" = spm."contentItemId"
        WHERE
          ci."sourceType" = CAST('social' AS "public"."SourceType")
          AND ci."state" = CAST('active' AS "public"."ContentState")
          AND COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") >= :from_ts
          AND (:to_ts IS NULL OR COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") < :to_ts)
          AND NOT EXISTS (
            SELECT 1
            FROM "public"."SocialPostTopicClassification" stc
            WHERE
              stc."contentItemId" = ci."id"
              AND stc."taxonomyVersion" = :taxonomy_version
              AND stc."promptVersion" = :prompt_version
              AND stc."modelId" = :model_id
          )
        ORDER BY COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") DESC, ci."id" DESC
        LIMIT :limit
      `,
      [
        sqlTimestamp("from_ts", input.from),
        sqlTimestamp("to_ts", input.to),
        sqlString("taxonomy_version", input.taxonomyVersion),
        sqlString("prompt_version", input.promptVersion),
        sqlString("model_id", input.modelId),
        sqlLong("limit", safeLimit)
      ]
    );

    return (response.records ?? [])
      .map((row) => {
        const contentItemId = fieldString(row, 0);
        const socialPostMetricId = fieldString(row, 1);
        if (!contentItemId || !socialPostMetricId) return null;
        return { contentItemId, socialPostMetricId };
      })
      .filter((item): item is SocialTopicPendingItem => item !== null);
  }

  async getPromptContent(contentItemId: string): Promise<SocialTopicPromptContent | null> {
    const response = await this.rds.execute(
      `
        SELECT
          ci."id"::text,
          spm."id"::text,
          spm."channel",
          spm."accountName",
          ci."provider",
          ci."language",
          ci."title",
          ci."summary",
          ci."content",
          COALESCE(ci."content", ci."summary", ci."title"),
          COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt"),
          ci."createdAt"
        FROM "public"."ContentItem" ci
        JOIN "public"."SocialPostMetric" spm ON spm."contentItemId" = ci."id"
        WHERE
          ci."id" = CAST(:content_item_id AS UUID)
          AND ci."sourceType" = CAST('social' AS "public"."SourceType")
        LIMIT 1
      `,
      [sqlUuid("content_item_id", contentItemId)]
    );

    const row = response.records?.[0];
    const id = fieldString(row, 0);
    const socialPostMetricId = fieldString(row, 1);
    const channel = fieldString(row, 2);
    const accountName = fieldString(row, 3);
    const provider = fieldString(row, 4);
    const language = fieldString(row, 5);
    const title = fieldString(row, 6);
    const summary = fieldString(row, 7);
    const content = fieldString(row, 8);
    const text = fieldString(row, 9);
    const publishedAt = fieldDate(row, 10);
    const createdAt = fieldDate(row, 11);

    if (!id || !socialPostMetricId || !channel || !accountName || !provider || !title || !createdAt) {
      return null;
    }

    return {
      contentItemId: id,
      socialPostMetricId,
      channel,
      accountName,
      provider,
      language,
      title,
      summary,
      content,
      text,
      publishedAt,
      createdAt
    };
  }

  private async resolveTaxonomyIdsByKey(keys: string[], transactionId?: string): Promise<Map<string, string>> {
    const normalized = Array.from(new Set(keys.map((item) => item.trim()).filter((item) => item.length > 0)));
    if (normalized.length === 0) return new Map();

    const placeholders = normalized.map((_, index) => `:key_${index}`);
    const params = [sqlString("kind", SOCIAL_TOPIC_TAXONOMY_KIND), ...normalized.map((item, index) => sqlString(`key_${index}`, item))];
    const response = await this.rds.execute(
      `
        SELECT "id"::text, "key"
        FROM "public"."TaxonomyEntry"
        WHERE
          "kind" = :kind
          AND "key" IN (${placeholders.join(", ")})
      `,
      params,
      { transactionId }
    );

    const map = new Map<string, string>();
    for (const row of response.records ?? []) {
      const id = fieldString(row, 0);
      const key = fieldString(row, 1);
      if (!id || !key) continue;
      map.set(key, id);
    }

    return map;
  }

  async upsertClassification(input: UpsertSocialTopicClassificationInput): Promise<void> {
    const tx = await this.rds.beginTransaction();
    try {
      const upsertResponse = await this.rds.execute(
        `
          INSERT INTO "public"."SocialPostTopicClassification"
            (
              "id",
              "contentItemId",
              "socialPostMetricId",
              "taxonomyVersion",
              "promptVersion",
              "modelId",
              "overallConfidence",
              "needsReview",
              "ambiguousDualContext",
              "metadata",
              "createdAt",
              "updatedAt"
            )
          VALUES
            (
              CAST(:id AS UUID),
              CAST(:content_item_id AS UUID),
              CAST(:social_post_metric_id AS UUID),
              :taxonomy_version,
              :prompt_version,
              :model_id,
              CAST(:overall_confidence AS DECIMAL(4,3)),
              :needs_review,
              :ambiguous_dual_context,
              CAST(:metadata AS JSONB),
              NOW(),
              NOW()
            )
          ON CONFLICT ("contentItemId", "taxonomyVersion", "promptVersion", "modelId") DO UPDATE SET
            "socialPostMetricId" = EXCLUDED."socialPostMetricId",
            "overallConfidence" = EXCLUDED."overallConfidence",
            "needsReview" = EXCLUDED."needsReview",
            "ambiguousDualContext" = EXCLUDED."ambiguousDualContext",
            "metadata" = EXCLUDED."metadata",
            "updatedAt" = NOW()
          RETURNING "id"::text
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("content_item_id", input.contentItemId),
          sqlUuid("social_post_metric_id", input.socialPostMetricId),
          sqlString("taxonomy_version", input.taxonomyVersion),
          sqlString("prompt_version", input.promptVersion),
          sqlString("model_id", input.modelId),
          sqlString(
            "overall_confidence",
            input.overallConfidence === null ? null : String(clamp(input.overallConfidence, 0, 1))
          ),
          sqlBoolean("needs_review", input.needsReview),
          sqlBoolean("ambiguous_dual_context", input.ambiguousDualContext),
          sqlJson("metadata", input.metadata ?? {})
        ],
        { transactionId: tx }
      );

      const classificationId = fieldString(upsertResponse.records?.[0], 0);
      if (!classificationId) {
        throw new Error("social_topic_classification_upsert_failed");
      }

      await this.rds.execute(
        `
          DELETE FROM "public"."SocialPostTopicAssignment"
          WHERE "classificationId" = CAST(:classification_id AS UUID)
        `,
        [sqlUuid("classification_id", classificationId)],
        { transactionId: tx }
      );

      const taxonomyMap = await this.resolveTaxonomyIdsByKey(
        input.topics.map((item) => item.key),
        tx
      );

      for (const assignment of input.topics) {
        const taxonomyEntryId = taxonomyMap.get(assignment.key);
        if (!taxonomyEntryId) continue;

        await this.rds.execute(
          `
            INSERT INTO "public"."SocialPostTopicAssignment"
              ("id", "classificationId", "taxonomyEntryId", "rank", "confidence", "evidence", "createdAt")
            VALUES
              (
                CAST(:id AS UUID),
                CAST(:classification_id AS UUID),
                CAST(:taxonomy_entry_id AS UUID),
                :rank,
                CAST(:confidence AS DECIMAL(4,3)),
                CAST(:evidence AS JSONB),
                NOW()
              )
            ON CONFLICT ("classificationId", "taxonomyEntryId") DO UPDATE SET
              "rank" = EXCLUDED."rank",
              "confidence" = EXCLUDED."confidence",
              "evidence" = EXCLUDED."evidence"
          `,
          [
            sqlUuid("id", randomUUID()),
            sqlUuid("classification_id", classificationId),
            sqlUuid("taxonomy_entry_id", taxonomyEntryId),
            sqlLong("rank", Math.max(1, Math.floor(assignment.rank))),
            sqlString("confidence", String(clamp(assignment.confidence, 0, 1))),
            sqlJson("evidence", assignment.evidence ?? {})
          ],
          { transactionId: tx }
        );
      }

      await this.rds.commitTransaction(tx);
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }

  async getCoverageStatus(input: {
    from: Date;
    to: Date | null;
    taxonomyVersion: string;
    promptVersion: string;
  }): Promise<SocialTopicCoverageStatus> {
    const [totalRes, classifiedRes, reviewRes, lastRunRes] = await Promise.all([
      this.rds.execute(
        `
          SELECT COUNT(*)::text
          FROM "public"."SocialPostMetric" spm
          JOIN "public"."ContentItem" ci ON ci."id" = spm."contentItemId"
          WHERE
            ci."sourceType" = CAST('social' AS "public"."SourceType")
            AND ci."state" = CAST('active' AS "public"."ContentState")
            AND COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") >= :from_ts
            AND (:to_ts IS NULL OR COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") < :to_ts)
        `,
        [sqlTimestamp("from_ts", input.from), sqlTimestamp("to_ts", input.to)]
      ),
      this.rds.execute(
        `
          SELECT COUNT(DISTINCT stc."contentItemId")::text
          FROM "public"."SocialPostTopicClassification" stc
          JOIN "public"."SocialPostMetric" spm ON spm."id" = stc."socialPostMetricId"
          JOIN "public"."ContentItem" ci ON ci."id" = stc."contentItemId"
          WHERE
            ci."sourceType" = CAST('social' AS "public"."SourceType")
            AND ci."state" = CAST('active' AS "public"."ContentState")
            AND stc."taxonomyVersion" = :taxonomy_version
            AND stc."promptVersion" = :prompt_version
            AND COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") >= :from_ts
            AND (:to_ts IS NULL OR COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") < :to_ts)
        `,
        [
          sqlString("taxonomy_version", input.taxonomyVersion),
          sqlString("prompt_version", input.promptVersion),
          sqlTimestamp("from_ts", input.from),
          sqlTimestamp("to_ts", input.to)
        ]
      ),
      this.rds.execute(
        `
          WITH ranked AS (
            SELECT
              stc."contentItemId",
              stc."needsReview",
              ROW_NUMBER() OVER (
                PARTITION BY stc."contentItemId"
                ORDER BY stc."updatedAt" DESC, stc."createdAt" DESC, stc."id" DESC
              ) AS rn
            FROM "public"."SocialPostTopicClassification" stc
            JOIN "public"."SocialPostMetric" spm ON spm."id" = stc."socialPostMetricId"
            JOIN "public"."ContentItem" ci ON ci."id" = stc."contentItemId"
            WHERE
              ci."sourceType" = CAST('social' AS "public"."SourceType")
              AND ci."state" = CAST('active' AS "public"."ContentState")
              AND stc."taxonomyVersion" = :taxonomy_version
              AND stc."promptVersion" = :prompt_version
              AND COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") >= :from_ts
              AND (:to_ts IS NULL OR COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") < :to_ts)
          )
          SELECT COUNT(*)::text
          FROM ranked
          WHERE rn = 1 AND "needsReview" = TRUE
        `,
        [
          sqlString("taxonomy_version", input.taxonomyVersion),
          sqlString("prompt_version", input.promptVersion),
          sqlTimestamp("from_ts", input.from),
          sqlTimestamp("to_ts", input.to)
        ]
      ),
      this.rds.execute(
        `
          SELECT
            "after"::text,
            "createdAt"
          FROM "public"."AuditLog"
          WHERE "action" = 'social_topics_backfill_run'
          ORDER BY "createdAt" DESC, "id" DESC
          LIMIT 1
        `
      )
    ]);

    const totalPosts = Math.max(0, Math.floor(parseDecimal(fieldString(totalRes.records?.[0], 0), 0)));
    const classified = Math.max(0, Math.floor(parseDecimal(fieldString(classifiedRes.records?.[0], 0), 0)));
    const inReview = Math.max(0, Math.floor(parseDecimal(fieldString(reviewRes.records?.[0], 0), 0)));
    const pending = Math.max(0, totalPosts - classified);

    const lastRunRow = lastRunRes.records?.[0];
    const lastRunPayload = parseJsonObject(fieldString(lastRunRow, 0));
    const lastRunCreatedAt = fieldDate(lastRunRow, 1);
    const statusValue = lastRunPayload.status;
    const normalizedStatus: "completed" | "failed" | null =
      statusValue === "completed" || statusValue === "failed" ? statusValue : null;
    const triggerTypeValue = lastRunPayload.trigger_type;
    const normalizedTriggerType: SocialTopicTriggerType | null =
      triggerTypeValue === "manual" || triggerTypeValue === "scheduled" ? triggerTypeValue : null;

    const lastRun = lastRunCreatedAt
      ? {
          runId: typeof lastRunPayload.run_id === "string" ? lastRunPayload.run_id : null,
          status: normalizedStatus,
          triggerType: normalizedTriggerType,
          requestedAt: typeof lastRunPayload.requested_at === "string" ? lastRunPayload.requested_at : null,
          from: typeof lastRunPayload.from === "string" ? lastRunPayload.from : null,
          to: typeof lastRunPayload.to === "string" ? lastRunPayload.to : null,
          limit: typeof lastRunPayload.limit === "number" ? Math.floor(lastRunPayload.limit) : null,
          dryRun: typeof lastRunPayload.dry_run === "boolean" ? lastRunPayload.dry_run : null,
          selectedCount: typeof lastRunPayload.selected_count === "number" ? Math.floor(lastRunPayload.selected_count) : null,
          enqueuedCount: typeof lastRunPayload.enqueued_count === "number" ? Math.floor(lastRunPayload.enqueued_count) : null,
          errorMessage: typeof lastRunPayload.error_message === "string" ? lastRunPayload.error_message : null,
          createdAt: lastRunCreatedAt.toISOString()
        }
      : null;

    return {
      totalPosts,
      classified,
      pending,
      inReview,
      lastRun
    };
  }

  async logBackfillRun(input: SocialTopicBackfillAuditInput): Promise<void> {
    await this.rds.execute(
      `
        INSERT INTO "public"."AuditLog"
          ("id", "actorUserId", "action", "resourceType", "resourceId", "requestId", "before", "after", "createdAt")
        VALUES
          (
            CAST(:id AS UUID),
            NULL,
            :action,
            :resource_type,
            :resource_id,
            :request_id,
            CAST(:before AS JSONB),
            CAST(:after AS JSONB),
            NOW()
          )
      `,
      [
        sqlUuid("id", randomUUID()),
        sqlString("action", "social_topics_backfill_run"),
        sqlString("resource_type", "SocialPostTopicClassification"),
        sqlString("resource_id", input.runId),
        sqlString("request_id", input.requestId ?? null),
        sqlJson("before", null),
        sqlJson("after", {
          run_id: input.runId,
          status: input.status,
          trigger_type: input.triggerType,
          requested_at: input.requestedAt,
          from: input.from.toISOString(),
          to: input.to ? input.to.toISOString() : null,
          limit: input.limit,
          dry_run: input.dryRun,
          selected_count: input.selectedCount,
          enqueued_count: input.enqueuedCount,
          error_message: input.errorMessage ?? null
        })
      ]
    );
  }
}

export const createSocialTopicStore = (): SocialTopicStore | null => {
  const client = RdsDataClient.fromEnv();
  if (!client) return null;
  return new SocialTopicStore(client);
};
