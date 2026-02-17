import { randomUUID } from "crypto";
import {
  RdsDataClient,
  fieldBoolean,
  fieldDate,
  fieldLong,
  fieldString,
  sqlBoolean,
  sqlLong,
  sqlString,
  sqlTimestamp,
  sqlUuid
} from "./rdsData";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CursorPayload = {
  created_at: string;
  id: string;
};

type TermRecord = {
  id: string;
  name: string;
  language: string;
  isActive: boolean;
  maxArticlesPerRun: number;
  createdAt: Date;
  updatedAt: Date;
};

type TermsPage = {
  items: TermRecord[];
  nextCursor: string | null;
  hasNext: boolean;
};

type CreateTermInput = {
  name: string;
  language: string;
  maxArticlesPerRun: number;
};

type UpdateTermInput = {
  name?: string;
  language?: string;
  isActive?: boolean;
  maxArticlesPerRun?: number;
};

type ContentFilters = {
  state?: "active" | "archived" | "hidden";
  sourceType?: "news" | "social";
  termId?: string;
  provider?: string;
  category?: string;
  sentimiento?: string;
  from?: Date;
  to?: Date;
  query?: string;
};

type ContentRecord = {
  id: string;
  sourceType: "news" | "social";
  termId: string | null;
  provider: string;
  sourceName: string | null;
  sourceId: string | null;
  state: "active" | "archived" | "hidden";
  title: string;
  summary: string | null;
  content: string | null;
  canonicalUrl: string;
  imageUrl: string | null;
  language: string | null;
  category: string | null;
  publishedAt: Date | null;
  sourceScore: number;
  rawPayloadS3Key: string | null;
  categoria: string | null;
  sentimiento: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ContentPage = {
  items: ContentRecord[];
  nextCursor: string | null;
  hasNext: boolean;
};

type MetaCountItem = {
  value: string;
  count: number;
};

type MetaResponse = {
  providers: MetaCountItem[];
  categories: MetaCountItem[];
  sentimientos: MetaCountItem[];
  states: MetaCountItem[];
};

type IngestionRunSnapshot = {
  status: "queued" | "running" | "completed" | "failed";
  startedAt: Date | null;
};

export class AppStoreError extends Error {
  constructor(public readonly code: "conflict" | "validation", message: string) {
    super(message);
    this.name = "AppStoreError";
  }
}

const isUniqueViolation = (error: unknown): boolean => {
  const message = (error as Error).message ?? "";
  return /duplicate key value|unique constraint/i.test(message);
};

const encodeCursor = (value: CursorPayload): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeCursor = (value?: string): CursorPayload | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as CursorPayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.created_at !== "string" || typeof parsed.id !== "string") return null;
    if (!UUID_REGEX.test(parsed.id)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const asDateOrThrow = (value: string, fieldName: string): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppStoreError("validation", `Invalid ${fieldName}`);
  }
  return parsed;
};

class AppStore {
  constructor(private readonly rds: RdsDataClient) {}

