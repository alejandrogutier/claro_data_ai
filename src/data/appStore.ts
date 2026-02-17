import { createHash, randomUUID } from "crypto";
import type { AuthPrincipal, UserRole } from "../core/auth";
import {
  RdsDataClient,
  fieldBoolean,
  fieldDate,
  fieldLong,
  fieldString,
  type SqlRow,
  sqlBoolean,
  sqlJson,
  sqlLong,
  sqlString,
  sqlTimestamp,
  sqlUuid
} from "./rdsData";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NEWS_FEED_LIMIT = 2;
const TERM_SCOPES = ["claro", "competencia"] as const;

type TermScope = (typeof TERM_SCOPES)[number];

type CursorPayload = {
  created_at: string;
  id: string;
};

type TermRecord = {
  id: string;
  name: string;
  language: string;
  scope: TermScope;
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
  scope: TermScope;
  maxArticlesPerRun: number;
};

type UpdateTermInput = {
  name?: string;
  language?: string;
  scope?: TermScope;
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

type MonitorSeverity = "SEV1" | "SEV2" | "SEV3" | "SEV4";

type MonitorScopeKpiRecord = {
  items: number;
  classifiedItems: number;
  positivos: number;
  negativos: number;
  neutrales: number;
  sentimientoNeto: number;
  riesgoActivo: number;
  qualityScore: number;
  bhs: number;
  sov: number;
  insufficientData: boolean;
};

type MonitorTotalsKpiRecord = {
  items: number;
  classifiedItems: number;
  sentimientoNeto: number;
  bhs: number;
  riesgoActivo: number;
  severidad: MonitorSeverity;
  sovClaro: number;
  sovCompetencia: number;
  insufficientData: boolean;
};

type MonitorOverviewRecord = {
  generatedAt: Date;
  windowDays: 7;
  sourceType: "news";
  formulaVersion: "kpi-v1";
  totals: MonitorTotalsKpiRecord;
  byScope: {
    claro: MonitorScopeKpiRecord;
    competencia: MonitorScopeKpiRecord;
  };
  diagnostics: {
    unscopedItems: number;
    unknownSentimentItems: number;
  };
};

type IngestionRunSnapshot = {
  status: "queued" | "running" | "completed" | "failed";
  startedAt: Date | null;
};

type ContentState = "active" | "archived" | "hidden";

type ContentStateEventRecord = {
  id: string;
  contentItemId: string;
  previousState: ContentState;
  nextState: ContentState;
  actorUserId: string;
  reason: string | null;
  createdAt: Date;
};

type ContentStateChangeInput = {
  contentItemId: string;
  targetState: ContentState;
  actorUserId: string;
  reason?: string;
  requestId?: string;
};

type ManualClassificationInput = {
  contentItemId: string;
  categoria: string;
  sentimiento: string;
  etiquetas?: string[] | null;
  confianza?: number | null;
  reason?: string;
  actorUserId: string;
  requestId?: string;
};

type ClassificationRecord = {
  id: string;
  contentItemId: string;
  categoria: string;
  sentimiento: string;
  etiquetas: string[] | null;
  confianza: number | null;
  promptVersion: string;
  modelId: string;
  isOverride: boolean;
  overriddenByUserId: string | null;
  overrideReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CreateExportJobInput = {
  requestedByUserId?: string | null;
  filters: Record<string, unknown>;
};

type ExportJobRecord = {
  id: string;
  requestedByUserId: string | null;
  status: "queued" | "running" | "completed" | "failed";
  filters: Record<string, unknown>;
  rowCount: number;
  s3Key: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export class AppStoreError extends Error {
  constructor(public readonly code: "conflict" | "validation" | "not_found", message: string) {
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

const isUuid = (value: string): boolean => UUID_REGEX.test(value);

const parseJsonString = (value: string | null): Record<string, unknown> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
};

const parseJsonArrayString = (value: string | null): string[] | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item) => String(item));
  } catch {
    return null;
  }
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const roundMetric = (value: number): number => Math.round(value * 100) / 100;

const normalizeSentimiento = (value: string | null): "positive" | "negative" | "neutral" | "unknown" | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "positive" || normalized === "positivo") return "positive";
  if (normalized === "negative" || normalized === "negativo") return "negative";
  if (normalized === "neutral" || normalized === "neutro") return "neutral";
  return "unknown";
};

const calculateSentimientoNeto = (positivos: number, negativos: number, classifiedItems: number): number =>
  ((positivos - negativos) / Math.max(classifiedItems, 1)) * 100;

