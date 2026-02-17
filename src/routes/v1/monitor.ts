import AWS from "aws-sdk";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getAuthPrincipal, getRole, hasRole } from "../../core/auth";
import { getPathWithoutStage, getRequestId, json, parseBody } from "../../core/http";
import { env } from "../../config/env";
import {
  AppStoreError,
  createAppStore,
  type MonitorOverviewRecord,
  type MonitorScopeKpiRecord
} from "../../data/appStore";
import {
  createIncidentStore,
  type IncidentListFilters,
  type IncidentNoteRecord,
  type IncidentRecord,
  type IncidentScope,
  type IncidentSeverity,
  type IncidentStatus
} from "../../data/incidentStore";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INCIDENT_SCOPES = new Set<IncidentScope>(["claro", "competencia"]);
const INCIDENT_SEVERITIES = new Set<IncidentSeverity>(["SEV1", "SEV2", "SEV3", "SEV4"]);
const INCIDENT_STATUSES = new Set<IncidentStatus>(["open", "acknowledged", "in_progress", "resolved", "dismissed"]);
const sqs = new AWS.SQS({ region: env.awsRegion });

type PatchIncidentBody = {
  status?: unknown;
  owner_user_id?: unknown;
  note?: unknown;
};

type CreateIncidentNoteBody = {
  note?: unknown;
};

const parseLimit = (value: string | undefined, fallback: number, max: number): number | null => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  if (parsed < 1 || parsed > max) return null;
  return parsed;
};

const toApiScopeKpi = (scope: MonitorScopeKpiRecord) => ({
  items: scope.items,
  classified_items: scope.classifiedItems,
  positivos: scope.positivos,
  negativos: scope.negativos,
  neutrales: scope.neutrales,
  sentimiento_neto: scope.sentimientoNeto,
  riesgo_activo: scope.riesgoActivo,
  quality_score: scope.qualityScore,
  bhs: scope.bhs,
  sov: scope.sov,
  insufficient_data: scope.insufficientData
});

const toApiOverview = (overview: MonitorOverviewRecord) => ({
  generated_at: overview.generatedAt.toISOString(),
  window_days: overview.windowDays,
  source_type: overview.sourceType,
  formula_version: overview.formulaVersion,
  totals: {
    items: overview.totals.items,
    classified_items: overview.totals.classifiedItems,
    sentimiento_neto: overview.totals.sentimientoNeto,
    bhs: overview.totals.bhs,
    riesgo_activo: overview.totals.riesgoActivo,
    severidad: overview.totals.severidad,
    sov_claro: overview.totals.sovClaro,
    sov_competencia: overview.totals.sovCompetencia,
    insufficient_data: overview.totals.insufficientData
  },
  by_scope: {
    claro: toApiScopeKpi(overview.byScope.claro),
    competencia: toApiScopeKpi(overview.byScope.competencia)
  },
  diagnostics: {
    unscoped_items: overview.diagnostics.unscopedItems,
    unknown_sentiment_items: overview.diagnostics.unknownSentimentItems
  }
});

const toApiIncident = (incident: IncidentRecord) => ({
  id: incident.id,
  scope: incident.scope,
  severity: incident.severity,
  status: incident.status,
  risk_score: incident.riskScore,
  classified_items: incident.classifiedItems,
  owner_user_id: incident.ownerUserId,
  owner: incident.ownerUserId
    ? {
        user_id: incident.ownerUserId,
        name: incident.ownerName,
        email: incident.ownerEmail,
        role: incident.ownerRole
      }
    : null,
  sla_due_at: incident.slaDueAt.toISOString(),
  sla_remaining_minutes: incident.slaRemainingMinutes,
  cooldown_until: incident.cooldownUntil.toISOString(),
  signal_version: incident.signalVersion,
  payload: incident.payload,
  created_at: incident.createdAt.toISOString(),
  updated_at: incident.updatedAt.toISOString(),
  resolved_at: incident.resolvedAt?.toISOString() ?? null
});

const toApiIncidentNote = (note: IncidentNoteRecord) => ({
  id: note.id,
  incident_id: note.incidentId,
  author_user_id: note.authorUserId,
  author: {
    user_id: note.authorUserId,
    name: note.authorName,
    email: note.authorEmail,
    role: note.authorRole
  },
  note: note.note,
  created_at: note.createdAt.toISOString()
});

const mapStoreError = (error: unknown) => {
  if (error instanceof AppStoreError) {
    if (error.code === "validation") {
      return json(422, {
        error: "validation_error",
        message: error.message
      });
    }

    if (error.code === "not_found") {
      return json(404, {
        error: "not_found",
        message: error.message
      });
    }

    if (error.code === "conflict") {
      return json(409, {
        error: "conflict",
        message: error.message
      });
    }
  }

  return json(500, {
    error: "internal_error",
    message: (error as Error).message
  });
};

const getIncidentIdFromPath = (event: APIGatewayProxyEventV2, pattern: RegExp): string | null => {
  const path = getPathWithoutStage(event);
  const match = path.match(pattern);
  if (!match) return null;
  return match[1] ?? null;
};

const normalizeNote = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2000) return null;
  return trimmed;
};