  async getIngestionRunSnapshot(runId: string): Promise<IngestionRunSnapshot | null> {
    const response = await this.rds.execute(
      `
        SELECT
          "status"::text,
          "startedAt"
        FROM "public"."IngestionRun"
        WHERE "id" = CAST(:run_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("run_id", runId)]
    );

    const row = response.records?.[0];
    if (!row) return null;

    const status = fieldString(row, 0) as IngestionRunSnapshot["status"] | null;
    if (!status) return null;

    return {
      status,
      startedAt: fieldDate(row, 1)
    };
  }

  async resolveTermsByIds(termIds: string[]): Promise<Array<{ id: string; name: string }>> {
    const ids = [...new Set(termIds)].filter((id) => UUID_REGEX.test(id)).slice(0, 50);
    if (ids.length === 0) return [];

    const placeholders = ids.map((_, index) => `CAST(:term_id_${index} AS UUID)`);
    const params = ids.map((id, index) => sqlUuid(`term_id_${index}`, id));

    const response = await this.rds.execute(
      `
        SELECT "id"::text, "name"
        FROM "public"."TrackedTerm"
        WHERE "id" IN (${placeholders.join(",")})
      `,
      params
    );

    return (response.records ?? [])
      .map((row) => {
        const id = fieldString(row, 0);
        const name = fieldString(row, 1);
        if (!id || !name) return null;
        return { id, name };
      })
      .filter((item): item is { id: string; name: string } => item !== null);
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
      .filter((value): value is string => Boolean(value));
  }

  async listTerms(limit: number, cursor?: string): Promise<TermsPage> {
    const safeLimit = Math.min(200, Math.max(1, limit));
    const cursorPayload = decodeCursor(cursor);
    if (cursor && !cursorPayload) {
      throw new AppStoreError("validation", "Invalid cursor");
    }

    const conditions: string[] = [];
    const params = [sqlLong("limit_plus_one", safeLimit + 1)];

    if (cursorPayload) {
      const cursorDate = asDateOrThrow(cursorPayload.created_at, "cursor");
      conditions.push(
        `(t."createdAt" < :cursor_created_at OR (t."createdAt" = :cursor_created_at AND t."id" < CAST(:cursor_id AS UUID)))`
      );
      params.push(sqlTimestamp("cursor_created_at", cursorDate), sqlUuid("cursor_id", cursorPayload.id));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const response = await this.rds.execute(
      `
        SELECT
          t."id"::text,
          t."name",
          t."language",
          t."isActive",
          t."maxArticlesPerRun",
          t."createdAt",
          t."updatedAt"
        FROM "public"."TrackedTerm" t
        ${whereClause}
        ORDER BY t."createdAt" DESC, t."id" DESC
        LIMIT :limit_plus_one
      `,
      params
    );

    const rows = response.records ?? [];
    const hasNext = rows.length > safeLimit;
    const sliced = hasNext ? rows.slice(0, safeLimit) : rows;

    const items = sliced
      .map((row) => {
        const id = fieldString(row, 0);
        const name = fieldString(row, 1);
        const language = fieldString(row, 2);
        const isActive = fieldBoolean(row, 3);
        const maxArticlesPerRun = fieldLong(row, 4);
        const createdAt = fieldDate(row, 5);
        const updatedAt = fieldDate(row, 6);

        if (!id || !name || !language || isActive === null || maxArticlesPerRun === null || !createdAt || !updatedAt) {
          return null;
        }

        return {
          id,
          name,
          language,
          isActive,
          maxArticlesPerRun,
          createdAt,
          updatedAt
        };
      })
      .filter((item): item is TermRecord => item !== null);

    const last = items[items.length - 1];
    const nextCursor = hasNext && last ? encodeCursor({ created_at: last.createdAt.toISOString(), id: last.id }) : null;

    return {
      items,
      nextCursor,
      hasNext
    };
  }

  async createTerm(input: CreateTermInput): Promise<TermRecord> {
    try {
      const response = await this.rds.execute(
        `
          INSERT INTO "public"."TrackedTerm"
            ("id", "name", "language", "isActive", "maxArticlesPerRun", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), :name, :language, TRUE, :max_articles_per_run, NOW(), NOW())
          RETURNING
            "id"::text,
            "name",
            "language",
            "isActive",
            "maxArticlesPerRun",
            "createdAt",
            "updatedAt"
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("name", input.name),
          sqlString("language", input.language),
          sqlLong("max_articles_per_run", input.maxArticlesPerRun)
        ]
      );

      const row = response.records?.[0];
      const id = fieldString(row, 0);
      const name = fieldString(row, 1);
      const language = fieldString(row, 2);
      const isActive = fieldBoolean(row, 3);
      const maxArticlesPerRun = fieldLong(row, 4);
      const createdAt = fieldDate(row, 5);
      const updatedAt = fieldDate(row, 6);

      if (!id || !name || !language || isActive === null || maxArticlesPerRun === null || !createdAt || !updatedAt) {
        throw new Error("Failed to parse created term");
      }

      return {
        id,
        name,
        language,
        isActive,
        maxArticlesPerRun,
        createdAt,
        updatedAt
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppStoreError("conflict", "Term with same name and language already exists");
      }
      throw error;
    }
  }

  async updateTerm(id: string, input: UpdateTermInput): Promise<TermRecord | null> {
    const setParts: string[] = ["\"updatedAt\" = NOW()"];
    const params = [sqlUuid("id", id)];

    if (input.name !== undefined) {
      setParts.push('"name" = :name');
      params.push(sqlString("name", input.name));
    }

    if (input.language !== undefined) {
      setParts.push('"language" = :language');
      params.push(sqlString("language", input.language));
    }

    if (input.isActive !== undefined) {
      setParts.push('"isActive" = :is_active');
      params.push(sqlBoolean("is_active", input.isActive));
    }

    if (input.maxArticlesPerRun !== undefined) {
      setParts.push('"maxArticlesPerRun" = :max_articles_per_run');
      params.push(sqlLong("max_articles_per_run", input.maxArticlesPerRun));
    }

    try {
      const response = await this.rds.execute(
        `
          UPDATE "public"."TrackedTerm"
          SET ${setParts.join(", ")}
          WHERE "id" = CAST(:id AS UUID)
          RETURNING
            "id"::text,
            "name",
            "language",
            "isActive",
            "maxArticlesPerRun",
            "createdAt",
            "updatedAt"
        `,
        params
      );

      const row = response.records?.[0];
      if (!row) return null;

      const term: TermRecord | null = {
        id: fieldString(row, 0) ?? "",
        name: fieldString(row, 1) ?? "",
        language: fieldString(row, 2) ?? "",
        isActive: fieldBoolean(row, 3) ?? false,
        maxArticlesPerRun: fieldLong(row, 4) ?? 0,
        createdAt: fieldDate(row, 5) ?? new Date(0),
        updatedAt: fieldDate(row, 6) ?? new Date(0)
      };

      if (!term.id || !term.name || !term.language || term.maxArticlesPerRun <= 0 || Number.isNaN(term.createdAt.getTime())) {
        throw new Error("Failed to parse updated term");
      }

      return term;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppStoreError("conflict", "Term with same name and language already exists");
      }
      throw error;
    }
  }

  async listContent(limit: number, filters: ContentFilters, cursor?: string): Promise<ContentPage> {
    const safeLimit = Math.min(200, Math.max(1, limit));
    const cursorPayload = decodeCursor(cursor);
    if (cursor && !cursorPayload) {
      throw new AppStoreError("validation", "Invalid cursor");
    }

    const conditions: string[] = [];
    const params = [sqlLong("limit_plus_one", safeLimit + 1)];

    if (filters.state) {
      conditions.push('ci."state" = CAST(:state AS "public"."ContentState")');
      params.push(sqlString("state", filters.state));
    }

    if (filters.sourceType) {
      conditions.push('ci."sourceType" = CAST(:source_type AS "public"."SourceType")');
      params.push(sqlString("source_type", filters.sourceType));
    }

    if (filters.termId) {
      conditions.push('ci."termId" = CAST(:term_id AS UUID)');
      params.push(sqlUuid("term_id", filters.termId));
    }

    if (filters.provider) {
      conditions.push('LOWER(ci."provider") = LOWER(:provider)');
      params.push(sqlString("provider", filters.provider));
    }

    if (filters.category) {
      conditions.push('LOWER(ci."category") = LOWER(:category)');
      params.push(sqlString("category", filters.category));
    }

    if (filters.sentimiento) {
      conditions.push('LOWER(cls."sentimiento") = LOWER(:sentimiento)');
      params.push(sqlString("sentimiento", filters.sentimiento));
    }

    if (filters.from) {
      conditions.push('ci."publishedAt" >= :from_date');
      params.push(sqlTimestamp("from_date", filters.from));
    }

    if (filters.to) {
      conditions.push('ci."publishedAt" <= :to_date');
      params.push(sqlTimestamp("to_date", filters.to));
    }

    if (filters.query) {
      conditions.push(
        `to_tsvector('simple', COALESCE(ci."title", '') || ' ' || COALESCE(ci."summary", '') || ' ' || COALESCE(ci."content", '')) @@ plainto_tsquery('simple', :query_text)`
      );
      params.push(sqlString("query_text", filters.query));
    }

    if (cursorPayload) {
      const cursorDate = asDateOrThrow(cursorPayload.created_at, "cursor");
      conditions.push(
        `(ci."createdAt" < :cursor_created_at OR (ci."createdAt" = :cursor_created_at AND ci."id" < CAST(:cursor_id AS UUID)))`
      );
      params.push(sqlTimestamp("cursor_created_at", cursorDate), sqlUuid("cursor_id", cursorPayload.id));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const response = await this.rds.execute(
      `
        SELECT
          ci."id"::text,
          ci."sourceType"::text,
          ci."termId"::text,
          ci."provider",
          ci."sourceName",
          ci."sourceId",
          ci."state"::text,
          ci."title",
          ci."summary",
          ci."content",
          ci."canonicalUrl",
          ci."imageUrl",
          ci."language",
          ci."category",
          ci."publishedAt",
          ci."sourceScore"::text,
          ci."rawPayloadS3Key",
          ci."createdAt",
          ci."updatedAt",
          cls."categoria",
          cls."sentimiento"
        FROM "public"."ContentItem" ci
        LEFT JOIN LATERAL (
          SELECT c."categoria", c."sentimiento"
          FROM "public"."Classification" c
          WHERE c."contentItemId" = ci."id"
          ORDER BY c."createdAt" DESC
          LIMIT 1
        ) cls ON TRUE
        ${whereClause}
        ORDER BY ci."createdAt" DESC, ci."id" DESC
        LIMIT :limit_plus_one
      `,
      params
    );

    const rows = response.records ?? [];
    const hasNext = rows.length > safeLimit;
    const sliced = hasNext ? rows.slice(0, safeLimit) : rows;

    const items = sliced
      .map((row) => {
        const id = fieldString(row, 0);
        const sourceType = fieldString(row, 1) as "news" | "social" | null;
        const termId = fieldString(row, 2);
        const provider = fieldString(row, 3);
        const sourceName = fieldString(row, 4);
        const sourceId = fieldString(row, 5);
        const state = fieldString(row, 6) as "active" | "archived" | "hidden" | null;
        const title = fieldString(row, 7);
        const summary = fieldString(row, 8);
        const content = fieldString(row, 9);
        const canonicalUrl = fieldString(row, 10);
        const imageUrl = fieldString(row, 11);
        const language = fieldString(row, 12);
        const category = fieldString(row, 13);
        const publishedAt = fieldDate(row, 14);
        const sourceScoreRaw = fieldString(row, 15) ?? "0.5";
        const rawPayloadS3Key = fieldString(row, 16);
        const createdAt = fieldDate(row, 17);
        const updatedAt = fieldDate(row, 18);
        const categoria = fieldString(row, 19);
        const sentimiento = fieldString(row, 20);

        const sourceScore = Number.parseFloat(sourceScoreRaw);

        if (!id || !sourceType || !provider || !state || !title || !canonicalUrl || !createdAt || !updatedAt) {
          return null;
        }

        return {
          id,
          sourceType,
          termId,
          provider,
          sourceName,
          sourceId,
          state,
          title,
          summary,
          content,
          canonicalUrl,
          imageUrl,
          language,
          category,
          publishedAt,
          sourceScore: Number.isFinite(sourceScore) ? sourceScore : 0.5,
          rawPayloadS3Key,
          categoria,
          sentimiento,
          createdAt,
          updatedAt
        };
      })
      .filter((item): item is ContentRecord => item !== null);

    const last = items[items.length - 1];
    const nextCursor = hasNext && last ? encodeCursor({ created_at: last.createdAt.toISOString(), id: last.id }) : null;

    return {
      items,
      nextCursor,
      hasNext
    };
  }

  async getMeta(): Promise<MetaResponse> {
    const [providersRes, categoriesRes, sentimientosRes, statesRes] = await Promise.all([
      this.rds.execute(
        `
          SELECT "provider", COUNT(*)::bigint
          FROM "public"."ContentItem"
          GROUP BY "provider"
          ORDER BY COUNT(*) DESC, "provider" ASC
        `
      ),
      this.rds.execute(
        `
          SELECT "category", COUNT(*)::bigint
          FROM "public"."ContentItem"
          WHERE "category" IS NOT NULL AND "category" <> ''
          GROUP BY "category"
          ORDER BY COUNT(*) DESC, "category" ASC
        `
      ),
      this.rds.execute(
        `
          SELECT latest."sentimiento", COUNT(*)::bigint
          FROM (
            SELECT DISTINCT ON (c."contentItemId") c."contentItemId", c."sentimiento"
            FROM "public"."Classification" c
            ORDER BY c."contentItemId", c."createdAt" DESC
          ) latest
          WHERE latest."sentimiento" IS NOT NULL AND latest."sentimiento" <> ''
          GROUP BY latest."sentimiento"
          ORDER BY COUNT(*) DESC, latest."sentimiento" ASC
        `
      ),
      this.rds.execute(
        `
          SELECT "state"::text, COUNT(*)::bigint
          FROM "public"."ContentItem"
          GROUP BY "state"
        `
      )
    ]);

    const providers = (providersRes.records ?? [])
      .map((row) => {
        const value = fieldString(row, 0);
        const count = fieldLong(row, 1);
        if (!value || count === null) return null;
        return { value, count };
      })
      .filter((item): item is MetaCountItem => item !== null);

    const categories = (categoriesRes.records ?? [])
      .map((row) => {
        const value = fieldString(row, 0);
        const count = fieldLong(row, 1);
        if (!value || count === null) return null;
        return { value, count };
      })
      .filter((item): item is MetaCountItem => item !== null);

    const sentimientos = (sentimientosRes.records ?? [])
      .map((row) => {
        const value = fieldString(row, 0);
        const count = fieldLong(row, 1);
        if (!value || count === null) return null;
        return { value, count };
      })
      .filter((item): item is MetaCountItem => item !== null);

    const stateCountMap = new Map<string, number>();
    for (const row of statesRes.records ?? []) {
      const value = fieldString(row, 0);
      const count = fieldLong(row, 1);
      if (value && count !== null) stateCountMap.set(value, count);
    }

    const states: MetaCountItem[] = ["active", "archived", "hidden"].map((value) => ({
      value,
      count: stateCountMap.get(value) ?? 0
    }));

    return {
      providers,
      categories,
      sentimientos,
      states
    };
  }
}

export const createAppStore = (): AppStore | null => {
  const client = RdsDataClient.fromEnv();
  if (!client) return null;
  return new AppStore(client);
};

export type { ContentFilters, ContentPage, ContentRecord, MetaCountItem, MetaResponse, TermRecord, TermsPage, UpdateTermInput };
