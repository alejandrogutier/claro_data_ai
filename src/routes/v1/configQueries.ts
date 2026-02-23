import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getAuthPrincipal, getRole, hasRole } from "../../core/auth";
import { getRequestId, getPathWithoutStage, json, parseBody } from "../../core/http";
import { loadRuntimeSecrets } from "../../config/secrets";
import { AppStoreError, createAppStore } from "../../data/appStore";
import {
  createQueryConfigStore,
  type QueryCreateInput,
  type QueryPreviewInput,
  type QueryRecord,
  type QueryRevisionRecord,
  type QueryUpdateInput
} from "../../data/queryConfigStore";
import type { QueryDefinition, QueryExecutionConfig, QueryScope } from "../../queryBuilder";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type QueryCreateBody = {
  name?: unknown;
  description?: unknown;
  language?: unknown;
  scope?: unknown;
  is_active?: unknown;
  priority?: unknown;
  max_articles_per_run?: unknown;
  definition?: unknown;
  execution?: unknown;
  change_reason?: unknown;
};

type QueryPatchBody = QueryCreateBody;

type QueryRollbackBody = {
  revision?: unknown;
  change_reason?: unknown;
};

type QueryPreviewBody = {
  definition?: unknown;
  execution?: unknown;
  limit?: unknown;
  candidate_limit?: unknown;
};

type QueryDryRunBody = {
  max_articles_per_term?: unknown;
};

const parseLimit = (value: string | undefined, fallback: number, max: number): number | null => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  if (parsed < 1 || parsed > max) return null;
  return parsed;
};

const normalizeString = (value: unknown, min = 1, max = 200): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
};

const normalizeLanguage = (value: unknown): string | null => {
  if (value === undefined) return "es";
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 8) return null;
  return normalized;
};

const normalizeScope = (value: unknown, fallback: QueryScope = "claro"): QueryScope | null => {
  if (value === undefined) return fallback;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "claro" || normalized === "competencia") {
    return normalized;
  }
  return null;
};

const normalizeOptionalBoolean = (value: unknown): boolean | null | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") return null;
  return value;
};

const normalizeOptionalInt = (value: unknown, min: number, max: number): number | null | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const normalized = Math.floor(value);
  if (normalized < min || normalized > max) return null;
  return normalized;
};

const normalizeOptionalExecutionConfig = (value: unknown): QueryExecutionConfig | null | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as QueryExecutionConfig;
};

const normalizeDefinition = (value: unknown): QueryDefinition | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as QueryDefinition;
};

const normalizeOptionalString = (value: unknown, max = 240): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
};

const mapStoreError = (error: unknown) => {
  if (error instanceof AppStoreError) {
    if (error.code === "validation") {
      return json(422, { error: "validation_error", message: error.message });
    }
    if (error.code === "conflict") {
      return json(409, { error: "conflict", message: error.message });
    }
    if (error.code === "not_found") {
      return json(404, { error: "not_found", message: error.message });
    }
  }

  return json(500, {
    error: "internal_error",
    message: (error as Error).message
  });
};

const toApiQuery = (item: QueryRecord) => ({
  id: item.id,
  name: item.name,
  description: item.description,
  language: item.language,
  scope: item.scope,
  is_active: item.isActive,
  priority: item.priority,
  max_articles_per_run: item.maxArticlesPerRun,
  definition: item.definition,
  execution: item.execution,
  compiled_definition: item.compiledDefinition,
  current_revision: item.currentRevision,
  updated_by_user_id: item.updatedByUserId,
  created_at: item.createdAt.toISOString(),
  updated_at: item.updatedAt.toISOString()
});

const toApiRevision = (item: QueryRevisionRecord) => ({
  id: item.id,
  query_id: item.termId,
  revision: item.revision,
  definition: item.definition,
  execution: item.execution,
  compiled_definition: item.compiledDefinition,
  changed_by_user_id: item.changedByUserId,
  change_reason: item.changeReason,
  created_at: item.createdAt.toISOString()
});

const assertStores = () => {
  const queryStore = createQueryConfigStore();
  const appStore = createAppStore();
  if (!queryStore || !appStore) {
    return { error: json(500, { error: "misconfigured", message: "Database runtime is not configured" }) };
  }
  return { queryStore, appStore };
};

const getIdFromPath = (event: APIGatewayProxyEventV2, pattern: RegExp): string | null => {
  const match = getPathWithoutStage(event).match(pattern);
  return match?.[1] ?? null;
};

