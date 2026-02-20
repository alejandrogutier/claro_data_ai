import { randomUUID } from "crypto";
import { AppStoreError } from "./appStore";
import type { UserRole } from "../core/auth";
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_CONNECTOR_PROVIDERS = ["newsapi", "gnews", "mediastack", "hootsuite", "awario", "tiktok"] as const;
const TAXONOMY_KINDS = ["categories", "business_lines", "macro_regions", "campaigns", "strategies"] as const;
const NOTIFICATION_RECIPIENT_KINDS = ["digest", "incident"] as const;

export type ConnectorRunStatus = "queued" | "running" | "completed" | "failed";
export type ConnectorHealth = "unknown" | "healthy" | "degraded" | "offline";
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];
export type NotificationRecipientKind = (typeof NOTIFICATION_RECIPIENT_KINDS)[number];

type AuditCursorPayload = {
  created_at: string;
  id: string;
};

export type ConnectorRecord = {
  id: string;
  provider: string;
  enabled: boolean;
  frequencyMinutes: number;
  healthStatus: ConnectorHealth;
  lastSyncAt: Date | null;
  lastError: string | null;
  latencyP95Ms: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type ConnectorSyncRunRecord = {
  id: string;
  connectorId: string;
  status: ConnectorRunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  metrics: Record<string, unknown>;
  errorMessage: string | null;
  triggeredByUserId: string | null;
  createdAt: Date;
};

export type ConnectorPatchInput = {
  enabled?: boolean;
  frequencyMinutes?: number;
};

export type SourceWeightRecord = {
  id: string;
  provider: string;
  sourceName: string | null;
  weight: number;
  isActive: boolean;
  updatedByUserId: string | null;
  updatedByName: string | null;
  updatedByEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SourceWeightCreateInput = {
  provider: string;
  sourceName?: string | null;
  weight: number;
  isActive?: boolean;
};

export type SourceWeightUpdateInput = {
  sourceName?: string | null;
  weight?: number;
  isActive?: boolean;
};

export type SourceWeightListFilters = {
  provider?: string;
  includeInactive?: boolean;
};

export type NotificationRecipientRecord = {
  id: string;
  kind: NotificationRecipientKind;
  scope: string;
  email: string | null;
  emailMasked: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type NotificationRecipientCreateInput = {
  kind: NotificationRecipientKind;
  scope?: string;
  email: string;
  isActive?: boolean;
};

export type NotificationRecipientUpdateInput = {
  scope?: string;
  email?: string;
  isActive?: boolean;
};

export type NotificationRecipientListFilters = {
  kind: NotificationRecipientKind;
  scope?: string;
  includeInactive?: boolean;
};

export type OwnedAccountRecord = {
  id: string;
  platform: string;
  handle: string;
  accountName: string;
  businessLine: string | null;
  macroRegion: string | null;
  language: string;
  teamOwner: string | null;
  status: string;
  campaignTags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type OwnedAccountCreateInput = {
  platform: string;
  handle: string;
  accountName: string;
  businessLine?: string;
  macroRegion?: string;
  language?: string;
  teamOwner?: string;
  status?: string;
  campaignTags?: string[];
  metadata?: Record<string, unknown>;
};

export type OwnedAccountUpdateInput = {
  platform?: string;
  handle?: string;
  accountName?: string;
  businessLine?: string | null;
  macroRegion?: string | null;
  language?: string;
  teamOwner?: string | null;
  status?: string;
  campaignTags?: string[];
  metadata?: Record<string, unknown>;
};

export type CompetitorRecord = {
  id: string;
  brandName: string;
  aliases: string[];
  priority: number;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CompetitorCreateInput = {
  brandName: string;
  aliases?: string[];
  priority?: number;
  status?: string;
  metadata?: Record<string, unknown>;
};

export type CompetitorUpdateInput = {
  brandName?: string;
  aliases?: string[];
  priority?: number;
  status?: string;
  metadata?: Record<string, unknown>;
};

export type TaxonomyEntryRecord = {
  id: string;
  kind: TaxonomyKind;
  key: string;
  label: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type TaxonomyEntryCreateInput = {
  key: string;
  label: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};

export type TaxonomyEntryUpdateInput = {
  key?: string;
  label?: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};

export type AuditRecord = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  requestId: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
};

export type AuditFilters = {
  resourceType?: string;
  action?: string;
  actorUserId?: string;
  from?: Date;
  to?: Date;
};

export type AuditPage = {
  items: AuditRecord[];
  nextCursor: string | null;
  hasNext: boolean;
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

const parseStringArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
};

const parseDecimal = (value: string | null, fallback = 0): number => {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeHealth = (value: string | null): ConnectorHealth => {
  if (value === "healthy" || value === "degraded" || value === "offline") return value;
  return "unknown";
};

const normalizeRunStatus = (value: string | null): ConnectorRunStatus => {
  if (value === "queued" || value === "running" || value === "completed" || value === "failed") return value;
  return "queued";
};

const parseConnectorRow = (row: SqlRow | undefined): ConnectorRecord | null => {
  const id = fieldString(row, 0);
  const provider = fieldString(row, 1);
  const enabled = fieldBoolean(row, 2);
  const frequencyMinutes = fieldLong(row, 3);
  const healthStatus = normalizeHealth(fieldString(row, 4));
  const lastSyncAt = fieldDate(row, 5);
  const lastError = fieldString(row, 6);
  const latencyP95Ms = fieldLong(row, 7);
  const metadata = parseJsonObject(fieldString(row, 8));
  const createdAt = fieldDate(row, 9);
  const updatedAt = fieldDate(row, 10);

  if (!id || !provider || enabled === null || frequencyMinutes === null || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    provider,
    enabled,
    frequencyMinutes,
    healthStatus,
    lastSyncAt,
    lastError,
    latencyP95Ms,
    metadata,
    createdAt,
    updatedAt
  };
};

const parseConnectorRunRow = (row: SqlRow | undefined): ConnectorSyncRunRecord | null => {
  const id = fieldString(row, 0);
  const connectorId = fieldString(row, 1);
  const status = normalizeRunStatus(fieldString(row, 2));
  const startedAt = fieldDate(row, 3);
  const finishedAt = fieldDate(row, 4);
  const metrics = parseJsonObject(fieldString(row, 5));
  const errorMessage = fieldString(row, 6);
  const triggeredByUserId = fieldString(row, 7);
  const createdAt = fieldDate(row, 8);

  if (!id || !connectorId || !createdAt) return null;

  return {
    id,
    connectorId,
    status,
    startedAt,
    finishedAt,
    metrics,
    errorMessage,
    triggeredByUserId,
    createdAt
  };
};

const parseSourceWeightRow = (row: SqlRow | undefined): SourceWeightRecord | null => {
  const id = fieldString(row, 0);
  const provider = fieldString(row, 1);
  const sourceName = fieldString(row, 2);
  const weight = parseDecimal(fieldString(row, 3), Number.NaN);
  const isActive = fieldBoolean(row, 4);
  const updatedByUserId = fieldString(row, 5);
  const updatedByName = fieldString(row, 6);
  const updatedByEmail = fieldString(row, 7);
  const createdAt = fieldDate(row, 8);
  const updatedAt = fieldDate(row, 9);

  if (!id || !provider || !Number.isFinite(weight) || isActive === null || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    provider,
    sourceName,
    weight,
    isActive,
    updatedByUserId,
    updatedByName,
    updatedByEmail,
    createdAt,
    updatedAt
  };
};

const normalizeProvider = (value: string): string => value.trim().toLowerCase();

const normalizeSourceName = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const toNotificationRecipientKind = (value: string | null): NotificationRecipientKind | null => {
  if (!value) return null;
  if (NOTIFICATION_RECIPIENT_KINDS.includes(value as NotificationRecipientKind)) return value as NotificationRecipientKind;
  return null;
};

const maskEmail = (email: string): string => {
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "***";

  const [local, domain] = parts;
  const start = local.slice(0, 1);
  const end = local.length > 1 ? local.slice(-1) : "";
  return `${start}***${end}@${domain}`;
};

const normalizeNotificationScope = (value: string): string | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return normalized.slice(0, 64);
};

const normalizeNotificationEmail = (value: string): string | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 320) return null;
  if (!EMAIL_REGEX.test(normalized)) return null;
  return normalized;
};

const parseNotificationRecipientRow = (row: SqlRow | undefined): NotificationRecipientRecord | null => {
  const id = fieldString(row, 0);
  const kind = toNotificationRecipientKind(fieldString(row, 1));
  const scope = fieldString(row, 2);
  const email = fieldString(row, 3);
  const isActive = fieldBoolean(row, 4);
  const createdAt = fieldDate(row, 5);
  const updatedAt = fieldDate(row, 6);

  if (!id || !kind || !scope || !email || isActive === null || !createdAt || !updatedAt) return null;

  return {
    id,
    kind,
    scope,
    email,
    emailMasked: maskEmail(email),
    isActive,
    createdAt,
    updatedAt
  };
};

const parseOwnedAccountRow = (row: SqlRow | undefined): OwnedAccountRecord | null => {
  const id = fieldString(row, 0);
  const platform = fieldString(row, 1);
  const handle = fieldString(row, 2);
  const accountName = fieldString(row, 3);
  const businessLine = fieldString(row, 4);
  const macroRegion = fieldString(row, 5);
  const language = fieldString(row, 6);
  const teamOwner = fieldString(row, 7);
  const status = fieldString(row, 8);
  const campaignTags = parseStringArray(fieldString(row, 9));
  const metadata = parseJsonObject(fieldString(row, 10));
  const createdAt = fieldDate(row, 11);
  const updatedAt = fieldDate(row, 12);

  if (!id || !platform || !handle || !accountName || !language || !status || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    platform,
    handle,
    accountName,
    businessLine,
    macroRegion,
    language,
    teamOwner,
    status,
    campaignTags,
    metadata,
    createdAt,
    updatedAt
  };
};

const parseCompetitorRow = (row: SqlRow | undefined): CompetitorRecord | null => {
  const id = fieldString(row, 0);
  const brandName = fieldString(row, 1);
  const aliases = parseStringArray(fieldString(row, 2));
  const priority = fieldLong(row, 3);
  const status = fieldString(row, 4);
  const metadata = parseJsonObject(fieldString(row, 5));
  const createdAt = fieldDate(row, 6);
  const updatedAt = fieldDate(row, 7);

  if (!id || !brandName || priority === null || !status || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    brandName,
    aliases,
    priority,
    status,
    metadata,
    createdAt,
    updatedAt
  };
};

const toTaxonomyKind = (value: string | null): TaxonomyKind | null => {
  if (!value) return null;
  if (TAXONOMY_KINDS.includes(value as TaxonomyKind)) return value as TaxonomyKind;
  return null;
};

const parseTaxonomyRow = (row: SqlRow | undefined): TaxonomyEntryRecord | null => {
  const id = fieldString(row, 0);
  const kind = toTaxonomyKind(fieldString(row, 1));
  const key = fieldString(row, 2);
  const label = fieldString(row, 3);
  const description = fieldString(row, 4);
  const isActive = fieldBoolean(row, 5);
  const sortOrder = fieldLong(row, 6);
  const metadata = parseJsonObject(fieldString(row, 7));
  const createdAt = fieldDate(row, 8);
  const updatedAt = fieldDate(row, 9);

  if (!id || !kind || !key || !label || isActive === null || sortOrder === null || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    kind,
    key,
    label,
    description,
    isActive,
    sortOrder,
    metadata,
    createdAt,
    updatedAt
  };
};

const parseAuditRow = (row: SqlRow | undefined): AuditRecord | null => {
  const id = fieldString(row, 0);
  const actorUserId = fieldString(row, 1);
  const action = fieldString(row, 2);
  const resourceType = fieldString(row, 3);
  const resourceId = fieldString(row, 4);
  const requestId = fieldString(row, 5);
  const before = parseJsonUnknown(fieldString(row, 6));
  const after = parseJsonUnknown(fieldString(row, 7));
  const createdAt = fieldDate(row, 8);
  const actorEmail = fieldString(row, 9);
  const actorName = fieldString(row, 10);
  const actorRole = fieldString(row, 11);

  if (!id || !action || !resourceType || !createdAt) return null;

  return {
    id,
    actorUserId,
    actorEmail,
    actorName,
    actorRole,
    action,
    resourceType,
    resourceId,
    requestId,
    before,
    after,
    createdAt
  };
};

const encodeCursor = (value: AuditCursorPayload): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeCursor = (value?: string): AuditCursorPayload | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as AuditCursorPayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.created_at !== "string" || typeof parsed.id !== "string") return null;
    if (!UUID_REGEX.test(parsed.id)) return null;
    return parsed;
  } catch {
    return null;
  }
};

