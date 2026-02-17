import { createHash, randomUUID } from "crypto";
import { AppStoreError } from "./appStore";
import {
  RdsDataClient,
  fieldDate,
  fieldLong,
  fieldString,
  sqlJson,
  sqlLong,
  sqlString,
  sqlTimestamp,
  sqlUuid,
  type SqlRow
} from "./rdsData";

const ANALYSIS_WINDOW_DAYS = 7;
const ANALYSIS_SCOPES = ["claro", "competencia"] as const;
const ANALYSIS_RUN_SCOPES = ["overview", "channel", "competitors", "custom"] as const;
const ANALYSIS_RUN_STATUSES = ["queued", "running", "completed", "failed"] as const;
const ANALYSIS_RUN_TRIGGER_TYPES = ["manual", "scheduled"] as const;
const ANALYSIS_SOURCE_TYPES = ["news", "social"] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AnalysisScope = (typeof ANALYSIS_SCOPES)[number];
type AnalysisRunScope = (typeof ANALYSIS_RUN_SCOPES)[number];
type AnalysisRunStatus = (typeof ANALYSIS_RUN_STATUSES)[number];
type AnalysisRunTriggerType = (typeof ANALYSIS_RUN_TRIGGER_TYPES)[number];
type AnalysisSourceType = (typeof ANALYSIS_SOURCE_TYPES)[number];
type MonitorSeverity = "SEV1" | "SEV2" | "SEV3" | "SEV4";
type SentimentBucket = "positive" | "negative" | "neutral" | "unknown" | null;

type AnalysisRunCursorPayload = {
  created_at: string;
  id: string;
};

