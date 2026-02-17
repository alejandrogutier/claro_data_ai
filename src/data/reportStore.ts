import { randomUUID } from "crypto";
import { AppStoreError } from "./appStore";
import {
  RdsDataClient,
  fieldBoolean,
  fieldDate,
  fieldLong,
  fieldString,
  sqlBoolean,
  sqlJson,
  sqlLong,
  sqlString,
  sqlTimestamp,
  sqlUuid,
  type SqlParameter,
  type SqlRow
} from "./rdsData";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REPORT_STATUSES = ["queued", "running", "completed", "failed", "pending_review"] as const;
const REPORT_FREQUENCIES = ["daily", "weekly"] as const;
const SOURCE_TYPES = ["news", "social"] as const;

type ReportCursorPayload = {
  created_at: string;
  id: string;
};

export type ReportRunStatus = (typeof REPORT_STATUSES)[number];
export type ReportScheduleFrequency = (typeof REPORT_FREQUENCIES)[number];
export type ReportSourceType = (typeof SOURCE_TYPES)[number];

export type ReportTemplateRecord = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sections: Record<string, unknown>;
  filters: Record<string, unknown>;
  confidenceThreshold: number;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReportScheduleRecord = {
  id: string;
  templateId: string;
  templateName: string;
  name: string;
  enabled: boolean;
  frequency: ReportScheduleFrequency;
  dayOfWeek: number | null;
  timeLocal: string;
  timezone: string;
  recipients: string[];
  nextRunAt: Date;
  lastRunAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReportRunRecord = {
  id: string;
  templateId: string;
  templateName: string;
  scheduleId: string | null;
  scheduleName: string | null;
  status: ReportRunStatus;
  windowStart: Date;
  windowEnd: Date;
  sourceType: ReportSourceType;
  confidence: number | null;
  summary: Record<string, unknown>;
  recommendations: string[];
  blockedReason: string | null;
  exportJobId: string | null;
  exportStatus: "queued" | "running" | "completed" | "failed" | null;
  exportS3Key: string | null;
  requestedByUserId: string | null;
  requestedByName: string | null;
  requestedByEmail: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  idempotencyKey: string | null;
};

export type ReportRunDetail = {
  run: ReportRunRecord;
  template: ReportTemplateRecord;
  schedule: ReportScheduleRecord | null;
};

export type ReportCenterFilters = {
  status?: ReportRunStatus;
  templateId?: string;
  from?: Date;
  to?: Date;
};

export type ReportCenterPage = {
  items: ReportRunRecord[];
  nextCursor: string | null;
  hasNext: boolean;
};

export type ReportTemplateCreateInput = {
  name: string;
  description?: string | null;
  isActive?: boolean;
  sections?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  confidenceThreshold?: number;
};

export type ReportTemplateUpdateInput = {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  sections?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  confidenceThreshold?: number;
};

export type ReportScheduleCreateInput = {
  templateId: string;
  name: string;
  enabled?: boolean;
  frequency: ReportScheduleFrequency;
  dayOfWeek?: number | null;
  timeLocal: string;
  timezone?: string;
  recipients?: string[];
};

export type ReportScheduleUpdateInput = {
  name?: string;
  enabled?: boolean;
  frequency?: ReportScheduleFrequency;
  dayOfWeek?: number | null;
  timeLocal?: string;
  timezone?: string;
  recipients?: string[];
};

export type ReportRunCreateInput = {
  templateId: string;
  scheduleId?: string | null;
  requestedByUserId?: string | null;
  sourceType?: ReportSourceType;
  idempotencyKey?: string | null;
  now?: Date;
};

export type ReportRunCompleteInput = {
  reportRunId: string;
  status: Extract<ReportRunStatus, "completed" | "pending_review">;
  confidence: number;
  summary: Record<string, unknown>;
  recommendations: string[];
  blockedReason?: string | null;
  exportJobId?: string | null;
};

export type DueScheduleCandidate = {
  scheduleId: string;
};

export type ScheduleEnqueueResult = {
  run: ReportRunRecord;
  created: boolean;
};

type ScheduleTiming = {
  frequency: ReportScheduleFrequency;
  dayOfWeek: number | null;
  timeLocal: string;
  timezone: string;
};

type AuditWriteInput = {
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  requestId?: string | null;
  before?: unknown;
  after?: unknown;
};

const isUuid = (value: string): boolean => UUID_REGEX.test(value);

const isUniqueViolation = (error: unknown): boolean => {
  const message = (error as Error).message ?? "";
  return /duplicate key value|unique constraint/i.test(message);
};

const parseDecimal = (value: string | null, fallback = 0): number => {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const parseStringArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item).trim()).filter((item) => item.length > 0);
  } catch {
    return [];
  }
};

const normalizeStatus = (value: string | null): ReportRunStatus => {
  if (value && REPORT_STATUSES.includes(value as ReportRunStatus)) return value as ReportRunStatus;
  return "queued";
};

const normalizeFrequency = (value: string | null): ReportScheduleFrequency => {
  if (value && REPORT_FREQUENCIES.includes(value as ReportScheduleFrequency)) return value as ReportScheduleFrequency;
  return "daily";
};

const normalizeSourceType = (value: string | null): ReportSourceType => {
  if (value && SOURCE_TYPES.includes(value as ReportSourceType)) return value as ReportSourceType;
  return "news";
};