class ConfigStore {
  constructor(private readonly rds: RdsDataClient) {}

  private async getSourceWeightById(id: string, transactionId?: string): Promise<SourceWeightRecord | null> {
    const response = await this.rds.execute(
      `
        SELECT
          sw."id"::text,
          sw."provider",
          sw."sourceName",
          sw."weight"::text,
          sw."isActive",
          sw."updatedByUserId"::text,
          u."name",
          u."email",
          sw."createdAt",
          sw."updatedAt"
        FROM "public"."SourceWeight" sw
        LEFT JOIN "public"."User" u
          ON u."id" = sw."updatedByUserId"
        WHERE sw."id" = CAST(:id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("id", id)],
      { transactionId }
    );

    return parseSourceWeightRow(response.records?.[0]);
  }

  private async getNotificationRecipientById(
    id: string,
    transactionId?: string
  ): Promise<NotificationRecipientRecord | null> {
    const response = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "kind"::text,
          "scope",
          "email",
          "isActive",
          "createdAt",
          "updatedAt"
        FROM "public"."NotificationRecipient"
        WHERE "id" = CAST(:id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("id", id)],
      { transactionId }
    );

    return parseNotificationRecipientRow(response.records?.[0]);
  }

  private async findSourceWeightByIdentity(
    provider: string,
    sourceName: string | null,
    excludeId?: string,
    transactionId?: string
  ): Promise<string | null> {
    const response = await this.rds.execute(
      `
        SELECT "id"::text
        FROM "public"."SourceWeight"
        WHERE
          LOWER("provider") = LOWER(:provider)
          AND (
            (CAST(:source_name AS TEXT) IS NULL AND "sourceName" IS NULL)
            OR (LOWER(COALESCE("sourceName", '')) = LOWER(COALESCE(CAST(:source_name AS TEXT), '')))
          )
          AND (CAST(:exclude_id AS UUID) IS NULL OR "id" <> CAST(:exclude_id AS UUID))
        LIMIT 1
      `,
      [
        sqlString("provider", provider),
        sqlString("source_name", sourceName),
        sqlUuid("exclude_id", excludeId ?? null)
      ],
      { transactionId }
    );

    return fieldString(response.records?.[0], 0);
  }

  private async findNotificationRecipientByIdentity(
    kind: NotificationRecipientKind,
    scope: string,
    email: string,
    excludeId?: string,
    transactionId?: string
  ): Promise<string | null> {
    const response = await this.rds.execute(
      `
        SELECT "id"::text
        FROM "public"."NotificationRecipient"
        WHERE
          "kind" = CAST(:kind AS "public"."NotificationRecipientKind")
          AND "scope" = :scope
          AND "email" = :email
          AND (CAST(:exclude_id AS UUID) IS NULL OR "id" <> CAST(:exclude_id AS UUID))
        LIMIT 1
      `,
      [
        sqlString("kind", kind),
        sqlString("scope", scope),
        sqlString("email", email),
        sqlUuid("exclude_id", excludeId ?? null)
      ],
      { transactionId }
    );

    return fieldString(response.records?.[0], 0);
  }

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

  async recordAudit(input: AuditWriteInput): Promise<void> {
    await this.appendAudit(input);
  }

  async ensureDefaultConnectors(): Promise<void> {
    const countResponse = await this.rds.execute(`SELECT COUNT(*)::bigint FROM "public"."ConnectorConfig"`);
    const count = fieldLong(countResponse.records?.[0], 0) ?? 0;
    if (count > 0) return;

    const insertSql = `
      INSERT INTO "public"."ConnectorConfig"
        ("id", "provider", "enabled", "frequencyMinutes", "healthStatus", "createdAt", "updatedAt")
      VALUES
        (CAST(:id AS UUID), :provider, TRUE, 15, :health_status, NOW(), NOW())
      ON CONFLICT ("provider") DO NOTHING
    `;

    for (const provider of DEFAULT_CONNECTOR_PROVIDERS) {
      await this.rds.execute(insertSql, [
        sqlUuid("id", randomUUID()),
        sqlString("provider", provider),
        sqlString("health_status", "unknown")
      ]);
    }
  }

  async listConnectors(limit: number): Promise<ConnectorRecord[]> {
    await this.ensureDefaultConnectors();

    const safeLimit = Math.min(200, Math.max(1, limit));
    const response = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "provider",
          "enabled",
          "frequencyMinutes",
          "healthStatus",
          "lastSyncAt",
          "lastError",
          "latencyP95Ms",
          "metadata"::text,
          "createdAt",
          "updatedAt"
        FROM "public"."ConnectorConfig"
        ORDER BY "provider" ASC
        LIMIT :limit
      `,
      [sqlLong("limit", safeLimit)]
    );

    return (response.records ?? []).map(parseConnectorRow).filter((item): item is ConnectorRecord => item !== null);
  }