type AnalysisRunRecord = {
  id: string;
  scope: AnalysisRunScope;
  status: AnalysisRunStatus;
  triggerType: AnalysisRunTriggerType;
  sourceType: AnalysisSourceType;
  inputCount: number;
  modelId: string;
  promptVersion: string;
  filters: Record<string, unknown>;
  output: Record<string, unknown> | null;
  requestId: string | null;
  requestedByUserId: string | null;
  requestedByName: string | null;
  requestedByEmail: string | null;
  idempotencyKey: string | null;
  windowStart: Date;
  windowEnd: Date;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AnalysisRunPage = {
  items: AnalysisRunRecord[];
  nextCursor: string | null;
  hasNext: boolean;
};

type AnalysisRunFilters = {
  status?: AnalysisRunStatus;
  scope?: AnalysisRunScope;
  from?: Date;
  to?: Date;
};

type AnalysisRunUniverseFilters = {
  termId?: string;
  provider?: string;
  category?: string;
  sentimiento?: string;
  query?: string;
  from?: Date;
  to?: Date;
  contentIds?: string[];
};

type CreateAnalysisRunInput = {
  scope: AnalysisRunScope;
  sourceType: AnalysisSourceType;
  modelId: string;
  promptVersion: string;
  triggerType: AnalysisRunTriggerType;
  requestId?: string | null;
  requestedByUserId?: string | null;
  filters: AnalysisRunUniverseFilters;
  idempotencyKey?: string | null;
  limit: number;
};

type CreateAnalysisRunResult = {
  run: AnalysisRunRecord;
  reused: boolean;
};

type AnalysisPromptItem = {
  id: string;
  provider: string;
  source_name: string | null;
  title: string;
  summary: string | null;
  category: string | null;
  published_at: string | null;
  scope: AnalysisScope | null;
  term_name: string | null;
  sentimiento: string | null;
  categoria: string | null;
  source_score: number;
};

type AnalysisSourceRow = {
  scope: AnalysisScope | null;
  termId: string | null;
  termName: string | null;
  provider: string;
  sentimiento: SentimentBucket;
  sourceScore: number;
  category: string | null;
};

type MetricsAccumulator = {
  items: number;
  classifiedItems: number;
  positivos: number;
  negativos: number;
  neutrales: number;
  unknownSentimentItems: number;
  qualitySum: number;
};

type AnalyzeScopeKpiRecord = {
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

type AnalyzeTotalsRecord = {
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

type AnalyzeOverviewSnapshot = {
  totals: AnalyzeTotalsRecord;
  byScope: {
    claro: AnalyzeScopeKpiRecord;
    competencia: AnalyzeScopeKpiRecord;
  };
  diagnostics: {
    unscopedItems: number;
    unknownSentimentItems: number;
  };
};

type AnalyzeOverviewDeltaRecord = {
  items: number;
  classifiedItems: number;
  sentimientoNeto: number;
  bhs: number;
  riesgoActivo: number;
  sovClaro: number;
  sovCompetencia: number;
};

type AnalyzeOverviewRecord = {
  generatedAt: Date;
  windowDays: 7;
  sourceType: "news";
  formulaVersion: "analysis-v1";
  totals: AnalyzeTotalsRecord;
  previousTotals: AnalyzeTotalsRecord;
  delta: AnalyzeOverviewDeltaRecord;
  byScope: {
    claro: AnalyzeScopeKpiRecord;
    competencia: AnalyzeScopeKpiRecord;
  };
  diagnostics: {
    unscopedItems: number;
    unknownSentimentItems: number;
  };
};

type AnalyzeCategoryCountRecord = {
  value: string;
  count: number;
};

type AnalyzeChannelRecord = {
  provider: string;
  items: number;
  classifiedItems: number;
  positivos: number;
  negativos: number;
  neutrales: number;
  sentimientoNeto: number;
  riesgoActivo: number;
  qualityScore: number;
  bhs: number;
  severidad: MonitorSeverity;
  topCategories: AnalyzeCategoryCountRecord[];
  insufficientData: boolean;
};

type AnalyzeChannelResponseRecord = {
  generatedAt: Date;
  windowDays: 7;
  sourceType: "news";
  formulaVersion: "analysis-v1";
  totals: {
    providers: number;
    items: number;
    classifiedItems: number;
  };
  items: AnalyzeChannelRecord[];
};

type AnalyzeCompetitorRecord = {
  termId: string;
  termName: string;
  items: number;
  classifiedItems: number;
  positivos: number;
  negativos: number;
  neutrales: number;
  sentimientoNeto: number;
  riesgoActivo: number;
  qualityScore: number;
  bhs: number;
  severidad: MonitorSeverity;
  sov: number;
  insufficientData: boolean;
};

type AnalyzeScopeBenchmarkRecord = {
  items: number;
  classifiedItems: number;
  positivos: number;
  negativos: number;
  neutrales: number;
  sentimientoNeto: number;
  riesgoActivo: number;
  qualityScore: number;
  bhs: number;
  severidad: MonitorSeverity;
  sov: number;
  insufficientData: boolean;
};

type AnalyzeCompetitorsResponseRecord = {
  generatedAt: Date;
  windowDays: 7;
  sourceType: "news";
  formulaVersion: "analysis-v1";
  baselineClaro: AnalyzeScopeBenchmarkRecord;
  competitors: AnalyzeCompetitorRecord[];
  totals: {
    competitorTerms: number;
    items: number;
    classifiedItems: number;
  };
};

const defaultAccumulator = (): MetricsAccumulator => ({
  items: 0,
  classifiedItems: 0,
  positivos: 0,
  negativos: 0,
  neutrales: 0,
  unknownSentimentItems: 0,
  qualitySum: 0
});

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const roundMetric = (value: number): number => Math.round(value * 100) / 100;

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

const normalizeSentimiento = (value: string | null): SentimentBucket => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "positive" || normalized === "positivo") return "positive";
  if (normalized === "negative" || normalized === "negativo") return "negative";
  if (normalized === "neutral" || normalized === "neutro") return "neutral";
  return "unknown";
};

const isUniqueViolation = (error: unknown): boolean => {
  const message = (error as Error).message ?? "";
  return /duplicate key value|unique constraint/i.test(message);
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

const parseJsonUnknown = (value: string | null): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const parseDecimal = (value: string | null, fallback = 0): number => {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeRunStatus = (value: string | null): AnalysisRunStatus | null => {
  if (!value) return null;
  if ((ANALYSIS_RUN_STATUSES as readonly string[]).includes(value)) {
    return value as AnalysisRunStatus;
  }
  return null;
};

const normalizeRunScope = (value: string | null): AnalysisRunScope | null => {
  if (!value) return null;
  if ((ANALYSIS_RUN_SCOPES as readonly string[]).includes(value)) {
    return value as AnalysisRunScope;
  }
  return null;
};

const normalizeTriggerType = (value: string | null): AnalysisRunTriggerType | null => {
  if (!value) return null;
  if ((ANALYSIS_RUN_TRIGGER_TYPES as readonly string[]).includes(value)) {
    return value as AnalysisRunTriggerType;
  }
  return null;
};

const normalizeSourceType = (value: string | null): AnalysisSourceType | null => {
  if (!value) return null;
  if ((ANALYSIS_SOURCE_TYPES as readonly string[]).includes(value)) {
    return value as AnalysisSourceType;
  }
  return null;
};

const encodeCursor = (value: AnalysisRunCursorPayload): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeCursor = (value?: string): AnalysisRunCursorPayload | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as AnalysisRunCursorPayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.created_at !== "string" || typeof parsed.id !== "string") return null;
    if (!UUID_REGEX.test(parsed.id)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const parseAnalysisRunRow = (row: SqlRow | undefined): AnalysisRunRecord | null => {
  const id = fieldString(row, 0);
  const scope = normalizeRunScope(fieldString(row, 1));
  const status = normalizeRunStatus(fieldString(row, 2));
  const triggerType = normalizeTriggerType(fieldString(row, 3));
  const sourceType = normalizeSourceType(fieldString(row, 4));
  const inputCount = fieldLong(row, 5);
  const modelId = fieldString(row, 6);
  const promptVersion = fieldString(row, 7);
  const filters = parseJsonObject(fieldString(row, 8));
  const output = parseJsonUnknown(fieldString(row, 9));
  const requestId = fieldString(row, 10);
  const requestedByUserId = fieldString(row, 11);
  const idempotencyKey = fieldString(row, 12);
  const windowStart = fieldDate(row, 13);
  const windowEnd = fieldDate(row, 14);
  const errorMessage = fieldString(row, 15);
  const startedAt = fieldDate(row, 16);
  const completedAt = fieldDate(row, 17);
  const createdAt = fieldDate(row, 18);
  const updatedAt = fieldDate(row, 19);
  const requestedByName = fieldString(row, 20);
  const requestedByEmail = fieldString(row, 21);

  if (
    !id ||
    !scope ||
    !status ||
    !triggerType ||
    !sourceType ||
    inputCount === null ||
    !modelId ||
    !promptVersion ||
    !windowStart ||
    !windowEnd ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    scope,
    status,
    triggerType,
    sourceType,
    inputCount,
    modelId,
    promptVersion,
    filters,
    output: output && typeof output === "object" && !Array.isArray(output) ? (output as Record<string, unknown>) : null,
    requestId,
    requestedByUserId,
    requestedByName,
    requestedByEmail,
    idempotencyKey,
    windowStart,
    windowEnd,
    errorMessage,
    startedAt,
    completedAt,
    createdAt,
    updatedAt
  };
};

const applyRowToAccumulator = (accumulator: MetricsAccumulator, row: AnalysisSourceRow): void => {
  accumulator.items += 1;
  accumulator.qualitySum += row.sourceScore;

  if (row.sentimiento === "positive") {
    accumulator.positivos += 1;
    accumulator.classifiedItems += 1;
    return;
  }

  if (row.sentimiento === "negative") {
    accumulator.negativos += 1;
    accumulator.classifiedItems += 1;
    return;
  }

  if (row.sentimiento === "neutral") {
    accumulator.neutrales += 1;
    accumulator.classifiedItems += 1;
    return;
  }

  if (row.sentimiento === "unknown") {
    accumulator.unknownSentimentItems += 1;
  }
};

const toScopeMetrics = (
  accumulator: MetricsAccumulator,
  scopedItemsTotal: number,
  scopedQualityTotal: number
): AnalyzeScopeKpiRecord => {
  const sentimientoNeto = calculateSentimientoNeto(
    accumulator.positivos,
    accumulator.negativos,
    accumulator.classifiedItems
  );
  const riesgoActivo = calculateRiesgoActivo(accumulator.negativos, accumulator.classifiedItems);
  const qualityScore = accumulator.items > 0 ? (accumulator.qualitySum / accumulator.items) * 100 : 50;
  const volumeShare = scopedItemsTotal > 0 ? accumulator.items / scopedItemsTotal : 0;
  const qualityShare = scopedQualityTotal > 0 ? accumulator.qualitySum / scopedQualityTotal : 0;
  const sov = (0.4 * volumeShare + 0.6 * qualityShare) * 100;

  return {
    items: accumulator.items,
    classifiedItems: accumulator.classifiedItems,
    positivos: accumulator.positivos,
    negativos: accumulator.negativos,
    neutrales: accumulator.neutrales,
    sentimientoNeto: roundMetric(sentimientoNeto),
    riesgoActivo: roundMetric(riesgoActivo),
    qualityScore: roundMetric(qualityScore),
    bhs: roundMetric(calculateBhs(sentimientoNeto, qualityScore, riesgoActivo)),
    sov: roundMetric(sov),
    insufficientData: accumulator.classifiedItems < 20
  };
};

const buildOverviewSnapshot = (rows: AnalysisSourceRow[]): AnalyzeOverviewSnapshot => {
  const global = defaultAccumulator();
  const byScopeAccumulator: Record<AnalysisScope, MetricsAccumulator> = {
    claro: defaultAccumulator(),
    competencia: defaultAccumulator()
  };

  let unscopedItems = 0;

  for (const row of rows) {
    applyRowToAccumulator(global, row);

    if (!row.scope) {
      unscopedItems += 1;
      continue;
    }

    applyRowToAccumulator(byScopeAccumulator[row.scope], row);
  }

  const scopedItemsTotal = byScopeAccumulator.claro.items + byScopeAccumulator.competencia.items;
  const scopedQualityTotal = byScopeAccumulator.claro.qualitySum + byScopeAccumulator.competencia.qualitySum;
  const byScope = {
    claro: toScopeMetrics(byScopeAccumulator.claro, scopedItemsTotal, scopedQualityTotal),
    competencia: toScopeMetrics(byScopeAccumulator.competencia, scopedItemsTotal, scopedQualityTotal)
  };

  const sentimientoNeto = calculateSentimientoNeto(global.positivos, global.negativos, global.classifiedItems);
  const riesgoActivo = calculateRiesgoActivo(global.negativos, global.classifiedItems);
  const qualityScore = global.items > 0 ? (global.qualitySum / global.items) * 100 : 50;

  return {
    totals: {
      items: global.items,
      classifiedItems: global.classifiedItems,
      sentimientoNeto: roundMetric(sentimientoNeto),
      bhs: roundMetric(calculateBhs(sentimientoNeto, qualityScore, riesgoActivo)),
      riesgoActivo: roundMetric(riesgoActivo),
      severidad: toSeveridad(riesgoActivo),
      sovClaro: byScope.claro.sov,
      sovCompetencia: byScope.competencia.sov,
      insufficientData: global.classifiedItems < 20
    },
    byScope,
    diagnostics: {
      unscopedItems,
      unknownSentimentItems: global.unknownSentimentItems
    }
  };
};

const analysisRunSelect = `
  ar."id"::text,
  ar."scope"::text,
  ar."status"::text,
  ar."triggerType"::text,
  ar."sourceType"::text,
  ar."inputCount",
  ar."modelId",
  ar."promptVersion",
  ar."filters"::text,
  ar."output"::text,
  ar."requestId",
  ar."requestedByUserId"::text,
  ar."idempotencyKey",
  ar."windowStart",
  ar."windowEnd",
  ar."errorMessage",
  ar."startedAt",
  ar."completedAt",
  ar."createdAt",
  ar."updatedAt",
  u."name",
  u."email"
`;

class AnalysisStore {
  constructor(private readonly rds: RdsDataClient) {}

  private async appendAudit(input: {
    actorUserId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    requestId?: string | null;
    before?: unknown;
    after?: unknown;
  }, transactionId?: string): Promise<void> {
    await this.rds.execute(
      `
        INSERT INTO "public"."AuditLog"
          ("id", "actorUserId", "action", "resourceType", "resourceId", "requestId", "before", "after", "createdAt")
        VALUES
          (CAST(:id AS UUID), CAST(:actor_user_id AS UUID), :action, :resource_type, :resource_id, :request_id, CAST(:before AS JSONB), CAST(:after AS JSONB), NOW())
      `,
      [
        sqlUuid("id", randomUUID()),
        sqlUuid("actor_user_id", input.actorUserId ?? null),
        sqlString("action", input.action),
        sqlString("resource_type", input.resourceType),
        sqlString("resource_id", input.resourceId ?? null),
        sqlString("request_id", input.requestId ?? null),
        sqlJson("before", input.before ?? null),
        sqlJson("after", input.after ?? null)
      ],
      { transactionId }
    );
  }

  private async getRunById(runId: string, transactionId?: string): Promise<AnalysisRunRecord | null> {
    const response = await this.rds.execute(
      `
        SELECT
          ${analysisRunSelect}
        FROM "public"."AnalysisRun" ar
        LEFT JOIN "public"."User" u
          ON u."id" = ar."requestedByUserId"
        WHERE ar."id" = CAST(:run_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("run_id", runId)],
      { transactionId }
    );

    return parseAnalysisRunRow(response.records?.[0]);
  }

  private normalizeUniverseFilters(filters: AnalysisRunUniverseFilters): AnalysisRunUniverseFilters {
    const normalized: AnalysisRunUniverseFilters = {};

    if (filters.termId && UUID_REGEX.test(filters.termId)) {
      normalized.termId = filters.termId;
    }

    if (filters.provider?.trim()) {
      normalized.provider = filters.provider.trim().toLowerCase();
    }

    if (filters.category?.trim()) {
      normalized.category = filters.category.trim();
    }

    if (filters.sentimiento?.trim()) {
      normalized.sentimiento = filters.sentimiento.trim();
    }

    if (filters.query?.trim()) {
      normalized.query = filters.query.trim();
    }

    if (filters.from) {
      normalized.from = filters.from;
    }

    if (filters.to) {
      normalized.to = filters.to;
    }

    if (Array.isArray(filters.contentIds) && filters.contentIds.length > 0) {
      normalized.contentIds = [...new Set(filters.contentIds.filter((item) => UUID_REGEX.test(item)))];
    }

    return normalized;
  }

  private buildWindow(filters: AnalysisRunUniverseFilters): { windowStart: Date; windowEnd: Date } {
    const now = new Date();
    const fallbackStart = new Date(now.getTime() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const windowStart = filters.from ?? fallbackStart;
    const windowEnd = filters.to ?? now;
    if (windowStart.getTime() > windowEnd.getTime()) {
      throw new AppStoreError("validation", "filters.from must be <= filters.to");
    }

    return { windowStart, windowEnd };
  }

  private async resolveContentUniverse(
    scope: AnalysisRunScope,
    sourceType: AnalysisSourceType,
    filters: AnalysisRunUniverseFilters,
    limit: number
  ): Promise<string[]> {
    const safeLimit = Math.min(500, Math.max(1, limit));
    const conditions: string[] = [
      'ci."state" = CAST(\'active\' AS "public"."ContentState")',
      'ci."sourceType" = CAST(:source_type AS "public"."SourceType")',
      'COALESCE(ci."publishedAt", ci."createdAt") >= :window_start',
      'COALESCE(ci."publishedAt", ci."createdAt") <= :window_end'
    ];
    const params = [
      sqlString("source_type", sourceType),
      sqlTimestamp("window_start", filters.from ?? new Date(0)),
      sqlTimestamp("window_end", filters.to ?? new Date())
    ];

    if (scope === "competitors") {
      conditions.push('t."scope" = CAST(\'competencia\' AS "public"."TermScope")');
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

    if (filters.query) {
      conditions.push(
        `to_tsvector('simple', COALESCE(ci."title", '') || ' ' || COALESCE(ci."summary", '') || ' ' || COALESCE(ci."content", '')) @@ plainto_tsquery('simple', :query_text)`
      );
      params.push(sqlString("query_text", filters.query));
    }

    if (filters.contentIds && filters.contentIds.length > 0) {
      const placeholders: string[] = [];
      filters.contentIds.forEach((id, index) => {
        const key = `content_id_${index}`;
        placeholders.push(`CAST(:${key} AS UUID)`);
        params.push(sqlUuid(key, id));
      });
      conditions.push(`ci."id" IN (${placeholders.join(", ")})`);
    }

    params.push(sqlLong("limit", safeLimit));

    const response = await this.rds.execute(
      `
        SELECT ci."id"::text
        FROM "public"."ContentItem" ci
        LEFT JOIN "public"."TrackedTerm" t
          ON t."id" = ci."termId"
        LEFT JOIN LATERAL (
          SELECT c."sentimiento"
          FROM "public"."Classification" c
          WHERE c."contentItemId" = ci."id"
          ORDER BY c."createdAt" DESC
          LIMIT 1
        ) cls ON TRUE
        WHERE ${conditions.join(" AND ")}
        ORDER BY
          COALESCE(ci."publishedAt", ci."createdAt") DESC,
          ci."createdAt" DESC,
          ci."id" DESC
        LIMIT :limit
      `,
      params
    );

    return (response.records ?? [])
      .map((row) => fieldString(row, 0))
      .filter((value): value is string => Boolean(value));
  }

  private buildFingerprint(input: {
    sortedContentIds: string[];
    promptVersion: string;
    modelId: string;
    scope: AnalysisRunScope;
    sourceType: AnalysisSourceType;
  }): string {
    const raw = `${input.sortedContentIds.join(",")}|${input.promptVersion}|${input.modelId}|${input.scope}|${input.sourceType}`;
    return createHash("sha256").update(raw).digest("hex");
  }

  async createAnalysisRun(input: CreateAnalysisRunInput): Promise<CreateAnalysisRunResult> {
    const normalizedFilters = this.normalizeUniverseFilters(input.filters);
    const { windowStart, windowEnd } = this.buildWindow(normalizedFilters);
    normalizedFilters.from = windowStart;
    normalizedFilters.to = windowEnd;

    const universeIds = await this.resolveContentUniverse(input.scope, input.sourceType, normalizedFilters, input.limit);
    const sortedContentIds = [...universeIds].sort((a, b) => a.localeCompare(b));
    const fingerprint = this.buildFingerprint({
      sortedContentIds,
      promptVersion: input.promptVersion,
      modelId: input.modelId,
      scope: input.scope,
      sourceType: input.sourceType
    });
    const normalizedIdempotencyKey = input.idempotencyKey?.trim() || `analysis:${fingerprint}`;

    const existingResponse = await this.rds.execute(
      `
        SELECT ${analysisRunSelect}
        FROM "public"."AnalysisRun" ar
        LEFT JOIN "public"."User" u
          ON u."id" = ar."requestedByUserId"
        WHERE
          ar."idempotencyKey" = :idempotency_key
          AND ar."status" IN (
            CAST('queued' AS "public"."RunStatus"),
            CAST('running' AS "public"."RunStatus"),
            CAST('completed' AS "public"."RunStatus")
          )
        ORDER BY ar."createdAt" DESC, ar."id" DESC
        LIMIT 1
      `,
      [sqlString("idempotency_key", normalizedIdempotencyKey)]
    );

    const existing = parseAnalysisRunRow(existingResponse.records?.[0]);
    if (existing) {
      return { run: existing, reused: true };
    }

    const tx = await this.rds.beginTransaction();
    try {
      const createResponse = await this.rds.execute(
        `
          INSERT INTO "public"."AnalysisRun"
            ("id", "termId", "scope", "status", "triggerType", "inputCount", "sourceType", "filters", "modelId", "promptVersion", "output", "requestId", "requestedByUserId", "idempotencyKey", "windowStart", "windowEnd", "errorMessage", "startedAt", "completedAt", "createdAt", "updatedAt")
          VALUES
            (
              CAST(:id AS UUID),
              CAST(:term_id AS UUID),
              CAST(:scope AS "public"."AnalysisRunScope"),
              CAST('queued' AS "public"."RunStatus"),
              CAST(:trigger_type AS "public"."TriggerType"),
              :input_count,
              CAST(:source_type AS "public"."SourceType"),
              CAST(:filters AS JSONB),
              :model_id,
              :prompt_version,
              NULL,
              :request_id,
              CAST(:requested_by_user_id AS UUID),
              :idempotency_key,
              :window_start,
              :window_end,
              NULL,
              NULL,
              NULL,
              NOW(),
              NOW()
            )
          RETURNING "id"::text
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("term_id", normalizedFilters.termId ?? null),
          sqlString("scope", input.scope),
          sqlString("trigger_type", input.triggerType),
          sqlLong("input_count", universeIds.length),
          sqlString("source_type", input.sourceType),
          sqlJson("filters", normalizedFilters),
          sqlString("model_id", input.modelId),
          sqlString("prompt_version", input.promptVersion),
          sqlString("request_id", input.requestId ?? null),
          sqlUuid("requested_by_user_id", input.requestedByUserId ?? null),
          sqlString("idempotency_key", normalizedIdempotencyKey),
          sqlTimestamp("window_start", windowStart),
          sqlTimestamp("window_end", windowEnd)
        ],
        { transactionId: tx }
      );

      const runId = fieldString(createResponse.records?.[0], 0);
      if (!runId) {
        throw new Error("Failed to create analysis run");
      }

      if (universeIds.length > 0) {
        await this.rds.batchExecute(
          `
            INSERT INTO "public"."AnalysisRunItem"
              ("id", "analysisRunId", "contentItemId", "createdAt")
            VALUES
              (CAST(:id AS UUID), CAST(:analysis_run_id AS UUID), CAST(:content_item_id AS UUID), NOW())
            ON CONFLICT ("analysisRunId", "contentItemId") DO NOTHING
          `,
          universeIds.map((contentId) => [
            sqlUuid("id", randomUUID()),
            sqlUuid("analysis_run_id", runId),
            sqlUuid("content_item_id", contentId)
          ]),
          25,
          { transactionId: tx }
        );
      }

      await this.appendAudit(
        {
          actorUserId: input.requestedByUserId ?? null,
          action: "analysis_run_created",
          resourceType: "AnalysisRun",
          resourceId: runId,
          requestId: input.requestId ?? null,
          after: {
            scope: input.scope,
            source_type: input.sourceType,
            trigger_type: input.triggerType,
            input_count: universeIds.length,
            model_id: input.modelId,
            prompt_version: input.promptVersion,
            idempotency_key: normalizedIdempotencyKey,
            window_start: windowStart.toISOString(),
            window_end: windowEnd.toISOString()
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);

      const created = await this.getRunById(runId);
      if (!created) throw new Error("Created analysis run not found");
      return {
        run: created,
        reused: false
      };
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (isUniqueViolation(error)) {
        const conflictResponse = await this.rds.execute(
          `
            SELECT ${analysisRunSelect}
            FROM "public"."AnalysisRun" ar
            LEFT JOIN "public"."User" u
              ON u."id" = ar."requestedByUserId"
            WHERE
              ar."idempotencyKey" = :idempotency_key
              AND ar."status" IN (
                CAST('queued' AS "public"."RunStatus"),
                CAST('running' AS "public"."RunStatus"),
                CAST('completed' AS "public"."RunStatus")
              )
            ORDER BY ar."createdAt" DESC, ar."id" DESC
            LIMIT 1
          `,
          [sqlString("idempotency_key", normalizedIdempotencyKey)]
        );
        const conflictRun = parseAnalysisRunRow(conflictResponse.records?.[0]);
        if (conflictRun) return { run: conflictRun, reused: true };
        throw new AppStoreError("conflict", "Analysis idempotency key already exists");
      }
      throw error;
    }
  }

  async listAnalysisRuns(limit: number, filters: AnalysisRunFilters, cursor?: string): Promise<AnalysisRunPage> {
    const safeLimit = Math.min(200, Math.max(1, limit));
    const cursorPayload = decodeCursor(cursor);
    if (cursor && !cursorPayload) {
      throw new AppStoreError("validation", "Invalid cursor");
    }

    const conditions: string[] = [];
    const params = [sqlLong("limit_plus_one", safeLimit + 1)];

    if (filters.status) {
      conditions.push('ar."status" = CAST(:status AS "public"."RunStatus")');
      params.push(sqlString("status", filters.status));
    }
    if (filters.scope) {
      conditions.push('ar."scope" = CAST(:scope AS "public"."AnalysisRunScope")');
      params.push(sqlString("scope", filters.scope));
    }
    if (filters.from) {
      conditions.push('ar."createdAt" >= :from_date');
      params.push(sqlTimestamp("from_date", filters.from));
    }
    if (filters.to) {
      conditions.push('ar."createdAt" <= :to_date');
      params.push(sqlTimestamp("to_date", filters.to));
    }

    if (cursorPayload) {
      const cursorDate = new Date(cursorPayload.created_at);
      if (Number.isNaN(cursorDate.getTime())) {
        throw new AppStoreError("validation", "Invalid cursor");
      }
      conditions.push(
        '(ar."createdAt" < :cursor_created_at OR (ar."createdAt" = :cursor_created_at AND ar."id" < CAST(:cursor_id AS UUID)))'
      );
      params.push(sqlTimestamp("cursor_created_at", cursorDate), sqlUuid("cursor_id", cursorPayload.id));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const response = await this.rds.execute(
      `
        SELECT
          ${analysisRunSelect}
        FROM "public"."AnalysisRun" ar
        LEFT JOIN "public"."User" u
          ON u."id" = ar."requestedByUserId"
        ${whereClause}
        ORDER BY ar."createdAt" DESC, ar."id" DESC
        LIMIT :limit_plus_one
      `,
      params
    );

    const rows = response.records ?? [];
    const hasNext = rows.length > safeLimit;
    const sliced = hasNext ? rows.slice(0, safeLimit) : rows;
    const items = sliced.map(parseAnalysisRunRow).filter((row): row is AnalysisRunRecord => row !== null);
    const last = items[items.length - 1];
    const nextCursor = hasNext && last ? encodeCursor({ created_at: last.createdAt.toISOString(), id: last.id }) : null;

    return {
      items,
      nextCursor,
      hasNext
    };
  }

  async getAnalysisRun(runId: string): Promise<AnalysisRunRecord | null> {
    return this.getRunById(runId);
  }

  async listAnalysisRunInputIds(runId: string, limit = 50): Promise<string[]> {
    const safeLimit = Math.min(500, Math.max(1, limit));
    const response = await this.rds.execute(
      `
        SELECT ari."contentItemId"::text
        FROM "public"."AnalysisRunItem" ari
        WHERE ari."analysisRunId" = CAST(:run_id AS UUID)
        ORDER BY ari."createdAt" ASC, ari."id" ASC
        LIMIT :limit
      `,
      [sqlUuid("run_id", runId), sqlLong("limit", safeLimit)]
    );

    return (response.records ?? [])
      .map((row) => fieldString(row, 0))
      .filter((value): value is string => Boolean(value));
  }

  async listPromptItemsForRun(runId: string, limit = 200): Promise<AnalysisPromptItem[]> {
    const safeLimit = Math.min(400, Math.max(1, limit));
    const response = await this.rds.execute(
      `
        SELECT
          ci."id"::text,
          ci."provider",
          ci."sourceName",
          ci."title",
          ci."summary",
          ci."category",
          COALESCE(ci."publishedAt", ci."createdAt"),
          COALESCE(t."scope"::text, ''),
          t."name",
          cls."sentimiento",
          cls."categoria",
          COALESCE(
            sw_source."weight",
            sw_provider."weight",
            ci."sourceScore",
            CAST(0.50 AS DECIMAL(3,2))
          )::text
        FROM "public"."AnalysisRunItem" ari
        INNER JOIN "public"."ContentItem" ci
          ON ci."id" = ari."contentItemId"
        LEFT JOIN "public"."TrackedTerm" t
          ON t."id" = ci."termId"
        LEFT JOIN LATERAL (
          SELECT c."sentimiento", c."categoria"
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
        WHERE ari."analysisRunId" = CAST(:run_id AS UUID)
        ORDER BY ari."createdAt" ASC, ari."id" ASC
        LIMIT :limit
      `,
      [sqlUuid("run_id", runId), sqlLong("limit", safeLimit)]
    );

    return (response.records ?? [])
      .map((row) => {
        const id = fieldString(row, 0);
        const provider = fieldString(row, 1);
        const sourceName = fieldString(row, 2);
        const title = fieldString(row, 3);
        const summary = fieldString(row, 4);
        const category = fieldString(row, 5);
        const publishedAt = fieldDate(row, 6);
        const scopeRaw = fieldString(row, 7);
        const termName = fieldString(row, 8);
        const sentimiento = fieldString(row, 9);
        const categoria = fieldString(row, 10);
        const sourceScore = parseDecimal(fieldString(row, 11), 0.5);

        if (!id || !provider || !title) return null;
        const scope = scopeRaw === "claro" || scopeRaw === "competencia" ? scopeRaw : null;

        return {
          id,
          provider,
          source_name: sourceName,
          title,
          summary,
          category,
          published_at: publishedAt?.toISOString() ?? null,
          scope,
          term_name: termName,
          sentimiento,
          categoria,
          source_score: sourceScore
        } satisfies AnalysisPromptItem;
      })
      .filter((item): item is AnalysisPromptItem => item !== null);
  }

  async claimAnalysisRun(runId: string): Promise<AnalysisRunRecord | null> {
    const response = await this.rds.execute(
      `
        UPDATE "public"."AnalysisRun"
        SET
          "status" = CAST('running' AS "public"."RunStatus"),
          "startedAt" = COALESCE("startedAt", NOW()),
          "updatedAt" = NOW(),
          "errorMessage" = NULL
        WHERE
          "id" = CAST(:run_id AS UUID)
          AND "status" = CAST('queued' AS "public"."RunStatus")
        RETURNING "id"::text
      `,
      [sqlUuid("run_id", runId)]
    );

    const updatedRunId = fieldString(response.records?.[0], 0);
    if (!updatedRunId) return null;
    return this.getRunById(updatedRunId);
  }

  async completeAnalysisRun(runId: string, output: Record<string, unknown>): Promise<void> {
    await this.rds.execute(
      `
        UPDATE "public"."AnalysisRun"
        SET
          "status" = CAST('completed' AS "public"."RunStatus"),
          "output" = CAST(:output AS JSONB),
          "completedAt" = NOW(),
          "updatedAt" = NOW(),
          "errorMessage" = NULL
        WHERE "id" = CAST(:run_id AS UUID)
      `,
      [sqlJson("output", output), sqlUuid("run_id", runId)]
    );
  }

  async failAnalysisRun(runId: string, message: string): Promise<void> {
    await this.rds.execute(
      `
        UPDATE "public"."AnalysisRun"
        SET
          "status" = CAST('failed' AS "public"."RunStatus"),
          "errorMessage" = :error_message,
          "completedAt" = NOW(),
          "updatedAt" = NOW()
        WHERE "id" = CAST(:run_id AS UUID)
      `,
      [sqlString("error_message", message.slice(0, 2000)), sqlUuid("run_id", runId)]
    );
  }

  private async listWindowRows(windowStart: Date, windowEnd: Date): Promise<AnalysisSourceRow[]> {
    const response = await this.rds.execute(
      `
        SELECT
          COALESCE(t."scope"::text, '') AS scope,
          ci."termId"::text,
          t."name",
          ci."provider",
          cls."sentimiento",
          COALESCE(
            sw_source."weight",
            sw_provider."weight",
            ci."sourceScore",
            CAST(0.50 AS DECIMAL(3,2))
          )::text,
          COALESCE(cls."categoria", ci."category", '') AS category
        FROM "public"."ContentItem" ci
        LEFT JOIN "public"."TrackedTerm" t ON t."id" = ci."termId"
        LEFT JOIN LATERAL (
          SELECT c."sentimiento", c."categoria"
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
          AND COALESCE(ci."publishedAt", ci."createdAt") < :window_end
      `,
      [sqlTimestamp("window_start", windowStart), sqlTimestamp("window_end", windowEnd)]
    );

    return (response.records ?? [])
      .map((row) => {
        const scopeRaw = fieldString(row, 0);
        const termId = fieldString(row, 1);
        const termName = fieldString(row, 2);
        const provider = fieldString(row, 3);
        const sentimientoRaw = fieldString(row, 4);
        const sourceScoreRaw = fieldString(row, 5);
        const categoryRaw = fieldString(row, 6);

        if (!provider) return null;

        const parsedSourceScore = sourceScoreRaw === null ? Number.NaN : Number.parseFloat(sourceScoreRaw);
        const sourceScore = Number.isFinite(parsedSourceScore) ? parsedSourceScore : 0.5;
        const normalizedScope = scopeRaw === "claro" || scopeRaw === "competencia" ? scopeRaw : null;

        return {
          scope: normalizedScope,
          termId,
          termName,
          provider,
          sentimiento: normalizeSentimiento(sentimientoRaw),
          sourceScore,
          category: categoryRaw && categoryRaw.trim() ? categoryRaw.trim() : null
        } satisfies AnalysisSourceRow;
      })
      .filter((row): row is AnalysisSourceRow => row !== null);
  }

  private getWindowBounds(): { currentStart: Date; currentEnd: Date; previousStart: Date } {
    const currentEnd = new Date();
    const currentStart = new Date(currentEnd.getTime() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const previousStart = new Date(currentStart.getTime() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return { currentStart, currentEnd, previousStart };
  }

  async getAnalyzeOverview(): Promise<AnalyzeOverviewRecord> {
    const { currentStart, currentEnd, previousStart } = this.getWindowBounds();
    const [currentRows, previousRows] = await Promise.all([
      this.listWindowRows(currentStart, currentEnd),
      this.listWindowRows(previousStart, currentStart)
    ]);

    const current = buildOverviewSnapshot(currentRows);
    const previous = buildOverviewSnapshot(previousRows);

    return {
      generatedAt: new Date(),
      windowDays: ANALYSIS_WINDOW_DAYS,
      sourceType: "news",
      formulaVersion: "analysis-v1",
      totals: current.totals,
      previousTotals: previous.totals,
      delta: {
        items: current.totals.items - previous.totals.items,
        classifiedItems: current.totals.classifiedItems - previous.totals.classifiedItems,
        sentimientoNeto: roundMetric(current.totals.sentimientoNeto - previous.totals.sentimientoNeto),
        bhs: roundMetric(current.totals.bhs - previous.totals.bhs),
        riesgoActivo: roundMetric(current.totals.riesgoActivo - previous.totals.riesgoActivo),
        sovClaro: roundMetric(current.totals.sovClaro - previous.totals.sovClaro),
        sovCompetencia: roundMetric(current.totals.sovCompetencia - previous.totals.sovCompetencia)
      },
      byScope: current.byScope,
      diagnostics: current.diagnostics
    };
  }

  async getAnalyzeChannel(limit: number): Promise<AnalyzeChannelResponseRecord> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const { currentStart, currentEnd } = this.getWindowBounds();
    const rows = await this.listWindowRows(currentStart, currentEnd);

    const byProvider = new Map<
      string,
      { accumulator: MetricsAccumulator; categories: Map<string, number> }
    >();
    const global = defaultAccumulator();

    for (const row of rows) {
      applyRowToAccumulator(global, row);
      const entry =
        byProvider.get(row.provider) ?? {
          accumulator: defaultAccumulator(),
          categories: new Map<string, number>()
        };

      applyRowToAccumulator(entry.accumulator, row);
      if (row.category) {
        entry.categories.set(row.category, (entry.categories.get(row.category) ?? 0) + 1);
      }

      byProvider.set(row.provider, entry);
    }

    const items = [...byProvider.entries()]
      .map(([provider, entry]) => {
        const metrics = toScopeMetrics(entry.accumulator, entry.accumulator.items, entry.accumulator.qualitySum);
        const topCategories = [...entry.categories.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
          .slice(0, 3);

        return {
          provider,
          items: metrics.items,
          classifiedItems: metrics.classifiedItems,
          positivos: metrics.positivos,
          negativos: metrics.negativos,
          neutrales: metrics.neutrales,
          sentimientoNeto: metrics.sentimientoNeto,
          riesgoActivo: metrics.riesgoActivo,
          qualityScore: metrics.qualityScore,
          bhs: metrics.bhs,
          severidad: toSeveridad(metrics.riesgoActivo),
          topCategories,
          insufficientData: metrics.insufficientData
        } satisfies AnalyzeChannelRecord;
      })
      .sort((a, b) => b.items - a.items || a.provider.localeCompare(b.provider))
      .slice(0, safeLimit);

    return {
      generatedAt: new Date(),
      windowDays: ANALYSIS_WINDOW_DAYS,
      sourceType: "news",
      formulaVersion: "analysis-v1",
      totals: {
        providers: byProvider.size,
        items: global.items,
        classifiedItems: global.classifiedItems
      },
      items
    };
  }

  private async listActiveCompetitorTerms(): Promise<Array<{ id: string; name: string }>> {
    const response = await this.rds.execute(
      `
        SELECT "id"::text, "name"
        FROM "public"."TrackedTerm"
        WHERE
          "scope" = CAST('competencia' AS "public"."TermScope")
          AND "isActive" = TRUE
        ORDER BY "name" ASC
      `
    );

    return (response.records ?? [])
      .map((row) => {
        const id = fieldString(row, 0);
        const name = fieldString(row, 1);
        if (!id || !name) return null;
        return { id, name };
      })
      .filter((row): row is { id: string; name: string } => row !== null);
  }

  async getAnalyzeCompetitors(limit: number): Promise<AnalyzeCompetitorsResponseRecord> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const { currentStart, currentEnd } = this.getWindowBounds();
    const [rows, activeCompetitors] = await Promise.all([
      this.listWindowRows(currentStart, currentEnd),
      this.listActiveCompetitorTerms()
    ]);

    const claroAccumulator = defaultAccumulator();
    const competitorMap = new Map(
      activeCompetitors.map((term) => [term.id, { termName: term.name, accumulator: defaultAccumulator() }])
    );

    for (const row of rows) {
      if (row.scope === "claro") {
        applyRowToAccumulator(claroAccumulator, row);
        continue;
      }

      if (row.scope === "competencia" && row.termId) {
        const entry = competitorMap.get(row.termId);
        if (!entry) continue;
        applyRowToAccumulator(entry.accumulator, row);
      }
    }

    const competitorAccumulators = [...competitorMap.entries()];
    const competitorItemsTotal = competitorAccumulators.reduce((sum, [, entry]) => sum + entry.accumulator.items, 0);
    const competitorClassifiedTotal = competitorAccumulators.reduce(
      (sum, [, entry]) => sum + entry.accumulator.classifiedItems,
      0
    );
    const scopedItemsTotal = claroAccumulator.items + competitorItemsTotal;
    const scopedQualityTotal =
      claroAccumulator.qualitySum +
      competitorAccumulators.reduce((sum, [, entry]) => sum + entry.accumulator.qualitySum, 0);

    const claroMetrics = toScopeMetrics(claroAccumulator, scopedItemsTotal, scopedQualityTotal);
    const baselineClaro: AnalyzeScopeBenchmarkRecord = {
      items: claroMetrics.items,
      classifiedItems: claroMetrics.classifiedItems,
      positivos: claroMetrics.positivos,
      negativos: claroMetrics.negativos,
      neutrales: claroMetrics.neutrales,
      sentimientoNeto: claroMetrics.sentimientoNeto,
      riesgoActivo: claroMetrics.riesgoActivo,
      qualityScore: claroMetrics.qualityScore,
      bhs: claroMetrics.bhs,
      severidad: toSeveridad(claroMetrics.riesgoActivo),
      sov: claroMetrics.sov,
      insufficientData: claroMetrics.insufficientData
    };

    const competitors = competitorAccumulators
      .map(([termId, entry]) => {
        const metrics = toScopeMetrics(entry.accumulator, scopedItemsTotal, scopedQualityTotal);
        return {
          termId,
          termName: entry.termName,
          items: metrics.items,
          classifiedItems: metrics.classifiedItems,
          positivos: metrics.positivos,
          negativos: metrics.negativos,
          neutrales: metrics.neutrales,
          sentimientoNeto: metrics.sentimientoNeto,
          riesgoActivo: metrics.riesgoActivo,
          qualityScore: metrics.qualityScore,
          bhs: metrics.bhs,
          severidad: toSeveridad(metrics.riesgoActivo),
          sov: metrics.sov,
          insufficientData: metrics.insufficientData
        } satisfies AnalyzeCompetitorRecord;
      })
      .sort((a, b) => b.sov - a.sov || b.items - a.items || a.termName.localeCompare(b.termName))
      .slice(0, safeLimit);

    return {
      generatedAt: new Date(),
      windowDays: ANALYSIS_WINDOW_DAYS,
      sourceType: "news",
      formulaVersion: "analysis-v1",
      baselineClaro,
      competitors,
      totals: {
        competitorTerms: activeCompetitors.length,
        items: claroAccumulator.items + competitorItemsTotal,
        classifiedItems: claroAccumulator.classifiedItems + competitorClassifiedTotal
      }
    };
  }
}

export const createAnalysisStore = (): AnalysisStore | null => {
  const client = RdsDataClient.fromEnv();
  if (!client) return null;
  return new AnalysisStore(client);
};

export type {
  AnalysisPromptItem,
  AnalysisRunFilters,
  AnalysisRunPage,
  AnalysisRunRecord,
  AnalysisRunScope,
  AnalysisRunStatus,
  AnalysisRunTriggerType,
  AnalysisSourceType,
  CreateAnalysisRunInput,
  CreateAnalysisRunResult,
  AnalyzeCategoryCountRecord,
  AnalyzeChannelRecord,
  AnalyzeChannelResponseRecord,
  AnalyzeCompetitorRecord,
  AnalyzeCompetitorsResponseRecord,
  AnalyzeOverviewDeltaRecord,
  AnalyzeOverviewRecord,
  AnalyzeScopeBenchmarkRecord,
  AnalyzeScopeKpiRecord,
  AnalyzeTotalsRecord
};
