import { randomUUID } from "crypto";
import { RdsDataClient, fieldDate, fieldString, sqlJson, sqlLong, sqlString, sqlTimestamp, sqlUuid } from "./rdsData";

export type ClassificationPendingItem = {
  contentItemId: string;
};

export type ContentForClassificationPrompt = {
  id: string;
  sourceType: string;
  provider: string;
  language: string | null;
  title: string;
  summary: string | null;
  content: string | null;
  publishedAt: Date | null;
  createdAt: Date;
};

export type UpsertAutoClassificationInput = {
  contentItemId: string;
  categoria: string;
  sentimiento: string;
  etiquetas: string[];
  confianza: number | null;
  resumen: string | null;
  promptVersion: string;
  modelId: string;
  requestId: string | null;
  requestedAt: string | null;
  triggerType: "manual" | "scheduled";
};

class ClassificationStore {
  constructor(private readonly rds: RdsDataClient) {}

  async listPendingContentIds(input: {
    limit: number;
    windowStart: Date;
    promptVersion: string;
    modelId: string;
    sourceType: "news";
  }): Promise<string[]> {
    const safeLimit = Math.min(500, Math.max(1, input.limit));
    const response = await this.rds.execute(
      `
        SELECT ci."id"::text
        FROM "public"."ContentItem" ci
        WHERE
          ci."sourceType" = CAST(:source_type AS "public"."SourceType")
          AND ci."state" = CAST('active' AS "public"."ContentState")
          AND COALESCE(ci."publishedAt", ci."createdAt") >= :window_start
          AND NOT EXISTS (
            SELECT 1
            FROM "public"."Classification" c
            WHERE c."contentItemId" = ci."id"
              AND c."isOverride" = TRUE
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "public"."Classification" c
            WHERE c."contentItemId" = ci."id"
              AND c."promptVersion" = :prompt_version
              AND c."modelId" = :model_id
              AND c."isOverride" = FALSE
          )
        ORDER BY
          COALESCE(ci."publishedAt", ci."createdAt") DESC,
          ci."createdAt" DESC,
          ci."id" DESC
        LIMIT :limit
      `,
      [
        sqlString("source_type", input.sourceType),
        sqlTimestamp("window_start", input.windowStart),
        sqlString("prompt_version", input.promptVersion),
        sqlString("model_id", input.modelId),
        sqlLong("limit", safeLimit)
      ]
    );

    return (response.records ?? [])
      .map((row) => fieldString(row, 0))
      .filter((value): value is string => Boolean(value));
  }

  async getContentForPrompt(contentItemId: string): Promise<ContentForClassificationPrompt | null> {
    const response = await this.rds.execute(
      `
        SELECT
          ci."id"::text,
          ci."sourceType"::text,
          ci."provider",
          ci."language",
          ci."title",
          ci."summary",
          ci."content",
          ci."publishedAt",
          ci."createdAt"
        FROM "public"."ContentItem" ci
        WHERE ci."id" = CAST(:content_item_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("content_item_id", contentItemId)]
    );

    const row = response.records?.[0];
    const id = fieldString(row, 0);
    const sourceType = fieldString(row, 1);
    const provider = fieldString(row, 2);
    const language = fieldString(row, 3);
    const title = fieldString(row, 4);
    const summary = fieldString(row, 5);
    const content = fieldString(row, 6);
    const publishedAt = fieldDate(row, 7);
    const createdAt = fieldDate(row, 8);

    if (!id || !sourceType || !provider || !title) return null;

    if (!createdAt || Number.isNaN(createdAt.getTime())) return null;

    return {
      id,
      sourceType,
      provider,
      language,
      title,
      summary,
      content,
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
      createdAt
    };
  }

  async hasManualOverride(contentItemId: string): Promise<boolean> {
    const response = await this.rds.execute(
      `
        SELECT 1
        FROM "public"."Classification" c
        WHERE c."contentItemId" = CAST(:content_item_id AS UUID)
          AND c."isOverride" = TRUE
        LIMIT 1
      `,
      [sqlUuid("content_item_id", contentItemId)]
    );

    return Boolean(fieldString(response.records?.[0], 0));
  }

  async upsertAutoClassification(input: UpsertAutoClassificationInput): Promise<void> {
    const tx = await this.rds.beginTransaction();

    try {
      const overrideResponse = await this.rds.execute(
        `
          SELECT 1
          FROM "public"."Classification" c
          WHERE c."contentItemId" = CAST(:content_item_id AS UUID)
            AND c."isOverride" = TRUE
          LIMIT 1
        `,
        [sqlUuid("content_item_id", input.contentItemId)],
        { transactionId: tx }
      );

      if (fieldString(overrideResponse.records?.[0], 0)) {
        await this.rds.commitTransaction(tx);
        return;
      }

      await this.rds.execute(
        `
          INSERT INTO "public"."Classification"
            ("id", "contentItemId", "categoria", "sentimiento", "etiquetas", "confianza", "promptVersion", "modelId", "isOverride", "metadata", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), CAST(:content_item_id AS UUID), :categoria, :sentimiento, CAST(:etiquetas AS JSONB), CAST(:confianza AS DECIMAL(4,3)), :prompt_version, :model_id, FALSE, CAST(:metadata AS JSONB), NOW(), NOW())
          ON CONFLICT ("contentItemId", "promptVersion", "modelId") DO UPDATE SET
            "categoria" = EXCLUDED."categoria",
            "sentimiento" = EXCLUDED."sentimiento",
            "etiquetas" = EXCLUDED."etiquetas",
            "confianza" = EXCLUDED."confianza",
            "isOverride" = FALSE,
            "metadata" = EXCLUDED."metadata",
            "updatedAt" = NOW()
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("content_item_id", input.contentItemId),
          sqlString("categoria", input.categoria),
          sqlString("sentimiento", input.sentimiento),
          sqlJson("etiquetas", input.etiquetas),
          sqlString("confianza", input.confianza === null ? null : String(input.confianza)),
          sqlString("prompt_version", input.promptVersion),
          sqlString("model_id", input.modelId),
          sqlJson("metadata", {
            source: "auto_classifier",
            resumen: input.resumen,
            request_id: input.requestId,
            requested_at: input.requestedAt,
            trigger_type: input.triggerType
          })
        ],
        { transactionId: tx }
      );

      await this.rds.commitTransaction(tx);
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }
}

export const createClassificationStore = (): ClassificationStore | null => {
  const client = RdsDataClient.fromEnv();
  if (!client) return null;
  return new ClassificationStore(client);
};
