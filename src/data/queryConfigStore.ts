import { randomUUID } from "crypto";
import { AppStoreError } from "./appStore";
import { deriveOriginFields } from "../core/origin";
import {
  type QueryDefinition,
  type QueryExecutionConfig,
  DEFAULT_QUERY_EXECUTION_CONFIG,
  buildSimpleQueryDefinition,
  compileQueryDefinition,
  evaluateQueryDefinition,
  sanitizeExecutionConfig,
  selectProvidersForExecution,
  validateQueryDefinition
} from "../queryBuilder";
import {
  RdsDataClient,
  fieldBoolean,
  fieldDate,
  fieldLong,
  fieldString,
  type SqlParameter,
  type SqlRow,
  sqlBoolean,
  sqlJson,
  sqlLong,
  sqlString,
  sqlTimestamp,
  sqlUuid
} from "./rdsData";
import type { NormalizedArticle } from "../ingestion/providers";
import { fetchFromProviders, dedupeByCanonicalUrl, NEWS_PROVIDER_NAMES } from "../ingestion/providers";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CursorPayload = {
  created_at: string;
  id: string;
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

const normalizeScope = (value: string | null): "claro" | "competencia" => {
  if (value === "competencia") return "competencia";
  return "claro";
};

const isUniqueViolation = (error: unknown): boolean => {
  const message = (error as Error).message ?? "";
  return /duplicate key value|unique constraint/i.test(message);
};

const isAwarioBindingUniqueViolation = (error: unknown): boolean => {
  const message = (error as Error).message ?? "";
  return /TrackedTerm_awarioBindingId_key|awarioBindingId/i.test(message);
};

const hostFromUrl = (rawUrl: string | undefined): string | null => {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
};

const normalizeStringList = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));

const extractCountryCandidates = (metadata: Record<string, unknown>): string[] => {
  const candidates: string[] = [];
  const rawValues: unknown[] = [
    metadata.country,
    metadata.countries,
    metadata.source_country,
    metadata.sourceCountry,
    metadata.locale
  ];

  for (const raw of rawValues) {
    if (typeof raw === "string") {
      candidates.push(raw);
      continue;
    }

    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string") {
          candidates.push(item);
        }
      }
    }
  }

  return normalizeStringList(candidates);
};

