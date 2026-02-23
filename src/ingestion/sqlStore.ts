import { randomUUID } from "crypto";
import { RdsDataClient, fieldDate, fieldLong, fieldString, sqlJson, sqlLong, sqlString, sqlTimestamp, sqlUuid } from "../data/rdsData";
import type { NormalizedArticle } from "./providers";
import {
  type QueryDefinition,
  type QueryExecutionConfig,
  buildSimpleQueryDefinition,
  compileQueryDefinition,
  sanitizeExecutionConfig,
  validateQueryDefinition
} from "../queryBuilder";

type TriggerType = "scheduled" | "manual";
type RunStatus = "queued" | "running" | "completed" | "failed";

type RunSnapshot = {
  status: RunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
};

type RunStartInput = {
  runId: string;
  triggerType: TriggerType;
  language: string;
  maxArticlesPerTerm: number;
  requestId?: string;
  startedAt: Date;
};

type RunFinishInput = {
  runId: string;
  status: Extract<RunStatus, "completed" | "failed">;
  metrics: Record<string, unknown>;
  finishedAt: Date;
  errorMessage?: string;
};

type PersistableContentItem = {
  article: NormalizedArticle;
  termId: string | null;
  runId: string;
  term: string;
  termScope: "claro" | "competencia";
  triggerType: TriggerType;
  rawPayloadS3Key: string;
};

type IngestionQueryTarget = {
  id: string;
  name: string;
  language: string;
  scope: "claro" | "competencia";
  maxArticlesPerRun: number;
  definition: QueryDefinition;
  execution: QueryExecutionConfig;
  compiledDefinition: Record<string, unknown>;
};

type UpsertedContentRef = {
  contentItemId: string;
  canonicalUrl: string;
  provider: string;
};

type PersistableRunItem = {
  runId: string;
  provider: string;
  status: Extract<RunStatus, "completed" | "failed">;
  fetchedCount: number;
  persistedCount: number;
  latencyMs: number;
  errorMessage?: string;
};

class IngestionSqlStore {
  constructor(private readonly rds: RdsDataClient) {}

