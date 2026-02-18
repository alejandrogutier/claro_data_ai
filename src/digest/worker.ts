import AWS from "aws-sdk";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import { createAppStore, type ContentRecord, type MonitorOverviewRecord } from "../data/appStore";
import { createDigestStore } from "../data/digestStore";
import { createIncidentStore, type IncidentRecord } from "../data/incidentStore";
import { createNotificationRecipientStore } from "../data/notificationRecipientStore";
import { normalizeRecipients, resolveRecipientsForDelivery } from "../email/sesDelivery";

const ACTIVE_INCIDENT_STATUSES = new Set(["open", "acknowledged", "in_progress"]);

const sesv2 = new AWS.SESV2({ region: env.awsRegion });
const s3 = new AWS.S3({ region: env.awsRegion });

type DigestTriggerType = "manual" | "scheduled";

type DigestWorkerEvent = {
  trigger_type?: DigestTriggerType;
  recipient_scope?: string;
  request_id?: string;
  requested_at?: string;
};

type DigestWorkerResponse = {
  status: "completed" | "skipped" | "failed";
  run_id: string | null;
  digest_date: string;
  timezone: string;
  recipient_scope: string;
  email_sent: boolean;
  recipients_count: number;
  s3_key: string | null;
  request_id: string;
  error_message?: string;
};

const parseEvent = (event: unknown): DigestWorkerEvent => {
  if (!event || typeof event !== "object" || Array.isArray(event)) return {};
  return event as DigestWorkerEvent;
};

const parseRecipientsCsv = (raw?: string): string[] => {
  if (!raw) return [];
  return normalizeRecipients(raw.split(","));
};

const toLocalParts = (
  date: Date,
  timezone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";

  const year = Number.parseInt(pick("year"), 10);
  const month = Number.parseInt(pick("month"), 10);
  const day = Number.parseInt(pick("day"), 10);
  const hour = Number.parseInt(pick("hour"), 10);
  const minute = Number.parseInt(pick("minute"), 10);
  const second = Number.parseInt(pick("second"), 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    throw new Error(`digest_timezone_parse_failed:${timezone}`);
  }

  return { year, month, day, hour, minute, second };
};

const localToUtcDate = (timezone: string, year: number, month: number, day: number, hour: number, minute: number, second = 0): Date => {
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 4; i += 1) {
    const local = toLocalParts(new Date(utcMillis), timezone);
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    const current = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const diff = desired - current;
    if (Math.abs(diff) < 1000) break;
    utcMillis += diff;
  }

  return new Date(utcMillis);
};

const buildDigestKey = (recipientScope: string, runId: string, local: { year: number; month: number; day: number }): string => {
  const m = String(local.month).padStart(2, "0");
  const d = String(local.day).padStart(2, "0");
  return `digests/${local.year}/${m}/${d}/${recipientScope}-${runId}.json`;
};

const buildEmailBody = (input: {
  digestDate: string;
  timezone: string;
  runId: string;
  monitor: MonitorOverviewRecord;
  activeIncidents: IncidentRecord[];
  topContent: ContentRecord[];
  s3Key: string | null;
}): string => {
  const lines: string[] = [];
  lines.push("Digest diario Claro Data");
  lines.push(`Fecha: ${input.digestDate} (${input.timezone})`);
  lines.push(`Corrida: ${input.runId}`);
  if (input.s3Key) {
    lines.push(`Snapshot: ${input.s3Key}`);
  }
  lines.push("");

  lines.push("KPIs (ventana 7 dias):");
  lines.push(`- BHS: ${input.monitor.totals.bhs.toFixed(2)}`);
  lines.push(`- Riesgo activo: ${input.monitor.totals.riesgoActivo.toFixed(2)} | Severidad: ${input.monitor.totals.severidad}`);
  lines.push(`- SOV Claro: ${input.monitor.totals.sovClaro.toFixed(2)} | SOV Competencia: ${input.monitor.totals.sovCompetencia.toFixed(2)}`);
  lines.push(`- Sentimiento neto: ${input.monitor.totals.sentimientoNeto.toFixed(2)}`);
  lines.push("");

  lines.push(`Incidentes activos: ${input.activeIncidents.length}`);
  for (const incident of input.activeIncidents.slice(0, 10)) {
    lines.push(`- ${incident.severity} | scope=${incident.scope} | riesgo=${incident.riskScore.toFixed(2)} | SLA=${incident.slaDueAt.toISOString()}`);
  }
  lines.push("");

  lines.push("Top contenido (ultimas 24h):");
  for (const item of input.topContent.slice(0, 10)) {
    const title = (item.title || "").trim() || "(sin titulo)";
    const source = [item.provider, item.sourceName].filter((value) => value && value.trim()).join("/");
    const when = (item.publishedAt ?? item.createdAt).toISOString();
    const url = item.canonicalUrl || "";
    lines.push(`- ${title} | ${source} | ${when}${url ? ` | ${url}` : ""}`);
  }
  lines.push("");

  lines.push("Dashboard: /app/monitor/overview");
  lines.push("Incidentes: /app/monitor/incidents");

  return lines.join("\n");
};

