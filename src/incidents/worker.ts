import AWS from "aws-sdk";
import type { SQSEvent } from "aws-lambda";
import { env } from "../config/env";
import { createIncidentStore, type IncidentRecord } from "../data/incidentStore";

type IncidentEvaluationMessage = {
  trigger_type?: "scheduled" | "manual";
  requested_at?: string;
  request_id?: string;
  actor_user_id?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const values = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0 && EMAIL_REGEX.test(value));
  return [...new Set(values)];
};

const getDomainIdentity = (email: string): string | null => {
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[1]) return null;
  return parts[1].toLowerCase();
};

const isIdentityVerified = async (identity: string): Promise<boolean> => {
  try {
    const response = await sesv2
      .getEmailIdentity({
        EmailIdentity: identity
      })
      .promise();

    return response.VerifiedForSendingStatus === true;
  } catch {
    return false;
  }
};

const resolveVerifiedRecipients = async (recipients: string[]): Promise<string[]> => {
  const verified: string[] = [];

  for (const recipient of recipients) {
    const exactVerified = await isIdentityVerified(recipient);
    if (exactVerified) {
      verified.push(recipient);
      continue;
    }

    const domain = getDomainIdentity(recipient);
    if (!domain) continue;

    const domainVerified = await isIdentityVerified(domain);
    if (domainVerified) {
      verified.push(recipient);
    }
  }

  return verified;
};

const incidentToLine = (incident: IncidentRecord): string =>
  `- ${incident.severity} | scope=${incident.scope} | riesgo=${incident.riskScore.toFixed(2)} | SLA=${incident.slaDueAt.toISOString()}`;

const sendIncidentNotification = async (created: IncidentRecord[], escalated: IncidentRecord[]) => {
  const sender = env.alertEmailSender;
  if (!sender) {
    console.warn("incident_email_skipped_missing_sender");
    return;
  }

  const recipients = parseRecipients(env.alertEmailRecipients);
  if (recipients.length === 0) {
    console.info("incident_email_skipped_no_recipients");
    return;
  }

  const verifiedRecipients = await resolveVerifiedRecipients(recipients);
  if (verifiedRecipients.length === 0) {
    console.info("incident_email_skipped_no_verified_recipients", {
      recipients
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
          ToAddresses: verifiedRecipients
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
      recipients: verifiedRecipients
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
