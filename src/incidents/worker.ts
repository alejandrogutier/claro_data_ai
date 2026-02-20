import AWS from "aws-sdk";
import type { SQSEvent } from "aws-lambda";
import { env } from "../config/env";
import { createIncidentStore, type IncidentRecord } from "../data/incidentStore";
import { createNotificationRecipientStore } from "../data/notificationRecipientStore";
import { normalizeRecipients, resolveRecipientsForDelivery } from "../email/sesDelivery";

type IncidentEvaluationMessage = {
  trigger_type?: "scheduled" | "manual";
  requested_at?: string;
  request_id?: string;
  actor_user_id?: string;
};

const sesv2 = new AWS.SESV2({ region: env.awsRegion });

const parseMessage = (body: string): IncidentEvaluationMessage => {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as IncidentEvaluationMessage;
  } catch {
    return {};
  }
};

const parseRecipients = (raw?: string): string[] => {
  if (!raw) return [];
  return normalizeRecipients(raw.split(","));
};

const incidentToLine = (incident: IncidentRecord): string =>
  `- ${incident.severity} | scope=${incident.scope} | riesgo=${incident.riskScore.toFixed(2)} | SLA=${incident.slaDueAt.toISOString()}`;

const sendIncidentNotification = async (created: IncidentRecord[], escalated: IncidentRecord[]) => {
  const sender = env.alertEmailSender;
  if (!sender) {
    console.warn("incident_email_skipped_missing_sender");
    return;
  }

  const recipientStore = createNotificationRecipientStore();
  if (!recipientStore) {
    console.warn("incident_email_skipped_missing_db");
    return;
  }

  let rawRecipients = await recipientStore.listActiveEmails("incident", "ops");
  if (rawRecipients.length === 0) {
    console.info("incident_email_skipped_no_recipients_db");
    const fallback = parseRecipients(env.alertEmailRecipients);
    if (fallback.length > 0) {
      console.warn("incident_email_recipients_fallback_env_deprecated", { candidate_count: fallback.length });
      rawRecipients = fallback;
    }
  }

  const resolved = await resolveRecipientsForDelivery(rawRecipients);
  const deliverableRecipients = resolved.recipients;

  if (deliverableRecipients.length === 0) {
    console.info("incident_email_skipped_no_deliverable_recipients", {
      is_sandbox: resolved.isSandbox,
      candidate_count: rawRecipients.length
    });
    return;
  }

  const lines: string[] = [];
  if (created.length > 0) {
    lines.push("Incidentes nuevos:");
    lines.push(...created.map(incidentToLine));
    lines.push("");
  }

  if (escalated.length > 0) {
    lines.push("Incidentes escalados:");
    lines.push(...escalated.map(incidentToLine));
    lines.push("");
  }

  if (lines.length === 0) return;

  lines.push("Detalle operativo disponible en /app/monitor/incidents");

  const subject = `[Claro Data] Incidentes nuevos/escalados (${created.length + escalated.length})`;
  const body = lines.join("\n").trim();

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
  } catch (error) {
    console.error("incident_email_send_failed", {
      message: (error as Error).message,
      recipients_count: deliverableRecipients.length
    });
  }
};

const processRecord = async (recordBody: string) => {
  const store = createIncidentStore();
  if (!store) {
    throw new Error("Database runtime is not configured");
  }

  const payload = parseMessage(recordBody);
  const triggerType = payload.trigger_type === "manual" ? "manual" : "scheduled";

  const evaluation = await store.evaluateIncidents({
    triggerType,
    cooldownMinutes: env.alertCooldownMinutes ?? 60,
    signalVersion: env.alertSignalVersion ?? "alert-v1-weighted"
  });

  if (evaluation.created.length > 0 || evaluation.escalated.length > 0) {
    await sendIncidentNotification(evaluation.created, evaluation.escalated);
  }

  console.log(
    JSON.stringify({
      level: "info",
      message: "incident_evaluation_processed",
      trigger_type: triggerType,
      run_id: evaluation.run.id,
      created_count: evaluation.created.length,
      escalated_count: evaluation.escalated.length,
      deduped_count: evaluation.deduped,
      skipped_sev4_count: evaluation.skippedSev4,
      request_id: payload.request_id ?? null,
      requested_at: payload.requested_at ?? null,
      actor_user_id: payload.actor_user_id ?? null
    })
  );
};

export const main = async (event: SQSEvent) => {
  for (const record of event.Records) {
    await processRecord(record.body);
  }
};