  async updateConnector(
    connectorId: string,
    input: ConnectorPatchInput,
    actorUserId: string,
    requestId?: string
  ): Promise<ConnectorRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const beforeResponse = await this.rds.execute(
        `
          SELECT
            "id"::text,
            "provider",
            "enabled",
            "frequencyMinutes",
            "healthStatus",
            "lastSyncAt",
            "lastError",
            "latencyP95Ms",
            "metadata"::text,
            "createdAt",
            "updatedAt"
          FROM "public"."ConnectorConfig"
          WHERE "id" = CAST(:connector_id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("connector_id", connectorId)],
        { transactionId: tx }
      );

      const before = parseConnectorRow(beforeResponse.records?.[0]);
      if (!before) {
        throw new AppStoreError("not_found", "Connector not found");
      }

      const setParts: string[] = ["\"updatedAt\" = NOW()"];
      const params: SqlParameter[] = [sqlUuid("connector_id", connectorId)];

      if (input.enabled !== undefined) {
        setParts.push('"enabled" = :enabled');
        params.push(sqlBoolean("enabled", input.enabled));
      }

      if (input.frequencyMinutes !== undefined) {
        setParts.push('"frequencyMinutes" = :frequency_minutes');
        params.push(sqlLong("frequency_minutes", input.frequencyMinutes));
      }

      if (setParts.length === 1) {
        throw new AppStoreError("conflict", "No changes requested for connector");
      }

      const updateResponse = await this.rds.execute(
        `
          UPDATE "public"."ConnectorConfig"
          SET ${setParts.join(", ")}
          WHERE "id" = CAST(:connector_id AS UUID)
          RETURNING
            "id"::text,
            "provider",
            "enabled",
            "frequencyMinutes",
            "healthStatus",
            "lastSyncAt",
            "lastError",
            "latencyP95Ms",
            "metadata"::text,
            "createdAt",
            "updatedAt"
        `,
        params,
        { transactionId: tx }
      );

      const after = parseConnectorRow(updateResponse.records?.[0]);
      if (!after) {
        throw new Error("Failed to parse updated connector");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "connector_updated",
          resourceType: "ConnectorConfig",
          resourceId: after.id,
          requestId,
          before: {
            enabled: before.enabled,
            frequency_minutes: before.frequencyMinutes,
            health_status: before.healthStatus
          },
          after: {
            enabled: after.enabled,
            frequency_minutes: after.frequencyMinutes,
            health_status: after.healthStatus
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

  async triggerConnectorSync(connectorId: string, actorUserId: string, requestId?: string): Promise<ConnectorSyncRunRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const connectorRes = await this.rds.execute(
        `
          SELECT
            "id"::text,
            "provider",
            "enabled",
            "frequencyMinutes",
            "healthStatus",
            "lastSyncAt",
            "lastError",
            "latencyP95Ms",
            "metadata"::text,
            "createdAt",
            "updatedAt"
          FROM "public"."ConnectorConfig"
          WHERE "id" = CAST(:connector_id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("connector_id", connectorId)],
        { transactionId: tx }
      );

      const connector = parseConnectorRow(connectorRes.records?.[0]);
      if (!connector) {
        throw new AppStoreError("not_found", "Connector not found");
      }

