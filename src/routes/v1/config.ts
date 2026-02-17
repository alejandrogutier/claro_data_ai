import AWS from "aws-sdk";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { env } from "../../config/env";
import { getAuthPrincipal, getRole, hasRole, type UserRole } from "../../core/auth";
import { getPathWithoutStage, getRequestId, json, parseBody } from "../../core/http";
import { AppStoreError, createAppStore } from "../../data/appStore";
import {
  createConfigStore,
  isTaxonomyKind,
  type AuditFilters,
  type AuditRecord,
  type CompetitorRecord,
  type ConnectorRecord,
  type ConnectorSyncRunRecord,
  type OwnedAccountRecord,
  type TaxonomyEntryRecord,
  type TaxonomyKind
} from "../../data/configStore";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSV_EXPORT_MAX_ROWS = 5000;

const s3 = new AWS.S3({ region: env.awsRegion, signatureVersion: "v4" });

type ConnectorPatchBody = {
  enabled?: unknown;
  frequency_minutes?: unknown;
};

type OwnedAccountBody = {
  platform?: unknown;
  handle?: unknown;
  account_name?: unknown;
  business_line?: unknown;
  macro_region?: unknown;
  language?: unknown;
  team_owner?: unknown;
  status?: unknown;
  campaign_tags?: unknown;
  metadata?: unknown;
};

type CompetitorBody = {
  brand_name?: unknown;
  aliases?: unknown;
  priority?: unknown;
  status?: unknown;
  metadata?: unknown;
};

type TaxonomyBody = {
  key?: unknown;
  label?: unknown;
  description?: unknown;
  is_active?: unknown;
  sort_order?: unknown;
  metadata?: unknown;
};

type AuditExportBody = {
  filters?: Record<string, unknown>;
  limit?: unknown;
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

const normalizeOptionalString = (value: unknown, max = 240): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
};

const normalizeStringArray = (value: unknown, maxItems = 30, maxItemLen = 80): string[] | null => {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .map((item) => item.slice(0, maxItemLen));
  return [...new Set(normalized)].slice(0, maxItems);
};

