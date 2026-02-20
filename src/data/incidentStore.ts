import { randomUUID } from "crypto";
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INCIDENT_SCOPES = ["claro", "competencia"] as const;
const INCIDENT_SEVERITIES = ["SEV1", "SEV2", "SEV3", "SEV4"] as const;
const INCIDENT_STATUSES = ["open", "acknowledged", "in_progress", "resolved", "dismissed"] as const;
const ACTIVE_INCIDENT_STATUSES = ["open", "acknowledged", "in_progress"] as const;

type IncidentScope = (typeof INCIDENT_SCOPES)[number];
type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
type EvaluationTriggerType = "scheduled" | "manual";

type IncidentCursorPayload = {
  updated_at: string;
  id: string;
};

type IncidentRecord = {
  id: string;
  scope: IncidentScope;
  severity: IncidentSeverity;
  status: IncidentStatus;
  riskScore: number;
  classifiedItems: number;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerRole: string | null;
  slaDueAt: Date;
  slaRemainingMinutes: number;
  cooldownUntil: Date;
  signalVersion: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
};

type IncidentNoteRecord = {
  id: string;
  incidentId: string;
  authorUserId: string;
  authorName: string | null;
  authorEmail: string | null;
  authorRole: string | null;
  note: string;
  createdAt: Date;
};