export const listConfigQueries = async (event: APIGatewayProxyEventV2) => {
  const stores = assertStores();
  if (stores.error) return stores.error;

  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit, 100, 300);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit debe ser entero entre 1 y 300" });
  }

  let scope: QueryScope | undefined;
  if (query.scope !== undefined) {
    const normalizedScope = normalizeScope(query.scope);
    if (!normalizedScope) {
      return json(422, { error: "validation_error", message: "scope debe ser claro|competencia" });
    }
    scope = normalizedScope;
  }

  let isActive: boolean | undefined;
  if (query.is_active !== undefined) {
    if (query.is_active !== "true" && query.is_active !== "false") {
      return json(422, { error: "validation_error", message: "is_active debe ser true|false" });
    }
    isActive = query.is_active === "true";
  }

  try {
    const page = await stores.queryStore.listQueries(limit, query.cursor, {
      scope,
      isActive,
      language: query.language || undefined,
      q: query.q || undefined
    });

    return json(200, {
      items: page.items.map(toApiQuery),
      page_info: {
        next_cursor: page.nextCursor,
        has_next: page.hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getConfigQuery = async (event: APIGatewayProxyEventV2) => {
  const stores = assertStores();
  if (stores.error) return stores.error;

  const id = getIdFromPath(event, /^\/v1\/config\/queries\/([^/]+)$/);
  if (!id || !UUID_REGEX.test(id)) {
    return json(422, { error: "validation_error", message: "query id invalido" });
  }

  try {
    const item = await stores.queryStore.getQuery(id);
    if (!item) return json(404, { error: "not_found", message: "Query no encontrada" });
    return json(200, toApiQuery(item));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const createConfigQuery = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede crear queries" });
  }

  const body = parseBody<QueryCreateBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const name = normalizeString(body.name, 2, 160);
  const language = normalizeLanguage(body.language);
  const scope = normalizeScope(body.scope, "claro");
  const isActive = normalizeOptionalBoolean(body.is_active);
  const priority = normalizeOptionalInt(body.priority, 1, 5);
  const maxArticlesPerRun = normalizeOptionalInt(body.max_articles_per_run, 1, 500);
  const description = normalizeOptionalString(body.description, 600);
  const changeReason = normalizeOptionalString(body.change_reason, 240);

  if (!name || !language || !scope) {
    return json(422, { error: "validation_error", message: "name, language y scope son requeridos" });
  }

  if (isActive === null || priority === null || maxArticlesPerRun === null) {
    return json(422, { error: "validation_error", message: "Campos opcionales invalidos" });
  }

  if (body.description !== undefined && description === undefined) {
    return json(422, { error: "validation_error", message: "description invalida" });
  }

  if (body.change_reason !== undefined && changeReason === undefined) {
    return json(422, { error: "validation_error", message: "change_reason invalido" });
  }

  let definition: QueryDefinition | undefined;
  if (body.definition !== undefined) {
    definition = normalizeDefinition(body.definition) ?? undefined;
    if (!definition) {
      return json(422, { error: "validation_error", message: "definition invalida" });
    }
  }

  const execution = normalizeOptionalExecutionConfig(body.execution);
  if (execution === null) {
    return json(422, { error: "validation_error", message: "execution invalido" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const payload: QueryCreateInput = {
      name,
      description,
      language,
      scope,
      isActive: isActive ?? undefined,
      priority: priority ?? undefined,
      maxArticlesPerRun: maxArticlesPerRun ?? undefined,
      definition,
      execution: execution ?? undefined,
      changeReason: changeReason ?? undefined
    };

    const created = await stores.queryStore.createQuery(payload, actorUserId, getRequestId(event));
    return json(201, toApiQuery(created));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const patchConfigQuery = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede editar queries" });
  }

  const id = getIdFromPath(event, /^\/v1\/config\/queries\/([^/]+)$/);
  if (!id || !UUID_REGEX.test(id)) {
    return json(422, { error: "validation_error", message: "query id invalido" });
  }

  const body = parseBody<QueryPatchBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const payload: QueryUpdateInput = {};

  if (body.name !== undefined) {
    const name = normalizeString(body.name, 2, 160);
    if (!name) return json(422, { error: "validation_error", message: "name invalido" });
    payload.name = name;
  }

  if (body.description !== undefined) {
    const description = normalizeOptionalString(body.description, 600);
    if (description === undefined) return json(422, { error: "validation_error", message: "description invalida" });
    payload.description = description;
  }

  if (body.language !== undefined) {
    const language = normalizeLanguage(body.language);
    if (!language) return json(422, { error: "validation_error", message: "language invalido" });
    payload.language = language;
  }

  if (body.scope !== undefined) {
    const scope = normalizeScope(body.scope, "claro");
    if (!scope) return json(422, { error: "validation_error", message: "scope invalido" });
    payload.scope = scope;
  }

  if (body.is_active !== undefined) {
    const isActive = normalizeOptionalBoolean(body.is_active);
    if (isActive === null || isActive === undefined) return json(422, { error: "validation_error", message: "is_active invalido" });
    payload.isActive = isActive;
  }

  if (body.priority !== undefined) {
    const priority = normalizeOptionalInt(body.priority, 1, 5);
    if (priority === null || priority === undefined) return json(422, { error: "validation_error", message: "priority invalido" });
    payload.priority = priority;
  }

  if (body.max_articles_per_run !== undefined) {
    const maxArticlesPerRun = normalizeOptionalInt(body.max_articles_per_run, 1, 500);
    if (maxArticlesPerRun === null || maxArticlesPerRun === undefined) {
      return json(422, { error: "validation_error", message: "max_articles_per_run invalido" });
    }
    payload.maxArticlesPerRun = maxArticlesPerRun;
  }

  if (body.definition !== undefined) {
    const definition = normalizeDefinition(body.definition);
    if (!definition) return json(422, { error: "validation_error", message: "definition invalida" });
    payload.definition = definition;
  }

  if (body.execution !== undefined) {
    const execution = normalizeOptionalExecutionConfig(body.execution);
    if (!execution) return json(422, { error: "validation_error", message: "execution invalido" });
    payload.execution = execution;
  }

  if (body.change_reason !== undefined) {
    const changeReason = normalizeOptionalString(body.change_reason, 240);
    if (changeReason === undefined) return json(422, { error: "validation_error", message: "change_reason invalido" });
    payload.changeReason = changeReason;
  }

  if (Object.keys(payload).length === 0) {
    return json(422, { error: "validation_error", message: "No hay campos para actualizar" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const updated = await stores.queryStore.updateQuery(id, payload, actorUserId, getRequestId(event));
    return json(200, toApiQuery(updated));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const deleteConfigQuery = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede eliminar queries" });
  }

  const id = getIdFromPath(event, /^\/v1\/config\/queries\/([^/]+)$/);
  if (!id || !UUID_REGEX.test(id)) {
    return json(422, { error: "validation_error", message: "query id invalido" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    await stores.queryStore.deleteQuery(id, actorUserId, getRequestId(event));
    return json(200, { ok: true, id });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const listConfigQueryRevisions = async (event: APIGatewayProxyEventV2) => {
  const id = getIdFromPath(event, /^\/v1\/config\/queries\/([^/]+)\/revisions$/);
  if (!id || !UUID_REGEX.test(id)) {
    return json(422, { error: "validation_error", message: "query id invalido" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  const limit = parseLimit(event.queryStringParameters?.limit, 100, 300);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit debe ser entero entre 1 y 300" });
  }

  try {
    const items = await stores.queryStore.listQueryRevisions(id, limit);
    return json(200, {
      query_id: id,
      items: items.map(toApiRevision)
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const rollbackConfigQuery = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede hacer rollback de queries" });
  }

  const id = getIdFromPath(event, /^\/v1\/config\/queries\/([^/]+)\/rollback$/);
  if (!id || !UUID_REGEX.test(id)) {
    return json(422, { error: "validation_error", message: "query id invalido" });
  }

  const body = parseBody<QueryRollbackBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const revision = normalizeOptionalInt(body.revision, 1, 1000000);
  if (revision === null || revision === undefined) {
    return json(422, { error: "validation_error", message: "revision invalida" });
  }

  const changeReason = normalizeOptionalString(body.change_reason, 240);
  if (body.change_reason !== undefined && changeReason === undefined) {
    return json(422, { error: "validation_error", message: "change_reason invalido" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const rolledBack = await stores.queryStore.rollbackQuery(
      id,
      revision,
      actorUserId,
      getRequestId(event),
      changeReason ?? undefined
    );

    return json(200, toApiQuery(rolledBack));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const previewConfigQuery = async (event: APIGatewayProxyEventV2) => {
  const body = parseBody<QueryPreviewBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const definition = normalizeDefinition(body.definition);
  if (!definition) {
    return json(422, { error: "validation_error", message: "definition invalida" });
  }

  const execution = normalizeOptionalExecutionConfig(body.execution);
  if (execution === null) {
    return json(422, { error: "validation_error", message: "execution invalido" });
  }

  const limit = normalizeOptionalInt(body.limit, 1, 50);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit invalido" });
  }

  const candidateLimit = normalizeOptionalInt(body.candidate_limit, 1, 2000);
  if (candidateLimit === null) {
    return json(422, { error: "validation_error", message: "candidate_limit invalido" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const payload: QueryPreviewInput = {
      definition,
      execution: execution ?? undefined,
      limit: limit ?? undefined,
      candidateLimit: candidateLimit ?? undefined
    };
    const result = await stores.queryStore.previewQuery(payload);
    return json(200, result);
  } catch (error) {
    return mapStoreError(error);
  }
};

export const dryRunConfigQuery = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede ejecutar dry-run" });
  }

  const id = getIdFromPath(event, /^\/v1\/config\/queries\/([^/]+)\/dry-run$/);
  if (!id || !UUID_REGEX.test(id)) {
    return json(422, { error: "validation_error", message: "query id invalido" });
  }

  const body = parseBody<QueryDryRunBody>(event) ?? {};
  const maxArticlesPerTerm = normalizeOptionalInt(body.max_articles_per_term, 1, 500);
  if (maxArticlesPerTerm === null) {
    return json(422, { error: "validation_error", message: "max_articles_per_term invalido" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const secrets = await loadRuntimeSecrets();
    const result = await stores.queryStore.dryRunQuery(
      id,
      secrets.providerKeys,
      actorUserId,
      getRequestId(event),
      maxArticlesPerTerm ?? 50
    );
    return json(200, result);
  } catch (error) {
    return mapStoreError(error);
  }
};