      const runId = randomUUID();
      const runResponse = await this.rds.execute(
        `
          INSERT INTO "public"."ConnectorSyncRun"
            ("id", "connectorId", "status", "startedAt", "finishedAt", "metrics", "errorMessage", "triggeredByUserId", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:connector_id AS UUID), CAST('completed' AS "public"."RunStatus"), NOW(), NOW(), CAST(:metrics AS JSONB), NULL, CAST(:triggered_by_user_id AS UUID), NOW())
          RETURNING
            "id"::text,
            "connectorId"::text,
            "status"::text,
            "startedAt",
            "finishedAt",
            "metrics"::text,
            "errorMessage",
            "triggeredByUserId"::text,
            "createdAt"
        `,
        [
          sqlUuid("id", runId),
          sqlUuid("connector_id", connectorId),
          sqlJson("metrics", {
            mode: "manual",
            fetched: 0,
            persisted: 0,
            skipped: 0
          }),
          sqlUuid("triggered_by_user_id", actorUserId)
        ],
        { transactionId: tx }
      );

      const run = parseConnectorRunRow(runResponse.records?.[0]);
      if (!run) {
        throw new Error("Failed to parse connector sync run");
      }

      await this.rds.execute(
        `
          UPDATE "public"."ConnectorConfig"
          SET
            "healthStatus" = :health_status,
            "lastSyncAt" = NOW(),
            "lastError" = NULL,
            "latencyP95Ms" = COALESCE("latencyP95Ms", :latency_ms),
            "updatedAt" = NOW()
          WHERE "id" = CAST(:connector_id AS UUID)
        `,
        [
          sqlString("health_status", "healthy"),
          sqlLong("latency_ms", 120),
          sqlUuid("connector_id", connectorId)
        ],
        { transactionId: tx }
      );

      await this.appendAudit(
        {
          actorUserId,
          action: "connector_sync_triggered",
          resourceType: "ConnectorConfig",
          resourceId: connectorId,
          requestId,
          before: {
            last_sync_at: connector.lastSyncAt?.toISOString() ?? null,
            health_status: connector.healthStatus
          },
          after: {
            sync_run_id: run.id,
            status: run.status
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return run;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }

  async listConnectorRuns(connectorId: string, limit: number): Promise<ConnectorSyncRunRecord[]> {
    const existsResponse = await this.rds.execute(
      `
        SELECT "id"::text
        FROM "public"."ConnectorConfig"
        WHERE "id" = CAST(:connector_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("connector_id", connectorId)]
    );

    if (!fieldString(existsResponse.records?.[0], 0)) {
      throw new AppStoreError("not_found", "Connector not found");
    }

    const safeLimit = Math.min(100, Math.max(1, limit));
    const response = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "connectorId"::text,
          "status"::text,
          "startedAt",
          "finishedAt",
          "metrics"::text,
          "errorMessage",
          "triggeredByUserId"::text,
          "createdAt"
        FROM "public"."ConnectorSyncRun"
        WHERE "connectorId" = CAST(:connector_id AS UUID)
        ORDER BY "createdAt" DESC, "id" DESC
        LIMIT :limit
      `,
      [sqlUuid("connector_id", connectorId), sqlLong("limit", safeLimit)]
    );

    return (response.records ?? []).map(parseConnectorRunRow).filter((item): item is ConnectorSyncRunRecord => item !== null);
  }

  async listSourceWeights(filters: SourceWeightListFilters, limit = 500): Promise<SourceWeightRecord[]> {
    const safeLimit = Math.min(500, Math.max(1, limit));
    const conditions: string[] = [];
    const params: SqlParameter[] = [sqlLong("limit", safeLimit)];

    if (!filters.includeInactive) {
      conditions.push('sw."isActive" = TRUE');
    }

    if (filters.provider) {
      conditions.push('LOWER(sw."provider") = LOWER(:provider)');
      params.push(sqlString("provider", filters.provider));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const response = await this.rds.execute(
      `
        SELECT
          sw."id"::text,
          sw."provider",
          sw."sourceName",
          sw."weight"::text,
          sw."isActive",
          sw."updatedByUserId"::text,
          u."name",
          u."email",
          sw."createdAt",
          sw."updatedAt"
        FROM "public"."SourceWeight" sw
        LEFT JOIN "public"."User" u
          ON u."id" = sw."updatedByUserId"
        ${whereClause}
        ORDER BY
          sw."provider" ASC,
          CASE WHEN sw."sourceName" IS NULL THEN 0 ELSE 1 END ASC,
          sw."sourceName" ASC,
          sw."id" ASC
        LIMIT :limit
      `,
      params
    );

    return (response.records ?? []).map(parseSourceWeightRow).filter((item): item is SourceWeightRecord => item !== null);
  }

  async createSourceWeight(
    input: SourceWeightCreateInput,
    actorUserId: string,
    requestId?: string
  ): Promise<SourceWeightRecord> {
    const provider = normalizeProvider(input.provider);
    const sourceName = normalizeSourceName(input.sourceName);
    const weight = Number(input.weight);
    if (!provider) {
      throw new AppStoreError("validation", "provider is required");
    }
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
      throw new AppStoreError("validation", "weight must be between 0 and 1");
    }

    const tx = await this.rds.beginTransaction();

    try {
      const existingId = await this.findSourceWeightByIdentity(provider, sourceName, undefined, tx);
      if (existingId) {
        throw new AppStoreError("conflict", "Source weight already exists for provider/source_name");
      }

      const response = await this.rds.execute(
        `
          INSERT INTO "public"."SourceWeight"
            ("id", "provider", "sourceName", "weight", "isActive", "updatedByUserId", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), :provider, :source_name, CAST(:weight AS DECIMAL(3,2)), :is_active, CAST(:updated_by_user_id AS UUID), NOW(), NOW())
          RETURNING "id"::text
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("provider", provider),
          sqlString("source_name", sourceName),
          sqlString("weight", weight.toFixed(2)),
          sqlBoolean("is_active", input.isActive ?? true),
          sqlUuid("updated_by_user_id", actorUserId)
        ],
        { transactionId: tx }
      );

      const weightId = fieldString(response.records?.[0], 0);
      if (!weightId) {
        throw new Error("Failed to create source weight");
      }

      const created = await this.getSourceWeightById(weightId, tx);
      if (!created) {
        throw new Error("Failed to load created source weight");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "source_weight_created",
          resourceType: "SourceWeight",
          resourceId: created.id,
          requestId,
          after: created
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return created;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new AppStoreError("conflict", "Source weight already exists for provider/source_name");
      }
      throw error;
    }
  }

  async updateSourceWeight(
    id: string,
    input: SourceWeightUpdateInput,
    actorUserId: string,
    requestId?: string
  ): Promise<SourceWeightRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const before = await this.getSourceWeightById(id, tx);
      if (!before) {
        throw new AppStoreError("not_found", "Source weight not found");
      }

      const nextSourceName = input.sourceName !== undefined ? normalizeSourceName(input.sourceName) : before.sourceName;
      const identityConflict = await this.findSourceWeightByIdentity(before.provider, nextSourceName, id, tx);
      if (identityConflict) {
        throw new AppStoreError("conflict", "Source weight already exists for provider/source_name");
      }

      const setParts: string[] = ['"updatedAt" = NOW()', '"updatedByUserId" = CAST(:updated_by_user_id AS UUID)'];
      const params: SqlParameter[] = [sqlUuid("id", id), sqlUuid("updated_by_user_id", actorUserId)];

      if (input.sourceName !== undefined) {
        setParts.push('"sourceName" = :source_name');
        params.push(sqlString("source_name", normalizeSourceName(input.sourceName)));
      }

      if (input.weight !== undefined) {
        const numericWeight = Number(input.weight);
        if (!Number.isFinite(numericWeight) || numericWeight < 0 || numericWeight > 1) {
          throw new AppStoreError("validation", "weight must be between 0 and 1");
        }
        setParts.push('"weight" = CAST(:weight AS DECIMAL(3,2))');
        params.push(sqlString("weight", numericWeight.toFixed(2)));
      }

      if (input.isActive !== undefined) {
        setParts.push('"isActive" = :is_active');
        params.push(sqlBoolean("is_active", input.isActive));
      }

      if (setParts.length === 2) {
        throw new AppStoreError("conflict", "No changes requested for source weight");
      }

      await this.rds.execute(
        `
          UPDATE "public"."SourceWeight"
          SET ${setParts.join(", ")}
          WHERE "id" = CAST(:id AS UUID)
        `,
        params,
        { transactionId: tx }
      );

      const after = await this.getSourceWeightById(id, tx);
      if (!after) {
        throw new Error("Failed to load updated source weight");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "source_weight_updated",
          resourceType: "SourceWeight",
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
        throw new AppStoreError("conflict", "Source weight already exists for provider/source_name");
      }
      throw error;
    }
  }

  async listNotificationRecipients(
    filters: NotificationRecipientListFilters,
    limit = 200,
    role: UserRole
  ): Promise<NotificationRecipientRecord[]> {
    const safeLimit = Math.min(500, Math.max(1, limit));

    if (!NOTIFICATION_RECIPIENT_KINDS.includes(filters.kind)) {
      throw new AppStoreError("validation", "kind must be digest or incident");
    }

    const conditions: string[] = ['nr."kind" = CAST(:kind AS "public"."NotificationRecipientKind")'];
    const params: SqlParameter[] = [sqlString("kind", filters.kind), sqlLong("limit", safeLimit)];

    if (!filters.includeInactive) {
      conditions.push('nr."isActive" = TRUE');
    }

    if (filters.scope) {
      conditions.push('nr."scope" = :scope');
      params.push(sqlString("scope", filters.scope.trim().toLowerCase()));
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const response = await this.rds.execute(
      `
        SELECT
          nr."id"::text,
          nr."kind"::text,
          nr."scope",
          nr."email",
          nr."isActive",
          nr."createdAt",
          nr."updatedAt"
        FROM "public"."NotificationRecipient" nr
        ${whereClause}
        ORDER BY nr."scope" ASC, nr."email" ASC, nr."id" ASC
        LIMIT :limit
      `,
      params
    );

    const items = (response.records ?? [])
      .map(parseNotificationRecipientRow)
      .filter((item): item is NotificationRecipientRecord => item !== null);

    if (role !== "Admin") {
      return items.map((item) => ({
        ...item,
        email: null
      }));
    }

    return items;
  }

  async createNotificationRecipient(
    input: NotificationRecipientCreateInput,
    actorUserId: string,
    requestId?: string
  ): Promise<NotificationRecipientRecord> {
    if (!NOTIFICATION_RECIPIENT_KINDS.includes(input.kind)) {
      throw new AppStoreError("validation", "kind must be digest or incident");
    }

    const scope = normalizeNotificationScope(input.scope ?? "ops");
    const email = normalizeNotificationEmail(input.email);

    if (!scope) {
      throw new AppStoreError("validation", "scope is required");
    }
    if (!email) {
      throw new AppStoreError("validation", "email is invalid");
    }

    const tx = await this.rds.beginTransaction();

    try {
      const existingId = await this.findNotificationRecipientByIdentity(input.kind, scope, email, undefined, tx);
      if (existingId) {
        throw new AppStoreError("conflict", "Notification recipient already exists for kind+scope+email");
      }

      const response = await this.rds.execute(
        `
          INSERT INTO "public"."NotificationRecipient"
            ("id", "kind", "scope", "email", "isActive", "updatedByUserId", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), CAST(:kind AS "public"."NotificationRecipientKind"), :scope, :email, :is_active, CAST(:updated_by_user_id AS UUID), NOW(), NOW())
          RETURNING
            "id"::text,
            "kind"::text,
            "scope",
            "email",
            "isActive",
            "createdAt",
            "updatedAt"
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("kind", input.kind),
          sqlString("scope", scope),
          sqlString("email", email),
          sqlBoolean("is_active", input.isActive ?? true),
          sqlUuid("updated_by_user_id", actorUserId)
        ],
        { transactionId: tx }
      );

      const created = parseNotificationRecipientRow(response.records?.[0]);
      if (!created) {
        throw new Error("Failed to parse created notification recipient");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "notification_recipient_created",
          resourceType: "NotificationRecipient",
          resourceId: created.id,
          requestId,
          after: created
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return created;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new AppStoreError("conflict", "Notification recipient already exists for kind+scope+email");
      }
      throw error;
    }
  }