export const main = async (event: unknown): Promise<DigestWorkerResponse> => {
  const now = new Date();
  const payload = parseEvent(event);
  const requestId =
    typeof payload.request_id === "string" && payload.request_id.trim() ? payload.request_id.trim() : `digest-${randomUUID()}`;
  const requestedAt =
    typeof payload.requested_at === "string" && payload.requested_at.trim() ? payload.requested_at.trim() : now.toISOString();
  const triggerType: DigestTriggerType = payload.trigger_type === "manual" ? "manual" : "scheduled";
  const recipientScope = (payload.recipient_scope ?? "ops").trim().toLowerCase() || "ops";
  const timezone = env.reportDefaultTimezone ?? "America/Bogota";

  const localNow = toLocalParts(now, timezone);
  const digestDate = `${localNow.year}-${String(localNow.month).padStart(2, "0")}-${String(localNow.day).padStart(2, "0")}`;
  const digestDateKeyUtc = localToUtcDate(timezone, localNow.year, localNow.month, localNow.day, 0, 0, 0);

  const digestStore = createDigestStore();
  const appStore = createAppStore();
  const incidentStore = createIncidentStore();
  const recipientStore = createNotificationRecipientStore();

  if (!digestStore || !appStore || !incidentStore || !recipientStore) {
    return {
      status: "failed",
      run_id: null,
      digest_date: digestDate,
      timezone,
      recipient_scope: recipientScope,
      email_sent: false,
      recipients_count: 0,
      s3_key: null,
      request_id: requestId,
      error_message: "Database runtime is not configured"
    };
  }

  const claimed = await digestStore.claimDigestRun(digestDateKeyUtc, recipientScope);
  if (!claimed) {
    console.log(
      JSON.stringify({
        level: "info",
        message: "digest_run_skipped",
        digest_date: digestDate,
        recipient_scope: recipientScope,
        timezone,
        trigger_type: triggerType,
        requested_at: requestedAt,
        request_id: requestId
      })
    );

    return {
      status: "skipped",
      run_id: null,
      digest_date: digestDate,
      timezone,
      recipient_scope: recipientScope,
      email_sent: false,
      recipients_count: 0,
      s3_key: null,
      request_id: requestId
    };
  }

  let s3Key: string | null = null;
  let emailSent = false;
  let recipientsCount = 0;

  try {
    const windowEnd = now;
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

    const [monitor, incidentsPage, topContentPage] = await Promise.all([
      appStore.getMonitorOverview(),
      incidentStore.listIncidents(100, {}, undefined),
      appStore.listContent(12, { state: "active", from: windowStart, to: windowEnd }, undefined)
    ]);

    const activeIncidents = incidentsPage.items.filter((item) => ACTIVE_INCIDENT_STATUSES.has(item.status));
    const topContent = topContentPage.items;

    const digestPayload = {
      run_id: claimed.id,
      digest_date: digestDate,
      timezone,
      recipient_scope: recipientScope,
      trigger_type: triggerType,
      request_id: requestId,
      requested_at: requestedAt,
      generated_at: now.toISOString(),
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      monitor,
      active_incidents: activeIncidents,
      top_content: topContent
    };

    if (env.exportBucketName) {
      s3Key = buildDigestKey(recipientScope, claimed.id, localNow);
      await s3
        .putObject({
          Bucket: env.exportBucketName,
          Key: s3Key,
          Body: JSON.stringify(digestPayload, null, 2),
          ContentType: "application/json; charset=utf-8"
        })
        .promise();
    } else {
      console.warn("digest_snapshot_skipped_missing_export_bucket", { run_id: claimed.id });
    }

    const sender = env.reportEmailSender || env.alertEmailSender;
    let rawRecipients = await recipientStore.listActiveEmails("digest", recipientScope);

    if (rawRecipients.length === 0) {
      console.info("digest_email_skipped_no_recipients_db", { run_id: claimed.id, recipient_scope: recipientScope });
      const fallback = parseRecipientsCsv(env.alertEmailRecipients);
      if (fallback.length > 0) {
        console.warn("digest_email_recipients_fallback_env_deprecated", { run_id: claimed.id, candidate_count: fallback.length });
        rawRecipients = fallback;
      }
    }

    const resolved = await resolveRecipientsForDelivery(rawRecipients);
    const deliverableRecipients = resolved.recipients;
    recipientsCount = deliverableRecipients.length;

    if (!sender) {
      console.warn("digest_email_skipped_missing_sender", { run_id: claimed.id });
    } else if (deliverableRecipients.length === 0) {
      console.info("digest_email_skipped_no_deliverable_recipients", {
        run_id: claimed.id,
        recipient_scope: recipientScope,
        is_sandbox: resolved.isSandbox,
        candidate_count: rawRecipients.length
      });
    } else {
      const subject = `[Claro Data] Digest diario ${digestDate}`;
      const body = buildEmailBody({
        digestDate,
        timezone,
        runId: claimed.id,
        monitor,
        activeIncidents,
        topContent,
        s3Key
      });

      try {
        await sesv2
          .sendEmail({
            FromEmailAddress: sender,
            Destination: {
              ToAddresses: deliverableRecipients
            },
            Content: {
              Simple: {
                Subject: {
                  Data: subject,
                  Charset: "UTF-8"
                },
                Body: {
                  Text: {
                    Data: body,
                    Charset: "UTF-8"
                  }
                }
              }
            }
          })
          .promise();
        emailSent = true;
      } catch (error) {
        console.error("digest_email_send_failed", {
          run_id: claimed.id,
          message: (error as Error).message,
          recipients_count: deliverableRecipients.length
        });
      }
    }

    await digestStore.completeDigestRun(claimed.id, recipientsCount, s3Key);

    console.log(
      JSON.stringify({
        level: "info",
        message: "digest_run_completed",
        run_id: claimed.id,
        digest_date: digestDate,
        recipient_scope: recipientScope,
        timezone,
        trigger_type: triggerType,
        email_sent: emailSent,
        recipients_count: recipientsCount,
        s3_key: s3Key,
        requested_at: requestedAt,
        request_id: requestId
      })
    );

    return {
      status: "completed",
      run_id: claimed.id,
      digest_date: digestDate,
      timezone,
      recipient_scope: recipientScope,
      email_sent: emailSent,
      recipients_count: recipientsCount,
      s3_key: s3Key,
      request_id: requestId
    };
  } catch (error) {
    await digestStore.failDigestRun(claimed.id);
    console.error("digest_run_failed", { run_id: claimed.id, message: (error as Error).message });
    return {
      status: "failed",
      run_id: claimed.id,
      digest_date: digestDate,
      timezone,
      recipient_scope: recipientScope,
      email_sent: emailSent,
      recipients_count: recipientsCount,
      s3_key: s3Key,
      request_id: requestId,
      error_message: (error as Error).message
    };
  }
};
