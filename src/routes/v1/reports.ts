import AWS from "aws-sdk";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getAuthPrincipal, getRole, hasRole } from "../../core/auth";
import { env } from "../../config/env";
import { getPathWithoutStage, getRequestId, json, parseBody } from "../../core/http";
import { AppStoreError, createAppStore } from "../../data/appStore";
import {
  createReportStore,
  type ReportCenterFilters,
  type ReportRunRecord,
  type ReportRunStatus,
  type ReportScheduleCreateInput,
  type ReportScheduleFrequency,
  type ReportScheduleRecord,
  type ReportScheduleUpdateInput,
  type ReportTemplateCreateInput,
  type ReportTemplateRecord,
  type ReportTemplateUpdateInput
} from "../../data/reportStore";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REPORT_STATUSES: ReadonlySet<ReportRunStatus> = new Set(["queued", "running", "completed", "failed", "pending_review"]);
const REPORT_FREQUENCIES: ReadonlySet<ReportScheduleFrequency> = new Set(["daily", "weekly"]);

type CreateReportRunBody = {
  template_id?: unknown;
};

type CreateTemplateBody = {
  name?: unknown;
  description?: unknown;
  is_active?: unknown;
  sections?: unknown;
  filters?: unknown;
  confidence_threshold?: unknown;
};

type PatchTemplateBody = CreateTemplateBody;

type CreateScheduleBody = {
  template_id?: unknown;
  name?: unknown;
  enabled?: unknown;
  frequency?: unknown;
  day_of_week?: unknown;
  time_local?: unknown;
  timezone?: unknown;
  recipients?: unknown;
};

type PatchScheduleBody = {
  name?: unknown;
  enabled?: unknown;
  frequency?: unknown;
  day_of_week?: unknown;
  time_local?: unknown;
  timezone?: unknown;
  recipients?: unknown;
};

const sqs = new AWS.SQS({ region: env.awsRegion });
const s3 = new AWS.S3({ region: env.awsRegion, signatureVersion: "v4" });

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

const normalizeBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") return undefined;
  return value;
};

const normalizeNumber = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
};

const normalizeIsoDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizeObject = (value: unknown): Record<string, unknown> | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
};

const normalizeRecipients = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;

  const recipients = value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter((item) => item.length > 0 && EMAIL_REGEX.test(item));

  return [...new Set(recipients)].slice(0, 50);
};

const normalizeFrequency = (value: unknown): ReportScheduleFrequency | undefined => {
  if (typeof value !== "string") return undefined;
  if (!REPORT_FREQUENCIES.has(value as ReportScheduleFrequency)) return undefined;
  return value as ReportScheduleFrequency;
};

const normalizeDayOfWeek = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 0 || value > 6) return undefined;
  return value;
};

const normalizeTimeLocal = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return undefined;
  const hour = Number.parseInt(trimmed.slice(0, 2), 10);
  const minute = Number.parseInt(trimmed.slice(3, 5), 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return trimmed;
};

const toApiTemplate = (record: ReportTemplateRecord) => ({
  id: record.id,
  name: record.name,
  description: record.description,
  is_active: record.isActive,
  sections: record.sections,
  filters: record.filters,
  confidence_threshold: record.confidenceThreshold,
  created_by_user_id: record.createdByUserId,
  created_at: record.createdAt.toISOString(),
  updated_at: record.updatedAt.toISOString()
});

const toApiSchedule = (record: ReportScheduleRecord) => ({
  id: record.id,
  template_id: record.templateId,
  template_name: record.templateName,
  name: record.name,
  enabled: record.enabled,
  frequency: record.frequency,
  day_of_week: record.dayOfWeek,
  time_local: record.timeLocal,
  timezone: record.timezone,
  recipients: record.recipients,
  next_run_at: record.nextRunAt.toISOString(),
  last_run_at: record.lastRunAt?.toISOString() ?? null,
  created_by_user_id: record.createdByUserId,
  created_at: record.createdAt.toISOString(),
  updated_at: record.updatedAt.toISOString()
});