const encodeCursor = (value: ReportCursorPayload): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeCursor = (value?: string): ReportCursorPayload | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ReportCursorPayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.created_at !== "string" || typeof parsed.id !== "string") return null;
    if (!isUuid(parsed.id)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const parseWeekday = (weekday: string | null): number | null => {
  if (!weekday) return null;
  const normalized = weekday.toLowerCase();
  if (normalized === "sun") return 0;
  if (normalized === "mon") return 1;
  if (normalized === "tue") return 2;
  if (normalized === "wed") return 3;
  if (normalized === "thu") return 4;
  if (normalized === "fri") return 5;
  if (normalized === "sat") return 6;
  return null;
};

const toLocalParts = (date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
} => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short"
  });

  const parts = formatter.formatToParts(date);
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";

  const year = Number.parseInt(pick("year"), 10);
  const month = Number.parseInt(pick("month"), 10);
  const day = Number.parseInt(pick("day"), 10);
  const hour = Number.parseInt(pick("hour"), 10);
  const minute = Number.parseInt(pick("minute"), 10);
  const second = Number.parseInt(pick("second"), 10);
  const weekday = parseWeekday(pick("weekday"));

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    weekday === null
  ) {
    throw new AppStoreError("validation", `Could not parse timezone parts for ${timezone}`);
  }

  return { year, month, day, hour, minute, second, weekday };
};

const localToUtcDate = (
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0
): Date => {
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 4; i += 1) {
    const local = toLocalParts(new Date(utcMillis), timezone);
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    const current = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const diff = desired - current;

    if (Math.abs(diff) < 1000) {
      break;
    }

    utcMillis += diff;
  }

  return new Date(utcMillis);
};

const addDays = (year: number, month: number, day: number, deltaDays: number): { year: number; month: number; day: number } => {
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
};

const parseTimeLocal = (value: string): { hour: number; minute: number } => {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    throw new AppStoreError("validation", "time_local must be HH:mm");
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new AppStoreError("validation", "time_local must be HH:mm");
  }

  return { hour, minute };
};

const computeNextRunAt = (timing: ScheduleTiming, reference: Date): Date => {
  const timezone = timing.timezone || "America/Bogota";
  const { hour: targetHour, minute: targetMinute } = parseTimeLocal(timing.timeLocal);

  const localRef = toLocalParts(reference, timezone);

  if (timing.frequency === "daily") {
    let candidate = {
      year: localRef.year,
      month: localRef.month,
      day: localRef.day
    };

    if (localRef.hour > targetHour || (localRef.hour === targetHour && localRef.minute >= targetMinute)) {
      candidate = addDays(candidate.year, candidate.month, candidate.day, 1);
    }

    return localToUtcDate(timezone, candidate.year, candidate.month, candidate.day, targetHour, targetMinute, 0);
  }

  const targetDay = timing.dayOfWeek;
  if (targetDay === null || targetDay === undefined || targetDay < 0 || targetDay > 6) {
    throw new AppStoreError("validation", "day_of_week is required for weekly frequency and must be 0..6");
  }

  let delta = (targetDay - localRef.weekday + 7) % 7;
  if (delta === 0 && (localRef.hour > targetHour || (localRef.hour === targetHour && localRef.minute >= targetMinute))) {
    delta = 7;
  }

  const candidate = addDays(localRef.year, localRef.month, localRef.day, delta);
  return localToUtcDate(timezone, candidate.year, candidate.month, candidate.day, targetHour, targetMinute, 0);
};

const sanitizeRecipients = (values: string[]): string[] => {
  const deduped = [...new Set(values.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0))];
  return deduped.slice(0, 50);
};

const toWindow = (now: Date): { windowStart: Date; windowEnd: Date } => {
  const windowEnd = now;
  const windowStart = new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { windowStart, windowEnd };
};

const parseTemplateRow = (row: SqlRow | undefined): ReportTemplateRecord | null => {
  const id = fieldString(row, 0);
  const name = fieldString(row, 1);
  const description = fieldString(row, 2);
  const isActive = fieldBoolean(row, 3);
  const sections = parseJsonObject(fieldString(row, 4));
  const filters = parseJsonObject(fieldString(row, 5));
  const confidenceThreshold = parseDecimal(fieldString(row, 6), 0.65);
  const createdByUserId = fieldString(row, 7);
  const createdAt = fieldDate(row, 8);
  const updatedAt = fieldDate(row, 9);

  if (!id || !name || isActive === null || !createdAt || !updatedAt) return null;

  return {
    id,
    name,
    description,
    isActive,
    sections,
    filters,
    confidenceThreshold,
    createdByUserId,
    createdAt,
    updatedAt
  };
};

const parseScheduleRow = (row: SqlRow | undefined): ReportScheduleRecord | null => {
  const id = fieldString(row, 0);
  const templateId = fieldString(row, 1);
  const templateName = fieldString(row, 2);
  const name = fieldString(row, 3);
  const enabled = fieldBoolean(row, 4);
  const frequency = normalizeFrequency(fieldString(row, 5));
  const dayOfWeek = fieldLong(row, 6);
  const timeLocal = fieldString(row, 7);
  const timezone = fieldString(row, 8);
  const recipients = parseStringArray(fieldString(row, 9));
  const nextRunAt = fieldDate(row, 10);
  const lastRunAt = fieldDate(row, 11);
  const createdByUserId = fieldString(row, 12);
  const createdAt = fieldDate(row, 13);
  const updatedAt = fieldDate(row, 14);

  if (!id || !templateId || !templateName || !name || enabled === null || !timeLocal || !timezone || !nextRunAt || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    templateId,
    templateName,
    name,
    enabled,
    frequency,
    dayOfWeek: dayOfWeek === null ? null : dayOfWeek,
    timeLocal,
    timezone,
    recipients,
    nextRunAt,
    lastRunAt,
    createdByUserId,
    createdAt,
    updatedAt
  };
};