const applyExecutionFilters = (
  article: { provider?: string; canonicalUrl?: string; metadata?: Record<string, unknown> },
  execution: QueryExecutionConfig
): boolean => {
  const provider = article.provider?.trim().toLowerCase() ?? "";
  const providerAllow = new Set(execution.providers_allow.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const providerDeny = new Set(execution.providers_deny.map((item) => item.trim().toLowerCase()).filter(Boolean));

  if (providerAllow.size > 0 && (!provider || !providerAllow.has(provider))) {
    return false;
  }

  if (provider && providerDeny.has(provider)) {
    return false;
  }

  const domain = hostFromUrl(article.canonicalUrl);
  const domainAllow = new Set(execution.domains_allow.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const domainDeny = new Set(execution.domains_deny.map((item) => item.trim().toLowerCase()).filter(Boolean));

  if (domainAllow.size > 0 && (!domain || !domainAllow.has(domain))) {
    return false;
  }

  if (domain && domainDeny.has(domain)) {
    return false;
  }

  const countries = extractCountryCandidates(article.metadata ?? {});
  const countryAllow = new Set(execution.countries_allow.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const countryDeny = new Set(execution.countries_deny.map((item) => item.trim().toLowerCase()).filter(Boolean));

  if (countryAllow.size > 0) {
    const hasAllowed = countries.some((country) => countryAllow.has(country));
    if (!hasAllowed) return false;
  }

  if (countries.some((country) => countryDeny.has(country))) {
    return false;
  }

  return true;
};

export type QueryRecord = {
  id: string;
  name: string;
  description: string | null;
  language: string;
  scope: "claro" | "competencia";
  isActive: boolean;
  priority: number;
  maxArticlesPerRun: number;
  definition: QueryDefinition;
  execution: QueryExecutionConfig;
  compiledDefinition: Record<string, unknown>;
  currentRevision: number;
  awarioBindingId: string | null;
  awarioAlertId: string | null;
  awarioLinkStatus: "linked" | "missing_awario";
  awarioSyncState: "pending_backfill" | "backfilling" | "active" | "error" | "paused" | "archived" | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type QueryRevisionRecord = {
  id: string;
  termId: string;
  revision: number;
  definition: QueryDefinition;
  execution: QueryExecutionConfig;
  compiledDefinition: Record<string, unknown>;
  changedByUserId: string | null;
  changeReason: string | null;
  createdAt: Date;
};

export type QueryListPage = {
  items: QueryRecord[];
  nextCursor: string | null;
  hasNext: boolean;
};

export type QueryListFilters = {
  scope?: "claro" | "competencia";
  isActive?: boolean;
  language?: string;
  q?: string;
};

export type QueryCreateInput = {
  name: string;
  description?: string | null;
  language: string;
  scope: "claro" | "competencia";
  isActive?: boolean;
  priority?: number;
  maxArticlesPerRun?: number;
  definition?: QueryDefinition;
  execution?: QueryExecutionConfig;
  awarioBindingId?: string | null;
  changeReason?: string | null;
};

export type QueryUpdateInput = {
  name?: string;
  description?: string | null;
  language?: string;
  scope?: "claro" | "competencia";
  isActive?: boolean;
  priority?: number;
  maxArticlesPerRun?: number;
  definition?: QueryDefinition;
  execution?: QueryExecutionConfig;
  awarioBindingId?: string | null;
  changeReason?: string | null;
};

export type QueryPreviewInput = {
  definition: QueryDefinition;
  execution?: QueryExecutionConfig;
  limit?: number;
  candidateLimit?: number;
};

export type QueryPreviewResult = {
  matched_count: number;
  candidates_count: number;
  sample: Array<{
    content_item_id: string;
    origin: "news" | "awario";
    medium: string | null;
    tags: string[];
    provider: string;
    title: string;
    canonical_url: string;
    published_at: string | null;
  }>;
  provider_breakdown: Array<{ provider: string; count: number }>;
};

export type QueryDryRunResult = {
  run_id: string;
  query_id: string;
  providers_used: string[];
  query_text: string;
  requested_max_articles_per_term: number;
  effective_max_articles_per_term: number;
  providers: Array<{
    provider: string;
    request_url?: string;
    raw_count: number;
    fetched_count: number;
    matched_count: number;
    duration_ms: number;
    error_type?: string;
    error?: string;
  }>;
  totals: {
    raw_count: number;
    fetched_count: number;
    matched_count: number;
    origin_breakdown: Record<string, number>;
  };
  sample: Array<{
    origin: "news" | "awario";
    medium: string | null;
    tags: string[];
    provider: string;
    title: string;
    canonical_url: string;
    published_at?: string;
  }>;
};

type AuditWriteInput = {
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  requestId?: string | null;
  before?: unknown;
  after?: unknown;
};

const parseQueryRow = (row: SqlRow | undefined): QueryRecord | null => {
  const id = fieldString(row, 0);
  const name = fieldString(row, 1);
  const description = fieldString(row, 2);
  const language = fieldString(row, 3);
  const scope = normalizeScope(fieldString(row, 4));
  const isActive = fieldBoolean(row, 5);
  const priority = fieldLong(row, 6);
  const maxArticlesPerRun = fieldLong(row, 7);
  const definitionRaw = parseJsonUnknown(fieldString(row, 8));
  const executionRaw = parseJsonUnknown(fieldString(row, 9));
  const compiledRaw = parseJsonObject(fieldString(row, 10));
  const currentRevision = fieldLong(row, 11);
  const awarioBindingId = fieldString(row, 12);
  const awarioAlertId = fieldString(row, 13);
  const awarioSyncStateRaw = fieldString(row, 14);
  const updatedByUserId = fieldString(row, 15);
  const createdAt = fieldDate(row, 16);
  const updatedAt = fieldDate(row, 17);

  if (!id || !name || !language || isActive === null || priority === null || maxArticlesPerRun === null || !createdAt || !updatedAt) {
    return null;
  }

  const definitionValidation = validateQueryDefinition(definitionRaw);
  const definition = definitionValidation.valid
    ? (definitionRaw as QueryDefinition)
    : buildSimpleQueryDefinition(name);

  const execution = sanitizeExecutionConfig(executionRaw);

  const safeCurrentRevision = currentRevision && currentRevision > 0 ? currentRevision : 1;

  return {
    id,
    name,
    description,
    language,
    scope,
    isActive,
    priority,
    maxArticlesPerRun,
    definition,
    execution,
    compiledDefinition: compiledRaw,
    currentRevision: safeCurrentRevision,
    awarioBindingId,
    awarioAlertId,
    awarioLinkStatus: awarioBindingId ? "linked" : "missing_awario",
    awarioSyncState:
      awarioSyncStateRaw === "pending_backfill" ||
      awarioSyncStateRaw === "backfilling" ||
      awarioSyncStateRaw === "active" ||
      awarioSyncStateRaw === "error" ||
      awarioSyncStateRaw === "paused" ||
      awarioSyncStateRaw === "archived"
        ? awarioSyncStateRaw
        : null,
    updatedByUserId,
    createdAt,
    updatedAt
  };
};

const parseQueryRevisionRow = (row: SqlRow | undefined): QueryRevisionRecord | null => {
  const id = fieldString(row, 0);
  const termId = fieldString(row, 1);
  const revision = fieldLong(row, 2);
  const definitionRaw = parseJsonUnknown(fieldString(row, 3));
  const executionRaw = parseJsonUnknown(fieldString(row, 4));
  const compiledRaw = parseJsonObject(fieldString(row, 5));
  const changedByUserId = fieldString(row, 6);
  const changeReason = fieldString(row, 7);
  const createdAt = fieldDate(row, 8);

  if (!id || !termId || revision === null || !createdAt) return null;

  const definitionValidation = validateQueryDefinition(definitionRaw);
  if (!definitionValidation.valid) return null;

  return {
    id,
    termId,
    revision,
    definition: definitionRaw as QueryDefinition,
    execution: sanitizeExecutionConfig(executionRaw),
    compiledDefinition: compiledRaw,
    changedByUserId,
    changeReason,
    createdAt
  };
};

class QueryConfigStore {
  constructor(private readonly rds: RdsDataClient) {}

  private async appendAudit(input: AuditWriteInput, transactionId?: string): Promise<void> {
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

  private async getQueryById(id: string, transactionId?: string): Promise<QueryRecord | null> {
    const response = await this.rds.execute(
      `
        SELECT
          t."id"::text,
          t."name",
          t."description",
          t."language",
          t."scope"::text,
          t."isActive",
          t."priority",
          t."maxArticlesPerRun",
          t."definition"::text,
          t."execution"::text,
          t."compiledDefinition"::text,
          t."currentRevision",
          t."awarioBindingId"::text,
          ab."awarioAlertId",
          ab."syncState",
          t."updatedByUserId"::text,
          t."createdAt",
          t."updatedAt"
        FROM "public"."TrackedTerm" t
        LEFT JOIN "public"."AwarioAlertBinding" ab ON ab."id" = t."awarioBindingId"
        WHERE t."id" = CAST(:id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("id", id)],
      { transactionId }
    );

    return parseQueryRow(response.records?.[0]);
  }

  async listQueries(limit: number, cursor?: string, filters: QueryListFilters = {}): Promise<QueryListPage> {
    const safeLimit = Math.min(300, Math.max(1, limit));
    const cursorPayload = decodeCursor(cursor);
    if (cursor && !cursorPayload) {
      throw new AppStoreError("validation", "Invalid cursor");
    }

    const conditions: string[] = [];
    const params: SqlParameter[] = [sqlLong("limit_plus_one", safeLimit + 1)];

    if (filters.scope) {
      conditions.push('t."scope" = CAST(:scope AS "public"."TermScope")');
      params.push(sqlString("scope", filters.scope));
    }

    if (filters.isActive !== undefined) {
      conditions.push('t."isActive" = :is_active');
      params.push(sqlBoolean("is_active", filters.isActive));
    }

    if (filters.language) {
      conditions.push('LOWER(t."language") = LOWER(:language)');
      params.push(sqlString("language", filters.language));
    }

    if (filters.q) {
      conditions.push(`(LOWER(t."name") LIKE LOWER(:q) OR LOWER(COALESCE(t."description", '')) LIKE LOWER(:q))`);
      params.push(sqlString("q", `%${filters.q}%`));
    }

    if (cursorPayload) {
      const cursorDate = new Date(cursorPayload.created_at);
      if (Number.isNaN(cursorDate.getTime())) {
        throw new AppStoreError("validation", "Invalid cursor");
      }
      conditions.push(
        '(t."createdAt" < :cursor_created_at OR (t."createdAt" = :cursor_created_at AND t."id" < CAST(:cursor_id AS UUID)))'
      );
      params.push(sqlTimestamp("cursor_created_at", cursorDate), sqlUuid("cursor_id", cursorPayload.id));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const response = await this.rds.execute(
      `
        SELECT
          t."id"::text,
          t."name",
          t."description",
          t."language",
          t."scope"::text,
          t."isActive",
          t."priority",
          t."maxArticlesPerRun",
          t."definition"::text,
          t."execution"::text,
          t."compiledDefinition"::text,
          t."currentRevision",
          t."awarioBindingId"::text,
          ab."awarioAlertId",
          ab."syncState",
          t."updatedByUserId"::text,
          t."createdAt",
          t."updatedAt"
        FROM "public"."TrackedTerm" t
        LEFT JOIN "public"."AwarioAlertBinding" ab ON ab."id" = t."awarioBindingId"
        ${whereClause}
        ORDER BY t."createdAt" DESC, t."id" DESC
        LIMIT :limit_plus_one
      `,
      params
    );

    const rows = response.records ?? [];
    const hasNext = rows.length > safeLimit;
    const sliced = hasNext ? rows.slice(0, safeLimit) : rows;
    const items = sliced.map(parseQueryRow).filter((item): item is QueryRecord => item !== null);

    const last = items[items.length - 1];
    const nextCursor = hasNext && last ? encodeCursor({ created_at: last.createdAt.toISOString(), id: last.id }) : null;

    return { items, nextCursor, hasNext };
  }

  async getQuery(id: string): Promise<QueryRecord | null> {
    return this.getQueryById(id);
  }

  async createQuery(input: QueryCreateInput, actorUserId: string, requestId?: string): Promise<QueryRecord> {
    const definition = input.definition ?? buildSimpleQueryDefinition(input.name);
    const validation = validateQueryDefinition(definition);
    if (!validation.valid) {
      throw new AppStoreError("validation", `definition invalid: ${validation.errors.join("; ")}`);
    }

    const execution = sanitizeExecutionConfig(input.execution ?? DEFAULT_QUERY_EXECUTION_CONFIG);
    const compiled = compileQueryDefinition(definition);
    const awarioBindingId = input.awarioBindingId ?? null;
    if (awarioBindingId !== null && !UUID_REGEX.test(awarioBindingId)) {
      throw new AppStoreError("validation", "awarioBindingId invalido");
    }

    const tx = await this.rds.beginTransaction();

    try {
      const response = await this.rds.execute(
        `
          INSERT INTO "public"."TrackedTerm"
            ("id", "name", "description", "language", "scope", "isActive", "priority", "maxArticlesPerRun", "definition", "execution", "compiledDefinition", "currentRevision", "awarioBindingId", "updatedByUserId", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), :name, :description, :language, CAST(:scope AS "public"."TermScope"), :is_active, :priority, :max_articles_per_run, CAST(:definition AS JSONB), CAST(:execution AS JSONB), CAST(:compiled_definition AS JSONB), 1, CAST(:awario_binding_id AS UUID), CAST(:updated_by_user_id AS UUID), NOW(), NOW())
          RETURNING
            "id"::text
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("name", input.name),
          sqlString("description", input.description ?? null),
          sqlString("language", input.language),
          sqlString("scope", input.scope),
          sqlBoolean("is_active", input.isActive ?? true),
          sqlLong("priority", input.priority ?? 3),
          sqlLong("max_articles_per_run", input.maxArticlesPerRun ?? 100),
          sqlJson("definition", definition),
          sqlJson("execution", execution),
          sqlJson("compiled_definition", compiled),
          sqlUuid("awario_binding_id", awarioBindingId),
          sqlUuid("updated_by_user_id", actorUserId)
        ],
        { transactionId: tx }
      );

      const createdId = fieldString(response.records?.[0], 0);
      const created = createdId ? await this.getQueryById(createdId, tx) : null;
      if (!created) {
        throw new Error("Failed to parse created query");
      }

      await this.rds.execute(
        `
          INSERT INTO "public"."TrackedTermRevision"
            ("id", "termId", "revision", "definition", "execution", "compiledDefinition", "changedByUserId", "changeReason", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:term_id AS UUID), 1, CAST(:definition AS JSONB), CAST(:execution AS JSONB), CAST(:compiled_definition AS JSONB), CAST(:changed_by_user_id AS UUID), :change_reason, NOW())
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("term_id", created.id),
          sqlJson("definition", created.definition),
          sqlJson("execution", created.execution),
          sqlJson("compiled_definition", created.compiledDefinition),
          sqlUuid("changed_by_user_id", actorUserId),
          sqlString("change_reason", input.changeReason ?? "create")
        ],
        { transactionId: tx }
      );

      await this.appendAudit(
        {
          actorUserId,
          action: "query_created",
          resourceType: "TrackedTerm",
          resourceId: created.id,
          requestId,
          after: {
            id: created.id,
            name: created.name,
            scope: created.scope,
            is_active: created.isActive,
            current_revision: created.currentRevision
          }
        },
        tx
      );

      if (created.awarioBindingId) {
        await this.appendAudit(
          {
            actorUserId,
            action: "query_awario_linked",
            resourceType: "TrackedTerm",
            resourceId: created.id,
            requestId,
            after: {
              query_id: created.id,
              awario_binding_id: created.awarioBindingId,
              awario_alert_id: created.awarioAlertId
            }
          },
          tx
        );
      }

      await this.rds.commitTransaction(tx);
      return created;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (isUniqueViolation(error)) {
        if (isAwarioBindingUniqueViolation(error)) {
          throw new AppStoreError("conflict", "Awario binding ya esta vinculado a otra query");
        }
        throw new AppStoreError("conflict", "Term with same name and language already exists");
      }
      throw error;
    }
  }

  async updateQuery(id: string, input: QueryUpdateInput, actorUserId: string, requestId?: string): Promise<QueryRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const before = await this.getQueryById(id, tx);
      if (!before) {
        throw new AppStoreError("not_found", "Query not found");
      }

      const definition = input.definition ?? before.definition;
      const validation = validateQueryDefinition(definition);
      if (!validation.valid) {
        throw new AppStoreError("validation", `definition invalid: ${validation.errors.join("; ")}`);
      }

      const execution = sanitizeExecutionConfig(input.execution ?? before.execution);
      const compiled = compileQueryDefinition(definition);
      const nextRevision = before.currentRevision + 1;

      const setParts: string[] = [
        '"updatedAt" = NOW()',
        '"currentRevision" = :current_revision',
        '"updatedByUserId" = CAST(:updated_by_user_id AS UUID)',
        '"definition" = CAST(:definition AS JSONB)',
        '"execution" = CAST(:execution AS JSONB)',
        '"compiledDefinition" = CAST(:compiled_definition AS JSONB)'
      ];

      const params: SqlParameter[] = [
        sqlUuid("id", id),
        sqlLong("current_revision", nextRevision),
        sqlUuid("updated_by_user_id", actorUserId),
        sqlJson("definition", definition),
        sqlJson("execution", execution),
        sqlJson("compiled_definition", compiled)
      ];

      if (input.name !== undefined) {
        setParts.push('"name" = :name');
        params.push(sqlString("name", input.name));
      }

      if (input.description !== undefined) {
        setParts.push('"description" = :description');
        params.push(sqlString("description", input.description));
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

      if (input.priority !== undefined) {
        setParts.push('"priority" = :priority');
        params.push(sqlLong("priority", input.priority));
      }

      if (input.maxArticlesPerRun !== undefined) {
        setParts.push('"maxArticlesPerRun" = :max_articles_per_run');
        params.push(sqlLong("max_articles_per_run", input.maxArticlesPerRun));
      }

      if (input.awarioBindingId !== undefined) {
        if (input.awarioBindingId !== null && !UUID_REGEX.test(input.awarioBindingId)) {
          throw new AppStoreError("validation", "awarioBindingId invalido");
        }
        setParts.push('"awarioBindingId" = CAST(:awario_binding_id AS UUID)');
        params.push(sqlUuid("awario_binding_id", input.awarioBindingId));
      }

      await this.rds.execute(
        `
          UPDATE "public"."TrackedTerm"
          SET ${setParts.join(", ")}
          WHERE "id" = CAST(:id AS UUID)
        `,
        params,
        { transactionId: tx }
      );

      await this.rds.execute(
        `
          INSERT INTO "public"."TrackedTermRevision"
            ("id", "termId", "revision", "definition", "execution", "compiledDefinition", "changedByUserId", "changeReason", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:term_id AS UUID), :revision, CAST(:definition AS JSONB), CAST(:execution AS JSONB), CAST(:compiled_definition AS JSONB), CAST(:changed_by_user_id AS UUID), :change_reason, NOW())
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("term_id", id),
          sqlLong("revision", nextRevision),
          sqlJson("definition", definition),
          sqlJson("execution", execution),
          sqlJson("compiled_definition", compiled),
          sqlUuid("changed_by_user_id", actorUserId),
          sqlString("change_reason", input.changeReason ?? "update")
        ],
        { transactionId: tx }
      );

      const awarioBindingChanged = input.awarioBindingId !== undefined && before.awarioBindingId !== input.awarioBindingId;
      if (awarioBindingChanged && before.awarioBindingId) {
        await this.rds.execute(
          `
            UPDATE "public"."AwarioAlertBinding"
            SET
              "status" = 'paused',
              "syncState" = 'paused',
              "updatedByUserId" = CAST(:updated_by_user_id AS UUID),
              "updatedAt" = NOW()
            WHERE "id" = CAST(:id AS UUID)
          `,
          [sqlUuid("id", before.awarioBindingId), sqlUuid("updated_by_user_id", actorUserId)],
          { transactionId: tx }
        );
      }

      const after = await this.getQueryById(id, tx);
      if (!after) {
        throw new Error("Failed to load updated query");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "query_updated",
          resourceType: "TrackedTerm",
          resourceId: id,
          requestId,
          before: {
            id: before.id,
            name: before.name,
            scope: before.scope,
            is_active: before.isActive,
            current_revision: before.currentRevision
          },
          after: {
            id: after.id,
            name: after.name,
            scope: after.scope,
            is_active: after.isActive,
            current_revision: after.currentRevision
          }
        },
        tx
      );

      if (awarioBindingChanged && after.awarioBindingId) {
        await this.appendAudit(
          {
            actorUserId,
            action: before.awarioBindingId ? "query_awario_relinked" : "query_awario_linked",
            resourceType: "TrackedTerm",
            resourceId: id,
            requestId,
            before: {
              query_id: before.id,
              awario_binding_id: before.awarioBindingId,
              awario_alert_id: before.awarioAlertId
            },
            after: {
              query_id: after.id,
              awario_binding_id: after.awarioBindingId,
              awario_alert_id: after.awarioAlertId
            }
          },
          tx
        );
      }

      await this.rds.commitTransaction(tx);
      return after;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (isUniqueViolation(error)) {
        if (isAwarioBindingUniqueViolation(error)) {
          throw new AppStoreError("conflict", "Awario binding ya esta vinculado a otra query");
        }
        throw new AppStoreError("conflict", "Term with same name and language already exists");
      }
      throw error;
    }
  }

  async deleteQuery(id: string, actorUserId: string, requestId?: string): Promise<void> {
    const tx = await this.rds.beginTransaction();

    try {
      const before = await this.getQueryById(id, tx);
      if (!before) {
        throw new AppStoreError("not_found", "Query not found");
      }

      if (before.awarioBindingId) {
        await this.rds.execute(
          `
            UPDATE "public"."AwarioAlertBinding"
            SET
              "status" = 'paused',
              "syncState" = 'paused',
              "updatedByUserId" = CAST(:updated_by_user_id AS UUID),
              "updatedAt" = NOW()
            WHERE "id" = CAST(:id AS UUID)
          `,
          [sqlUuid("id", before.awarioBindingId), sqlUuid("updated_by_user_id", actorUserId)],
          { transactionId: tx }
        );
      }

      await this.rds.execute(`DELETE FROM "public"."TrackedTerm" WHERE "id" = CAST(:id AS UUID)`, [sqlUuid("id", id)], {
        transactionId: tx
      });

      await this.appendAudit(
        {
          actorUserId,
          action: "query_deleted",
          resourceType: "TrackedTerm",
          resourceId: id,
          requestId,
          before: {
            id: before.id,
            name: before.name,
            scope: before.scope,
            current_revision: before.currentRevision
          },
          after: {
            id: before.id,
            status: "deleted"
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }

  async listQueryRevisions(termId: string, limit: number): Promise<QueryRevisionRecord[]> {
    const safeLimit = Math.min(300, Math.max(1, limit));

    const response = await this.rds.execute(
      `
        SELECT
          r."id"::text,
          r."termId"::text,
          r."revision",
          r."definition"::text,
          r."execution"::text,
          r."compiledDefinition"::text,
          r."changedByUserId"::text,
          r."changeReason",
          r."createdAt"
        FROM "public"."TrackedTermRevision" r
        WHERE r."termId" = CAST(:term_id AS UUID)
        ORDER BY r."revision" DESC, r."createdAt" DESC
        LIMIT :limit
      `,
      [sqlUuid("term_id", termId), sqlLong("limit", safeLimit)]
    );

    return (response.records ?? []).map(parseQueryRevisionRow).filter((item): item is QueryRevisionRecord => item !== null);
  }

  async rollbackQuery(
    termId: string,
    rollbackToRevision: number,
    actorUserId: string,
    requestId?: string,
    changeReason?: string | null
  ): Promise<QueryRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const before = await this.getQueryById(termId, tx);
      if (!before) {
        throw new AppStoreError("not_found", "Query not found");
      }

      const revisionResponse = await this.rds.execute(
        `
          SELECT
            r."id"::text,
            r."termId"::text,
            r."revision",
            r."definition"::text,
            r."execution"::text,
            r."compiledDefinition"::text,
            r."changedByUserId"::text,
            r."changeReason",
            r."createdAt"
          FROM "public"."TrackedTermRevision" r
          WHERE
            r."termId" = CAST(:term_id AS UUID)
            AND r."revision" = :revision
          LIMIT 1
        `,
        [sqlUuid("term_id", termId), sqlLong("revision", rollbackToRevision)],
        { transactionId: tx }
      );

      const targetRevision = parseQueryRevisionRow(revisionResponse.records?.[0]);
      if (!targetRevision) {
        throw new AppStoreError("not_found", "Revision not found");
      }

      const nextRevision = before.currentRevision + 1;
      await this.rds.execute(
        `
          UPDATE "public"."TrackedTerm"
          SET
            "definition" = CAST(:definition AS JSONB),
            "execution" = CAST(:execution AS JSONB),
            "compiledDefinition" = CAST(:compiled_definition AS JSONB),
            "currentRevision" = :current_revision,
            "updatedByUserId" = CAST(:updated_by_user_id AS UUID),
            "updatedAt" = NOW()
          WHERE "id" = CAST(:term_id AS UUID)
        `,
        [
          sqlJson("definition", targetRevision.definition),
          sqlJson("execution", targetRevision.execution),
          sqlJson("compiled_definition", targetRevision.compiledDefinition),
          sqlLong("current_revision", nextRevision),
          sqlUuid("updated_by_user_id", actorUserId),
          sqlUuid("term_id", termId)
        ],
        { transactionId: tx }
      );

      await this.rds.execute(
        `
          INSERT INTO "public"."TrackedTermRevision"
            ("id", "termId", "revision", "definition", "execution", "compiledDefinition", "changedByUserId", "changeReason", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:term_id AS UUID), :revision, CAST(:definition AS JSONB), CAST(:execution AS JSONB), CAST(:compiled_definition AS JSONB), CAST(:changed_by_user_id AS UUID), :change_reason, NOW())
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("term_id", termId),
          sqlLong("revision", nextRevision),
          sqlJson("definition", targetRevision.definition),
          sqlJson("execution", targetRevision.execution),
          sqlJson("compiled_definition", targetRevision.compiledDefinition),
          sqlUuid("changed_by_user_id", actorUserId),
          sqlString("change_reason", changeReason ?? `rollback_to_${rollbackToRevision}`)
        ],
        { transactionId: tx }
      );

      const after = await this.getQueryById(termId, tx);
      if (!after) {
        throw new Error("Failed to load rolled back query");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "query_rollback",
          resourceType: "TrackedTerm",
          resourceId: termId,
          requestId,
          before: {
            id: before.id,
            current_revision: before.currentRevision
          },
          after: {
            id: after.id,
            current_revision: after.currentRevision,
            rollback_to_revision: rollbackToRevision,
            change_reason: changeReason ?? null
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return after;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }

  async previewQuery(input: QueryPreviewInput): Promise<QueryPreviewResult> {
    const validation = validateQueryDefinition(input.definition);
    if (!validation.valid) {
      throw new AppStoreError("validation", `definition invalid: ${validation.errors.join("; ")}`);
    }

    const execution = sanitizeExecutionConfig(input.execution ?? DEFAULT_QUERY_EXECUTION_CONFIG);
    const safeLimit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 20)));
    const candidateLimit = Math.min(500, Math.max(safeLimit, Math.floor(input.candidateLimit ?? 200)));

    const response = await this.rds.execute(
      `
        SELECT
          ci."id"::text,
          ci."provider",
          ci."sourceName",
          LEFT(COALESCE(ci."title", ''), 512),
          LEFT(COALESCE(ci."summary", ''), 1000),
          LEFT(COALESCE(ci."content", ''), 4000),
          ci."canonicalUrl",
          ci."language",
          (
            jsonb_build_object(
              'country', ci."metadata"->>'country',
              'countries', ci."metadata"->'countries',
              'source_country', ci."metadata"->>'source_country',
              'sourceCountry', ci."metadata"->>'sourceCountry',
              'locale', ci."metadata"->>'locale'
            )
          )::text,
          ci."publishedAt",
          ci."createdAt"
        FROM "public"."ContentItem" ci
        WHERE
          ci."sourceType" = CAST('news' AS "public"."SourceType")
          AND ci."state" = CAST('active' AS "public"."ContentState")
        ORDER BY COALESCE(ci."publishedAt", ci."createdAt") DESC, ci."id" DESC
        LIMIT :limit
      `,
      [sqlLong("limit", candidateLimit)]
    );

    const matched: Array<{
      content_item_id: string;
      origin: "news" | "awario";
      medium: string | null;
      tags: string[];
      provider: string;
      title: string;
      canonical_url: string;
      published_at: string | null;
    }> = [];

    const providerBreakdown = new Map<string, number>();

    for (const row of response.records ?? []) {
      const contentItemId = fieldString(row, 0);
      const provider = fieldString(row, 1) ?? "unknown";
      const sourceName = fieldString(row, 2);
      const title = fieldString(row, 3) ?? "";
      const summary = fieldString(row, 4) ?? "";
      const content = fieldString(row, 5) ?? "";
      const canonicalUrl = fieldString(row, 6) ?? "";
      const language = fieldString(row, 7) ?? "";
      const metadata = parseJsonObject(fieldString(row, 8));
      const publishedAt = fieldDate(row, 9) ?? fieldDate(row, 10);

      if (!contentItemId || !canonicalUrl) continue;

      const queryMatched = evaluateQueryDefinition(input.definition, {
        provider,
        title,
        summary,
        content,
        canonicalUrl,
        language,
        metadata
      });

      if (!queryMatched) continue;
      if (!applyExecutionFilters({ provider, canonicalUrl, metadata }, execution)) continue;

      providerBreakdown.set(provider, (providerBreakdown.get(provider) ?? 0) + 1);
      if (matched.length < safeLimit) {
        const originFields = deriveOriginFields({
          forcedOrigin: "news",
          provider,
          sourceName
        });
        matched.push({
          content_item_id: contentItemId,
          origin: originFields.origin,
          medium: originFields.medium,
          tags: originFields.tags,
          provider,
          title,
          canonical_url: canonicalUrl,
          published_at: publishedAt?.toISOString() ?? null
        });
      }
    }

    const totalMatched = Array.from(providerBreakdown.values()).reduce((acc, value) => acc + value, 0);

    return {
      matched_count: totalMatched,
      candidates_count: (response.records ?? []).length,
      sample: matched,
      provider_breakdown: Array.from(providerBreakdown.entries())
        .map(([provider, count]) => ({ provider, count }))
        .sort((a, b) => b.count - a.count)
    };
  }

  async dryRunQuery(
    queryId: string,
    providerKeys: Record<string, string>,
    actorUserId: string,
    requestId?: string,
    requestedMaxArticlesPerTerm = 50
  ): Promise<QueryDryRunResult> {
    const query = await this.getQueryById(queryId);
    if (!query) {
      throw new AppStoreError("not_found", "Query not found");
    }

    const execution = sanitizeExecutionConfig(query.execution);
    const providersUsed = selectProvidersForExecution([...NEWS_PROVIDER_NAMES], execution);
    const queryText =
      typeof query.compiledDefinition.query === "string" && query.compiledDefinition.query.trim()
        ? query.compiledDefinition.query.trim()
        : query.name;

    const effectiveMaxArticlesPerTerm = Math.min(500, Math.max(1, Math.floor(requestedMaxArticlesPerTerm)));
    const providerResults = await fetchFromProviders({
      term: queryText,
      language: query.language,
      maxArticlesPerTerm: effectiveMaxArticlesPerTerm,
      providerKeys,
      providers: providersUsed
    });

    const providerRows: QueryDryRunResult["providers"] = [];
    let rawCount = 0;
    let fetchedCount = 0;
    let matchedCount = 0;

    const matchedItems: Array<NormalizedArticle & { provider: string }> = [];

    for (const result of providerResults) {
      const filteredByDefinition = result.items.filter((article) =>
        evaluateQueryDefinition(query.definition, {
          provider: article.provider,
          title: article.title,
          summary: article.summary,
          content: article.content,
          canonicalUrl: article.canonicalUrl,
          language: article.language,
          metadata: article.metadata
        })
      );

      const fullyMatched = filteredByDefinition.filter((article) =>
        applyExecutionFilters(
          {
            provider: article.provider,
            canonicalUrl: article.canonicalUrl,
            metadata: article.metadata
          },
          execution
        )
      );

      rawCount += result.rawCount;
      fetchedCount += result.items.length;
      matchedCount += fullyMatched.length;
      matchedItems.push(...fullyMatched);

      providerRows.push({
        provider: result.provider,
        request_url: result.requestUrl,
        raw_count: result.rawCount,
        fetched_count: result.items.length,
        matched_count: fullyMatched.length,
        duration_ms: result.durationMs,
        error_type: result.errorType,
        error: result.error
      });
    }

    const sample = dedupeByCanonicalUrl(matchedItems)
      .slice(0, 20)
      .map((item) => {
        const originFields = deriveOriginFields({
          forcedOrigin: "news",
          provider: item.provider,
          sourceName: item.sourceName
        });
        return {
          origin: originFields.origin,
          medium: originFields.medium,
          tags: originFields.tags,
          provider: item.provider,
          title: item.title,
          canonical_url: item.canonicalUrl,
          published_at: item.publishedAt
        };
      });

    const result: QueryDryRunResult = {
      run_id: randomUUID(),
      query_id: query.id,
      providers_used: providersUsed,
      query_text: queryText,
      requested_max_articles_per_term: requestedMaxArticlesPerTerm,
      effective_max_articles_per_term: effectiveMaxArticlesPerTerm,
      providers: providerRows,
      totals: {
        raw_count: rawCount,
        fetched_count: fetchedCount,
        matched_count: matchedCount,
        origin_breakdown: {
          news: matchedCount
        }
      },
      sample
    };

    await this.appendAudit({
      actorUserId,
      action: "query_dry_run",
      resourceType: "TrackedTerm",
      resourceId: query.id,
      requestId,
      after: {
        run_id: result.run_id,
        providers_used: providersUsed,
        totals: result.totals,
        origin_breakdown: result.totals.origin_breakdown
      }
    });

    return result;
  }
}

export const createQueryConfigStore = (): QueryConfigStore | null => {
  const client = RdsDataClient.fromEnv();
  if (!client) return null;
  return new QueryConfigStore(client);
};

export type { QueryConfigStore };