const normalizeMetadata = (value: unknown): Record<string, unknown> | null => {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const normalizeDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
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

const toApiConnector = (item: ConnectorRecord) => ({
  id: item.id,
  provider: item.provider,
  enabled: item.enabled,
  frequency_minutes: item.frequencyMinutes,
  health_status: item.healthStatus,
  last_sync_at: item.lastSyncAt?.toISOString() ?? null,
  last_error: item.lastError,
  latency_p95_ms: item.latencyP95Ms,
  metadata: item.metadata,
  created_at: item.createdAt.toISOString(),
  updated_at: item.updatedAt.toISOString()
});

const toApiConnectorRun = (item: ConnectorSyncRunRecord) => ({
  id: item.id,
  connector_id: item.connectorId,
  status: item.status,
  started_at: item.startedAt?.toISOString() ?? null,
  finished_at: item.finishedAt?.toISOString() ?? null,
  metrics: item.metrics,
  error: item.errorMessage,
  triggered_by_user_id: item.triggeredByUserId,
  created_at: item.createdAt.toISOString()
});

const toApiAccount = (item: OwnedAccountRecord) => ({
  id: item.id,
  plataforma: item.platform,
  handle: item.handle,
  nombre_cuenta: item.accountName,
  linea_negocio: item.businessLine,
  region_macro: item.macroRegion,
  idioma: item.language,
  owner_equipo: item.teamOwner,
  estado: item.status,
  tags_campana: item.campaignTags,
  metadata: item.metadata,
  created_at: item.createdAt.toISOString(),
  updated_at: item.updatedAt.toISOString()
});

const toApiCompetitor = (item: CompetitorRecord) => ({
  id: item.id,
  marca_competidora: item.brandName,
  aliases: item.aliases,
  prioridad: item.priority,
  estado: item.status,
  metadata: item.metadata,
  created_at: item.createdAt.toISOString(),
  updated_at: item.updatedAt.toISOString()
});

const toApiTaxonomy = (item: TaxonomyEntryRecord) => ({
  id: item.id,
  kind: item.kind,
  key: item.key,
  label: item.label,
  description: item.description,
  is_active: item.isActive,
  sort_order: item.sortOrder,
  metadata: item.metadata,
  created_at: item.createdAt.toISOString(),
  updated_at: item.updatedAt.toISOString()
});

const sanitizeAuditRecord = (record: AuditRecord, role: UserRole) => {
  const isAdmin = role === "Admin";
  return {
    id: record.id,
    actor_user_id: record.actorUserId,
    actor_email: isAdmin ? record.actorEmail : null,
    actor_name: isAdmin ? record.actorName : null,
    actor_role: record.actorRole,
    action: record.action,
    resource_type: record.resourceType,
    resource_id: record.resourceId,
    request_id: record.requestId,
    before: isAdmin ? record.before : null,
    after: isAdmin ? record.after : null,
    created_at: record.createdAt.toISOString()
  };
};

const getIdFromPath = (event: APIGatewayProxyEventV2, pattern: RegExp): string | null => {
  const match = getPathWithoutStage(event).match(pattern);
  return match?.[1] ?? null;
};

const getTaxonomyPathParams = (
  event: APIGatewayProxyEventV2,
  pattern: RegExp
): { kind: TaxonomyKind; id?: string } | null => {
  const match = getPathWithoutStage(event).match(pattern);
  if (!match) return null;

  const rawKind = match[1] ?? "";
  if (!isTaxonomyKind(rawKind)) return null;

  const maybeId = match[2];
  if (maybeId !== undefined && !UUID_REGEX.test(maybeId)) return null;

  return {
    kind: rawKind,
    id: maybeId
  };
};

const assertStores = () => {
  const store = createConfigStore();
  const appStore = createAppStore();
  if (!store || !appStore) {
    return { error: json(500, { error: "misconfigured", message: "Database runtime is not configured" }) };
  }
  return { store, appStore };
};

const toAuditFilters = (query: Record<string, string | undefined>): { filters: AuditFilters | null; message?: string } => {
  const filters: AuditFilters = {};

  if (query.resource_type) {
    const resourceType = normalizeString(query.resource_type, 2, 80);
    if (!resourceType) return { filters: null, message: "resource_type invalido" };
    filters.resourceType = resourceType;
  }

  if (query.action) {
    const action = normalizeString(query.action, 2, 80);
    if (!action) return { filters: null, message: "action invalido" };
    filters.action = action;
  }

  if (query.actor_user_id) {
    if (!UUID_REGEX.test(query.actor_user_id)) {
      return { filters: null, message: "actor_user_id debe ser UUID valido" };
    }
    filters.actorUserId = query.actor_user_id;
  }

  const from = normalizeDate(query.from);
  if (query.from && !from) {
    return { filters: null, message: "from debe ser fecha ISO valida" };
  }

  const to = normalizeDate(query.to);
  if (query.to && !to) {
    return { filters: null, message: "to debe ser fecha ISO valida" };
  }

  if (from && to && from.getTime() > to.getTime()) {
    return { filters: null, message: "from debe ser menor o igual que to" };
  }

  if (from) filters.from = from;
  if (to) filters.to = to;

  return { filters };
};

const csvEscape = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
    return `"${text.replace(/\"/g, '""')}"`;
  }
  return text;
};

const buildAuditCsv = (records: ReturnType<typeof sanitizeAuditRecord>[]): string => {
  const headers = [
    "id",
    "created_at",
    "action",
    "resource_type",
    "resource_id",
    "request_id",
    "actor_user_id",
    "actor_role",
    "actor_email",
    "actor_name",
    "before",
    "after"
  ];

  const lines = [headers.join(",")];
  for (const item of records) {
    const row = [
      item.id,
      item.created_at,
      item.action,
      item.resource_type,
      item.resource_id,
      item.request_id,
      item.actor_user_id,
      item.actor_role,
      item.actor_email,
      item.actor_name,
      item.before,
      item.after
    ].map(csvEscape);

    lines.push(row.join(","));
  }

  return `${lines.join("\n")}\n`;
};

