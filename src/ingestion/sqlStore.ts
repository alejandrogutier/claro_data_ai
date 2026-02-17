import AWS from "aws-sdk";
import { randomUUID } from "crypto";
import type { NormalizedArticle } from "./providers";

type TriggerType = "scheduled" | "manual";
type RunStatus = "running" | "completed" | "failed";

type SqlField = AWS.RDSDataService.Field;
type SqlParameter = AWS.RDSDataService.SqlParameter;

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
  triggerType: TriggerType;
  rawPayloadS3Key: string;
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

const MAX_BATCH_ITEMS = 20;

const asStringField = (name: string, value: string | null | undefined): SqlParameter => ({
  name,
  value: value === null || value === undefined ? { isNull: true } : { stringValue: value }
});

const asLongField = (name: string, value: number): SqlParameter => ({
  name,
  value: { longValue: Math.floor(value) }
});

const asTimestampField = (name: string, value: Date | null | undefined): SqlParameter => ({
  name,
  value: value ? { stringValue: value.toISOString().replace("T", " ").replace("Z", "") } : { isNull: true },
  typeHint: "TIMESTAMP"
});

const asJsonField = (name: string, value: Record<string, unknown>): SqlParameter => ({
  name,
  value: { stringValue: JSON.stringify(value) },
  typeHint: "JSON"
});

const asUuidField = (name: string, value: string | null): SqlParameter => ({
  name,
  value: value ? { stringValue: value } : { isNull: true },
  typeHint: "UUID"
});

const readFirstStringCell = (response: AWS.RDSDataService.ExecuteStatementResponse): string | null => {
  const row = response.records?.[0];
  const cell = row?.[0] as SqlField | undefined;
  if (!cell) return null;
  return cell.stringValue ?? null;
};

const chunk = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const hasSqlConfig = (): boolean =>
  Boolean(process.env.DB_RESOURCE_ARN && process.env.DB_SECRET_ARN && process.env.DB_NAME);

class IngestionSqlStore {
  private readonly client: AWS.RDSDataService;
  private readonly resourceArn: string;
  private readonly secretArn: string;
  private readonly database: string;

  constructor() {
    this.resourceArn = process.env.DB_RESOURCE_ARN as string;
    this.secretArn = process.env.DB_SECRET_ARN as string;
    this.database = process.env.DB_NAME as string;
    this.client = new AWS.RDSDataService({ region: process.env.AWS_REGION });
  }

  private async execute(sql: string, parameters: SqlParameter[] = []) {
    return this.client
      .executeStatement({
        resourceArn: this.resourceArn,
        secretArn: this.secretArn,
        database: this.database,
        sql,
        parameters,
        continueAfterTimeout: true
      })
      .promise();
  }

  private async batchExecute(sql: string, parameterSets: SqlParameter[][]) {
    if (parameterSets.length === 0) return;

    for (const setChunk of chunk(parameterSets, MAX_BATCH_ITEMS)) {
      await this.client
        .batchExecuteStatement({
          resourceArn: this.resourceArn,
          secretArn: this.secretArn,
          database: this.database,
          sql,
          parameterSets: setChunk
        })
        .promise();
    }
  }

  async startRun(input: RunStartInput): Promise<void> {
    await this.execute(
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
        asUuidField("run_id", input.runId),
        asStringField("trigger_type", input.triggerType),
        asStringField("language", input.language),
        asLongField("max_articles_per_term", input.maxArticlesPerTerm),
        asStringField("request_id", input.requestId),
        asTimestampField("started_at", input.startedAt)
      ]
    );