const toApiRun = (record: ReportRunRecord, downloadUrl: string | null) => ({
  id: record.id,
  template_id: record.templateId,
  template_name: record.templateName,
  schedule_id: record.scheduleId,
  schedule_name: record.scheduleName,
  status: record.status,
  window_start: record.windowStart.toISOString(),
  window_end: record.windowEnd.toISOString(),
  source_type: record.sourceType,
  confidence: record.confidence,
  summary: record.summary,
  recommendations: record.recommendations,
  blocked_reason: record.blockedReason,
  export_job_id: record.exportJobId,
  export_status: record.exportStatus,
  download_url: downloadUrl,
  requested_by_user_id: record.requestedByUserId,
  requested_by_name: record.requestedByName,
  requested_by_email: record.requestedByEmail,
  idempotency_key: record.idempotencyKey,
  created_at: record.createdAt.toISOString(),
  started_at: record.startedAt?.toISOString() ?? null,
  completed_at: record.completedAt?.toISOString() ?? null,
  error_message: record.errorMessage
});

const signExportUrl = async (record: ReportRunRecord): Promise<string | null> => {
  if (!env.exportBucketName || !record.exportJobId || record.exportStatus !== "completed" || !record.exportS3Key) {
    return null;
  }

  return s3.getSignedUrlPromise("getObject", {
    Bucket: env.exportBucketName,
    Key: record.exportS3Key,
    Expires: env.exportSignedUrlSeconds ?? 900
  });
};

const getIdFromPath = (event: APIGatewayProxyEventV2, pattern: RegExp): string | null => {
  const match = getPathWithoutStage(event).match(pattern);
  return match?.[1] ?? null;
};

const dispatchReportRun = async (runId: string, requestId: string, actorUserId: string | null) => {
  if (!env.reportQueueUrl) {
    throw new Error("Missing REPORT_QUEUE_URL");
  }

  await sqs
    .sendMessage({
      QueueUrl: env.reportQueueUrl,
      MessageBody: JSON.stringify({
        report_run_id: runId,
        request_id: requestId,
        requested_by_user_id: actorUserId,
        requested_at: new Date().toISOString()
      })
    })
    .promise();
};