export const getMonitorOverview = async () => {
  const store = createAppStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  try {
    const overview = await store.getMonitorOverview();
    return json(200, toApiOverview(overview));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const listMonitorIncidents = async (event: APIGatewayProxyEventV2) => {
  const store = createIncidentStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit, 50, 200);
  if (limit === null) {
    return json(422, {
      error: "validation_error",
      message: "limit debe ser un entero entre 1 y 200"
    });
  }

  const filters: IncidentListFilters = {};

  if (query.status) {
    if (!INCIDENT_STATUSES.has(query.status as IncidentStatus)) {
      return json(422, { error: "validation_error", message: "status invalido" });
    }
    filters.status = query.status as IncidentStatus;
  }

  if (query.severity) {
    if (!INCIDENT_SEVERITIES.has(query.severity as IncidentSeverity)) {
      return json(422, { error: "validation_error", message: "severity invalido" });
    }
    filters.severity = query.severity as IncidentSeverity;
  }

  if (query.scope) {
    if (!INCIDENT_SCOPES.has(query.scope as IncidentScope)) {
      return json(422, { error: "validation_error", message: "scope invalido" });
    }
    filters.scope = query.scope as IncidentScope;
  }

  if (query.owner_user_id) {
    if (!UUID_REGEX.test(query.owner_user_id)) {
      return json(422, { error: "validation_error", message: "owner_user_id debe ser UUID valido" });
    }
    filters.ownerUserId = query.owner_user_id;
  }

  try {
    const page = await store.listIncidents(limit, filters, query.cursor ?? undefined);
    return json(200, {
      items: page.items.map(toApiIncident),
      page_info: {
        next_cursor: page.nextCursor,
        has_next: page.hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const patchMonitorIncident = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const incidentId = getIncidentIdFromPath(event, /^\/v1\/monitor\/incidents\/([^/]+)$/);
  if (!incidentId || !UUID_REGEX.test(incidentId)) {
    return json(422, {
      error: "validation_error",
      message: "Incident id invalido"
    });
  }

  const body = parseBody<PatchIncidentBody>(event);
  if (!body) {
    return json(400, {
      error: "invalid_json",
      message: "Body JSON invalido"
    });
  }

  let status: IncidentStatus | undefined;
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !INCIDENT_STATUSES.has(body.status as IncidentStatus)) {
      return json(422, {
        error: "validation_error",
        message: "status invalido"
      });
    }
    status = body.status as IncidentStatus;
  }

  let ownerUserId: string | null | undefined;
  if (body.owner_user_id !== undefined) {
    if (body.owner_user_id === null) {
      ownerUserId = null;
    } else if (typeof body.owner_user_id === "string" && UUID_REGEX.test(body.owner_user_id)) {
      ownerUserId = body.owner_user_id;
    } else {
      return json(422, {
        error: "validation_error",
        message: "owner_user_id debe ser UUID valido o null"
      });
    }
  }

  const note = normalizeNote(body.note);
  if (body.note !== undefined && note === null) {
    return json(422, {
      error: "validation_error",
      message: "note debe ser texto no vacio y maximo 2000 caracteres"
    });
  }

  if (status === undefined && ownerUserId === undefined && note === undefined) {
    return json(422, {
      error: "validation_error",
      message: "Debe enviar al menos uno de status, owner_user_id o note"
    });
  }

  const appStore = createAppStore();
  const incidentStore = createIncidentStore();
  if (!appStore || !incidentStore) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);

    const result = await incidentStore.patchIncident({
      incidentId,
      status,
      ownerUserId,
      note: note ?? undefined,
      actorUserId,
      requestId: getRequestId(event)
    });

    return json(200, {
      incident: toApiIncident(result.incident),
      note: result.note ? toApiIncidentNote(result.note) : null
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getMonitorIncidentNotes = async (event: APIGatewayProxyEventV2) => {
  const store = createIncidentStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  const incidentId = getIncidentIdFromPath(event, /^\/v1\/monitor\/incidents\/([^/]+)\/notes$/);
  if (!incidentId || !UUID_REGEX.test(incidentId)) {
    return json(422, {
      error: "validation_error",
      message: "Incident id invalido"
    });
  }

  const limit = parseLimit(event.queryStringParameters?.limit, 100, 200);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit debe ser un entero entre 1 y 200" });
  }

  try {
    const items = await store.listIncidentNotes(incidentId, limit);
    return json(200, {
      items: items.map(toApiIncidentNote)
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const createMonitorIncidentNote = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const incidentId = getIncidentIdFromPath(event, /^\/v1\/monitor\/incidents\/([^/]+)\/notes$/);
  if (!incidentId || !UUID_REGEX.test(incidentId)) {
    return json(422, {
      error: "validation_error",
      message: "Incident id invalido"
    });
  }

  const body = parseBody<CreateIncidentNoteBody>(event);
  if (!body) {
    return json(400, {
      error: "invalid_json",
      message: "Body JSON invalido"
    });
  }

  const note = normalizeNote(body.note);
  if (!note) {
    return json(422, {
      error: "validation_error",
      message: "note es obligatorio y debe tener maximo 2000 caracteres"
    });
  }

  const appStore = createAppStore();
  const incidentStore = createIncidentStore();
  if (!appStore || !incidentStore) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);

    const created = await incidentStore.addIncidentNote({
      incidentId,
      note,
      authorUserId: actorUserId,
      requestId: getRequestId(event)
    });

    return json(201, toApiIncidentNote(created));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const evaluateMonitorIncidents = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  if (!env.incidentQueueUrl) {
    return json(500, {
      error: "misconfigured",
      message: "Missing INCIDENT_QUEUE_URL"
    });
  }

  const appStore = createAppStore();
  if (!appStore) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);

    const payload = {
      trigger_type: "manual",
      requested_at: new Date().toISOString(),
      request_id: getRequestId(event),
      actor_user_id: actorUserId
    };

    const response = await sqs
      .sendMessage({
        QueueUrl: env.incidentQueueUrl,
        MessageBody: JSON.stringify(payload)
      })
      .promise();

    return json(202, {
      status: "queued",
      trigger_type: "manual",
      message_id: response.MessageId ?? null
    });
  } catch (error) {
    return json(500, {
      error: "internal_error",
      message: (error as Error).message
    });
  }
};