export const listConnectors = async (event: APIGatewayProxyEventV2) => {
  const stores = assertStores();
  if (stores.error) return stores.error;

  const limit = parseLimit(event.queryStringParameters?.limit, 100, 200);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit debe ser un entero entre 1 y 200" });
  }

  try {
    const items = await stores.store.listConnectors(limit);
    return json(200, { items: items.map(toApiConnector) });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const patchConnector = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const connectorId = getIdFromPath(event, /^\/v1\/connectors\/([^/]+)$/);
  if (!connectorId || !UUID_REGEX.test(connectorId)) {
    return json(422, { error: "validation_error", message: "id de conector invalido" });
  }

  const body = parseBody<ConnectorPatchBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const patch: { enabled?: boolean; frequencyMinutes?: number } = {};

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return json(422, { error: "validation_error", message: "enabled debe ser boolean" });
    }
    patch.enabled = body.enabled;
  }

  if (body.frequency_minutes !== undefined) {
    if (typeof body.frequency_minutes !== "number" || Number.isNaN(body.frequency_minutes)) {
      return json(422, { error: "validation_error", message: "frequency_minutes debe ser numero" });
    }
    const frequency = Math.floor(body.frequency_minutes);
    if (frequency < 5 || frequency > 1440) {
      return json(422, { error: "validation_error", message: "frequency_minutes debe estar entre 5 y 1440" });
    }
    patch.frequencyMinutes = frequency;
  }

  if (Object.keys(patch).length === 0) {
    return json(422, { error: "validation_error", message: "No hay campos para actualizar" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const updated = await stores.store.updateConnector(connectorId, patch, actorUserId, getRequestId(event));
    return json(200, toApiConnector(updated));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const triggerConnectorSync = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const connectorId = getIdFromPath(event, /^\/v1\/connectors\/([^/]+)\/sync$/);
  if (!connectorId || !UUID_REGEX.test(connectorId)) {
    return json(422, { error: "validation_error", message: "id de conector invalido" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const run = await stores.store.triggerConnectorSync(connectorId, actorUserId, getRequestId(event));
    return json(202, toApiConnectorRun(run));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const listConnectorRuns = async (event: APIGatewayProxyEventV2) => {
  const connectorId = getIdFromPath(event, /^\/v1\/connectors\/([^/]+)\/runs$/);
  if (!connectorId || !UUID_REGEX.test(connectorId)) {
    return json(422, { error: "validation_error", message: "id de conector invalido" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  const limit = parseLimit(event.queryStringParameters?.limit, 20, 100);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit debe ser entero entre 1 y 100" });
  }

  try {
    const items = await stores.store.listConnectorRuns(connectorId, limit);
    return json(200, {
      connector_id: connectorId,
      items: items.map(toApiConnectorRun)
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const listConfigAccounts = async (event: APIGatewayProxyEventV2) => {
  const stores = assertStores();
  if (stores.error) return stores.error;

  const limit = parseLimit(event.queryStringParameters?.limit, 200, 300);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit debe ser entero entre 1 y 300" });
  }

  try {
    const items = await stores.store.listOwnedAccounts(limit);
    return json(200, { items: items.map(toApiAccount) });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const createConfigAccount = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede crear cuentas" });
  }

  const body = parseBody<OwnedAccountBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const platform = normalizeString(body.platform, 1, 40);
  const handle = normalizeString(body.handle, 2, 80);
  const accountName = normalizeString(body.account_name, 2, 160);
  const businessLine = normalizeOptionalString(body.business_line, 120);
  const macroRegion = normalizeOptionalString(body.macro_region, 120);
  const language = body.language === undefined ? "es" : normalizeString(body.language, 2, 8);
  const teamOwner = normalizeOptionalString(body.team_owner, 120);
  const status = body.status === undefined ? "active" : normalizeString(body.status, 2, 40);
  const campaignTags = body.campaign_tags === undefined ? [] : normalizeStringArray(body.campaign_tags, 40, 60);
  const metadata = normalizeMetadata(body.metadata);

  if (!platform || !handle || !accountName || !language || !status || campaignTags === null || metadata === null) {
    return json(422, {
      error: "validation_error",
      message:
        "platform, handle y account_name son requeridos; language/status deben ser validos; campaign_tags debe ser arreglo de strings"
    });
  }

  if (
    (body.business_line !== undefined && businessLine === undefined) ||
    (body.macro_region !== undefined && macroRegion === undefined) ||
    (body.team_owner !== undefined && teamOwner === undefined)
  ) {
    return json(422, { error: "validation_error", message: "Campos opcionales invalidos" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const created = await stores.store.createOwnedAccount(
      {
        platform: platform.toLowerCase(),
        handle,
        accountName,
        businessLine: businessLine ?? undefined,
        macroRegion: macroRegion ?? undefined,
        language: language.toLowerCase(),
        teamOwner: teamOwner ?? undefined,
        status: status.toLowerCase(),
        campaignTags,
        metadata
      },
      actorUserId,
      getRequestId(event)
    );
    return json(201, toApiAccount(created));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const patchConfigAccount = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede editar cuentas" });
  }

  const accountId = getIdFromPath(event, /^\/v1\/config\/accounts\/([^/]+)$/);
  if (!accountId || !UUID_REGEX.test(accountId)) {
    return json(422, { error: "validation_error", message: "id invalido" });
  }

  const body = parseBody<OwnedAccountBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const patch: Record<string, unknown> = {};

  if (body.platform !== undefined) {
    const value = normalizeString(body.platform, 1, 40);
    if (!value) return json(422, { error: "validation_error", message: "platform invalido" });
    patch.platform = value.toLowerCase();
  }
  if (body.handle !== undefined) {
    const value = normalizeString(body.handle, 2, 80);
    if (!value) return json(422, { error: "validation_error", message: "handle invalido" });
    patch.handle = value;
  }
  if (body.account_name !== undefined) {
    const value = normalizeString(body.account_name, 2, 160);
    if (!value) return json(422, { error: "validation_error", message: "account_name invalido" });
    patch.accountName = value;
  }
  if (body.business_line !== undefined) {
    const value = normalizeOptionalString(body.business_line, 120);
    if (value === undefined) return json(422, { error: "validation_error", message: "business_line invalido" });
    patch.businessLine = value;
  }
  if (body.macro_region !== undefined) {
    const value = normalizeOptionalString(body.macro_region, 120);
    if (value === undefined) return json(422, { error: "validation_error", message: "macro_region invalido" });
    patch.macroRegion = value;
  }
  if (body.language !== undefined) {
    const value = normalizeString(body.language, 2, 8);
    if (!value) return json(422, { error: "validation_error", message: "language invalido" });
    patch.language = value.toLowerCase();
  }
  if (body.team_owner !== undefined) {
    const value = normalizeOptionalString(body.team_owner, 120);
    if (value === undefined) return json(422, { error: "validation_error", message: "team_owner invalido" });
    patch.teamOwner = value;
  }
  if (body.status !== undefined) {
    const value = normalizeString(body.status, 2, 40);
    if (!value) return json(422, { error: "validation_error", message: "status invalido" });
    patch.status = value.toLowerCase();
  }
  if (body.campaign_tags !== undefined) {
    const value = normalizeStringArray(body.campaign_tags, 40, 60);
    if (value === null) return json(422, { error: "validation_error", message: "campaign_tags invalido" });
    patch.campaignTags = value;
  }
  if (body.metadata !== undefined) {
    const value = normalizeMetadata(body.metadata);
    if (value === null) return json(422, { error: "validation_error", message: "metadata invalido" });
    patch.metadata = value;
  }

  if (Object.keys(patch).length === 0) {
    return json(422, { error: "validation_error", message: "No hay campos para actualizar" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const updated = await stores.store.updateOwnedAccount(accountId, patch, actorUserId, getRequestId(event));
    return json(200, toApiAccount(updated));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const listConfigCompetitors = async (event: APIGatewayProxyEventV2) => {
  const stores = assertStores();
  if (stores.error) return stores.error;

  const limit = parseLimit(event.queryStringParameters?.limit, 200, 300);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit debe ser entero entre 1 y 300" });
  }

  try {
    const items = await stores.store.listCompetitors(limit);
    return json(200, { items: items.map(toApiCompetitor) });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const createConfigCompetitor = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede crear competidores" });
  }

  const body = parseBody<CompetitorBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const brandName = normalizeString(body.brand_name, 2, 160);
  const aliases = body.aliases === undefined ? [] : normalizeStringArray(body.aliases, 50, 80);
  const priority = body.priority === undefined ? 3 : Math.floor(Number(body.priority));
  const status = body.status === undefined ? "active" : normalizeString(body.status, 2, 40);
  const metadata = normalizeMetadata(body.metadata);

  if (!brandName || aliases === null || !Number.isFinite(priority) || priority < 1 || priority > 10 || !status || metadata === null) {
    return json(422, {
      error: "validation_error",
      message: "brand_name requerido; aliases arreglo; priority 1..10; status valido"
    });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const created = await stores.store.createCompetitor(
      {
        brandName,
        aliases,
        priority,
        status: status.toLowerCase(),
        metadata
      },
      actorUserId,
      getRequestId(event)
    );

    return json(201, toApiCompetitor(created));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const patchConfigCompetitor = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede editar competidores" });
  }

  const competitorId = getIdFromPath(event, /^\/v1\/config\/competitors\/([^/]+)$/);
  if (!competitorId || !UUID_REGEX.test(competitorId)) {
    return json(422, { error: "validation_error", message: "id invalido" });
  }

  const body = parseBody<CompetitorBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const patch: Record<string, unknown> = {};

  if (body.brand_name !== undefined) {
    const value = normalizeString(body.brand_name, 2, 160);
    if (!value) return json(422, { error: "validation_error", message: "brand_name invalido" });
    patch.brandName = value;
  }

  if (body.aliases !== undefined) {
    const value = normalizeStringArray(body.aliases, 50, 80);
    if (value === null) return json(422, { error: "validation_error", message: "aliases invalido" });
    patch.aliases = value;
  }

  if (body.priority !== undefined) {
    const priority = Math.floor(Number(body.priority));
    if (!Number.isFinite(priority) || priority < 1 || priority > 10) {
      return json(422, { error: "validation_error", message: "priority debe estar entre 1 y 10" });
    }
    patch.priority = priority;
  }

  if (body.status !== undefined) {
    const value = normalizeString(body.status, 2, 40);
    if (!value) return json(422, { error: "validation_error", message: "status invalido" });
    patch.status = value.toLowerCase();
  }

  if (body.metadata !== undefined) {
    const value = normalizeMetadata(body.metadata);
    if (value === null) return json(422, { error: "validation_error", message: "metadata invalido" });
    patch.metadata = value;
  }

  if (Object.keys(patch).length === 0) {
    return json(422, { error: "validation_error", message: "No hay campos para actualizar" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const updated = await stores.store.updateCompetitor(competitorId, patch, actorUserId, getRequestId(event));
    return json(200, toApiCompetitor(updated));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const listTaxonomies = async (event: APIGatewayProxyEventV2) => {
  const params = getTaxonomyPathParams(event, /^\/v1\/config\/taxonomies\/([^/]+)$/);
  if (!params) {
    return json(422, { error: "validation_error", message: "kind invalido" });
  }

  const includeInactive = event.queryStringParameters?.include_inactive === "true";

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const items = await stores.store.listTaxonomyEntries(params.kind, includeInactive);
    return json(200, {
      kind: params.kind,
      items: items.map(toApiTaxonomy)
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const createTaxonomy = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede crear taxonomias" });
  }

  const params = getTaxonomyPathParams(event, /^\/v1\/config\/taxonomies\/([^/]+)$/);
  if (!params) {
    return json(422, { error: "validation_error", message: "kind invalido" });
  }

  const body = parseBody<TaxonomyBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const key = normalizeString(body.key, 2, 120);
  const label = normalizeString(body.label, 2, 160);
  const description = normalizeOptionalString(body.description, 260);
  const isActive = body.is_active === undefined ? true : body.is_active;
  const sortOrder = body.sort_order === undefined ? 100 : Math.floor(Number(body.sort_order));
  const metadata = normalizeMetadata(body.metadata);

  if (
    !key ||
    !label ||
    (body.description !== undefined && description === undefined) ||
    typeof isActive !== "boolean" ||
    !Number.isFinite(sortOrder) ||
    metadata === null
  ) {
    return json(422, {
      error: "validation_error",
      message: "key y label requeridos; is_active boolean; sort_order numerico; metadata objeto"
    });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const created = await stores.store.createTaxonomyEntry(
      params.kind,
      {
        key,
        label,
        description: description ?? undefined,
        isActive,
        sortOrder,
        metadata
      },
      actorUserId,
      getRequestId(event)
    );

    return json(201, toApiTaxonomy(created));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const patchTaxonomy = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede editar taxonomias" });
  }

  const params = getTaxonomyPathParams(event, /^\/v1\/config\/taxonomies\/([^/]+)\/([^/]+)$/);
  if (!params?.id) {
    return json(422, { error: "validation_error", message: "kind o id invalido" });
  }

  const body = parseBody<TaxonomyBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const patch: Record<string, unknown> = {};

  if (body.key !== undefined) {
    const key = normalizeString(body.key, 2, 120);
    if (!key) return json(422, { error: "validation_error", message: "key invalido" });
    patch.key = key;
  }
  if (body.label !== undefined) {
    const label = normalizeString(body.label, 2, 160);
    if (!label) return json(422, { error: "validation_error", message: "label invalido" });
    patch.label = label;
  }
  if (body.description !== undefined) {
    const description = normalizeOptionalString(body.description, 260);
    if (description === undefined) return json(422, { error: "validation_error", message: "description invalido" });
    patch.description = description;
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      return json(422, { error: "validation_error", message: "is_active debe ser boolean" });
    }
    patch.isActive = body.is_active;
  }
  if (body.sort_order !== undefined) {
    const sortOrder = Math.floor(Number(body.sort_order));
    if (!Number.isFinite(sortOrder)) {
      return json(422, { error: "validation_error", message: "sort_order debe ser numerico" });
    }
    patch.sortOrder = sortOrder;
  }
  if (body.metadata !== undefined) {
    const metadata = normalizeMetadata(body.metadata);
    if (metadata === null) {
      return json(422, { error: "validation_error", message: "metadata invalido" });
    }
    patch.metadata = metadata;
  }

  if (Object.keys(patch).length === 0) {
    return json(422, { error: "validation_error", message: "No hay campos para actualizar" });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const updated = await stores.store.updateTaxonomyEntry(params.kind, params.id, patch, actorUserId, getRequestId(event));
    return json(200, toApiTaxonomy(updated));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const listConfigAudit = async (event: APIGatewayProxyEventV2) => {
  const stores = assertStores();
  if (stores.error) return stores.error;

  const role = getRole(event);
  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit, 100, 500);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit debe ser entero entre 1 y 500" });
  }

  const parsedFilters = toAuditFilters(query);
  if (!parsedFilters.filters) {
    return json(422, { error: "validation_error", message: parsedFilters.message ?? "Filtros invalidos" });
  }

  try {
    const page = await stores.store.listAudit(limit, query.cursor, parsedFilters.filters);
    return json(200, {
      items: page.items.map((item) => sanitizeAuditRecord(item, role)),
      page_info: {
        next_cursor: page.nextCursor,
        has_next: page.hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const exportConfigAudit = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  if (!env.exportBucketName) {
    return json(500, { error: "misconfigured", message: "Missing EXPORT_BUCKET_NAME" });
  }

  const body = event.body ? parseBody<AuditExportBody>(event) : { filters: {} };
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const rawFilters = (body.filters ?? {}) as Record<string, string | undefined>;
  const parsedFilters = toAuditFilters(rawFilters);
  if (!parsedFilters.filters) {
    return json(422, { error: "validation_error", message: parsedFilters.message ?? "Filtros invalidos" });
  }

  const requestedLimit = typeof body.limit === "number" ? Math.floor(body.limit) : 2000;
  if (!Number.isFinite(requestedLimit) || requestedLimit < 1 || requestedLimit > CSV_EXPORT_MAX_ROWS) {
    return json(422, { error: "validation_error", message: `limit debe estar entre 1 y ${CSV_EXPORT_MAX_ROWS}` });
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);

    const records = await stores.store.listAuditForExport(requestedLimit, parsedFilters.filters);
    const sanitized = records.map((item) => sanitizeAuditRecord(item, role));
    const csv = buildAuditCsv(sanitized);

    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const key = `audit-exports/${year}/${month}/${randomUUID()}.csv`;

    await s3
      .putObject({
        Bucket: env.exportBucketName,
        Key: key,
        Body: csv,
        ContentType: "text/csv; charset=utf-8"
      })
      .promise();

    const downloadUrl = await s3.getSignedUrlPromise("getObject", {
      Bucket: env.exportBucketName,
      Key: key,
      Expires: env.exportSignedUrlSeconds ?? 900
    });

    const exportResponse = {
      export_id: randomUUID(),
      status: "completed",
      format: "csv",
      row_count: records.length,
      created_at: now.toISOString(),
      download_url: downloadUrl,
      s3_key: key
    };

    await stores.store.recordAudit({
      actorUserId,
      action: "config_audit_export",
      resourceType: "AuditLog",
      resourceId: exportResponse.export_id,
      requestId: getRequestId(event),
      after: {
        row_count: exportResponse.row_count,
        format: exportResponse.format,
        s3_key: key,
        filters: parsedFilters.filters
      }
    });

    return json(202, {
      ...exportResponse,
      requested_by_user_id: actorUserId,
      request_id: getRequestId(event)
    });
  } catch (error) {
    return mapStoreError(error);
  }
};