export const listReportsCenter = async (event: APIGatewayProxyEventV2) => {
  const store = createReportStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit, 50, 200);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit debe ser un entero entre 1 y 200" });
  }

  const filters: ReportCenterFilters = {};
  if (query.status) {
    if (!REPORT_STATUSES.has(query.status as ReportRunStatus)) {
      return json(422, { error: "validation_error", message: "status invalido" });
    }
    filters.status = query.status as ReportRunStatus;
  }

  if (query.template_id) {
    if (!UUID_REGEX.test(query.template_id)) {
      return json(422, { error: "validation_error", message: "template_id debe ser UUID valido" });
    }
    filters.templateId = query.template_id;
  }

  if (query.from) {
    const from = normalizeIsoDate(query.from);
    if (!from) {
      return json(422, { error: "validation_error", message: "from invalido" });
    }
    filters.from = from;
  }

  if (query.to) {
    const to = normalizeIsoDate(query.to);
    if (!to) {
      return json(422, { error: "validation_error", message: "to invalido" });
    }
    filters.to = to;
  }

  try {
    const page = await store.listReportCenter(limit, filters, query.cursor ?? undefined);
    const items = await Promise.all(
      page.items.map(async (item) => {
        const downloadUrl = await signExportUrl(item);
        return toApiRun(item, downloadUrl);
      })
    );

    return json(200, {
      items,
      page_info: {
        next_cursor: page.nextCursor,
        has_next: page.hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getReportRun = async (event: APIGatewayProxyEventV2) => {
  const reportRunId = getIdFromPath(event, /^\/v1\/reports\/runs\/([^/]+)$/);
  if (!reportRunId || !UUID_REGEX.test(reportRunId)) {
    return json(422, { error: "validation_error", message: "report run id invalido" });
  }

  const store = createReportStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  try {
    const detail = await store.getReportRun(reportRunId);
    if (!detail) {
      return json(404, { error: "not_found", message: "Report run not found" });
    }

    const downloadUrl = await signExportUrl(detail.run);

    return json(200, {
      run: toApiRun(detail.run, downloadUrl),
      template: toApiTemplate(detail.template),
      schedule: detail.schedule ? toApiSchedule(detail.schedule) : null
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const createReportRun = async (event: APIGatewayProxyEventV2) => {
  if (!hasRole(getRole(event), "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const body = parseBody<CreateReportRunBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const templateId = typeof body.template_id === "string" ? body.template_id.trim() : "";
  if (!UUID_REGEX.test(templateId)) {
    return json(422, { error: "validation_error", message: "template_id debe ser UUID valido" });
  }

  const appStore = createAppStore();
  const reportStore = createReportStore();
  if (!appStore || !reportStore) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);
    const run = await reportStore.createReportRun({
      templateId,
      requestedByUserId: actorUserId,
      sourceType: "news"
    }, getRequestId(event));

    try {
      await dispatchReportRun(run.id, getRequestId(event), actorUserId);
    } catch (dispatchError) {
      await reportStore.failReportRun(run.id, `dispatch_failed: ${(dispatchError as Error).message}`);
      return json(502, { error: "report_dispatch_failed", message: (dispatchError as Error).message });
    }

    return json(202, {
      report_run_id: run.id,
      status: run.status
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const listReportTemplates = async (event: APIGatewayProxyEventV2) => {
  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit, 100, 200);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit debe ser un entero entre 1 y 200" });
  }

  const store = createReportStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  try {
    const items = await store.listTemplates(limit);
    return json(200, { items: items.map(toApiTemplate) });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const createReportTemplate = async (event: APIGatewayProxyEventV2) => {
  if (!hasRole(getRole(event), "Admin")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Admin" });
  }

  const body = parseBody<CreateTemplateBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const name = normalizeString(body.name, 3, 120);
  if (!name) {
    return json(422, { error: "validation_error", message: "name es obligatorio (3..120)" });
  }

  const description = normalizeOptionalString(body.description, 600);
  if (body.description !== undefined && description === undefined) {
    return json(422, { error: "validation_error", message: "description invalida" });
  }

  const isActive = normalizeBoolean(body.is_active);
  if (body.is_active !== undefined && isActive === undefined) {
    return json(422, { error: "validation_error", message: "is_active debe ser boolean" });
  }

  const sections = normalizeObject(body.sections);
  if (body.sections !== undefined && !sections) {
    return json(422, { error: "validation_error", message: "sections debe ser objeto" });
  }

  const filters = normalizeObject(body.filters);
  if (body.filters !== undefined && !filters) {
    return json(422, { error: "validation_error", message: "filters debe ser objeto" });
  }

  const confidenceThreshold = normalizeNumber(body.confidence_threshold);
  if (body.confidence_threshold !== undefined && (confidenceThreshold === undefined || confidenceThreshold < 0 || confidenceThreshold > 1)) {
    return json(422, { error: "validation_error", message: "confidence_threshold debe estar entre 0 y 1" });
  }

  const appStore = createAppStore();
  const reportStore = createReportStore();
  if (!appStore || !reportStore) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);
    const template = await reportStore.createTemplate(
      {
        name,
        description,
        isActive,
        sections,
        filters,
        confidenceThreshold
      } satisfies ReportTemplateCreateInput,
      actorUserId,
      getRequestId(event)
    );

    return json(201, toApiTemplate(template));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const patchReportTemplate = async (event: APIGatewayProxyEventV2) => {
  if (!hasRole(getRole(event), "Admin")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Admin" });
  }

  const templateId = getIdFromPath(event, /^\/v1\/reports\/templates\/([^/]+)$/);
  if (!templateId || !UUID_REGEX.test(templateId)) {
    return json(422, { error: "validation_error", message: "template id invalido" });
  }

  const body = parseBody<PatchTemplateBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const patch: ReportTemplateUpdateInput = {};

  if (body.name !== undefined) {
    const name = normalizeString(body.name, 3, 120);
    if (!name) {
      return json(422, { error: "validation_error", message: "name invalido" });
    }
    patch.name = name;
  }

  if (body.description !== undefined) {
    const description = normalizeOptionalString(body.description, 600);
    if (description === undefined) {
      return json(422, { error: "validation_error", message: "description invalida" });
    }
    patch.description = description;
  }

  if (body.is_active !== undefined) {
    const isActive = normalizeBoolean(body.is_active);
    if (isActive === undefined) {
      return json(422, { error: "validation_error", message: "is_active debe ser boolean" });
    }
    patch.isActive = isActive;
  }

  if (body.sections !== undefined) {
    const sections = normalizeObject(body.sections);
    if (!sections) {
      return json(422, { error: "validation_error", message: "sections debe ser objeto" });
    }
    patch.sections = sections;
  }

  if (body.filters !== undefined) {
    const filters = normalizeObject(body.filters);
    if (!filters) {
      return json(422, { error: "validation_error", message: "filters debe ser objeto" });
    }
    patch.filters = filters;
  }

  if (body.confidence_threshold !== undefined) {
    const confidenceThreshold = normalizeNumber(body.confidence_threshold);
    if (confidenceThreshold === undefined || confidenceThreshold < 0 || confidenceThreshold > 1) {
      return json(422, { error: "validation_error", message: "confidence_threshold debe estar entre 0 y 1" });
    }
    patch.confidenceThreshold = confidenceThreshold;
  }

  if (Object.keys(patch).length === 0) {
    return json(409, { error: "conflict", message: "No changes requested" });
  }

  const appStore = createAppStore();
  const reportStore = createReportStore();
  if (!appStore || !reportStore) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);
    const template = await reportStore.updateTemplate(templateId, patch, actorUserId, getRequestId(event));
    return json(200, toApiTemplate(template));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const listReportSchedules = async (event: APIGatewayProxyEventV2) => {
  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit, 100, 300);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit debe ser un entero entre 1 y 300" });
  }

  const store = createReportStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  try {
    const items = await store.listSchedules(limit);
    return json(200, { items: items.map(toApiSchedule) });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const createReportSchedule = async (event: APIGatewayProxyEventV2) => {
  if (!hasRole(getRole(event), "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const body = parseBody<CreateScheduleBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const templateId = typeof body.template_id === "string" ? body.template_id.trim() : "";
  if (!UUID_REGEX.test(templateId)) {
    return json(422, { error: "validation_error", message: "template_id debe ser UUID valido" });
  }

  const name = normalizeString(body.name, 3, 120);
  if (!name) {
    return json(422, { error: "validation_error", message: "name es obligatorio (3..120)" });
  }

  const frequency = normalizeFrequency(body.frequency);
  if (!frequency) {
    return json(422, { error: "validation_error", message: "frequency debe ser daily|weekly" });
  }

  const dayOfWeek = normalizeDayOfWeek(body.day_of_week);
  if (body.day_of_week !== undefined && dayOfWeek === undefined) {
    return json(422, { error: "validation_error", message: "day_of_week debe ser 0..6" });
  }
  if (frequency === "weekly" && (dayOfWeek === null || dayOfWeek === undefined)) {
    return json(422, { error: "validation_error", message: "day_of_week es obligatorio para frecuencia weekly" });
  }

  const timeLocal = normalizeTimeLocal(body.time_local);
  if (!timeLocal) {
    return json(422, { error: "validation_error", message: "time_local debe cumplir HH:mm" });
  }

  const timezone = normalizeString(body.timezone, 3, 80);
  if (body.timezone !== undefined && !timezone) {
    return json(422, { error: "validation_error", message: "timezone invalida" });
  }

  const enabled = normalizeBoolean(body.enabled);
  if (body.enabled !== undefined && enabled === undefined) {
    return json(422, { error: "validation_error", message: "enabled debe ser boolean" });
  }

  const recipients = normalizeRecipients(body.recipients);
  if (body.recipients !== undefined && recipients === undefined) {
    return json(422, { error: "validation_error", message: "recipients debe ser array de correos validos" });
  }

  const appStore = createAppStore();
  const reportStore = createReportStore();
  if (!appStore || !reportStore) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);
    const schedule = await reportStore.createSchedule(
      {
        templateId,
        name,
        enabled,
        frequency,
        dayOfWeek,
        timeLocal,
        timezone: timezone ?? env.reportDefaultTimezone ?? "America/Bogota",
        recipients
      } satisfies ReportScheduleCreateInput,
      actorUserId,
      getRequestId(event)
    );

    return json(201, toApiSchedule(schedule));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const patchReportSchedule = async (event: APIGatewayProxyEventV2) => {
  if (!hasRole(getRole(event), "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const scheduleId = getIdFromPath(event, /^\/v1\/reports\/schedules\/([^/]+)$/);
  if (!scheduleId || !UUID_REGEX.test(scheduleId)) {
    return json(422, { error: "validation_error", message: "schedule id invalido" });
  }

  const body = parseBody<PatchScheduleBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const patch: ReportScheduleUpdateInput = {};

  if (body.name !== undefined) {
    const name = normalizeString(body.name, 3, 120);
    if (!name) {
      return json(422, { error: "validation_error", message: "name invalido" });
    }
    patch.name = name;
  }

  if (body.enabled !== undefined) {
    const enabled = normalizeBoolean(body.enabled);
    if (enabled === undefined) {
      return json(422, { error: "validation_error", message: "enabled debe ser boolean" });
    }
    patch.enabled = enabled;
  }

  if (body.frequency !== undefined) {
    const frequency = normalizeFrequency(body.frequency);
    if (!frequency) {
      return json(422, { error: "validation_error", message: "frequency debe ser daily|weekly" });
    }
    patch.frequency = frequency;
  }

  if (body.day_of_week !== undefined) {
    const dayOfWeek = normalizeDayOfWeek(body.day_of_week);
    if (dayOfWeek === undefined) {
      return json(422, { error: "validation_error", message: "day_of_week debe ser 0..6" });
    }
    patch.dayOfWeek = dayOfWeek;
  }

  if (body.time_local !== undefined) {
    const timeLocal = normalizeTimeLocal(body.time_local);
    if (!timeLocal) {
      return json(422, { error: "validation_error", message: "time_local debe cumplir HH:mm" });
    }
    patch.timeLocal = timeLocal;
  }

  if (body.timezone !== undefined) {
    const timezone = normalizeString(body.timezone, 3, 80);
    if (!timezone) {
      return json(422, { error: "validation_error", message: "timezone invalida" });
    }
    patch.timezone = timezone;
  }

  if (body.recipients !== undefined) {
    const recipients = normalizeRecipients(body.recipients);
    if (!recipients) {
      return json(422, { error: "validation_error", message: "recipients debe ser array de correos validos" });
    }
    patch.recipients = recipients;
  }

  const frequencyCandidate = patch.frequency;
  if (frequencyCandidate === "weekly") {
    if (patch.dayOfWeek === undefined || patch.dayOfWeek === null) {
      return json(422, { error: "validation_error", message: "day_of_week es obligatorio para frecuencia weekly" });
    }
  }

  if (Object.keys(patch).length === 0) {
    return json(409, { error: "conflict", message: "No changes requested" });
  }

  const appStore = createAppStore();
  const reportStore = createReportStore();
  if (!appStore || !reportStore) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);
    const schedule = await reportStore.updateSchedule(scheduleId, patch, actorUserId, getRequestId(event));
    return json(200, toApiSchedule(schedule));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const triggerReportScheduleRun = async (event: APIGatewayProxyEventV2) => {
  if (!hasRole(getRole(event), "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const scheduleId = getIdFromPath(event, /^\/v1\/reports\/schedules\/([^/]+)\/run$/);
  if (!scheduleId || !UUID_REGEX.test(scheduleId)) {
    return json(422, { error: "validation_error", message: "schedule id invalido" });
  }

  const appStore = createAppStore();
  const reportStore = createReportStore();
  if (!appStore || !reportStore) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  try {
    const schedule = await reportStore.getSchedule(scheduleId);
    if (!schedule) {
      return json(404, { error: "not_found", message: "Report schedule not found" });
    }

    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);
    const run = await reportStore.createReportRun(
      {
        templateId: schedule.templateId,
        scheduleId: schedule.id,
        requestedByUserId: actorUserId,
        sourceType: "news"
      },
      getRequestId(event)
    );

    try {
      await dispatchReportRun(run.id, getRequestId(event), actorUserId);
    } catch (dispatchError) {
      await reportStore.failReportRun(run.id, `dispatch_failed: ${(dispatchError as Error).message}`);
      return json(502, { error: "report_dispatch_failed", message: (dispatchError as Error).message });
    }

    return json(202, {
      report_run_id: run.id,
      schedule_id: schedule.id,
      status: run.status
    });
  } catch (error) {
    return mapStoreError(error);
  }
};