const parseRunRow = (row: SqlRow | undefined): ReportRunRecord | null => {
  const id = fieldString(row, 0);
  const templateId = fieldString(row, 1);
  const templateName = fieldString(row, 2);
  const scheduleId = fieldString(row, 3);
  const scheduleName = fieldString(row, 4);
  const status = normalizeStatus(fieldString(row, 5));
  const windowStart = fieldDate(row, 6);
  const windowEnd = fieldDate(row, 7);
  const sourceType = normalizeSourceType(fieldString(row, 8));
  const confidenceRaw = fieldString(row, 9);
  const confidence = confidenceRaw === null ? null : parseDecimal(confidenceRaw, 0);
  const summary = parseJsonObject(fieldString(row, 10));
  const recommendations = parseStringArray(fieldString(row, 11));
  const blockedReason = fieldString(row, 12);
  const exportJobId = fieldString(row, 13);
  const exportStatusValue = fieldString(row, 14);
  const exportStatus =
    exportStatusValue === "queued" ||
    exportStatusValue === "running" ||
    exportStatusValue === "completed" ||
    exportStatusValue === "failed"
      ? exportStatusValue
      : null;
  const exportS3Key = fieldString(row, 15);
  const requestedByUserId = fieldString(row, 16);
  const requestedByName = fieldString(row, 17);
  const requestedByEmail = fieldString(row, 18);
  const createdAt = fieldDate(row, 19);
  const startedAt = fieldDate(row, 20);
  const completedAt = fieldDate(row, 21);
  const errorMessage = fieldString(row, 22);
  const idempotencyKey = fieldString(row, 23);

  if (!id || !templateId || !templateName || !windowStart || !windowEnd || !createdAt) return null;

  return {
    id,
    templateId,
    templateName,
    scheduleId,
    scheduleName,
    status,
    windowStart,
    windowEnd,
    sourceType,
    confidence,
    summary,
    recommendations,
    blockedReason,
    exportJobId,
    exportStatus,
    exportS3Key,
    requestedByUserId,
    requestedByName,
    requestedByEmail,
    createdAt,
    startedAt,
    completedAt,
    errorMessage,
    idempotencyKey
  };
};

const reportRunSelect = `
  rr."id"::text,
  rr."templateId"::text,
  rt."name",
  rr."scheduleId"::text,
  rs."name",
  rr."status"::text,
  rr."windowStart",
  rr."windowEnd",
  rr."sourceType"::text,
  rr."confidence"::text,
  rr."summary"::text,
  rr."recommendations"::text,
  rr."blockedReason",
  rr."exportJobId"::text,
  ej."status"::text,
  ej."s3Key",
  rr."requestedByUserId"::text,
  ru."name",
  ru."email",
  rr."createdAt",
  rr."startedAt",
  rr."completedAt",
  rr."errorMessage",
  rr."idempotencyKey"
`;

class ReportStore {
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

  async listReportCenter(limit: number, filters: ReportCenterFilters, cursor?: string): Promise<ReportCenterPage> {
    const safeLimit = Math.min(200, Math.max(1, limit));
    const cursorPayload = decodeCursor(cursor);

    if (cursor && !cursorPayload) {
      throw new AppStoreError("validation", "Invalid cursor");
    }

    const conditions: string[] = [];
    const params: SqlParameter[] = [sqlLong("limit_plus_one", safeLimit + 1)];

    if (filters.status) {
      conditions.push('rr."status" = CAST(:status AS "public"."ReportRunStatus")');
      params.push(sqlString("status", filters.status));
    }

    if (filters.templateId) {
      conditions.push('rr."templateId" = CAST(:template_id AS UUID)');
      params.push(sqlUuid("template_id", filters.templateId));
    }

    if (filters.from) {
      conditions.push('rr."createdAt" >= :from_date');
      params.push(sqlTimestamp("from_date", filters.from));
    }

    if (filters.to) {
      conditions.push('rr."createdAt" <= :to_date');
      params.push(sqlTimestamp("to_date", filters.to));
    }

    if (cursorPayload) {
      const cursorDate = new Date(cursorPayload.created_at);
      if (Number.isNaN(cursorDate.getTime())) {
        throw new AppStoreError("validation", "Invalid cursor");
      }

      conditions.push(
        '(rr."createdAt" < :cursor_created_at OR (rr."createdAt" = :cursor_created_at AND rr."id" < CAST(:cursor_id AS UUID)))'
      );
      params.push(sqlTimestamp("cursor_created_at", cursorDate), sqlUuid("cursor_id", cursorPayload.id));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const response = await this.rds.execute(
      `
        SELECT
          ${reportRunSelect}
        FROM "public"."ReportRun" rr
        INNER JOIN "public"."ReportTemplate" rt
          ON rt."id" = rr."templateId"
        LEFT JOIN "public"."ReportSchedule" rs
          ON rs."id" = rr."scheduleId"
        LEFT JOIN "public"."ExportJob" ej
          ON ej."id" = rr."exportJobId"
        LEFT JOIN "public"."User" ru
          ON ru."id" = rr."requestedByUserId"
        ${whereClause}
        ORDER BY rr."createdAt" DESC, rr."id" DESC
        LIMIT :limit_plus_one
      `,
      params
    );

    const rows = response.records ?? [];
    const hasNext = rows.length > safeLimit;
    const sliced = hasNext ? rows.slice(0, safeLimit) : rows;
    const items = sliced.map(parseRunRow).filter((item): item is ReportRunRecord => item !== null);

    const last = items[items.length - 1];
    const nextCursor = hasNext && last ? encodeCursor({ created_at: last.createdAt.toISOString(), id: last.id }) : null;

    return {
      items,
      nextCursor,
      hasNext
    };
  }

  async getReportRun(reportRunId: string): Promise<ReportRunDetail | null> {
    const runResponse = await this.rds.execute(
      `
        SELECT
          ${reportRunSelect}
        FROM "public"."ReportRun" rr
        INNER JOIN "public"."ReportTemplate" rt
          ON rt."id" = rr."templateId"
        LEFT JOIN "public"."ReportSchedule" rs
          ON rs."id" = rr."scheduleId"
        LEFT JOIN "public"."ExportJob" ej
          ON ej."id" = rr."exportJobId"
        LEFT JOIN "public"."User" ru
          ON ru."id" = rr."requestedByUserId"
        WHERE rr."id" = CAST(:report_run_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("report_run_id", reportRunId)]
    );

    const run = parseRunRow(runResponse.records?.[0]);
    if (!run) return null;

    const templateResponse = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "name",
          "description",
          "isActive",
          "sections"::text,
          "filters"::text,
          "confidenceThreshold"::text,
          "createdByUserId"::text,
          "createdAt",
          "updatedAt"
        FROM "public"."ReportTemplate"
        WHERE "id" = CAST(:template_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("template_id", run.templateId)]
    );

    const template = parseTemplateRow(templateResponse.records?.[0]);
    if (!template) {
      throw new Error("Report template not found for existing run");
    }

    let schedule: ReportScheduleRecord | null = null;
    if (run.scheduleId) {
      const scheduleResponse = await this.rds.execute(
        `
          SELECT
            rs."id"::text,
            rs."templateId"::text,
            rt."name",
            rs."name",
            rs."enabled",
            rs."frequency"::text,
            rs."dayOfWeek",
            rs."timeLocal",
            rs."timezone",
            rs."recipients"::text,
            rs."nextRunAt",
            rs."lastRunAt",
            rs."createdByUserId"::text,
            rs."createdAt",
            rs."updatedAt"
          FROM "public"."ReportSchedule" rs
          INNER JOIN "public"."ReportTemplate" rt ON rt."id" = rs."templateId"
          WHERE rs."id" = CAST(:schedule_id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("schedule_id", run.scheduleId)]
      );

      schedule = parseScheduleRow(scheduleResponse.records?.[0]);
    }

    return {
      run,
      template,
      schedule
    };
  }