  async updateNotificationRecipient(
    id: string,
    input: NotificationRecipientUpdateInput,
    actorUserId: string,
    requestId?: string
  ): Promise<NotificationRecipientRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const before = await this.getNotificationRecipientById(id, tx);
      if (!before) {
        throw new AppStoreError("not_found", "Notification recipient not found");
      }

      let nextScope = before.scope;
      if (input.scope !== undefined) {
        const normalized = normalizeNotificationScope(input.scope);
        if (!normalized) {
          throw new AppStoreError("validation", "scope is invalid");
        }
        nextScope = normalized;
      }

      let nextEmail = before.email ?? "";
      if (input.email !== undefined) {
        const normalized = normalizeNotificationEmail(input.email);
        if (!normalized) {
          throw new AppStoreError("validation", "email is invalid");
        }
        nextEmail = normalized;
      }

      if (nextScope && nextEmail) {
        const identityConflict = await this.findNotificationRecipientByIdentity(before.kind, nextScope, nextEmail, id, tx);
        if (identityConflict) {
          throw new AppStoreError("conflict", "Notification recipient already exists for kind+scope+email");
        }
      }

      const setParts: string[] = ['"updatedAt" = NOW()', '"updatedByUserId" = CAST(:updated_by_user_id AS UUID)'];
      const params: SqlParameter[] = [sqlUuid("id", id), sqlUuid("updated_by_user_id", actorUserId)];

      if (input.scope !== undefined) {
        setParts.push('"scope" = :scope');
        params.push(sqlString("scope", nextScope));
      }

      if (input.email !== undefined) {
        setParts.push('"email" = :email');
        params.push(sqlString("email", nextEmail));
      }

      if (input.isActive !== undefined) {
        setParts.push('"isActive" = :is_active');
        params.push(sqlBoolean("is_active", input.isActive));
      }

      if (setParts.length === 2) {
        throw new AppStoreError("conflict", "No changes requested for notification recipient");
      }