const calculateRiesgoActivo = (negativos: number, classifiedItems: number): number =>
  (negativos / Math.max(classifiedItems, 1)) * 100;

const toSeveridad = (riesgoActivo: number): MonitorSeverity => {
  if (riesgoActivo >= 80) return "SEV1";
  if (riesgoActivo >= 60) return "SEV2";
  if (riesgoActivo >= 40) return "SEV3";
  return "SEV4";
};

const calculateBhs = (sentimientoNeto: number, qualityScore: number, riesgoActivo: number): number => {
  const sentimentScore = clamp(50 + sentimientoNeto / 2, 0, 100);
  return 0.5 * sentimentScore + 0.25 * qualityScore + 0.25 * (100 - riesgoActivo);
};

const parseContentRow = (row: SqlRow): ContentRecord | null => {
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
};

const toUserRole = (role: UserRole): UserRole => {
  if (role === "Admin" || role === "Analyst") return role;
  return "Viewer";
};

const uuidFromString = (value: string): string => {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  const variantNibble = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variantNibble}${hex.slice(17, 20)}`,
    hex.slice(20, 32)
  ].join("-");
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

  async listTerms(limit: number, cursor?: string, scope?: TermScope): Promise<TermsPage> {
    const safeLimit = Math.min(200, Math.max(1, limit));
    const cursorPayload = decodeCursor(cursor);
    if (cursor && !cursorPayload) {
      throw new AppStoreError("validation", "Invalid cursor");
    }

    const conditions: string[] = [];
    const params = [sqlLong("limit_plus_one", safeLimit + 1)];

    if (scope) {
      conditions.push('t."scope" = CAST(:scope AS "public"."TermScope")');
      params.push(sqlString("scope", scope));
    }

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
          t."scope"::text,
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
        const scope = fieldString(row, 3) as TermScope | null;
        const isActive = fieldBoolean(row, 4);
        const maxArticlesPerRun = fieldLong(row, 5);
        const createdAt = fieldDate(row, 6);
        const updatedAt = fieldDate(row, 7);

        if (
          !id ||
          !name ||
          !language ||
          !scope ||
          !TERM_SCOPES.includes(scope) ||
          isActive === null ||
          maxArticlesPerRun === null ||
          !createdAt ||
          !updatedAt
        ) {
          return null;
        }

        return {
          id,
          name,
          language,
          scope,
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
            ("id", "name", "language", "scope", "isActive", "maxArticlesPerRun", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), :name, :language, CAST(:scope AS "public"."TermScope"), TRUE, :max_articles_per_run, NOW(), NOW())
          RETURNING
            "id"::text,
            "name",
            "language",
            "scope"::text,
            "isActive",
            "maxArticlesPerRun",
            "createdAt",
            "updatedAt"
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("name", input.name),
          sqlString("language", input.language),
          sqlString("scope", input.scope),
          sqlLong("max_articles_per_run", input.maxArticlesPerRun)
        ]
      );

      const row = response.records?.[0];
      const id = fieldString(row, 0);
      const name = fieldString(row, 1);
      const language = fieldString(row, 2);
      const scope = fieldString(row, 3) as TermScope | null;
      const isActive = fieldBoolean(row, 4);
      const maxArticlesPerRun = fieldLong(row, 5);
      const createdAt = fieldDate(row, 6);
      const updatedAt = fieldDate(row, 7);

      if (
        !id ||
        !name ||
        !language ||
        !scope ||
        !TERM_SCOPES.includes(scope) ||
        isActive === null ||
        maxArticlesPerRun === null ||
        !createdAt ||
        !updatedAt
      ) {
        throw new Error("Failed to parse created term");
      }

      return {
        id,
        name,
        language,
        scope,
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

    if (input.scope !== undefined) {
      setParts.push('"scope" = CAST(:scope AS "public"."TermScope")');
      params.push(sqlString("scope", input.scope));
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
            "scope"::text,
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
        scope: (fieldString(row, 3) as TermScope | null) ?? "claro",
        isActive: fieldBoolean(row, 4) ?? false,
        maxArticlesPerRun: fieldLong(row, 5) ?? 0,
        createdAt: fieldDate(row, 6) ?? new Date(0),
        updatedAt: fieldDate(row, 7) ?? new Date(0)
      };

      if (
        !term.id ||
        !term.name ||
        !term.language ||
        !TERM_SCOPES.includes(term.scope) ||
        term.maxArticlesPerRun <= 0 ||
        Number.isNaN(term.createdAt.getTime())
      ) {
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
          COALESCE(
            sw_source."weight",
            sw_provider."weight",
            ci."sourceScore",
            CAST(0.50 AS DECIMAL(3,2))
          )::text,
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
        LEFT JOIN LATERAL (
          SELECT sw."weight"
          FROM "public"."SourceWeight" sw
          WHERE
            sw."isActive" = TRUE
            AND sw."sourceName" IS NOT NULL
            AND LOWER(sw."provider") = LOWER(ci."provider")
            AND LOWER(sw."sourceName") = LOWER(COALESCE(ci."sourceName", ''))
          ORDER BY sw."updatedAt" DESC, sw."id" DESC
          LIMIT 1
        ) sw_source ON TRUE
        LEFT JOIN LATERAL (
          SELECT sw."weight"
          FROM "public"."SourceWeight" sw
          WHERE
            sw."isActive" = TRUE
            AND sw."sourceName" IS NULL
            AND LOWER(sw."provider") = LOWER(ci."provider")
          ORDER BY sw."updatedAt" DESC, sw."id" DESC
          LIMIT 1
        ) sw_provider ON TRUE
        ${whereClause}
        ORDER BY ci."createdAt" DESC, ci."id" DESC
        LIMIT :limit_plus_one
      `,
      params
    );

    const rows = response.records ?? [];
    const hasNext = rows.length > safeLimit;
    const sliced = hasNext ? rows.slice(0, safeLimit) : rows;

    const items = sliced.map(parseContentRow).filter((item): item is ContentRecord => item !== null);

    const last = items[items.length - 1];
    const nextCursor = hasNext && last ? encodeCursor({ created_at: last.createdAt.toISOString(), id: last.id }) : null;

    return {
      items,
      nextCursor,
      hasNext
    };
  }

  async listNewsFeed(termId: string): Promise<ContentRecord[]> {
    if (!isUuid(termId)) {
      throw new AppStoreError("validation", "term_id must be a valid UUID");
    }

    const termResponse = await this.rds.execute(
      `
        SELECT "id"::text
        FROM "public"."TrackedTerm"
        WHERE "id" = CAST(:term_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("term_id", termId)]
    );

    if (!fieldString(termResponse.records?.[0], 0)) {
      throw new AppStoreError("not_found", "Tracked term not found");
    }

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
          COALESCE(
            sw_source."weight",
            sw_provider."weight",
            ci."sourceScore",
            CAST(0.50 AS DECIMAL(3,2))
          )::text,
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
        LEFT JOIN LATERAL (
          SELECT sw."weight"
          FROM "public"."SourceWeight" sw
          WHERE
            sw."isActive" = TRUE
            AND sw."sourceName" IS NOT NULL
            AND LOWER(sw."provider") = LOWER(ci."provider")
            AND LOWER(sw."sourceName") = LOWER(COALESCE(ci."sourceName", ''))
          ORDER BY sw."updatedAt" DESC, sw."id" DESC
          LIMIT 1
        ) sw_source ON TRUE
        LEFT JOIN LATERAL (
          SELECT sw."weight"
          FROM "public"."SourceWeight" sw
          WHERE
            sw."isActive" = TRUE
            AND sw."sourceName" IS NULL
            AND LOWER(sw."provider") = LOWER(ci."provider")
          ORDER BY sw."updatedAt" DESC, sw."id" DESC
          LIMIT 1
        ) sw_provider ON TRUE
        WHERE
          ci."sourceType" = CAST('news' AS "public"."SourceType")
          AND ci."termId" = CAST(:term_id AS UUID)
          AND ci."state" = CAST('active' AS "public"."ContentState")
        ORDER BY
          COALESCE(ci."publishedAt", ci."createdAt") DESC,
          ci."createdAt" DESC,
          ci."id" DESC
        LIMIT :limit
      `,
      [sqlUuid("term_id", termId), sqlLong("limit", NEWS_FEED_LIMIT)]
    );

    return (response.records ?? []).map(parseContentRow).filter((item): item is ContentRecord => item !== null);
  }

  async upsertUserFromPrincipal(principal: AuthPrincipal): Promise<string> {
    if (!principal.sub) {
      throw new AppStoreError("validation", "JWT sub claim is required");
    }
    const userId = isUuid(principal.sub) ? principal.sub : uuidFromString(principal.sub);

    const response = await this.rds.execute(
      `
        INSERT INTO "public"."User"
          ("id", "email", "name", "role", "isActive", "createdAt", "updatedAt")
        VALUES
          (CAST(:id AS UUID), :email, :name, CAST(:role AS "public"."UserRole"), TRUE, NOW(), NOW())
        ON CONFLICT ("id") DO UPDATE SET
          "email" = COALESCE(EXCLUDED."email", "public"."User"."email"),
          "name" = COALESCE(EXCLUDED."name", "public"."User"."name"),
          "role" = EXCLUDED."role",
          "isActive" = TRUE,
          "updatedAt" = NOW()
        RETURNING "id"::text
      `,
      [
        sqlUuid("id", userId),
        sqlString("email", principal.email),
        sqlString("name", principal.name),
        sqlString("role", toUserRole(principal.role))
      ]
    );

    const id = fieldString(response.records?.[0], 0);
    if (!id) {
      throw new Error("Failed to upsert actor user");
    }

    return id;
  }

  async changeContentState(input: ContentStateChangeInput): Promise<ContentStateEventRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const stateResponse = await this.rds.execute(
        `
          SELECT "state"::text
          FROM "public"."ContentItem"
          WHERE "id" = CAST(:content_item_id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("content_item_id", input.contentItemId)],
        { transactionId: tx }
      );

      const previousState = fieldString(stateResponse.records?.[0], 0) as ContentState | null;
      if (!previousState) {
        throw new AppStoreError("not_found", "Content item not found");
      }

      if (previousState === input.targetState) {
        throw new AppStoreError("conflict", "Content item already has target state");
      }

      await this.rds.execute(
        `
          UPDATE "public"."ContentItem"
          SET "state" = CAST(:target_state AS "public"."ContentState"), "updatedAt" = NOW()
          WHERE "id" = CAST(:content_item_id AS UUID)
        `,
        [
          sqlString("target_state", input.targetState),
          sqlUuid("content_item_id", input.contentItemId)
        ],
        { transactionId: tx }
      );

      const eventResponse = await this.rds.execute(
        `
          INSERT INTO "public"."ContentStateEvent"
            ("id", "contentItemId", "previousState", "nextState", "actorUserId", "reason", "requestId", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:content_item_id AS UUID), CAST(:previous_state AS "public"."ContentState"), CAST(:next_state AS "public"."ContentState"), CAST(:actor_user_id AS UUID), :reason, :request_id, NOW())
          RETURNING
            "id"::text,
            "contentItemId"::text,
            "previousState"::text,
            "nextState"::text,
            "actorUserId"::text,
            "reason",
            "createdAt"
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("content_item_id", input.contentItemId),
          sqlString("previous_state", previousState),
          sqlString("next_state", input.targetState),
          sqlUuid("actor_user_id", input.actorUserId),
          sqlString("reason", input.reason ?? null),
          sqlString("request_id", input.requestId ?? null)
        ],
        { transactionId: tx }
      );

      const eventRow = eventResponse.records?.[0];
      const event: ContentStateEventRecord = {
        id: fieldString(eventRow, 0) ?? "",
        contentItemId: fieldString(eventRow, 1) ?? "",
        previousState: (fieldString(eventRow, 2) as ContentState | null) ?? "active",
        nextState: (fieldString(eventRow, 3) as ContentState | null) ?? "active",
        actorUserId: fieldString(eventRow, 4) ?? "",
        reason: fieldString(eventRow, 5),
        createdAt: fieldDate(eventRow, 6) ?? new Date(0)
      };

      if (!event.id || !event.contentItemId || !event.actorUserId || Number.isNaN(event.createdAt.getTime())) {
        throw new Error("Failed to parse content state event");
      }

      await this.rds.execute(
        `
          INSERT INTO "public"."AuditLog"
            ("id", "actorUserId", "action", "resourceType", "resourceId", "requestId", "before", "after", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:actor_user_id AS UUID), :action, :resource_type, :resource_id, :request_id, CAST(:before AS JSONB), CAST(:after AS JSONB), NOW())
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("actor_user_id", input.actorUserId),
          sqlString("action", "content_state_changed"),
          sqlString("resource_type", "ContentItem"),
          sqlString("resource_id", input.contentItemId),
          sqlString("request_id", input.requestId ?? null),
          sqlJson("before", { state: previousState }),
          sqlJson("after", { state: input.targetState, reason: input.reason ?? null })
        ],
        { transactionId: tx }
      );

      await this.rds.commitTransaction(tx);
      return event;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }

  async upsertManualClassification(input: ManualClassificationInput): Promise<ClassificationRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const existsResponse = await this.rds.execute(
        `
          SELECT "id"::text
          FROM "public"."ContentItem"
          WHERE "id" = CAST(:content_item_id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("content_item_id", input.contentItemId)],
        { transactionId: tx }
      );

      if (!fieldString(existsResponse.records?.[0], 0)) {
        throw new AppStoreError("not_found", "Content item not found");
      }

      const beforeResponse = await this.rds.execute(
        `
          SELECT
            "id"::text,
            "categoria",
            "sentimiento",
            "etiquetas",
            "confianza"::text,
            "overrideReason",
            "updatedAt"
          FROM "public"."Classification"
          WHERE "contentItemId" = CAST(:content_item_id AS UUID)
            AND "promptVersion" = :prompt_version
            AND "modelId" = :model_id
          LIMIT 1
        `,
        [
          sqlUuid("content_item_id", input.contentItemId),
          sqlString("prompt_version", "manual-override-v1"),
          sqlString("model_id", "manual")
        ],
        { transactionId: tx }
      );

      const beforeRow = beforeResponse.records?.[0];
      const beforePayload = beforeRow
        ? {
            id: fieldString(beforeRow, 0),
            categoria: fieldString(beforeRow, 1),
            sentimiento: fieldString(beforeRow, 2),
            etiquetas: parseJsonArrayString(fieldString(beforeRow, 3)),
            confianza: fieldString(beforeRow, 4),
            override_reason: fieldString(beforeRow, 5),
            updated_at: fieldDate(beforeRow, 6)?.toISOString() ?? null
          }
        : null;

      const classificationResponse = await this.rds.execute(
        `
          INSERT INTO "public"."Classification"
            ("id", "contentItemId", "categoria", "sentimiento", "etiquetas", "confianza", "promptVersion", "modelId", "isOverride", "overriddenByUserId", "overrideReason", "metadata", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), CAST(:content_item_id AS UUID), :categoria, :sentimiento, CAST(:etiquetas AS JSONB), CAST(:confianza AS DECIMAL(4,3)), :prompt_version, :model_id, TRUE, CAST(:overridden_by_user_id AS UUID), :override_reason, CAST(:metadata AS JSONB), NOW(), NOW())
          ON CONFLICT ("contentItemId", "promptVersion", "modelId") DO UPDATE SET
            "categoria" = EXCLUDED."categoria",
            "sentimiento" = EXCLUDED."sentimiento",
            "etiquetas" = EXCLUDED."etiquetas",
            "confianza" = EXCLUDED."confianza",
            "isOverride" = TRUE,
            "overriddenByUserId" = EXCLUDED."overriddenByUserId",
            "overrideReason" = EXCLUDED."overrideReason",
            "metadata" = EXCLUDED."metadata",
            "updatedAt" = NOW()
          RETURNING
            "id"::text,
            "contentItemId"::text,
            "categoria",
            "sentimiento",
            "etiquetas",
            "confianza"::text,
            "promptVersion",
            "modelId",
            "isOverride",
            "overriddenByUserId"::text,
            "overrideReason",
            "createdAt",
            "updatedAt"
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("content_item_id", input.contentItemId),
          sqlString("categoria", input.categoria),
          sqlString("sentimiento", input.sentimiento),
          sqlJson("etiquetas", input.etiquetas ?? []),
          sqlString("confianza", input.confianza !== null && input.confianza !== undefined ? String(input.confianza) : null),
          sqlString("prompt_version", "manual-override-v1"),
          sqlString("model_id", "manual"),
          sqlUuid("overridden_by_user_id", input.actorUserId),
          sqlString("override_reason", input.reason ?? null),
          sqlJson("metadata", {
            source: "manual_override",
            request_id: input.requestId ?? null
          })
        ],
        { transactionId: tx }
      );

      const row = classificationResponse.records?.[0];
      const rawConfianza = fieldString(row, 5);
      const parsedConfianza = rawConfianza === null ? null : Number.parseFloat(rawConfianza);

      const classification: ClassificationRecord = {
        id: fieldString(row, 0) ?? "",
        contentItemId: fieldString(row, 1) ?? "",
        categoria: fieldString(row, 2) ?? "",
        sentimiento: fieldString(row, 3) ?? "",
        etiquetas: parseJsonArrayString(fieldString(row, 4)),
        confianza: Number.isFinite(parsedConfianza) ? parsedConfianza : null,
        promptVersion: fieldString(row, 6) ?? "",
        modelId: fieldString(row, 7) ?? "",
        isOverride: fieldBoolean(row, 8) ?? true,
        overriddenByUserId: fieldString(row, 9),
        overrideReason: fieldString(row, 10),
        createdAt: fieldDate(row, 11) ?? new Date(0),
        updatedAt: fieldDate(row, 12) ?? new Date(0)
      };

      if (
        !classification.id ||
        !classification.contentItemId ||
        !classification.categoria ||
        !classification.sentimiento ||
        !classification.promptVersion ||
        !classification.modelId ||
        Number.isNaN(classification.createdAt.getTime()) ||
        Number.isNaN(classification.updatedAt.getTime())
      ) {
        throw new Error("Failed to parse manual classification record");
      }

      await this.rds.execute(
        `
          INSERT INTO "public"."AuditLog"
            ("id", "actorUserId", "action", "resourceType", "resourceId", "requestId", "before", "after", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:actor_user_id AS UUID), :action, :resource_type, :resource_id, :request_id, CAST(:before AS JSONB), CAST(:after AS JSONB), NOW())
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("actor_user_id", input.actorUserId),
          sqlString("action", "classification_override_upsert"),
          sqlString("resource_type", "Classification"),
          sqlString("resource_id", classification.id),
          sqlString("request_id", input.requestId ?? null),
          sqlJson("before", beforePayload),
          sqlJson("after", {
            categoria: classification.categoria,
            sentimiento: classification.sentimiento,
            etiquetas: classification.etiquetas,
            confianza: classification.confianza,
            override_reason: classification.overrideReason
          })
        ],
        { transactionId: tx }
      );

      await this.rds.commitTransaction(tx);
      return classification;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }

  async createExportJob(input: CreateExportJobInput): Promise<ExportJobRecord> {
    const response = await this.rds.execute(
      `
        INSERT INTO "public"."ExportJob"
          ("id", "requestedByUserId", "status", "filters", "rowCount", "s3Key", "createdAt", "completedAt")
        VALUES
          (CAST(:id AS UUID), CAST(:requested_by_user_id AS UUID), CAST('queued' AS "public"."RunStatus"), CAST(:filters AS JSONB), 0, NULL, NOW(), NULL)
        RETURNING
          "id"::text,
          "requestedByUserId"::text,
          "status"::text,
          "filters",
          "rowCount",
          "s3Key",
          "createdAt",
          "completedAt"
      `,
      [
        sqlUuid("id", randomUUID()),
        sqlUuid("requested_by_user_id", input.requestedByUserId ?? null),
        sqlJson("filters", input.filters)
      ]
    );

    return this.toExportJobRecord(response.records?.[0]);
  }

  async getExportJob(exportId: string): Promise<ExportJobRecord | null> {
    const response = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "requestedByUserId"::text,
          "status"::text,
          "filters",
          "rowCount",
          "s3Key",
          "createdAt",
          "completedAt"
        FROM "public"."ExportJob"
        WHERE "id" = CAST(:export_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("export_id", exportId)]
    );

    const row = response.records?.[0];
    if (!row) return null;
    return this.toExportJobRecord(row);
  }

  async claimExportJob(exportId: string): Promise<ExportJobRecord | null> {
    const response = await this.rds.execute(
      `
        UPDATE "public"."ExportJob"
        SET "status" = CAST('running' AS "public"."RunStatus")
        WHERE "id" = CAST(:export_id AS UUID)
          AND "status" = CAST('queued' AS "public"."RunStatus")
        RETURNING
          "id"::text,
          "requestedByUserId"::text,
          "status"::text,
          "filters",
          "rowCount",
          "s3Key",
          "createdAt",
          "completedAt"
      `,
      [sqlUuid("export_id", exportId)]
    );

    const row = response.records?.[0];
    if (!row) return null;
    return this.toExportJobRecord(row);
  }

  async completeExportJob(exportId: string, rowCount: number, s3Key: string): Promise<void> {
    await this.rds.execute(
      `
        UPDATE "public"."ExportJob"
        SET
          "status" = CAST('completed' AS "public"."RunStatus"),
          "rowCount" = :row_count,
          "s3Key" = :s3_key,
          "completedAt" = NOW()
        WHERE "id" = CAST(:export_id AS UUID)
      `,
      [
        sqlLong("row_count", rowCount),
        sqlString("s3_key", s3Key),
        sqlUuid("export_id", exportId)
      ]
    );
  }

  async failExportJob(exportId: string): Promise<void> {
    await this.rds.execute(
      `
        UPDATE "public"."ExportJob"
        SET
          "status" = CAST('failed' AS "public"."RunStatus"),
          "completedAt" = NOW()
        WHERE "id" = CAST(:export_id AS UUID)
      `,
      [sqlUuid("export_id", exportId)]
    );
  }

  private toExportJobRecord(row: SqlRow | undefined): ExportJobRecord {
    const rawFilters = fieldString(row, 3);
    const parsedFilters = parseJsonString(rawFilters);
    const parsedStatus = fieldString(row, 2) as ExportJobRecord["status"] | null;
    const rowCount = fieldLong(row, 4);

    const record: ExportJobRecord = {
      id: fieldString(row, 0) ?? "",
      requestedByUserId: fieldString(row, 1),
      status: parsedStatus ?? "queued",
      filters: parsedFilters,
      rowCount: rowCount ?? 0,
      s3Key: fieldString(row, 5),
      createdAt: fieldDate(row, 6) ?? new Date(0),
      completedAt: fieldDate(row, 7)
    };

    if (!record.id || Number.isNaN(record.createdAt.getTime())) {
      throw new Error("Failed to parse export job");
    }

    return record;
  }

  async getMonitorOverview(): Promise<MonitorOverviewRecord> {
    const effectiveWindowDays = 7;
    const windowStart = new Date(Date.now() - effectiveWindowDays * 24 * 60 * 60 * 1000);
    const response = await this.rds.execute(
      `
        SELECT
          COALESCE(t."scope"::text, '') AS scope,
          cls."sentimiento",
          COALESCE(
            sw_source."weight",
            sw_provider."weight",
            ci."sourceScore",
            CAST(0.50 AS DECIMAL(3,2))
          )::text
        FROM "public"."ContentItem" ci
        LEFT JOIN "public"."TrackedTerm" t ON t."id" = ci."termId"
        LEFT JOIN LATERAL (
          SELECT c."sentimiento"
          FROM "public"."Classification" c
          WHERE c."contentItemId" = ci."id"
          ORDER BY c."createdAt" DESC
          LIMIT 1
        ) cls ON TRUE
        LEFT JOIN LATERAL (
          SELECT sw."weight"
          FROM "public"."SourceWeight" sw
          WHERE
            sw."isActive" = TRUE
            AND sw."sourceName" IS NOT NULL
            AND LOWER(sw."provider") = LOWER(ci."provider")
            AND LOWER(sw."sourceName") = LOWER(COALESCE(ci."sourceName", ''))
          ORDER BY sw."updatedAt" DESC, sw."id" DESC
          LIMIT 1
        ) sw_source ON TRUE
        LEFT JOIN LATERAL (
          SELECT sw."weight"
          FROM "public"."SourceWeight" sw
          WHERE
            sw."isActive" = TRUE
            AND sw."sourceName" IS NULL
            AND LOWER(sw."provider") = LOWER(ci."provider")
          ORDER BY sw."updatedAt" DESC, sw."id" DESC
          LIMIT 1
        ) sw_provider ON TRUE
        WHERE
          ci."sourceType" = CAST('news' AS "public"."SourceType")
          AND ci."state" = CAST('active' AS "public"."ContentState")
          AND COALESCE(ci."publishedAt", ci."createdAt") >= :window_start
      `,
      [sqlTimestamp("window_start", windowStart)]
    );

    type ScopeAccumulator = {
      items: number;
      classifiedItems: number;
      positivos: number;
      negativos: number;
      neutrales: number;
      qualitySum: number;
    };

    const scopeAccumulators: Record<TermScope, ScopeAccumulator> = {
      claro: { items: 0, classifiedItems: 0, positivos: 0, negativos: 0, neutrales: 0, qualitySum: 0 },
      competencia: { items: 0, classifiedItems: 0, positivos: 0, negativos: 0, neutrales: 0, qualitySum: 0 }
    };

    let items = 0;
    let classifiedItems = 0;
    let positivos = 0;
    let negativos = 0;
    let neutrales = 0;
    let unknownSentimentItems = 0;
    let unscopedItems = 0;
    let qualitySum = 0;

    for (const row of response.records ?? []) {
      const scope = fieldString(row, 0) as TermScope | null;
      const sentimientoRaw = fieldString(row, 1);
      const sourceScoreValue = fieldString(row, 2);
      const parsedSourceScore = sourceScoreValue === null ? Number.NaN : Number.parseFloat(sourceScoreValue);
      const sourceScore = Number.isFinite(parsedSourceScore) ? parsedSourceScore : 0.5;

      items += 1;
      qualitySum += sourceScore;

      const normalizedSentimiento = normalizeSentimiento(sentimientoRaw);
      if (normalizedSentimiento === "positive") {
        positivos += 1;
        classifiedItems += 1;
      } else if (normalizedSentimiento === "negative") {
        negativos += 1;
        classifiedItems += 1;
      } else if (normalizedSentimiento === "neutral") {
        neutrales += 1;
        classifiedItems += 1;
      } else if (normalizedSentimiento === "unknown") {
        unknownSentimentItems += 1;
      }

      if (scope === "claro" || scope === "competencia") {
        const scopeAccumulator = scopeAccumulators[scope];
        scopeAccumulator.items += 1;
        scopeAccumulator.qualitySum += sourceScore;

        if (normalizedSentimiento === "positive") {
          scopeAccumulator.positivos += 1;
          scopeAccumulator.classifiedItems += 1;
        } else if (normalizedSentimiento === "negative") {
          scopeAccumulator.negativos += 1;
          scopeAccumulator.classifiedItems += 1;
        } else if (normalizedSentimiento === "neutral") {
          scopeAccumulator.neutrales += 1;
          scopeAccumulator.classifiedItems += 1;
        }
      } else {
        unscopedItems += 1;
      }
    }

    const totalQualityScore = items > 0 ? (qualitySum / items) * 100 : 50;
    const sentimientoNeto = calculateSentimientoNeto(positivos, negativos, classifiedItems);
    const riesgoActivo = calculateRiesgoActivo(negativos, classifiedItems);
    const severidad = toSeveridad(riesgoActivo);
    const bhs = calculateBhs(sentimientoNeto, totalQualityScore, riesgoActivo);

    const scopedItemsTotal = scopeAccumulators.claro.items + scopeAccumulators.competencia.items;
    const scopedQualityTotal = scopeAccumulators.claro.qualitySum + scopeAccumulators.competencia.qualitySum;

    const toScopeRecord = (scope: TermScope): MonitorScopeKpiRecord => {
      const accumulator = scopeAccumulators[scope];
      const scopeSentimientoNeto = calculateSentimientoNeto(
        accumulator.positivos,
        accumulator.negativos,
        accumulator.classifiedItems
      );
      const scopeRiesgoActivo = calculateRiesgoActivo(accumulator.negativos, accumulator.classifiedItems);
      const scopeQualityScore = accumulator.items > 0 ? (accumulator.qualitySum / accumulator.items) * 100 : 50;
      const volumeShare = scopedItemsTotal > 0 ? accumulator.items / scopedItemsTotal : 0;
      const qualityShare = scopedQualityTotal > 0 ? accumulator.qualitySum / scopedQualityTotal : 0;
      const sov = (0.4 * volumeShare + 0.6 * qualityShare) * 100;

      return {
        items: accumulator.items,
        classifiedItems: accumulator.classifiedItems,
        positivos: accumulator.positivos,
        negativos: accumulator.negativos,
        neutrales: accumulator.neutrales,
        sentimientoNeto: roundMetric(scopeSentimientoNeto),
        riesgoActivo: roundMetric(scopeRiesgoActivo),
        qualityScore: roundMetric(scopeQualityScore),
        bhs: roundMetric(calculateBhs(scopeSentimientoNeto, scopeQualityScore, scopeRiesgoActivo)),
        sov: roundMetric(sov),
        insufficientData: accumulator.classifiedItems < 20
      };
    };

    const byScope = {
      claro: toScopeRecord("claro"),
      competencia: toScopeRecord("competencia")
    };

    return {
      generatedAt: new Date(),
      windowDays: effectiveWindowDays,
      sourceType: "news",
      formulaVersion: "kpi-v1",
      totals: {
        items,
        classifiedItems,
        sentimientoNeto: roundMetric(sentimientoNeto),
        bhs: roundMetric(bhs),
        riesgoActivo: roundMetric(riesgoActivo),
        severidad,
        sovClaro: byScope.claro.sov,
        sovCompetencia: byScope.competencia.sov,
        insufficientData: classifiedItems < 20
      },
      byScope,
      diagnostics: {
        unscopedItems,
        unknownSentimentItems
      }
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

export type {
  ClassificationRecord,
  ContentFilters,
  ContentPage,
  ContentRecord,
  ContentState,
  ContentStateEventRecord,
  CreateExportJobInput,
  ExportJobRecord,
  ManualClassificationInput,
  MetaCountItem,
  MetaResponse,
  MonitorOverviewRecord,
  MonitorScopeKpiRecord,
  MonitorSeverity,
  MonitorTotalsKpiRecord,
  TermRecord,
  TermScope,
  TermsPage,
  UpdateTermInput
};