  async listTemplates(limit: number): Promise<ReportTemplateRecord[]> {
    const safeLimit = Math.min(200, Math.max(1, limit));
    const response = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "name",
          "description",
          "isActive",
          "sections"::text,
          "filters"::text,
          "confidenceThreshold"::text,
          "createdByUserId"::text,
          "createdAt",
          "updatedAt"
        FROM "public"."ReportTemplate"
        ORDER BY "createdAt" DESC, "id" DESC
        LIMIT :limit
      `,
      [sqlLong("limit", safeLimit)]
    );

    return (response.records ?? []).map(parseTemplateRow).filter((item): item is ReportTemplateRecord => item !== null);
  }

  async createTemplate(input: ReportTemplateCreateInput, actorUserId: string, requestId?: string): Promise<ReportTemplateRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const response = await this.rds.execute(
        `
          INSERT INTO "public"."ReportTemplate"
            ("id", "name", "description", "isActive", "sections", "filters", "confidenceThreshold", "createdByUserId", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), :name, :description, :is_active, CAST(:sections AS JSONB), CAST(:filters AS JSONB), CAST(:confidence_threshold AS DECIMAL(4,3)), CAST(:created_by_user_id AS UUID), NOW(), NOW())
          RETURNING
            "id"::text,
            "name",
            "description",
            "isActive",
            "sections"::text,
            "filters"::text,
            "confidenceThreshold"::text,
            "createdByUserId"::text,
            "createdAt",
            "updatedAt"
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("name", input.name),
          sqlString("description", input.description ?? null),
          sqlBoolean("is_active", input.isActive ?? true),
          sqlJson("sections", input.sections ?? {}),
          sqlJson("filters", input.filters ?? {}),
          sqlString("confidence_threshold", (input.confidenceThreshold ?? 0.65).toFixed(3)),
          sqlUuid("created_by_user_id", actorUserId)
        ],
        { transactionId: tx }
      );

      const template = parseTemplateRow(response.records?.[0]);
      if (!template) throw new Error("Failed to parse created report template");

      await this.appendAudit(
        {
          actorUserId,
          action: "report_template_created",
          resourceType: "ReportTemplate",
          resourceId: template.id,
          requestId,
          after: {
            name: template.name,
            confidence_threshold: template.confidenceThreshold,
            is_active: template.isActive
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return template;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new AppStoreError("conflict", "Report template name already exists");
      }
      throw error;
    }
  }

  async updateTemplate(
    templateId: string,
    input: ReportTemplateUpdateInput,
    actorUserId: string,
    requestId?: string
  ): Promise<ReportTemplateRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const beforeResponse = await this.rds.execute(
        `
          SELECT
            "id"::text,
            "name",
            "description",
            "isActive",
            "sections"::text,
            "filters"::text,
            "confidenceThreshold"::text,
            "createdByUserId"::text,
            "createdAt",
            "updatedAt"
          FROM "public"."ReportTemplate"
          WHERE "id" = CAST(:template_id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("template_id", templateId)],
        { transactionId: tx }
      );

      const before = parseTemplateRow(beforeResponse.records?.[0]);
      if (!before) {
        throw new AppStoreError("not_found", "Report template not found");
      }

      const setParts: string[] = ['"updatedAt" = NOW()'];
      const params: SqlParameter[] = [sqlUuid("template_id", templateId)];

      if (input.name !== undefined) {
        setParts.push('"name" = :name');
        params.push(sqlString("name", input.name));
      }
      if (input.description !== undefined) {
        setParts.push('"description" = :description');
        params.push(sqlString("description", input.description));
      }
      if (input.isActive !== undefined) {
        setParts.push('"isActive" = :is_active');
        params.push(sqlBoolean("is_active", input.isActive));
      }
      if (input.sections !== undefined) {
        setParts.push('"sections" = CAST(:sections AS JSONB)');
        params.push(sqlJson("sections", input.sections));
      }
      if (input.filters !== undefined) {
        setParts.push('"filters" = CAST(:filters AS JSONB)');
        params.push(sqlJson("filters", input.filters));
      }
      if (input.confidenceThreshold !== undefined) {
        setParts.push('"confidenceThreshold" = CAST(:confidence_threshold AS DECIMAL(4,3))');
        params.push(sqlString("confidence_threshold", input.confidenceThreshold.toFixed(3)));
      }

      if (setParts.length === 1) {
        throw new AppStoreError("conflict", "No changes requested for report template");
      }

      const updateResponse = await this.rds.execute(
        `
          UPDATE "public"."ReportTemplate"
          SET ${setParts.join(", ")}
          WHERE "id" = CAST(:template_id AS UUID)
          RETURNING
            "id"::text,
            "name",
            "description",
            "isActive",
            "sections"::text,
            "filters"::text,
            "confidenceThreshold"::text,
            "createdByUserId"::text,
            "createdAt",
            "updatedAt"
        `,
        params,
        { transactionId: tx }
      );

      const after = parseTemplateRow(updateResponse.records?.[0]);
      if (!after) throw new Error("Failed to parse updated report template");

      await this.appendAudit(
        {
          actorUserId,
          action: "report_template_updated",
          resourceType: "ReportTemplate",
          resourceId: after.id,
          requestId,
          before,
          after
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return after;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new AppStoreError("conflict", "Report template name already exists");
      }
      throw error;
    }
  }

  async listSchedules(limit: number): Promise<ReportScheduleRecord[]> {
    const safeLimit = Math.min(300, Math.max(1, limit));
    const response = await this.rds.execute(
      `
        SELECT
          rs."id"::text,
          rs."templateId"::text,
          rt."name",
          rs."name",
          rs."enabled",
          rs."frequency"::text,
          rs."dayOfWeek",
          rs."timeLocal",
          rs."timezone",
          rs."recipients"::text,
          rs."nextRunAt",
          rs."lastRunAt",
          rs."createdByUserId"::text,
          rs."createdAt",
          rs."updatedAt"
        FROM "public"."ReportSchedule" rs
        INNER JOIN "public"."ReportTemplate" rt
          ON rt."id" = rs."templateId"
        ORDER BY rs."nextRunAt" ASC, rs."createdAt" DESC
        LIMIT :limit
      `,
      [sqlLong("limit", safeLimit)]
    );

    return (response.records ?? []).map(parseScheduleRow).filter((item): item is ReportScheduleRecord => item !== null);
  }

  async getSchedule(scheduleId: string): Promise<ReportScheduleRecord | null> {
    const response = await this.rds.execute(
      `
        SELECT
          rs."id"::text,
          rs."templateId"::text,
          rt."name",
          rs."name",
          rs."enabled",
          rs."frequency"::text,
          rs."dayOfWeek",
          rs."timeLocal",
          rs."timezone",
          rs."recipients"::text,
          rs."nextRunAt",
          rs."lastRunAt",
          rs."createdByUserId"::text,
          rs."createdAt",
          rs."updatedAt"
        FROM "public"."ReportSchedule" rs
        INNER JOIN "public"."ReportTemplate" rt
          ON rt."id" = rs."templateId"
        WHERE rs."id" = CAST(:schedule_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("schedule_id", scheduleId)]
    );

    return parseScheduleRow(response.records?.[0]);
  }

  async createSchedule(input: ReportScheduleCreateInput, actorUserId: string, requestId?: string): Promise<ReportScheduleRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const templateExists = await this.rds.execute(
        `
          SELECT "id"::text
          FROM "public"."ReportTemplate"
          WHERE "id" = CAST(:template_id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("template_id", input.templateId)],
        { transactionId: tx }
      );

      if (!fieldString(templateExists.records?.[0], 0)) {
        throw new AppStoreError("not_found", "Report template not found");
      }

      const timezone = input.timezone ?? "America/Bogota";
      const recipients = sanitizeRecipients(input.recipients ?? []);
      const dayOfWeek = input.frequency === "weekly" ? (input.dayOfWeek ?? null) : null;
      const nextRunAt = computeNextRunAt(
        {
          frequency: input.frequency,
          dayOfWeek,
          timeLocal: input.timeLocal,
          timezone
        },
        new Date()
      );

      const response = await this.rds.execute(
        `
          INSERT INTO "public"."ReportSchedule"
            ("id", "templateId", "name", "enabled", "frequency", "dayOfWeek", "timeLocal", "timezone", "recipients", "nextRunAt", "lastRunAt", "createdByUserId", "createdAt", "updatedAt")
          VALUES
            (
              CAST(:id AS UUID),
              CAST(:template_id AS UUID),
              :name,
              :enabled,
              CAST(:frequency AS "public"."ReportScheduleFrequency"),
              :day_of_week,
              :time_local,
              :timezone,
              CAST(:recipients AS JSONB),
              :next_run_at,
              NULL,
              CAST(:created_by_user_id AS UUID),
              NOW(),
              NOW()
            )
          RETURNING
            "id"::text,
            "templateId"::text,
            (SELECT "name" FROM "public"."ReportTemplate" WHERE "id" = CAST(:template_id AS UUID)),
            "name",
            "enabled",
            "frequency"::text,
            "dayOfWeek",
            "timeLocal",
            "timezone",
            "recipients"::text,
            "nextRunAt",
            "lastRunAt",
            "createdByUserId"::text,
            "createdAt",
            "updatedAt"
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("template_id", input.templateId),
          sqlString("name", input.name),
          sqlBoolean("enabled", input.enabled ?? true),
          sqlString("frequency", input.frequency),
          dayOfWeek === null ? sqlString("day_of_week", null) : sqlLong("day_of_week", dayOfWeek),
          sqlString("time_local", input.timeLocal),
          sqlString("timezone", timezone),
          sqlJson("recipients", recipients),
          sqlTimestamp("next_run_at", nextRunAt),
          sqlUuid("created_by_user_id", actorUserId)
        ],
        { transactionId: tx }
      );

      const schedule = parseScheduleRow(response.records?.[0]);
      if (!schedule) throw new Error("Failed to parse created report schedule");

      await this.appendAudit(
        {
          actorUserId,
          action: "report_schedule_created",
          resourceType: "ReportSchedule",
          resourceId: schedule.id,
          requestId,
          after: {
            template_id: schedule.templateId,
            frequency: schedule.frequency,
            day_of_week: schedule.dayOfWeek,
            time_local: schedule.timeLocal,
            timezone: schedule.timezone,
            recipients: schedule.recipients,
            next_run_at: schedule.nextRunAt.toISOString()
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return schedule;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }

  async updateSchedule(
    scheduleId: string,
    input: ReportScheduleUpdateInput,
    actorUserId: string,
    requestId?: string
  ): Promise<ReportScheduleRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const beforeResponse = await this.rds.execute(
        `
          SELECT
            rs."id"::text,
            rs."templateId"::text,
            rt."name",
            rs."name",
            rs."enabled",
            rs."frequency"::text,
            rs."dayOfWeek",
            rs."timeLocal",
            rs."timezone",
            rs."recipients"::text,
            rs."nextRunAt",
            rs."lastRunAt",
            rs."createdByUserId"::text,
            rs."createdAt",
            rs."updatedAt"
          FROM "public"."ReportSchedule" rs
          INNER JOIN "public"."ReportTemplate" rt ON rt."id" = rs."templateId"
          WHERE rs."id" = CAST(:schedule_id AS UUID)
          LIMIT 1
          FOR UPDATE
        `,
        [sqlUuid("schedule_id", scheduleId)],
        { transactionId: tx }
      );

      const before = parseScheduleRow(beforeResponse.records?.[0]);
      if (!before) {
        throw new AppStoreError("not_found", "Report schedule not found");
      }

      const setParts: string[] = ['"updatedAt" = NOW()'];
      const params: SqlParameter[] = [sqlUuid("schedule_id", scheduleId)];

      if (input.name !== undefined) {
        setParts.push('"name" = :name');
        params.push(sqlString("name", input.name));
      }

      if (input.enabled !== undefined) {
        setParts.push('"enabled" = :enabled');
        params.push(sqlBoolean("enabled", input.enabled));
      }

      if (input.frequency !== undefined) {
        setParts.push('"frequency" = CAST(:frequency AS "public"."ReportScheduleFrequency")');
        params.push(sqlString("frequency", input.frequency));
      }

      if (input.dayOfWeek !== undefined) {
        if (input.dayOfWeek === null) {
          setParts.push('"dayOfWeek" = NULL');
        } else {
          setParts.push('"dayOfWeek" = :day_of_week');
          params.push(sqlLong("day_of_week", input.dayOfWeek));
        }
      }

      if (input.timeLocal !== undefined) {
        setParts.push('"timeLocal" = :time_local');
        params.push(sqlString("time_local", input.timeLocal));
      }

      if (input.timezone !== undefined) {
        setParts.push('"timezone" = :timezone');
        params.push(sqlString("timezone", input.timezone));
      }

      if (input.recipients !== undefined) {
        setParts.push('"recipients" = CAST(:recipients AS JSONB)');
        params.push(sqlJson("recipients", sanitizeRecipients(input.recipients)));
      }

      const effectiveFrequency = input.frequency ?? before.frequency;
      const effectiveDayOfWeek = input.dayOfWeek !== undefined ? input.dayOfWeek : before.dayOfWeek;
      const effectiveTimeLocal = input.timeLocal ?? before.timeLocal;
      const effectiveTimezone = input.timezone ?? before.timezone;
      const shouldRecomputeNextRun =
        input.frequency !== undefined || input.dayOfWeek !== undefined || input.timeLocal !== undefined || input.timezone !== undefined;

      if (shouldRecomputeNextRun || (input.enabled !== undefined && input.enabled === true && before.enabled === false)) {
        const nextRunAt = computeNextRunAt(
          {
            frequency: effectiveFrequency,
            dayOfWeek: effectiveFrequency === "weekly" ? effectiveDayOfWeek : null,
            timeLocal: effectiveTimeLocal,
            timezone: effectiveTimezone
          },
          new Date()
        );
        setParts.push('"nextRunAt" = :next_run_at');
        params.push(sqlTimestamp("next_run_at", nextRunAt));
      }

      if (setParts.length === 1) {
        throw new AppStoreError("conflict", "No changes requested for report schedule");
      }

      const updateResponse = await this.rds.execute(
        `
          UPDATE "public"."ReportSchedule"
          SET ${setParts.join(", ")}
          WHERE "id" = CAST(:schedule_id AS UUID)
          RETURNING
            "id"::text,
            "templateId"::text,
            (SELECT "name" FROM "public"."ReportTemplate" WHERE "id" = "ReportSchedule"."templateId"),
            "name",
            "enabled",
            "frequency"::text,
            "dayOfWeek",
            "timeLocal",
            "timezone",
            "recipients"::text,
            "nextRunAt",
            "lastRunAt",
            "createdByUserId"::text,
            "createdAt",
            "updatedAt"
        `,
        params,
        { transactionId: tx }
      );

      const after = parseScheduleRow(updateResponse.records?.[0]);
      if (!after) {
        throw new Error("Failed to parse updated report schedule");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "report_schedule_updated",
          resourceType: "ReportSchedule",
          resourceId: after.id,
          requestId,
          before,
          after
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

  async createReportRun(input: ReportRunCreateInput, requestId?: string): Promise<ReportRunRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const templateResponse = await this.rds.execute(
        `
          SELECT "id"::text, "name"
          FROM "public"."ReportTemplate"
          WHERE "id" = CAST(:template_id AS UUID)
            AND "isActive" = TRUE
          LIMIT 1
        `,
        [sqlUuid("template_id", input.templateId)],
        { transactionId: tx }
      );

      const templateId = fieldString(templateResponse.records?.[0], 0);
      if (!templateId) {
        throw new AppStoreError("not_found", "Active report template not found");
      }

      let scheduleId: string | null = input.scheduleId ?? null;
      if (scheduleId) {
        const scheduleResponse = await this.rds.execute(
          `
            SELECT "id"::text
            FROM "public"."ReportSchedule"
            WHERE "id" = CAST(:schedule_id AS UUID)
              AND "templateId" = CAST(:template_id AS UUID)
            LIMIT 1
          `,
          [sqlUuid("schedule_id", scheduleId), sqlUuid("template_id", templateId)],
          { transactionId: tx }
        );

        if (!fieldString(scheduleResponse.records?.[0], 0)) {
          throw new AppStoreError("not_found", "Report schedule not found for template");
        }
      }

      const now = input.now ?? new Date();
      const { windowStart, windowEnd } = toWindow(now);
      const idempotencyKey = input.idempotencyKey ?? null;

      const response = await this.rds.execute(
        `
          INSERT INTO "public"."ReportRun"
            ("id", "templateId", "scheduleId", "status", "windowStart", "windowEnd", "sourceType", "confidence", "summary", "recommendations", "blockedReason", "exportJobId", "idempotencyKey", "requestedByUserId", "createdAt", "startedAt", "completedAt", "errorMessage")
          VALUES
            (
              CAST(:id AS UUID),
              CAST(:template_id AS UUID),
              CAST(:schedule_id AS UUID),
              CAST('queued' AS "public"."ReportRunStatus"),
              :window_start,
              :window_end,
              CAST(:source_type AS "public"."SourceType"),
              NULL,
              CAST(:summary AS JSONB),
              CAST(:recommendations AS JSONB),
              NULL,
              NULL,
              :idempotency_key,
              CAST(:requested_by_user_id AS UUID),
              NOW(),
              NULL,
              NULL,
              NULL
            )
          RETURNING "id"::text
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("template_id", templateId),
          sqlUuid("schedule_id", scheduleId),
          sqlTimestamp("window_start", windowStart),
          sqlTimestamp("window_end", windowEnd),
          sqlString("source_type", input.sourceType ?? "news"),
          sqlJson("summary", {}),
          sqlJson("recommendations", []),
          sqlString("idempotency_key", idempotencyKey),
          sqlUuid("requested_by_user_id", input.requestedByUserId ?? null)
        ],
        { transactionId: tx }
      );

      const runId = fieldString(response.records?.[0], 0);
      if (!runId) throw new Error("Failed to create report run");

      await this.appendAudit(
        {
          actorUserId: input.requestedByUserId ?? null,
          action: "report_run_created",
          resourceType: "ReportRun",
          resourceId: runId,
          requestId,
          after: {
            template_id: templateId,
            schedule_id: scheduleId,
            source_type: input.sourceType ?? "news",
            window_start: windowStart.toISOString(),
            window_end: windowEnd.toISOString(),
            idempotency_key: idempotencyKey
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);

      const run = await this.getRunById(runId);
      if (!run) throw new Error("Run created but could not be loaded");
      return run;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new AppStoreError("conflict", "Report run idempotency key already exists");
      }
      throw error;
    }
  }

  private async getRunById(reportRunId: string): Promise<ReportRunRecord | null> {
    const response = await this.rds.execute(
      `
        SELECT
          ${reportRunSelect}
        FROM "public"."ReportRun" rr
        INNER JOIN "public"."ReportTemplate" rt
          ON rt."id" = rr."templateId"
        LEFT JOIN "public"."ReportSchedule" rs
          ON rs."id" = rr."scheduleId"
        LEFT JOIN "public"."ExportJob" ej
          ON ej."id" = rr."exportJobId"
        LEFT JOIN "public"."User" ru
          ON ru."id" = rr."requestedByUserId"
        WHERE rr."id" = CAST(:report_run_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("report_run_id", reportRunId)]
    );

    return parseRunRow(response.records?.[0]);
  }

  async claimReportRun(reportRunId: string): Promise<ReportRunRecord | null> {
    const response = await this.rds.execute(
      `
        UPDATE "public"."ReportRun"
        SET
          "status" = CAST('running' AS "public"."ReportRunStatus"),
          "startedAt" = NOW(),
          "errorMessage" = NULL
        WHERE
          "id" = CAST(:report_run_id AS UUID)
          AND "status" = CAST('queued' AS "public"."ReportRunStatus")
        RETURNING "id"::text
      `,
      [sqlUuid("report_run_id", reportRunId)]
    );

    const runId = fieldString(response.records?.[0], 0);
    if (!runId) return null;

    return this.getRunById(runId);
  }

  async completeReportRun(input: ReportRunCompleteInput): Promise<void> {
    await this.rds.execute(
      `
        UPDATE "public"."ReportRun"
        SET
          "status" = CAST(:status AS "public"."ReportRunStatus"),
          "confidence" = CAST(:confidence AS DECIMAL(4,3)),
          "summary" = CAST(:summary AS JSONB),
          "recommendations" = CAST(:recommendations AS JSONB),
          "blockedReason" = :blocked_reason,
          "exportJobId" = CAST(:export_job_id AS UUID),
          "completedAt" = NOW(),
          "errorMessage" = NULL
        WHERE "id" = CAST(:report_run_id AS UUID)
      `,
      [
        sqlString("status", input.status),
        sqlString("confidence", input.confidence.toFixed(3)),
        sqlJson("summary", input.summary),
        sqlJson("recommendations", input.recommendations),
        sqlString("blocked_reason", input.blockedReason ?? null),
        sqlUuid("export_job_id", input.exportJobId ?? null),
        sqlUuid("report_run_id", input.reportRunId)
      ]
    );
  }

  async failReportRun(reportRunId: string, message: string): Promise<void> {
    await this.rds.execute(
      `
        UPDATE "public"."ReportRun"
        SET
          "status" = CAST('failed' AS "public"."ReportRunStatus"),
          "errorMessage" = :error_message,
          "completedAt" = NOW()
        WHERE "id" = CAST(:report_run_id AS UUID)
      `,
      [sqlString("error_message", message.slice(0, 1000)), sqlUuid("report_run_id", reportRunId)]
    );
  }

  async listDueScheduleCandidates(now: Date, limit: number): Promise<DueScheduleCandidate[]> {
    const safeLimit = Math.min(200, Math.max(1, limit));

    const response = await this.rds.execute(
      `
        SELECT "id"::text
        FROM "public"."ReportSchedule"
        WHERE "enabled" = TRUE
          AND "nextRunAt" <= :now_date
        ORDER BY "nextRunAt" ASC, "id" ASC
        LIMIT :limit
      `,
      [sqlTimestamp("now_date", now), sqlLong("limit", safeLimit)]
    );

    return (response.records ?? [])
      .map((row) => fieldString(row, 0))
      .filter((value): value is string => Boolean(value))
      .map((scheduleId) => ({ scheduleId }));
  }

  async enqueueDueScheduleRun(scheduleId: string, now: Date): Promise<ScheduleEnqueueResult | null> {
    const tx = await this.rds.beginTransaction();

    try {
      const scheduleResponse = await this.rds.execute(
        `
          SELECT
            rs."id"::text,
            rs."templateId"::text,
            rt."name",
            rs."name",
            rs."enabled",
            rs."frequency"::text,
            rs."dayOfWeek",
            rs."timeLocal",
            rs."timezone",
            rs."recipients"::text,
            rs."nextRunAt",
            rs."lastRunAt",
            rs."createdByUserId"::text,
            rs."createdAt",
            rs."updatedAt"
          FROM "public"."ReportSchedule" rs
          INNER JOIN "public"."ReportTemplate" rt ON rt."id" = rs."templateId"
          WHERE rs."id" = CAST(:schedule_id AS UUID)
          LIMIT 1
          FOR UPDATE
        `,
        [sqlUuid("schedule_id", scheduleId)],
        { transactionId: tx }
      );

      const schedule = parseScheduleRow(scheduleResponse.records?.[0]);
      if (!schedule) {
        await this.rds.rollbackTransaction(tx);
        return null;
      }

      if (!schedule.enabled || schedule.nextRunAt.getTime() > now.getTime()) {
        await this.rds.rollbackTransaction(tx);
        return null;
      }

      const slotTime = schedule.nextRunAt;
      const slotKey = `schedule:${schedule.id}:${slotTime.toISOString()}`;

      const existingResponse = await this.rds.execute(
        `
          SELECT "id"::text
          FROM "public"."ReportRun"
          WHERE "idempotencyKey" = :idempotency_key
          LIMIT 1
        `,
        [sqlString("idempotency_key", slotKey)],
        { transactionId: tx }
      );

      let runId = fieldString(existingResponse.records?.[0], 0);
      let created = false;

      if (!runId) {
        const window = toWindow(slotTime);
        const createResponse = await this.rds.execute(
          `
            INSERT INTO "public"."ReportRun"
              ("id", "templateId", "scheduleId", "status", "windowStart", "windowEnd", "sourceType", "confidence", "summary", "recommendations", "blockedReason", "exportJobId", "idempotencyKey", "requestedByUserId", "createdAt", "startedAt", "completedAt", "errorMessage")
            VALUES
              (
                CAST(:id AS UUID),
                CAST(:template_id AS UUID),
                CAST(:schedule_id AS UUID),
                CAST('queued' AS "public"."ReportRunStatus"),
                :window_start,
                :window_end,
                CAST('news' AS "public"."SourceType"),
                NULL,
                CAST(:summary AS JSONB),
                CAST(:recommendations AS JSONB),
                NULL,
                NULL,
                :idempotency_key,
                NULL,
                NOW(),
                NULL,
                NULL,
                NULL
              )
            RETURNING "id"::text
          `,
          [
            sqlUuid("id", randomUUID()),
            sqlUuid("template_id", schedule.templateId),
            sqlUuid("schedule_id", schedule.id),
            sqlTimestamp("window_start", window.windowStart),
            sqlTimestamp("window_end", window.windowEnd),
            sqlJson("summary", {}),
            sqlJson("recommendations", []),
            sqlString("idempotency_key", slotKey)
          ],
          { transactionId: tx }
        );

        runId = fieldString(createResponse.records?.[0], 0);
        if (!runId) {
          throw new Error("Failed to create schedule report run");
        }
        created = true;
      }

      const nextRunAt = computeNextRunAt(
        {
          frequency: schedule.frequency,
          dayOfWeek: schedule.frequency === "weekly" ? schedule.dayOfWeek : null,
          timeLocal: schedule.timeLocal,
          timezone: schedule.timezone
        },
        new Date(slotTime.getTime() + 60_000)
      );

      await this.rds.execute(
        `
          UPDATE "public"."ReportSchedule"
          SET
            "lastRunAt" = :last_run_at,
            "nextRunAt" = :next_run_at,
            "updatedAt" = NOW()
          WHERE "id" = CAST(:schedule_id AS UUID)
        `,
        [
          sqlTimestamp("last_run_at", slotTime),
          sqlTimestamp("next_run_at", nextRunAt),
          sqlUuid("schedule_id", schedule.id)
        ],
        { transactionId: tx }
      );

      await this.appendAudit(
        {
          actorUserId: null,
          action: "report_schedule_run_enqueued",
          resourceType: "ReportSchedule",
          resourceId: schedule.id,
          after: {
            run_id: runId,
            slot_time: slotTime.toISOString(),
            next_run_at: nextRunAt.toISOString(),
            idempotency_key: slotKey,
            created
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);

      const run = await this.getRunById(runId);
      if (!run) throw new Error("Enqueued run not found");

      return {
        run,
        created
      };
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }
}

export const createReportStore = (): ReportStore | null => {
  const client = RdsDataClient.fromEnv();
  if (!client) return null;
  return new ReportStore(client);
};

export type { ReportStore };