      await this.rds.execute(
        `
          UPDATE "public"."NotificationRecipient"
          SET ${setParts.join(", ")}
          WHERE "id" = CAST(:id AS UUID)
        `,
        params,
        { transactionId: tx }
      );

      const after = await this.getNotificationRecipientById(id, tx);
      if (!after) {
        throw new Error("Failed to load updated notification recipient");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "notification_recipient_updated",
          resourceType: "NotificationRecipient",
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
        throw new AppStoreError("conflict", "Notification recipient already exists for kind+scope+email");
      }
      throw error;
    }
  }

  async listOwnedAccounts(limit: number): Promise<OwnedAccountRecord[]> {
    const safeLimit = Math.min(300, Math.max(1, limit));
    const response = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "platform",
          "handle",
          "accountName",
          "businessLine",
          "macroRegion",
          "language",
          "teamOwner",
          "status",
          "campaignTags"::text,
          "metadata"::text,
          "createdAt",
          "updatedAt"
        FROM "public"."OwnedAccount"
        ORDER BY "platform" ASC, "handle" ASC
        LIMIT :limit
      `,
      [sqlLong("limit", safeLimit)]
    );

    return (response.records ?? []).map(parseOwnedAccountRow).filter((item): item is OwnedAccountRecord => item !== null);
  }

  async createOwnedAccount(
    input: OwnedAccountCreateInput,
    actorUserId: string,
    requestId?: string
  ): Promise<OwnedAccountRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const response = await this.rds.execute(
        `
          INSERT INTO "public"."OwnedAccount"
            ("id", "platform", "handle", "accountName", "businessLine", "macroRegion", "language", "teamOwner", "status", "campaignTags", "metadata", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), :platform, :handle, :account_name, :business_line, :macro_region, :language, :team_owner, :status, CAST(:campaign_tags AS JSONB), CAST(:metadata AS JSONB), NOW(), NOW())
          RETURNING
            "id"::text,
            "platform",
            "handle",
            "accountName",
            "businessLine",
            "macroRegion",
            "language",
            "teamOwner",
            "status",
            "campaignTags"::text,
            "metadata"::text,
            "createdAt",
            "updatedAt"
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("platform", input.platform),
          sqlString("handle", input.handle),
          sqlString("account_name", input.accountName),
          sqlString("business_line", input.businessLine ?? null),
          sqlString("macro_region", input.macroRegion ?? null),
          sqlString("language", input.language ?? "es"),
          sqlString("team_owner", input.teamOwner ?? null),
          sqlString("status", input.status ?? "active"),
          sqlJson("campaign_tags", input.campaignTags ?? []),
          sqlJson("metadata", input.metadata ?? {})
        ],
        { transactionId: tx }
      );

      const account = parseOwnedAccountRow(response.records?.[0]);
      if (!account) {
        throw new Error("Failed to parse created account");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "owned_account_created",
          resourceType: "OwnedAccount",
          resourceId: account.id,
          requestId,
          after: {
            platform: account.platform,
            handle: account.handle,
            status: account.status
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return account;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new AppStoreError("conflict", "Owned account with same platform+handle already exists");
      }
      throw error;
    }
  }

  async updateOwnedAccount(
    id: string,
    input: OwnedAccountUpdateInput,
    actorUserId: string,
    requestId?: string
  ): Promise<OwnedAccountRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const beforeResponse = await this.rds.execute(
        `
          SELECT
            "id"::text,
            "platform",
            "handle",
            "accountName",
            "businessLine",
            "macroRegion",
            "language",
            "teamOwner",
            "status",
            "campaignTags"::text,
            "metadata"::text,
            "createdAt",
            "updatedAt"
          FROM "public"."OwnedAccount"
          WHERE "id" = CAST(:id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("id", id)],
        { transactionId: tx }
      );

      const before = parseOwnedAccountRow(beforeResponse.records?.[0]);
      if (!before) {
        throw new AppStoreError("not_found", "Owned account not found");
      }

      const setParts: string[] = ["\"updatedAt\" = NOW()"];
      const params: SqlParameter[] = [sqlUuid("id", id)];

      if (input.platform !== undefined) {
        setParts.push('"platform" = :platform');
        params.push(sqlString("platform", input.platform));
      }
      if (input.handle !== undefined) {
        setParts.push('"handle" = :handle');
        params.push(sqlString("handle", input.handle));
      }
      if (input.accountName !== undefined) {
        setParts.push('"accountName" = :account_name');
        params.push(sqlString("account_name", input.accountName));
      }
      if (input.businessLine !== undefined) {
        setParts.push('"businessLine" = :business_line');
        params.push(sqlString("business_line", input.businessLine));
      }
      if (input.macroRegion !== undefined) {
        setParts.push('"macroRegion" = :macro_region');
        params.push(sqlString("macro_region", input.macroRegion));
      }
      if (input.language !== undefined) {
        setParts.push('"language" = :language');
        params.push(sqlString("language", input.language));
      }
      if (input.teamOwner !== undefined) {
        setParts.push('"teamOwner" = :team_owner');
        params.push(sqlString("team_owner", input.teamOwner));
      }
      if (input.status !== undefined) {
        setParts.push('"status" = :status');
        params.push(sqlString("status", input.status));
      }
      if (input.campaignTags !== undefined) {
        setParts.push('"campaignTags" = CAST(:campaign_tags AS JSONB)');
        params.push(sqlJson("campaign_tags", input.campaignTags));
      }
      if (input.metadata !== undefined) {
        setParts.push('"metadata" = CAST(:metadata AS JSONB)');
        params.push(sqlJson("metadata", input.metadata));
      }

      if (setParts.length === 1) {
        throw new AppStoreError("conflict", "No changes requested for owned account");
      }

      const updateResponse = await this.rds.execute(
        `
          UPDATE "public"."OwnedAccount"
          SET ${setParts.join(", ")}
          WHERE "id" = CAST(:id AS UUID)
          RETURNING
            "id"::text,
            "platform",
            "handle",
            "accountName",
            "businessLine",
            "macroRegion",
            "language",
            "teamOwner",
            "status",
            "campaignTags"::text,
            "metadata"::text,
            "createdAt",
            "updatedAt"
        `,
        params,
        { transactionId: tx }
      );

      const after = parseOwnedAccountRow(updateResponse.records?.[0]);
      if (!after) {
        throw new Error("Failed to parse updated account");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "owned_account_updated",
          resourceType: "OwnedAccount",
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
        throw new AppStoreError("conflict", "Owned account with same platform+handle already exists");
      }
      throw error;
    }
  }

  async listCompetitors(limit: number): Promise<CompetitorRecord[]> {
    const safeLimit = Math.min(300, Math.max(1, limit));
    const response = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "brandName",
          "aliases"::text,
          "priority",
          "status",
          "metadata"::text,
          "createdAt",
          "updatedAt"
        FROM "public"."Competitor"
        ORDER BY "priority" ASC, "brandName" ASC
        LIMIT :limit
      `,
      [sqlLong("limit", safeLimit)]
    );

    return (response.records ?? []).map(parseCompetitorRow).filter((item): item is CompetitorRecord => item !== null);
  }

  async createCompetitor(input: CompetitorCreateInput, actorUserId: string, requestId?: string): Promise<CompetitorRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const response = await this.rds.execute(
        `
          INSERT INTO "public"."Competitor"
            ("id", "brandName", "aliases", "priority", "status", "metadata", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), :brand_name, CAST(:aliases AS JSONB), :priority, :status, CAST(:metadata AS JSONB), NOW(), NOW())
          RETURNING
            "id"::text,
            "brandName",
            "aliases"::text,
            "priority",
            "status",
            "metadata"::text,
            "createdAt",
            "updatedAt"
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("brand_name", input.brandName),
          sqlJson("aliases", input.aliases ?? []),
          sqlLong("priority", input.priority ?? 3),
          sqlString("status", input.status ?? "active"),
          sqlJson("metadata", input.metadata ?? {})
        ],
        { transactionId: tx }
      );

      const competitor = parseCompetitorRow(response.records?.[0]);
      if (!competitor) {
        throw new Error("Failed to parse created competitor");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "competitor_created",
          resourceType: "Competitor",
          resourceId: competitor.id,
          requestId,
          after: {
            brand_name: competitor.brandName,
            priority: competitor.priority,
            status: competitor.status
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return competitor;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new AppStoreError("conflict", "Competitor with same brand name already exists");
      }
      throw error;
    }
  }

  async updateCompetitor(
    id: string,
    input: CompetitorUpdateInput,
    actorUserId: string,
    requestId?: string
  ): Promise<CompetitorRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const beforeResponse = await this.rds.execute(
        `
          SELECT
            "id"::text,
            "brandName",
            "aliases"::text,
            "priority",
            "status",
            "metadata"::text,
            "createdAt",
            "updatedAt"
          FROM "public"."Competitor"
          WHERE "id" = CAST(:id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("id", id)],
        { transactionId: tx }
      );

      const before = parseCompetitorRow(beforeResponse.records?.[0]);
      if (!before) {
        throw new AppStoreError("not_found", "Competitor not found");
      }

      const setParts: string[] = ["\"updatedAt\" = NOW()"];
      const params: SqlParameter[] = [sqlUuid("id", id)];

      if (input.brandName !== undefined) {
        setParts.push('"brandName" = :brand_name');
        params.push(sqlString("brand_name", input.brandName));
      }
      if (input.aliases !== undefined) {
        setParts.push('"aliases" = CAST(:aliases AS JSONB)');
        params.push(sqlJson("aliases", input.aliases));
      }
      if (input.priority !== undefined) {
        setParts.push('"priority" = :priority');
        params.push(sqlLong("priority", input.priority));
      }
      if (input.status !== undefined) {
        setParts.push('"status" = :status');
        params.push(sqlString("status", input.status));
      }
      if (input.metadata !== undefined) {
        setParts.push('"metadata" = CAST(:metadata AS JSONB)');
        params.push(sqlJson("metadata", input.metadata));
      }

      if (setParts.length === 1) {
        throw new AppStoreError("conflict", "No changes requested for competitor");
      }

      const updateResponse = await this.rds.execute(
        `
          UPDATE "public"."Competitor"
          SET ${setParts.join(", ")}
          WHERE "id" = CAST(:id AS UUID)
          RETURNING
            "id"::text,
            "brandName",
            "aliases"::text,
            "priority",
            "status",
            "metadata"::text,
            "createdAt",
            "updatedAt"
        `,
        params,
        { transactionId: tx }
      );

      const after = parseCompetitorRow(updateResponse.records?.[0]);
      if (!after) {
        throw new Error("Failed to parse updated competitor");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "competitor_updated",
          resourceType: "Competitor",
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
        throw new AppStoreError("conflict", "Competitor with same brand name already exists");
      }
      throw error;
    }
  }

  async listTaxonomyEntries(kind: TaxonomyKind, includeInactive: boolean): Promise<TaxonomyEntryRecord[]> {
    const conditions = ['"kind" = :kind'];
    const params: SqlParameter[] = [sqlString("kind", kind)];

    if (!includeInactive) {
      conditions.push('"isActive" = TRUE');
    }

    const response = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "kind",
          "key",
          "label",
          "description",
          "isActive",
          "sortOrder",
          "metadata"::text,
          "createdAt",
          "updatedAt"
        FROM "public"."TaxonomyEntry"
        WHERE ${conditions.join(" AND ")}
        ORDER BY "sortOrder" ASC, "label" ASC, "id" ASC
      `,
      params
    );

    return (response.records ?? []).map(parseTaxonomyRow).filter((item): item is TaxonomyEntryRecord => item !== null);
  }

  async createTaxonomyEntry(
    kind: TaxonomyKind,
    input: TaxonomyEntryCreateInput,
    actorUserId: string,
    requestId?: string
  ): Promise<TaxonomyEntryRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const response = await this.rds.execute(
        `
          INSERT INTO "public"."TaxonomyEntry"
            ("id", "kind", "key", "label", "description", "isActive", "sortOrder", "metadata", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), :kind, :key, :label, :description, :is_active, :sort_order, CAST(:metadata AS JSONB), NOW(), NOW())
          RETURNING
            "id"::text,
            "kind",
            "key",
            "label",
            "description",
            "isActive",
            "sortOrder",
            "metadata"::text,
            "createdAt",
            "updatedAt"
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("kind", kind),
          sqlString("key", input.key),
          sqlString("label", input.label),
          sqlString("description", input.description ?? null),
          sqlBoolean("is_active", input.isActive ?? true),
          sqlLong("sort_order", input.sortOrder ?? 100),
          sqlJson("metadata", input.metadata ?? {})
        ],
        { transactionId: tx }
      );

      const entry = parseTaxonomyRow(response.records?.[0]);
      if (!entry) {
        throw new Error("Failed to parse created taxonomy entry");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "taxonomy_entry_created",
          resourceType: "TaxonomyEntry",
          resourceId: entry.id,
          requestId,
          after: {
            kind: entry.kind,
            key: entry.key,
            label: entry.label,
            is_active: entry.isActive
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return entry;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new AppStoreError("conflict", "Taxonomy key already exists for this kind");
      }
      throw error;
    }
  }

  async updateTaxonomyEntry(
    kind: TaxonomyKind,
    id: string,
    input: TaxonomyEntryUpdateInput,
    actorUserId: string,
    requestId?: string
  ): Promise<TaxonomyEntryRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const beforeResponse = await this.rds.execute(
        `
          SELECT
            "id"::text,
            "kind",
            "key",
            "label",
            "description",
            "isActive",
            "sortOrder",
            "metadata"::text,
            "createdAt",
            "updatedAt"
          FROM "public"."TaxonomyEntry"
          WHERE "id" = CAST(:id AS UUID)
            AND "kind" = :kind
          LIMIT 1
        `,
        [sqlUuid("id", id), sqlString("kind", kind)],
        { transactionId: tx }
      );

      const before = parseTaxonomyRow(beforeResponse.records?.[0]);
      if (!before) {
        throw new AppStoreError("not_found", "Taxonomy entry not found");
      }

      const setParts: string[] = ["\"updatedAt\" = NOW()"];
      const params: SqlParameter[] = [sqlUuid("id", id), sqlString("kind", kind)];

      if (input.key !== undefined) {
        setParts.push('"key" = :key');
        params.push(sqlString("key", input.key));
      }
      if (input.label !== undefined) {
        setParts.push('"label" = :label');
        params.push(sqlString("label", input.label));
      }
      if (input.description !== undefined) {
        setParts.push('"description" = :description');
        params.push(sqlString("description", input.description));
      }
      if (input.isActive !== undefined) {
        setParts.push('"isActive" = :is_active');
        params.push(sqlBoolean("is_active", input.isActive));
      }
      if (input.sortOrder !== undefined) {
        setParts.push('"sortOrder" = :sort_order');
        params.push(sqlLong("sort_order", input.sortOrder));
      }
      if (input.metadata !== undefined) {
        setParts.push('"metadata" = CAST(:metadata AS JSONB)');
        params.push(sqlJson("metadata", input.metadata));
      }

      if (setParts.length === 1) {
        throw new AppStoreError("conflict", "No changes requested for taxonomy entry");
      }

      const updateResponse = await this.rds.execute(
        `
          UPDATE "public"."TaxonomyEntry"
          SET ${setParts.join(", ")}
          WHERE "id" = CAST(:id AS UUID)
            AND "kind" = :kind
          RETURNING
            "id"::text,
            "kind",
            "key",
            "label",
            "description",
            "isActive",
            "sortOrder",
            "metadata"::text,
            "createdAt",
            "updatedAt"
        `,
        params,
        { transactionId: tx }
      );

      const after = parseTaxonomyRow(updateResponse.records?.[0]);
      if (!after) {
        throw new Error("Failed to parse updated taxonomy entry");
      }

      await this.appendAudit(
        {
          actorUserId,
          action: "taxonomy_entry_updated",
          resourceType: "TaxonomyEntry",
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
        throw new AppStoreError("conflict", "Taxonomy key already exists for this kind");
      }
      throw error;
    }
  }

  async listAudit(limit: number, cursor: string | undefined, filters: AuditFilters): Promise<AuditPage> {
    const safeLimit = Math.min(500, Math.max(1, limit));
    const cursorPayload = decodeCursor(cursor);
    if (cursor && !cursorPayload) {
      throw new AppStoreError("validation", "Invalid cursor");
    }

    const conditions: string[] = [];
    const params: SqlParameter[] = [sqlLong("limit_plus_one", safeLimit + 1)];

    if (filters.resourceType) {
      conditions.push('LOWER(al."resourceType") = LOWER(:resource_type)');
      params.push(sqlString("resource_type", filters.resourceType));
    }
    if (filters.action) {
      conditions.push('LOWER(al."action") = LOWER(:action)');
      params.push(sqlString("action", filters.action));
    }
    if (filters.actorUserId) {
      conditions.push('al."actorUserId" = CAST(:actor_user_id AS UUID)');
      params.push(sqlUuid("actor_user_id", filters.actorUserId));
    }
    if (filters.from) {
      conditions.push('al."createdAt" >= :from_date');
      params.push(sqlTimestamp("from_date", filters.from));
    }
    if (filters.to) {
      conditions.push('al."createdAt" <= :to_date');
      params.push(sqlTimestamp("to_date", filters.to));
    }

    if (cursorPayload) {
      const cursorDate = new Date(cursorPayload.created_at);
      if (Number.isNaN(cursorDate.getTime())) {
        throw new AppStoreError("validation", "Invalid cursor");
      }
      conditions.push(
        '(al."createdAt" < :cursor_created_at OR (al."createdAt" = :cursor_created_at AND al."id" < CAST(:cursor_id AS UUID)))'
      );
      params.push(sqlTimestamp("cursor_created_at", cursorDate), sqlUuid("cursor_id", cursorPayload.id));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const response = await this.rds.execute(
      `
        SELECT
          al."id"::text,
          al."actorUserId"::text,
          al."action",
          al."resourceType",
          al."resourceId",
          al."requestId",
          al."before"::text,
          al."after"::text,
          al."createdAt",
          u."email",
          u."name",
          u."role"::text
        FROM "public"."AuditLog" al
        LEFT JOIN "public"."User" u
          ON u."id" = al."actorUserId"
        ${whereClause}
        ORDER BY al."createdAt" DESC, al."id" DESC
        LIMIT :limit_plus_one
      `,
      params
    );

    const rows = response.records ?? [];
    const hasNext = rows.length > safeLimit;
    const sliced = hasNext ? rows.slice(0, safeLimit) : rows;
    const items = sliced.map(parseAuditRow).filter((item): item is AuditRecord => item !== null);

    const last = items[items.length - 1];
    const nextCursor = hasNext && last ? encodeCursor({ created_at: last.createdAt.toISOString(), id: last.id }) : null;

    return {
      items,
      nextCursor,
      hasNext
    };
  }

  async listAuditForExport(limit: number, filters: AuditFilters): Promise<AuditRecord[]> {
    const safeLimit = Math.min(5000, Math.max(1, limit));
    const conditions: string[] = [];
    const params: SqlParameter[] = [sqlLong("limit", safeLimit)];

    if (filters.resourceType) {
      conditions.push('LOWER(al."resourceType") = LOWER(:resource_type)');
      params.push(sqlString("resource_type", filters.resourceType));
    }
    if (filters.action) {
      conditions.push('LOWER(al."action") = LOWER(:action)');
      params.push(sqlString("action", filters.action));
    }
    if (filters.actorUserId) {
      conditions.push('al."actorUserId" = CAST(:actor_user_id AS UUID)');
      params.push(sqlUuid("actor_user_id", filters.actorUserId));
    }
    if (filters.from) {
      conditions.push('al."createdAt" >= :from_date');
      params.push(sqlTimestamp("from_date", filters.from));
    }
    if (filters.to) {
      conditions.push('al."createdAt" <= :to_date');
      params.push(sqlTimestamp("to_date", filters.to));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const response = await this.rds.execute(
      `
        SELECT
          al."id"::text,
          al."actorUserId"::text,
          al."action",
          al."resourceType",
          al."resourceId",
          al."requestId",
          al."before"::text,
          al."after"::text,
          al."createdAt",
          u."email",
          u."name",
          u."role"::text
        FROM "public"."AuditLog" al
        LEFT JOIN "public"."User" u
          ON u."id" = al."actorUserId"
        ${whereClause}
        ORDER BY al."createdAt" DESC, al."id" DESC
        LIMIT :limit
      `,
      params
    );

    return (response.records ?? []).map(parseAuditRow).filter((item): item is AuditRecord => item !== null);
  }
}

export const createConfigStore = (): ConfigStore | null => {
  const client = RdsDataClient.fromEnv();
  if (!client) return null;
  return new ConfigStore(client);
};

export const isTaxonomyKind = (value: string): value is TaxonomyKind => TAXONOMY_KINDS.includes(value as TaxonomyKind);

export type { ConfigStore };