type IncidentEvaluationRunRecord = {
  id: string;
  triggerType: EvaluationTriggerType;
  status: "queued" | "running" | "completed" | "failed";
  metrics: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

type IncidentListFilters = {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  scope?: IncidentScope;
  ownerUserId?: string;
};

type IncidentPage = {
  items: IncidentRecord[];
  nextCursor: string | null;
  hasNext: boolean;
};

type IncidentPatchInput = {
  incidentId: string;
  status?: IncidentStatus;
  ownerUserId?: string | null;
  note?: string;
  actorUserId: string;
  requestId?: string;
};

type IncidentEvaluationInput = {
  triggerType: EvaluationTriggerType;
  cooldownMinutes: number;
  signalVersion: string;
};

type ScopeSignal = {
  scope: IncidentScope;
  riskWeighted: number;
  severity: IncidentSeverity;
  classifiedItems: number;
  negatives: number;
  positives: number;
  neutrals: number;
  classifiedWeight: number;
  negativeWeight: number;
  unknownSentimentItems: number;
};

type IncidentEvaluationResult = {
  run: IncidentEvaluationRunRecord;
  created: IncidentRecord[];
  escalated: IncidentRecord[];
  deduped: number;
  skippedSev4: number;
  scopes: ScopeSignal[];
};

type PatchIncidentResult = {
  incident: IncidentRecord;
  note: IncidentNoteRecord | null;
};

type AddIncidentNoteInput = {
  incidentId: string;
  note: string;
  authorUserId: string;
  requestId?: string;
};

const isUuid = (value: string): boolean => UUID_REGEX.test(value);

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

const toRiskScore = (value: number): number => Math.round(value * 100) / 100;

const parseDecimal = (value: string | null): number => {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const encodeCursor = (value: IncidentCursorPayload): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeCursor = (value?: string): IncidentCursorPayload | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as IncidentCursorPayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.updated_at !== "string" || typeof parsed.id !== "string") return null;
    if (!isUuid(parsed.id)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const severityToRank = (value: IncidentSeverity): number => {
  if (value === "SEV1") return 1;
  if (value === "SEV2") return 2;
  if (value === "SEV3") return 3;
  return 4;
};

const toSeverity = (riskWeighted: number): IncidentSeverity => {
  if (riskWeighted >= 80) return "SEV1";
  if (riskWeighted >= 60) return "SEV2";
  if (riskWeighted >= 40) return "SEV3";
  return "SEV4";
};

const toSlaMinutes = (severity: IncidentSeverity): number => {
  if (severity === "SEV1") return 30;
  if (severity === "SEV2") return 4 * 60;
  return 24 * 60;
};

const addMinutes = (base: Date, minutes: number): Date => new Date(base.getTime() + minutes * 60_000);

const parseIncidentRow = (row: SqlRow | undefined, now: Date): IncidentRecord | null => {
  const id = fieldString(row, 0);
  const scope = fieldString(row, 1) as IncidentScope | null;
  const severity = fieldString(row, 2) as IncidentSeverity | null;
  const status = fieldString(row, 3) as IncidentStatus | null;
  const riskScore = parseDecimal(fieldString(row, 4));
  const classifiedItems = fieldLong(row, 5);
  const ownerUserId = fieldString(row, 6);
  const slaDueAt = fieldDate(row, 7);
  const cooldownUntil = fieldDate(row, 8);
  const signalVersion = fieldString(row, 9);
  const payload = parseJsonObject(fieldString(row, 10));
  const createdAt = fieldDate(row, 11);
  const updatedAt = fieldDate(row, 12);
  const resolvedAt = fieldDate(row, 13);
  const ownerName = fieldString(row, 14);
  const ownerEmail = fieldString(row, 15);
  const ownerRole = fieldString(row, 16);

  if (
    !id ||
    !scope ||
    !INCIDENT_SCOPES.includes(scope) ||
    !severity ||
    !INCIDENT_SEVERITIES.includes(severity) ||
    !status ||
    !INCIDENT_STATUSES.includes(status) ||
    classifiedItems === null ||
    !slaDueAt ||
    !cooldownUntil ||
    !signalVersion ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  const slaRemainingMinutes = Math.floor((slaDueAt.getTime() - now.getTime()) / 60_000);

  return {
    id,
    scope,
    severity,
    status,
    riskScore: toRiskScore(riskScore),
    classifiedItems,
    ownerUserId,
    ownerName,
    ownerEmail,
    ownerRole,
    slaDueAt,
    slaRemainingMinutes,
    cooldownUntil,
    signalVersion,
    payload,
    createdAt,
    updatedAt,
    resolvedAt
  };
};

const parseIncidentNoteRow = (row: SqlRow | undefined): IncidentNoteRecord | null => {
  const id = fieldString(row, 0);
  const incidentId = fieldString(row, 1);
  const authorUserId = fieldString(row, 2);
  const note = fieldString(row, 3);
  const createdAt = fieldDate(row, 4);
  const authorName = fieldString(row, 5);
  const authorEmail = fieldString(row, 6);
  const authorRole = fieldString(row, 7);

  if (!id || !incidentId || !authorUserId || !note || !createdAt) return null;

  return {
    id,
    incidentId,
    authorUserId,
    authorName,
    authorEmail,
    authorRole,
    note,
    createdAt
  };
};

const parseInsertedIncidentNoteBase = (row: SqlRow | undefined): IncidentNoteRecord | null => {
  const id = fieldString(row, 0);
  const incidentId = fieldString(row, 1);
  const authorUserId = fieldString(row, 2);
  const note = fieldString(row, 3);
  const createdAt = fieldDate(row, 4);

  if (!id || !incidentId || !authorUserId || !note || !createdAt) return null;
  return {
    id,
    incidentId,
    authorUserId,
    authorName: null,
    authorEmail: null,
    authorRole: null,
    note,
    createdAt
  };
};

const parseIncidentEvaluationRunRow = (row: SqlRow | undefined): IncidentEvaluationRunRecord | null => {
  const id = fieldString(row, 0);
  const triggerType = fieldString(row, 1) as EvaluationTriggerType | null;
  const status = fieldString(row, 2) as IncidentEvaluationRunRecord["status"] | null;
  const metrics = parseJsonObject(fieldString(row, 3));
  const errorMessage = fieldString(row, 4);
  const createdAt = fieldDate(row, 5);
  const finishedAt = fieldDate(row, 6);

  if (!id || !triggerType || (triggerType !== "scheduled" && triggerType !== "manual") || !status || !createdAt) {
    return null;
  }

  return {
    id,
    triggerType,
    status,
    metrics,
    errorMessage,
    createdAt,
    finishedAt
  };
};

class IncidentStore {
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

  async listIncidents(limit: number, filters: IncidentListFilters, cursor?: string): Promise<IncidentPage> {
    const safeLimit = Math.min(200, Math.max(1, limit));
    const cursorPayload = decodeCursor(cursor);

    if (cursor && !cursorPayload) {
      throw new AppStoreError("validation", "Invalid cursor");
    }

    const now = new Date();
    const conditions: string[] = [];
    const params = [sqlLong("limit_plus_one", safeLimit + 1)];

    if (filters.status) {
      conditions.push('i."status" = CAST(:status AS "public"."IncidentStatus")');
      params.push(sqlString("status", filters.status));
    }

    if (filters.severity) {
      conditions.push('i."severity" = CAST(:severity AS "public"."IncidentSeverity")');
      params.push(sqlString("severity", filters.severity));
    }

    if (filters.scope) {
      conditions.push('i."scope" = CAST(:scope AS "public"."TermScope")');
      params.push(sqlString("scope", filters.scope));
    }

    if (filters.ownerUserId) {
      conditions.push('i."ownerUserId" = CAST(:owner_user_id AS UUID)');
      params.push(sqlUuid("owner_user_id", filters.ownerUserId));
    }

    if (cursorPayload) {
      const cursorDate = new Date(cursorPayload.updated_at);
      if (Number.isNaN(cursorDate.getTime())) {
        throw new AppStoreError("validation", "Invalid cursor");
      }

      conditions.push(
        '(i."updatedAt" < :cursor_updated_at OR (i."updatedAt" = :cursor_updated_at AND i."id" < CAST(:cursor_id AS UUID)))'
      );
      params.push(sqlTimestamp("cursor_updated_at", cursorDate), sqlUuid("cursor_id", cursorPayload.id));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const response = await this.rds.execute(
      `
        SELECT
          i."id"::text,
          i."scope"::text,
          i."severity"::text,
          i."status"::text,
          i."riskScore"::text,
          i."classifiedItems",
          i."ownerUserId"::text,
          i."slaDueAt",
          i."cooldownUntil",
          i."signalVersion",
          i."payload"::text,
          i."createdAt",
          i."updatedAt",
          i."resolvedAt",
          u."name",
          u."email",
          u."role"::text
        FROM "public"."Incident" i
        LEFT JOIN "public"."User" u ON u."id" = i."ownerUserId"
        ${whereClause}
        ORDER BY i."updatedAt" DESC, i."id" DESC
        LIMIT :limit_plus_one
      `,
      params
    );

    const rows = response.records ?? [];
    const hasNext = rows.length > safeLimit;
    const sliced = hasNext ? rows.slice(0, safeLimit) : rows;

    const items = sliced.map((row) => parseIncidentRow(row, now)).filter((item): item is IncidentRecord => item !== null);

    const last = items[items.length - 1];
    const nextCursor = hasNext && last ? encodeCursor({ updated_at: last.updatedAt.toISOString(), id: last.id }) : null;

    return {
      items,
      nextCursor,
      hasNext
    };
  }

  async listIncidentNotes(incidentId: string, limit: number): Promise<IncidentNoteRecord[]> {
    const safeLimit = Math.min(200, Math.max(1, limit));

    const exists = await this.rds.execute(
      `
        SELECT "id"::text
        FROM "public"."Incident"
        WHERE "id" = CAST(:incident_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("incident_id", incidentId)]
    );

    if (!fieldString(exists.records?.[0], 0)) {
      throw new AppStoreError("not_found", "Incident not found");
    }

    const response = await this.rds.execute(
      `
        SELECT
          n."id"::text,
          n."incidentId"::text,
          n."authorUserId"::text,
          n."note",
          n."createdAt",
          u."name",
          u."email",
          u."role"::text
        FROM "public"."IncidentNote" n
        INNER JOIN "public"."User" u ON u."id" = n."authorUserId"
        WHERE n."incidentId" = CAST(:incident_id AS UUID)
        ORDER BY n."createdAt" DESC, n."id" DESC
        LIMIT :limit
      `,
      [sqlUuid("incident_id", incidentId), sqlLong("limit", safeLimit)]
    );

    return (response.records ?? []).map(parseIncidentNoteRow).filter((item): item is IncidentNoteRecord => item !== null);
  }

  async addIncidentNote(input: AddIncidentNoteInput): Promise<IncidentNoteRecord> {
    const tx = await this.rds.beginTransaction();

    try {
      const exists = await this.rds.execute(
        `
          SELECT "id"::text
          FROM "public"."Incident"
          WHERE "id" = CAST(:incident_id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("incident_id", input.incidentId)],
        { transactionId: tx }
      );

      if (!fieldString(exists.records?.[0], 0)) {
        throw new AppStoreError("not_found", "Incident not found");
      }

      await this.rds.execute(
        `
          UPDATE "public"."Incident"
          SET "updatedAt" = NOW()
          WHERE "id" = CAST(:incident_id AS UUID)
        `,
        [sqlUuid("incident_id", input.incidentId)],
        { transactionId: tx }
      );

      const noteResponse = await this.rds.execute(
        `
          INSERT INTO "public"."IncidentNote"
            ("id", "incidentId", "authorUserId", "note", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:incident_id AS UUID), CAST(:author_user_id AS UUID), :note, NOW())
          RETURNING
            "id"::text,
            "incidentId"::text,
            "authorUserId"::text,
            "note",
            "createdAt"
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("incident_id", input.incidentId),
          sqlUuid("author_user_id", input.authorUserId),
          sqlString("note", input.note)
        ],
        { transactionId: tx }
      );

      const createdNoteBase = parseInsertedIncidentNoteBase(noteResponse.records?.[0]);

      if (!createdNoteBase) {
        throw new Error("Failed to parse incident note");
      }

      await this.appendAudit(
        {
          actorUserId: input.authorUserId,
          action: "incident_note_added",
          resourceType: "Incident",
          resourceId: input.incidentId,
          requestId: input.requestId,
          after: {
            note: createdNoteBase.note
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);

      const hydrated = await this.rds.execute(
        `
          SELECT
            n."id"::text,
            n."incidentId"::text,
            n."authorUserId"::text,
            n."note",
            n."createdAt",
            u."name",
            u."email",
            u."role"::text
          FROM "public"."IncidentNote" n
          INNER JOIN "public"."User" u ON u."id" = n."authorUserId"
          WHERE n."id" = CAST(:id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("id", createdNoteBase.id)]
      );

      const note = parseIncidentNoteRow(hydrated.records?.[0]);
      if (!note) throw new Error("Failed to hydrate incident note");
      return note;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }

  async patchIncident(input: IncidentPatchInput): Promise<PatchIncidentResult> {
    const tx = await this.rds.beginTransaction();

    try {
      const beforeResponse = await this.rds.execute(
        `
          SELECT
            i."id"::text,
            i."scope"::text,
            i."severity"::text,
            i."status"::text,
            i."riskScore"::text,
            i."classifiedItems",
            i."ownerUserId"::text,
            i."slaDueAt",
            i."cooldownUntil",
            i."signalVersion",
            i."payload"::text,
            i."createdAt",
            i."updatedAt",
            i."resolvedAt",
            u."name",
            u."email",
            u."role"::text
          FROM "public"."Incident" i
          LEFT JOIN "public"."User" u ON u."id" = i."ownerUserId"
          WHERE i."id" = CAST(:incident_id AS UUID)
          LIMIT 1
          FOR UPDATE
        `,
        [sqlUuid("incident_id", input.incidentId)],
        { transactionId: tx }
      );

      const before = parseIncidentRow(beforeResponse.records?.[0], new Date());
      if (!before) {
        throw new AppStoreError("not_found", "Incident not found");
      }

      if (input.ownerUserId !== undefined && input.ownerUserId !== null) {
        const ownerExists = await this.rds.execute(
          `
            SELECT "id"::text
            FROM "public"."User"
            WHERE "id" = CAST(:owner_user_id AS UUID)
            LIMIT 1
          `,
          [sqlUuid("owner_user_id", input.ownerUserId)],
          { transactionId: tx }
        );

        if (!fieldString(ownerExists.records?.[0], 0)) {
          throw new AppStoreError("not_found", "owner_user_id not found");
        }
      }

      const statusChanged = input.status !== undefined && input.status !== before.status;
      const ownerChanged = input.ownerUserId !== undefined && input.ownerUserId !== before.ownerUserId;
      const hasNote = Boolean(input.note);

      if (!statusChanged && !ownerChanged && !hasNote) {
        throw new AppStoreError("conflict", "No changes requested for incident");
      }

      const setParts: string[] = ['"updatedAt" = NOW()'];
      const params = [sqlUuid("incident_id", input.incidentId)];

      if (statusChanged && input.status) {
        setParts.push('"status" = CAST(:status AS "public"."IncidentStatus")');
        params.push(sqlString("status", input.status));

        if (input.status === "resolved" || input.status === "dismissed") {
          setParts.push('"resolvedAt" = NOW()');
        } else {
          setParts.push('"resolvedAt" = NULL');
        }
      }

      if (ownerChanged) {
        setParts.push('"ownerUserId" = CAST(:owner_user_id AS UUID)');
        params.push(sqlUuid("owner_user_id", input.ownerUserId ?? null));
      }

      let updated = before;

      if (statusChanged || ownerChanged) {
        const updateResponse = await this.rds.execute(
          `
            UPDATE "public"."Incident"
            SET ${setParts.join(", ")}
            WHERE "id" = CAST(:incident_id AS UUID)
            RETURNING
              "id"::text,
              "scope"::text,
              "severity"::text,
              "status"::text,
              "riskScore"::text,
              "classifiedItems",
              "ownerUserId"::text,
              "slaDueAt",
              "cooldownUntil",
              "signalVersion",
              "payload"::text,
              "createdAt",
              "updatedAt",
              "resolvedAt"
          `,
          params,
          { transactionId: tx }
        );

        const updatedBase = updateResponse.records?.[0];
        if (!updatedBase) {
          throw new Error("Failed to update incident");
        }

        const withOwner = await this.rds.execute(
          `
            SELECT
              i."id"::text,
              i."scope"::text,
              i."severity"::text,
              i."status"::text,
              i."riskScore"::text,
              i."classifiedItems",
              i."ownerUserId"::text,
              i."slaDueAt",
              i."cooldownUntil",
              i."signalVersion",
              i."payload"::text,
              i."createdAt",
              i."updatedAt",
              i."resolvedAt",
              u."name",
              u."email",
              u."role"::text
            FROM "public"."Incident" i
            LEFT JOIN "public"."User" u ON u."id" = i."ownerUserId"
            WHERE i."id" = CAST(:incident_id AS UUID)
            LIMIT 1
          `,
          [sqlUuid("incident_id", input.incidentId)],
          { transactionId: tx }
        );

        const parsedUpdated = parseIncidentRow(withOwner.records?.[0], new Date());
        if (!parsedUpdated) {
          throw new Error("Failed to parse updated incident");
        }
        updated = parsedUpdated;
      }

      let createdNote: IncidentNoteRecord | null = null;
      if (hasNote && input.note) {
        const noteResponse = await this.rds.execute(
          `
            INSERT INTO "public"."IncidentNote"
              ("id", "incidentId", "authorUserId", "note", "createdAt")
            VALUES
              (CAST(:id AS UUID), CAST(:incident_id AS UUID), CAST(:author_user_id AS UUID), :note, NOW())
            RETURNING
              "id"::text,
              "incidentId"::text,
              "authorUserId"::text,
              "note",
              "createdAt"
          `,
          [
            sqlUuid("id", randomUUID()),
            sqlUuid("incident_id", input.incidentId),
            sqlUuid("author_user_id", input.actorUserId),
            sqlString("note", input.note)
          ],
          { transactionId: tx }
        );

        const parsed = parseInsertedIncidentNoteBase(noteResponse.records?.[0]);
        if (!parsed) {
          throw new Error("Failed to parse created incident note");
        }
        createdNote = parsed;
      }

      await this.appendAudit(
        {
          actorUserId: input.actorUserId,
          action: hasNote && !statusChanged && !ownerChanged ? "incident_note_added" : "incident_updated",
          resourceType: "Incident",
          resourceId: input.incidentId,
          requestId: input.requestId,
          before: {
            status: before.status,
            owner_user_id: before.ownerUserId,
            resolved_at: before.resolvedAt?.toISOString() ?? null
          },
          after: {
            status: updated.status,
            owner_user_id: updated.ownerUserId,
            resolved_at: updated.resolvedAt?.toISOString() ?? null,
            note: createdNote?.note ?? null
          }
        },
        tx
      );

      await this.rds.commitTransaction(tx);

      if (createdNote) {
        const hydratedNote = await this.rds.execute(
          `
            SELECT
              n."id"::text,
              n."incidentId"::text,
              n."authorUserId"::text,
              n."note",
              n."createdAt",
              u."name",
              u."email",
              u."role"::text
            FROM "public"."IncidentNote" n
            INNER JOIN "public"."User" u ON u."id" = n."authorUserId"
            WHERE n."id" = CAST(:id AS UUID)
            LIMIT 1
          `,
          [sqlUuid("id", createdNote.id)]
        );

        const parsed = parseIncidentNoteRow(hydratedNote.records?.[0]);
        if (parsed) {
          createdNote = parsed;
        }
      }

      return {
        incident: updated,
        note: createdNote
      };
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }

  private async createEvaluationRun(triggerType: EvaluationTriggerType): Promise<IncidentEvaluationRunRecord> {
    const response = await this.rds.execute(
      `
        INSERT INTO "public"."IncidentEvaluationRun"
          ("id", "triggerType", "status", "metrics", "errorMessage", "createdAt", "finishedAt")
        VALUES
          (CAST(:id AS UUID), CAST(:trigger_type AS "public"."TriggerType"), CAST('running' AS "public"."RunStatus"), CAST(:metrics AS JSONB), NULL, NOW(), NULL)
        RETURNING
          "id"::text,
          "triggerType"::text,
          "status"::text,
          "metrics"::text,
          "errorMessage",
          "createdAt",
          "finishedAt"
      `,
      [
        sqlUuid("id", randomUUID()),
        sqlString("trigger_type", triggerType),
        sqlJson("metrics", {
          stage: "running"
        })
      ]
    );

    const run = parseIncidentEvaluationRunRow(response.records?.[0]);
    if (!run) {
      throw new Error("Failed to create incident evaluation run");
    }

    return run;
  }

  private async finishEvaluationRun(runId: string, status: "completed" | "failed", metrics: Record<string, unknown>, error?: string) {
    await this.rds.execute(
      `
        UPDATE "public"."IncidentEvaluationRun"
        SET
          "status" = CAST(:status AS "public"."RunStatus"),
          "metrics" = CAST(:metrics AS JSONB),
          "errorMessage" = :error_message,
          "finishedAt" = NOW()
        WHERE "id" = CAST(:id AS UUID)
      `,
      [
        sqlString("status", status),
        sqlJson("metrics", metrics),
        sqlString("error_message", error ? error.slice(0, 1000) : null),
        sqlUuid("id", runId)
      ]
    );
  }

  private async getActiveIncident(scope: IncidentScope, transactionId: string): Promise<IncidentRecord | null> {
    const response = await this.rds.execute(
      `
        SELECT
          i."id"::text,
          i."scope"::text,
          i."severity"::text,
          i."status"::text,
          i."riskScore"::text,
          i."classifiedItems",
          i."ownerUserId"::text,
          i."slaDueAt",
          i."cooldownUntil",
          i."signalVersion",
          i."payload"::text,
          i."createdAt",
          i."updatedAt",
          i."resolvedAt",
          u."name",
          u."email",
          u."role"::text
        FROM "public"."Incident" i
        LEFT JOIN "public"."User" u ON u."id" = i."ownerUserId"
        WHERE
          i."scope" = CAST(:scope AS "public"."TermScope")
          AND i."status" IN (${ACTIVE_INCIDENT_STATUSES
            .map((_, index) => `CAST(:active_status_${index} AS \"public\".\"IncidentStatus\")`)
            .join(",")})
        ORDER BY i."updatedAt" DESC, i."id" DESC
        LIMIT 1
        FOR UPDATE
      `,
      [
        sqlString("scope", scope),
        ...ACTIVE_INCIDENT_STATUSES.map((status, index) => sqlString(`active_status_${index}`, status))
      ],
      { transactionId }
    );

    return parseIncidentRow(response.records?.[0], new Date());
  }

  private async insertIncident(signal: ScopeSignal, now: Date, cooldownMinutes: number, signalVersion: string, transactionId: string) {
    const response = await this.rds.execute(
      `
        INSERT INTO "public"."Incident"
          ("id", "scope", "severity", "status", "riskScore", "classifiedItems", "ownerUserId", "slaDueAt", "cooldownUntil", "signalVersion", "payload", "createdAt", "updatedAt", "resolvedAt")
        VALUES
          (
            CAST(:id AS UUID),
            CAST(:scope AS "public"."TermScope"),
            CAST(:severity AS "public"."IncidentSeverity"),
            CAST('open' AS "public"."IncidentStatus"),
            CAST(:risk_score AS DECIMAL(5,2)),
            :classified_items,
            NULL,
            :sla_due_at,
            :cooldown_until,
            :signal_version,
            CAST(:payload AS JSONB),
            NOW(),
            NOW(),
            NULL
          )
        RETURNING
          "id"::text,
          "scope"::text,
          "severity"::text,
          "status"::text,
          "riskScore"::text,
          "classifiedItems",
          "ownerUserId"::text,
          "slaDueAt",
          "cooldownUntil",
          "signalVersion",
          "payload"::text,
          "createdAt",
          "updatedAt",
          "resolvedAt"
      `,
      [
        sqlUuid("id", randomUUID()),
        sqlString("scope", signal.scope),
        sqlString("severity", signal.severity),
        sqlString("risk_score", toRiskScore(signal.riskWeighted).toFixed(2)),
        sqlLong("classified_items", signal.classifiedItems),
        sqlTimestamp("sla_due_at", addMinutes(now, toSlaMinutes(signal.severity))),
        sqlTimestamp("cooldown_until", addMinutes(now, cooldownMinutes)),
        sqlString("signal_version", signalVersion),
        sqlJson("payload", {
          scope: signal.scope,
          risk_ponderado: toRiskScore(signal.riskWeighted),
          classified_items: signal.classifiedItems,
          positivos: signal.positives,
          negativos: signal.negatives,
          neutrales: signal.neutrals,
          weighted_negative: toRiskScore(signal.negativeWeight),
          weighted_classified: toRiskScore(signal.classifiedWeight),
          unknown_sentiment_items: signal.unknownSentimentItems,
          formula_version: "alert-v1-weighted",
          window_days: 7,
          source_type: "news"
        })
      ],
      { transactionId }
    );

    const created = parseIncidentRow(response.records?.[0], now);
    if (!created) {
      throw new Error("Failed to parse created incident");
    }

    await this.appendAudit(
      {
        action: "incident_auto_created",
        resourceType: "Incident",
        resourceId: created.id,
        after: {
          scope: created.scope,
          severity: created.severity,
          status: created.status,
          risk_score: created.riskScore
        }
      },
      transactionId
    );

    return created;
  }

  private async escalateIncident(
    incident: IncidentRecord,
    signal: ScopeSignal,
    now: Date,
    cooldownMinutes: number,
    signalVersion: string,
    transactionId: string
  ): Promise<IncidentRecord> {
    const response = await this.rds.execute(
      `
        UPDATE "public"."Incident"
        SET
          "severity" = CAST(:severity AS "public"."IncidentSeverity"),
          "status" = CAST('open' AS "public"."IncidentStatus"),
          "riskScore" = CAST(:risk_score AS DECIMAL(5,2)),
          "classifiedItems" = :classified_items,
          "slaDueAt" = :sla_due_at,
          "cooldownUntil" = :cooldown_until,
          "signalVersion" = :signal_version,
          "payload" = CAST(:payload AS JSONB),
          "resolvedAt" = NULL,
          "updatedAt" = NOW()
        WHERE "id" = CAST(:id AS UUID)
        RETURNING
          "id"::text,
          "scope"::text,
          "severity"::text,
          "status"::text,
          "riskScore"::text,
          "classifiedItems",
          "ownerUserId"::text,
          "slaDueAt",
          "cooldownUntil",
          "signalVersion",
          "payload"::text,
          "createdAt",
          "updatedAt",
          "resolvedAt"
      `,
      [
        sqlString("severity", signal.severity),
        sqlString("risk_score", toRiskScore(signal.riskWeighted).toFixed(2)),
        sqlLong("classified_items", signal.classifiedItems),
        sqlTimestamp("sla_due_at", addMinutes(now, toSlaMinutes(signal.severity))),
        sqlTimestamp("cooldown_until", addMinutes(now, cooldownMinutes)),
        sqlString("signal_version", signalVersion),
        sqlJson("payload", {
          scope: signal.scope,
          risk_ponderado: toRiskScore(signal.riskWeighted),
          classified_items: signal.classifiedItems,
          positivos: signal.positives,
          negativos: signal.negatives,
          neutrales: signal.neutrals,
          weighted_negative: toRiskScore(signal.negativeWeight),
          weighted_classified: toRiskScore(signal.classifiedWeight),
          unknown_sentiment_items: signal.unknownSentimentItems,
          formula_version: "alert-v1-weighted",
          window_days: 7,
          source_type: "news"
        }),
        sqlUuid("id", incident.id)
      ],
      { transactionId }
    );

    const escalated = parseIncidentRow(response.records?.[0], now);
    if (!escalated) {
      throw new Error("Failed to parse escalated incident");
    }

    await this.appendAudit(
      {
        action: "incident_auto_escalated",
        resourceType: "Incident",
        resourceId: escalated.id,
        before: {
          severity: incident.severity,
          risk_score: incident.riskScore,
          status: incident.status
        },
        after: {
          severity: escalated.severity,
          risk_score: escalated.riskScore,
          status: escalated.status
        }
      },
      transactionId
    );

    return escalated;
  }

  private async refreshIncident(
    incident: IncidentRecord,
    signal: ScopeSignal,
    now: Date,
    cooldownMinutes: number,
    signalVersion: string,
    transactionId: string
  ): Promise<void> {
    await this.rds.execute(
      `
        UPDATE "public"."Incident"
        SET
          "riskScore" = CAST(:risk_score AS DECIMAL(5,2)),
          "classifiedItems" = :classified_items,
          "cooldownUntil" = :cooldown_until,
          "signalVersion" = :signal_version,
          "payload" = CAST(:payload AS JSONB),
          "updatedAt" = NOW()
        WHERE "id" = CAST(:id AS UUID)
      `,
      [
        sqlString("risk_score", toRiskScore(signal.riskWeighted).toFixed(2)),
        sqlLong("classified_items", signal.classifiedItems),
        sqlTimestamp("cooldown_until", addMinutes(now, cooldownMinutes)),
        sqlString("signal_version", signalVersion),
        sqlJson("payload", {
          scope: signal.scope,
          risk_ponderado: toRiskScore(signal.riskWeighted),
          classified_items: signal.classifiedItems,
          positivos: signal.positives,
          negativos: signal.negatives,
          neutrales: signal.neutrals,
          weighted_negative: toRiskScore(signal.negativeWeight),
          weighted_classified: toRiskScore(signal.classifiedWeight),
          unknown_sentiment_items: signal.unknownSentimentItems,
          formula_version: "alert-v1-weighted",
          window_days: 7,
          source_type: "news"
        }),
        sqlUuid("id", incident.id)
      ],
      { transactionId }
    );
  }

  private async buildScopeSignals(windowStart: Date): Promise<ScopeSignal[]> {
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
          ORDER BY c."isOverride" DESC, c."createdAt" DESC
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
      classifiedWeight: number;
      negativeWeight: number;
      classifiedItems: number;
      negatives: number;
      positives: number;
      neutrals: number;
      unknownSentimentItems: number;
    };

    const accumulators: Record<IncidentScope, ScopeAccumulator> = {
      claro: {
        classifiedWeight: 0,
        negativeWeight: 0,
        classifiedItems: 0,
        negatives: 0,
        positives: 0,
        neutrals: 0,
        unknownSentimentItems: 0
      },
      competencia: {
        classifiedWeight: 0,
        negativeWeight: 0,
        classifiedItems: 0,
        negatives: 0,
        positives: 0,
        neutrals: 0,
        unknownSentimentItems: 0
      }
    };

    for (const row of response.records ?? []) {
      const scope = fieldString(row, 0) as IncidentScope | null;
      if (!scope || !INCIDENT_SCOPES.includes(scope)) continue;

      const sentimiento = (fieldString(row, 1) ?? "").trim().toLowerCase();
      const sourceScore = parseDecimal(fieldString(row, 2));
      const weight = Number.isFinite(sourceScore) ? sourceScore : 0.5;
      const bucket = accumulators[scope];

      if (sentimiento === "positive" || sentimiento === "positivo") {
        bucket.classifiedItems += 1;
        bucket.classifiedWeight += weight;
        bucket.positives += 1;
      } else if (sentimiento === "negative" || sentimiento === "negativo") {
        bucket.classifiedItems += 1;
        bucket.classifiedWeight += weight;
        bucket.negativeWeight += weight;
        bucket.negatives += 1;
      } else if (sentimiento === "neutral" || sentimiento === "neutro") {
        bucket.classifiedItems += 1;
        bucket.classifiedWeight += weight;
        bucket.neutrals += 1;
      } else if (sentimiento) {
        bucket.unknownSentimentItems += 1;
      }
    }

    return INCIDENT_SCOPES.map((scope) => {
      const bucket = accumulators[scope];
      const denominator = Math.max(bucket.classifiedWeight, 0.0001);
      const riskWeighted = (bucket.negativeWeight / denominator) * 100;
      const severity = toSeverity(riskWeighted);

      return {
        scope,
        riskWeighted: toRiskScore(riskWeighted),
        severity,
        classifiedItems: bucket.classifiedItems,
        negatives: bucket.negatives,
        positives: bucket.positives,
        neutrals: bucket.neutrals,
        classifiedWeight: toRiskScore(bucket.classifiedWeight),
        negativeWeight: toRiskScore(bucket.negativeWeight),
        unknownSentimentItems: bucket.unknownSentimentItems
      };
    });
  }

  async evaluateIncidents(input: IncidentEvaluationInput): Promise<IncidentEvaluationResult> {
    const run = await this.createEvaluationRun(input.triggerType);

    const cooldownMinutes = Math.max(1, Math.min(24 * 60, Math.floor(input.cooldownMinutes)));
    const now = new Date();
    const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const created: IncidentRecord[] = [];
    const escalated: IncidentRecord[] = [];
    let deduped = 0;
    let skippedSev4 = 0;

    try {
      const signals = await this.buildScopeSignals(windowStart);
      const tx = await this.rds.beginTransaction();

      try {
        for (const signal of signals) {
          if (signal.severity === "SEV4" || signal.classifiedItems === 0) {
            skippedSev4 += 1;
            continue;
          }

          const activeIncident = await this.getActiveIncident(signal.scope, tx);

          if (!activeIncident) {
            const inserted = await this.insertIncident(signal, now, cooldownMinutes, input.signalVersion, tx);
            created.push(inserted);
            continue;
          }

          const severityRank = severityToRank(signal.severity);
          const activeRank = severityToRank(activeIncident.severity);

          if (severityRank < activeRank) {
            const updated = await this.escalateIncident(activeIncident, signal, now, cooldownMinutes, input.signalVersion, tx);
            escalated.push(updated);
            continue;
          }

          if (signal.severity === activeIncident.severity && activeIncident.cooldownUntil.getTime() > now.getTime()) {
            deduped += 1;
            continue;
          }

          await this.refreshIncident(activeIncident, signal, now, cooldownMinutes, input.signalVersion, tx);
        }

        await this.rds.commitTransaction(tx);
      } catch (error) {
        await this.rds.rollbackTransaction(tx).catch(() => undefined);
        throw error;
      }

      const metrics = {
        window_days: 7,
        source_type: "news",
        signal_version: input.signalVersion,
        cooldown_minutes: cooldownMinutes,
        created_count: created.length,
        escalated_count: escalated.length,
        deduped_count: deduped,
        skipped_sev4_count: skippedSev4,
        scopes: signals
      };

      await this.finishEvaluationRun(run.id, "completed", metrics);

      const completedRunResponse = await this.rds.execute(
        `
          SELECT
            "id"::text,
            "triggerType"::text,
            "status"::text,
            "metrics"::text,
            "errorMessage",
            "createdAt",
            "finishedAt"
          FROM "public"."IncidentEvaluationRun"
          WHERE "id" = CAST(:id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("id", run.id)]
      );

      const completedRun = parseIncidentEvaluationRunRow(completedRunResponse.records?.[0]) ?? {
        ...run,
        status: "completed" as const,
        metrics,
        finishedAt: new Date(),
        errorMessage: null
      };

      return {
        run: completedRun,
        created,
        escalated,
        deduped,
        skippedSev4,
        scopes: signals
      };
    } catch (error) {
      await this.finishEvaluationRun(
        run.id,
        "failed",
        {
          signal_version: input.signalVersion,
          cooldown_minutes: cooldownMinutes,
          created_count: created.length,
          escalated_count: escalated.length,
          deduped_count: deduped,
          skipped_sev4_count: skippedSev4
        },
        (error as Error).message
      );
      throw error;
    }
  }
}

export const createIncidentStore = (): IncidentStore | null => {
  const client = RdsDataClient.fromEnv();
  if (!client) return null;
  return new IncidentStore(client);
};

export type {
  AddIncidentNoteInput,
  IncidentEvaluationInput,
  IncidentEvaluationResult,
  IncidentEvaluationRunRecord,
  IncidentListFilters,
  IncidentNoteRecord,
  IncidentPage,
  IncidentPatchInput,
  IncidentRecord,
  IncidentScope,
  IncidentSeverity,
  IncidentStatus,
  PatchIncidentResult
};