    await this.execute(`DELETE FROM "public"."IngestionRunItem" WHERE "ingestionRunId" = CAST(:run_id AS UUID)`, [
      asUuidField("run_id", input.runId)
    ]);
  }

  async ensureTrackedTerm(term: string, language: string, maxArticlesPerRun: number): Promise<string | null> {
    const response = await this.execute(
      `
        INSERT INTO "public"."TrackedTerm"
          ("id", "name", "language", "isActive", "maxArticlesPerRun", "createdAt", "updatedAt")
        VALUES
          (CAST(:id AS UUID), :name, :language, TRUE, :max_articles_per_run, NOW(), NOW())
        ON CONFLICT ("name", "language") DO UPDATE SET
          "isActive" = TRUE,
          "updatedAt" = NOW(),
          "maxArticlesPerRun" = GREATEST("public"."TrackedTerm"."maxArticlesPerRun", EXCLUDED."maxArticlesPerRun")
        RETURNING "id"
      `,
      [
        asUuidField("id", randomUUID()),
        asStringField("name", term),
        asStringField("language", language),
        asLongField("max_articles_per_run", maxArticlesPerRun)
      ]
    );

    return readFirstStringCell(response);
  }

  async upsertContentItems(items: PersistableContentItem[]): Promise<number> {
    if (items.length === 0) return 0;

    const sql = `
      INSERT INTO "public"."ContentItem"
        ("id", "sourceType", "termId", "provider", "sourceName", "sourceId", "title", "summary", "content", "canonicalUrl", "imageUrl", "language", "category", "publishedAt", "rawPayloadS3Key", "metadata", "createdAt", "updatedAt")
      VALUES
        (CAST(:id AS UUID), CAST(:source_type AS "public"."SourceType"), CAST(:term_id AS UUID), :provider, :source_name, :source_id, :title, :summary, :content, :canonical_url, :image_url, :language, :category, CAST(:published_at AS TIMESTAMP), :raw_payload_s3_key, CAST(:metadata AS JSONB), NOW(), NOW())
      ON CONFLICT ("canonicalUrl") DO UPDATE SET
        "provider" = EXCLUDED."provider",
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
    `;

    const parameterSets: SqlParameter[][] = items.map((item) => {
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

      return [
        asUuidField("id", randomUUID()),
        asStringField("source_type", item.article.sourceType),
        asUuidField("term_id", item.termId),
        asStringField("provider", item.article.provider),
        asStringField("source_name", item.article.sourceName),
        asStringField("source_id", item.article.sourceId),
        asStringField("title", item.article.title),
        asStringField("summary", item.article.summary),
        asStringField("content", item.article.content),
        asStringField("canonical_url", item.article.canonicalUrl),
        asStringField("image_url", item.article.imageUrl),
        asStringField("language", item.article.language),
        asStringField("category", item.article.category),
        asTimestampField("published_at", isValidDate ? (publishedAt as Date) : null),
        asStringField("raw_payload_s3_key", item.rawPayloadS3Key),
        asJsonField("metadata", metadata)
      ];
    });

    await this.batchExecute(sql, parameterSets);
    return items.length;
  }

  async replaceRunItems(items: PersistableRunItem[]): Promise<void> {
    if (items.length === 0) return;

    const sql = `
      INSERT INTO "public"."IngestionRunItem"
        ("id", "ingestionRunId", "provider", "status", "fetchedCount", "persistedCount", "latencyMs", "errorMessage", "createdAt")
      VALUES
        (CAST(:id AS UUID), CAST(:ingestion_run_id AS UUID), :provider, CAST(:status AS "public"."RunStatus"), :fetched_count, :persisted_count, :latency_ms, :error_message, NOW())
    `;

    const parameterSets: SqlParameter[][] = items.map((item) => [
      asUuidField("id", randomUUID()),
      asUuidField("ingestion_run_id", item.runId),
      asStringField("provider", item.provider),
      asStringField("status", item.status),
      asLongField("fetched_count", item.fetchedCount),
      asLongField("persisted_count", item.persistedCount),
      asLongField("latency_ms", item.latencyMs),
      asStringField("error_message", item.errorMessage)
    ]);

    await this.batchExecute(sql, parameterSets);
  }

  async finishRun(input: RunFinishInput): Promise<void> {
    await this.execute(
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
        asStringField("status", input.status),
        asTimestampField("finished_at", input.finishedAt),
        asJsonField("metrics", input.metrics),
        asStringField("error_message", input.errorMessage),
        asUuidField("run_id", input.runId)
      ]
    );
  }
}

export const createIngestionSqlStore = (): IngestionSqlStore | null => {
  if (!hasSqlConfig()) return null;
  return new IngestionSqlStore();
};

export type { PersistableContentItem, PersistableRunItem, TriggerType };