  async getRunSnapshot(runId: string): Promise<RunSnapshot | null> {
    const response = await this.rds.execute(
      `
        SELECT
          "status"::text,
          "startedAt",
          "finishedAt"
        FROM "public"."IngestionRun"
        WHERE "id" = CAST(:run_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("run_id", runId)]
    );

    const row = response.records?.[0];
    if (!row) return null;

    const status = fieldString(row, 0) as RunStatus | null;
    if (!status) return null;

    return {
      status,
      startedAt: fieldDate(row, 1),
      finishedAt: fieldDate(row, 2)
    };
  }

  async startRun(input: RunStartInput): Promise<void> {
    await this.rds.execute(
      `
        INSERT INTO "public"."IngestionRun"
          ("id", "triggerType", "status", "termId", "language", "maxArticlesPerTerm", "requestId", "startedAt", "finishedAt", "metrics", "errorMessage", "createdAt")
        VALUES
          (CAST(:run_id AS UUID), CAST(:trigger_type AS "public"."TriggerType"), CAST('running' AS "public"."RunStatus"), NULL, :language, :max_articles_per_term, :request_id, :started_at, NULL, NULL, NULL, NOW())
        ON CONFLICT ("id") DO UPDATE SET
          "triggerType" = EXCLUDED."triggerType",
          "status" = CAST('running' AS "public"."RunStatus"),
          "language" = EXCLUDED."language",
          "maxArticlesPerTerm" = EXCLUDED."maxArticlesPerTerm",
          "requestId" = COALESCE(EXCLUDED."requestId", "public"."IngestionRun"."requestId"),
          "startedAt" = COALESCE("public"."IngestionRun"."startedAt", EXCLUDED."startedAt"),
          "finishedAt" = NULL,
          "metrics" = NULL,
          "errorMessage" = NULL
      `,
      [
        sqlUuid("run_id", input.runId),
        sqlString("trigger_type", input.triggerType),
        sqlString("language", input.language),
        sqlLong("max_articles_per_term", input.maxArticlesPerTerm),
        sqlString("request_id", input.requestId),
        sqlTimestamp("started_at", input.startedAt)
      ]
    );

    await this.rds.execute(`DELETE FROM "public"."IngestionRunItem" WHERE "ingestionRunId" = CAST(:run_id AS UUID)`, [
      sqlUuid("run_id", input.runId)
    ]);
  }

  async ensureTrackedTerm(term: string, language: string, maxArticlesPerRun: number): Promise<string | null> {
    const definition = buildSimpleQueryDefinition(term);
    const execution = sanitizeExecutionConfig({});
    const compiled = compileQueryDefinition(definition);

    const response = await this.rds.execute(
      `
        INSERT INTO "public"."TrackedTerm"
          ("id", "name", "language", "scope", "isActive", "priority", "maxArticlesPerRun", "definition", "execution", "compiledDefinition", "currentRevision", "createdAt", "updatedAt")
        VALUES
          (CAST(:id AS UUID), :name, :language, CAST('claro' AS "public"."TermScope"), TRUE, 3, :max_articles_per_run, CAST(:definition AS JSONB), CAST(:execution AS JSONB), CAST(:compiled_definition AS JSONB), 1, NOW(), NOW())
        ON CONFLICT ("name", "language") DO UPDATE SET
          "isActive" = TRUE,
          "updatedAt" = NOW(),
          "maxArticlesPerRun" = GREATEST("public"."TrackedTerm"."maxArticlesPerRun", EXCLUDED."maxArticlesPerRun"),
          "definition" = COALESCE("public"."TrackedTerm"."definition", EXCLUDED."definition"),
          "execution" = COALESCE("public"."TrackedTerm"."execution", EXCLUDED."execution"),
          "compiledDefinition" = COALESCE("public"."TrackedTerm"."compiledDefinition", EXCLUDED."compiledDefinition"),
          "currentRevision" = GREATEST("public"."TrackedTerm"."currentRevision", EXCLUDED."currentRevision")
        RETURNING "id"::text
      `,
      [
        sqlUuid("id", randomUUID()),
        sqlString("name", term),
        sqlString("language", language),
        sqlLong("max_articles_per_run", maxArticlesPerRun),
        sqlJson("definition", definition),
        sqlJson("execution", execution),
        sqlJson("compiled_definition", compiled)
      ]
    );

    return fieldString(response.records?.[0], 0);
  }

  async resolveTermIdsToNames(termIds: string[]): Promise<string[]> {
    const ids = [...new Set(termIds)].slice(0, 50);
    if (ids.length === 0) return [];

    const placeholders = ids.map((_, index) => `CAST(:term_id_${index} AS UUID)`);
    const params = ids.map((id, index) => sqlUuid(`term_id_${index}`, id));

    const response = await this.rds.execute(
      `
        SELECT "name"
        FROM "public"."TrackedTerm"
        WHERE "id" IN (${placeholders.join(",")})
      `,
      params
    );

    return (response.records ?? [])
      .map((row) => fieldString(row, 0))
      .filter((name): name is string => Boolean(name));
  }

  async resolveTermIdsToQueries(termIds: string[]): Promise<IngestionQueryTarget[]> {
    const ids = [...new Set(termIds)].slice(0, 50);
    if (ids.length === 0) return [];

    const placeholders = ids.map((_, index) => `CAST(:term_id_${index} AS UUID)`);
    const params = ids.map((id, index) => sqlUuid(`term_id_${index}`, id));

    const response = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "name",
          "language",
          "scope"::text,
          "maxArticlesPerRun",
          "definition"::text,
          "execution"::text,
          "compiledDefinition"::text
        FROM "public"."TrackedTerm"
        WHERE "id" IN (${placeholders.join(",")})
        ORDER BY "updatedAt" DESC, "createdAt" DESC
      `,
      params
    );

    return (response.records ?? [])
      .map((row) => {
        const id = fieldString(row, 0);
        const name = fieldString(row, 1);
        const language = fieldString(row, 2) ?? "es";
        const scopeRaw = fieldString(row, 3);
        const maxArticlesPerRun = fieldLong(row, 4) ?? 100;
        const definitionRaw = fieldString(row, 5);
        const executionRaw = fieldString(row, 6);
        const compiledRaw = fieldString(row, 7);

        if (!id || !name) return null;
        const scope = scopeRaw === "competencia" ? "competencia" : "claro";

        let definition: QueryDefinition = buildSimpleQueryDefinition(name);
        if (definitionRaw) {
          try {
            const parsed = JSON.parse(definitionRaw) as unknown;
            const validated = validateQueryDefinition(parsed);
            if (validated.valid) {
              definition = parsed as QueryDefinition;
            }
          } catch {
            // fallback to simple definition
          }
        }

        const execution = sanitizeExecutionConfig(
          executionRaw
            ? (() => {
                try {
                  return JSON.parse(executionRaw) as unknown;
                } catch {
                  return {};
                }
              })()
            : {}
        );

        const compiledDefinition =
          compiledRaw
            ? (() => {
                try {
                  const parsed = JSON.parse(compiledRaw) as unknown;
                  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                    return parsed as Record<string, unknown>;
                  }
                  return compileQueryDefinition(definition) as unknown as Record<string, unknown>;
                } catch {
                  return compileQueryDefinition(definition) as unknown as Record<string, unknown>;
                }
              })()
            : (compileQueryDefinition(definition) as unknown as Record<string, unknown>);

        return {
          id,
          name,
          language,
          scope,
          maxArticlesPerRun: Math.max(1, maxArticlesPerRun),
          definition,
          execution,
          compiledDefinition
        } satisfies IngestionQueryTarget;
      })
      .filter((item): item is IngestionQueryTarget => item !== null);
  }

  async listActiveTermNames(limit = 50): Promise<string[]> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const response = await this.rds.execute(
      `
        SELECT "name"
        FROM "public"."TrackedTerm"
        WHERE "isActive" = TRUE
        ORDER BY "updatedAt" DESC, "createdAt" DESC
        LIMIT :limit
      `,
      [sqlLong("limit", safeLimit)]
    );

    return (response.records ?? [])
      .map((row) => fieldString(row, 0))
      .filter((name): name is string => Boolean(name));
  }

  async listActiveQueries(limit = 50): Promise<IngestionQueryTarget[]> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const response = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "name",
          "language",
          "scope"::text,
          "maxArticlesPerRun",
          "definition"::text,
          "execution"::text,
          "compiledDefinition"::text
        FROM "public"."TrackedTerm"
        WHERE "isActive" = TRUE
        ORDER BY "priority" ASC, "updatedAt" DESC, "createdAt" DESC
        LIMIT :limit
      `,
      [sqlLong("limit", safeLimit)]
    );

    return (response.records ?? [])
      .map((row) => {
        const id = fieldString(row, 0);
        const name = fieldString(row, 1);
        const language = fieldString(row, 2) ?? "es";
        const scopeRaw = fieldString(row, 3);
        const maxArticlesPerRun = fieldLong(row, 4) ?? 100;
        const definitionRaw = fieldString(row, 5);
        const executionRaw = fieldString(row, 6);
        const compiledRaw = fieldString(row, 7);

        if (!id || !name) return null;
        const scope = scopeRaw === "competencia" ? "competencia" : "claro";

        let definition: QueryDefinition = buildSimpleQueryDefinition(name);
        if (definitionRaw) {
          try {
            const parsed = JSON.parse(definitionRaw) as unknown;
            const validated = validateQueryDefinition(parsed);
            if (validated.valid) {
              definition = parsed as QueryDefinition;
            }
          } catch {
            // fallback to simple definition
          }
        }

        const execution = sanitizeExecutionConfig(
          executionRaw
            ? (() => {
                try {
                  return JSON.parse(executionRaw) as unknown;
                } catch {
                  return {};
                }
              })()
            : {}
        );

        const compiledDefinition =
          compiledRaw
            ? (() => {
                try {
                  const parsed = JSON.parse(compiledRaw) as unknown;
                  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                    return parsed as Record<string, unknown>;
                  }
                  return compileQueryDefinition(definition) as unknown as Record<string, unknown>;
                } catch {
                  return compileQueryDefinition(definition) as unknown as Record<string, unknown>;
                }
              })()
            : (compileQueryDefinition(definition) as unknown as Record<string, unknown>);

        return {
          id,
          name,
          language,
          scope,
          maxArticlesPerRun: Math.max(1, maxArticlesPerRun),
          definition,
          execution,
          compiledDefinition
        } satisfies IngestionQueryTarget;
      })
      .filter((item): item is IngestionQueryTarget => item !== null);
  }

  async upsertContentItems(items: PersistableContentItem[]): Promise<UpsertedContentRef[]> {
    if (items.length === 0) return [];

    const sql = `
      INSERT INTO "public"."ContentItem"
        ("id", "sourceType", "termId", "queryIdSnapshot", "queryNameSnapshot", "queryScopeSnapshot", "provider", "sourceName", "sourceId", "title", "summary", "content", "canonicalUrl", "imageUrl", "language", "category", "publishedAt", "rawPayloadS3Key", "metadata", "createdAt", "updatedAt")
      VALUES
        (CAST(:id AS UUID), CAST(:source_type AS "public"."SourceType"), CAST(:term_id AS UUID), CAST(:query_id_snapshot AS UUID), :query_name_snapshot, CAST(:query_scope_snapshot AS "public"."TermScope"), :provider, :source_name, :source_id, :title, :summary, :content, :canonical_url, :image_url, :language, :category, CAST(:published_at AS TIMESTAMP), :raw_payload_s3_key, CAST(:metadata AS JSONB), NOW(), NOW())
      ON CONFLICT ("canonicalUrl") DO UPDATE SET
        "provider" = EXCLUDED."provider",
        "queryIdSnapshot" = COALESCE("public"."ContentItem"."queryIdSnapshot", EXCLUDED."queryIdSnapshot"),
        "queryNameSnapshot" = COALESCE("public"."ContentItem"."queryNameSnapshot", EXCLUDED."queryNameSnapshot"),
        "queryScopeSnapshot" = COALESCE("public"."ContentItem"."queryScopeSnapshot", EXCLUDED."queryScopeSnapshot"),
        "sourceName" = COALESCE(EXCLUDED."sourceName", "public"."ContentItem"."sourceName"),
        "sourceId" = COALESCE(EXCLUDED."sourceId", "public"."ContentItem"."sourceId"),
        "title" = EXCLUDED."title",
        "summary" = COALESCE(EXCLUDED."summary", "public"."ContentItem"."summary"),
        "content" = COALESCE(EXCLUDED."content", "public"."ContentItem"."content"),
        "imageUrl" = COALESCE(EXCLUDED."imageUrl", "public"."ContentItem"."imageUrl"),
        "language" = COALESCE(EXCLUDED."language", "public"."ContentItem"."language"),
        "category" = COALESCE(EXCLUDED."category", "public"."ContentItem"."category"),
        "publishedAt" = COALESCE(EXCLUDED."publishedAt", "public"."ContentItem"."publishedAt"),
        "rawPayloadS3Key" = EXCLUDED."rawPayloadS3Key",
        "metadata" = EXCLUDED."metadata",
        "updatedAt" = NOW(),
        "termId" = COALESCE("public"."ContentItem"."termId", EXCLUDED."termId")
      RETURNING "id"::text, "canonicalUrl"
    `;

    const refs: UpsertedContentRef[] = [];

    for (const item of items) {
      const metadata = {
        ...(item.article.metadata ?? {}),
        author: item.article.author ?? null,
        ingestion: {
          run_id: item.runId,
          term: item.term,
          trigger_type: item.triggerType,
          raw_s3_key: item.rawPayloadS3Key
        }
      };

      const publishedAt = item.article.publishedAt ? new Date(item.article.publishedAt) : null;
      const isValidDate = Boolean(publishedAt && !Number.isNaN(publishedAt.getTime()));

      const response = await this.rds.execute(sql, [
        sqlUuid("id", randomUUID()),
        sqlString("source_type", item.article.sourceType),
        sqlUuid("term_id", item.termId),
        sqlUuid("query_id_snapshot", item.termId),
        sqlString("query_name_snapshot", item.term),
        sqlString("query_scope_snapshot", item.termScope),
        sqlString("provider", item.article.provider),
        sqlString("source_name", item.article.sourceName),
        sqlString("source_id", item.article.sourceId),
        sqlString("title", item.article.title),
        sqlString("summary", item.article.summary),
        sqlString("content", item.article.content),
        sqlString("canonical_url", item.article.canonicalUrl),
        sqlString("image_url", item.article.imageUrl),
        sqlString("language", item.article.language),
        sqlString("category", item.article.category),
        sqlTimestamp("published_at", isValidDate ? (publishedAt as Date) : null),
        sqlString("raw_payload_s3_key", item.rawPayloadS3Key),
        sqlJson("metadata", metadata)
      ]);

      const row = response.records?.[0];
      const contentItemId = fieldString(row, 0);
      const canonicalUrl = fieldString(row, 1);
      if (contentItemId && canonicalUrl) {
        refs.push({
          contentItemId,
          canonicalUrl,
          provider: item.article.provider
        });
      }
    }

    return refs;
  }

  async upsertRunContentLinks(runId: string, term: string, refs: UpsertedContentRef[]): Promise<Set<string>> {
    const insertedCanonicalUrls = new Set<string>();

    for (const ref of refs) {
      const response = await this.rds.execute(
        `
          INSERT INTO "public"."IngestionRunContentLink"
            ("id", "ingestionRunId", "contentItemId", "canonicalUrl", "provider", "term", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:run_id AS UUID), CAST(:content_item_id AS UUID), :canonical_url, :provider, :term, NOW())
          ON CONFLICT DO NOTHING
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("run_id", runId),
          sqlUuid("content_item_id", ref.contentItemId),
          sqlString("canonical_url", ref.canonicalUrl),
          sqlString("provider", ref.provider),
          sqlString("term", term)
        ]
      );

      if ((response.numberOfRecordsUpdated ?? 0) > 0) {
        insertedCanonicalUrls.add(ref.canonicalUrl);
      }
    }

    return insertedCanonicalUrls;
  }

  async replaceRunItems(items: PersistableRunItem[]): Promise<void> {
    if (items.length === 0) return;

    const sql = `
      INSERT INTO "public"."IngestionRunItem"
        ("id", "ingestionRunId", "provider", "status", "fetchedCount", "persistedCount", "latencyMs", "errorMessage", "createdAt")
      VALUES
        (CAST(:id AS UUID), CAST(:ingestion_run_id AS UUID), :provider, CAST(:status AS "public"."RunStatus"), :fetched_count, :persisted_count, :latency_ms, :error_message, NOW())
    `;

    const parameterSets = items.map((item) => [
      sqlUuid("id", randomUUID()),
      sqlUuid("ingestion_run_id", item.runId),
      sqlString("provider", item.provider),
      sqlString("status", item.status),
      sqlLong("fetched_count", item.fetchedCount),
      sqlLong("persisted_count", item.persistedCount),
      sqlLong("latency_ms", item.latencyMs),
      sqlString("error_message", item.errorMessage)
    ]);

    await this.rds.batchExecute(sql, parameterSets);
  }

  async finishRun(input: RunFinishInput): Promise<void> {
    await this.rds.execute(
      `
        UPDATE "public"."IngestionRun"
        SET
          "status" = CAST(:status AS "public"."RunStatus"),
          "finishedAt" = :finished_at,
          "metrics" = CAST(:metrics AS JSONB),
          "errorMessage" = :error_message
        WHERE "id" = CAST(:run_id AS UUID)
      `,
      [
        sqlString("status", input.status),
        sqlTimestamp("finished_at", input.finishedAt),
        sqlJson("metrics", input.metrics),
        sqlString("error_message", input.errorMessage),
        sqlUuid("run_id", input.runId)
      ]
    );
  }
}

export const createIngestionSqlStore = (): IngestionSqlStore | null => {
  const client = RdsDataClient.fromEnv();
  if (!client) return null;
  return new IngestionSqlStore(client);
};

export type { IngestionQueryTarget, PersistableContentItem, PersistableRunItem, TriggerType, RunSnapshot };
