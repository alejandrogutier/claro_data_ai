import AWS from "aws-sdk";
import type { SQSEvent } from "aws-lambda";
import { env } from "../config/env";
import { createAppStore, type ContentFilters } from "../data/appStore";
import { createIncidentStore } from "../data/incidentStore";
import { createReportStore, type ReportRunDetail } from "../data/reportStore";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_INCIDENT_STATUSES = new Set(["open", "acknowledged", "in_progress"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sqs = new AWS.SQS({ region: env.awsRegion });
const sesv2 = new AWS.SESV2({ region: env.awsRegion });

type ReportRunMessage = {
  report_run_id?: string;
  request_id?: string;
  requested_by_user_id?: string | null;
};

type NarrativeInput = {
  detail: ReportRunDetail;
  confidence: number;
  threshold: number;
  monitor: Awaited<ReturnType<NonNullable<ReturnType<typeof createAppStore>>["getMonitorOverview"]>>;
  activeIncidents: Awaited<ReturnType<NonNullable<ReturnType<typeof createIncidentStore>>["listIncidents"]>>["items"];
  topContent: Awaited<ReturnType<NonNullable<ReturnType<typeof createAppStore>>["listContent"]>>["items"];
};

const identityCache = new Map<string, boolean>();

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const parseMessage = (body: string): ReportRunMessage => {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ReportRunMessage;
  } catch {
    return {};
  }
};

const toContentFilters = (detail: ReportRunDetail): ContentFilters => {
  const templateFilters = detail.template.filters ?? {};
  const filters: ContentFilters = {
    state: "active",
    sourceType: "news",
    from: detail.run.windowStart,
    to: detail.run.windowEnd
  };

  if (typeof templateFilters.provider === "string" && templateFilters.provider.trim()) {
    filters.provider = templateFilters.provider.trim();
  }
  if (typeof templateFilters.category === "string" && templateFilters.category.trim()) {
    filters.category = templateFilters.category.trim();
  }
  if (typeof templateFilters.sentimiento === "string" && templateFilters.sentimiento.trim()) {
    filters.sentimiento = templateFilters.sentimiento.trim();
  }
  if (typeof templateFilters.term_id === "string" && UUID_REGEX.test(templateFilters.term_id)) {
    filters.termId = templateFilters.term_id;
  }
  if (typeof templateFilters.q === "string" && templateFilters.q.trim()) {
    filters.query = templateFilters.q.trim();
  }

  return filters;
};

const toExportFilters = (detail: ReportRunDetail): Record<string, unknown> => {
  const templateFilters = detail.template.filters ?? {};
  const exportFilters: Record<string, unknown> = {
    source_type: "news",
    state: "active",
    from: detail.run.windowStart.toISOString(),
    to: detail.run.windowEnd.toISOString()
  };

  for (const key of ["provider", "category", "sentimiento", "term_id", "q"]) {
    const value = templateFilters[key];
    if (typeof value === "string" && value.trim().length > 0) {
      exportFilters[key] = value.trim();
    }
  }

  return exportFilters;
};

const computeConfidence = (
  monitor: Awaited<ReturnType<NonNullable<ReturnType<typeof createAppStore>>["getMonitorOverview"]>>,
  activeIncidentCount: number,
  topContentCount: number
): number => {
  const coverage = clamp(monitor.totals.classifiedItems / 120, 0, 1);
  const volume = clamp(monitor.totals.items / 180, 0, 1);
  const bhsQuality = clamp(monitor.totals.bhs / 100, 0, 1);
  const lowRisk = 1 - clamp(monitor.totals.riesgoActivo / 100, 0, 1);
  const incidentPenalty = clamp(activeIncidentCount / 6, 0, 1);
  const contentSignal = clamp(topContentCount / 8, 0, 1);

  const value = 0.2 + coverage * 0.25 + volume * 0.2 + bhsQuality * 0.2 + lowRisk * 0.1 + contentSignal * 0.1 - incidentPenalty * 0.15;
  return clamp(Math.round(value * 1000) / 1000, 0, 1);
};

const buildRecommendations = (input: NarrativeInput): string[] => {
  const recommendations: string[] = [];

  if (input.monitor.totals.riesgoActivo >= 60) {
    recommendations.push("Activar plan de contencion reputacional para riesgo alto en noticias de la ventana actual.");
  }

  if (input.monitor.totals.sovClaro < 50) {
    recommendations.push("Incrementar cobertura de mensajes de marca para recuperar share of voice frente a competencia.");
  }

  if (input.activeIncidents.length > 0) {
    recommendations.push("Priorizar triage de incidentes abiertos y cerrar owners con SLA en el tablero de monitoreo.");
  }

  if (input.topContent.length === 0) {
    recommendations.push("Revisar terminos y conectores activos para evitar perdida de senal de contenido en reportes.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Mantener operacion actual y monitorear tendencia semanal de BHS y riesgo activo.");
    recommendations.push("Ejecutar revision editorial de top notas para validar consistencia del tono clasificado.");
  }

  return recommendations.slice(0, 6);
};

const buildSummary = (input: NarrativeInput): Record<string, unknown> => {
  const topHeadlines = input.topContent.slice(0, 5).map((item) => ({
    id: item.id,
    provider: item.provider,
    title: item.title,
    published_at: item.publishedAt?.toISOString() ?? item.createdAt.toISOString(),
    sentiment: item.sentimiento ?? null,
    category: item.category ?? null,
    source_score: item.sourceScore
  }));

  return {
    generated_at: new Date().toISOString(),
    formula_version: "report-v1-deterministic",
    confidence: input.confidence,
    confidence_threshold: input.threshold,
    status_preview: input.confidence < input.threshold ? "pending_review" : "completed",
    window: {
      start: input.detail.run.windowStart.toISOString(),
      end: input.detail.run.windowEnd.toISOString(),
      source_type: input.detail.run.sourceType
    },
    kpis: {
      items: input.monitor.totals.items,
      classified_items: input.monitor.totals.classifiedItems,
      bhs: input.monitor.totals.bhs,
      sentimiento_neto: input.monitor.totals.sentimientoNeto,
      riesgo_activo: input.monitor.totals.riesgoActivo,
      severidad: input.monitor.totals.severidad,
      sov_claro: input.monitor.totals.sovClaro,
      sov_competencia: input.monitor.totals.sovCompetencia,
      insufficient_data: input.monitor.totals.insufficientData
    },
    by_scope: {
      claro: input.monitor.byScope.claro,
      competencia: input.monitor.byScope.competencia
    },
    incidents: {
      active_count: input.activeIncidents.length,
      top: input.activeIncidents.slice(0, 5).map((incident) => ({
        id: incident.id,
        scope: incident.scope,
        severity: incident.severity,
        status: incident.status,
        risk_score: incident.riskScore,
        sla_due_at: incident.slaDueAt.toISOString()
      }))
    },
    content: {
      top_headlines: topHeadlines
    }
  };
};

const getDomainIdentity = (email: string): string | null => {
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[1]) return null;
  return parts[1].toLowerCase();
};

const isIdentityVerified = async (identity: string): Promise<boolean> => {
  if (identityCache.has(identity)) {
    return identityCache.get(identity) ?? false;
  }

  try {
    const response = await sesv2
      .getEmailIdentity({
        EmailIdentity: identity
      })
      .promise();

    const verified = response.VerifiedForSendingStatus === true;
    identityCache.set(identity, verified);
    return verified;
  } catch {
    identityCache.set(identity, false);
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

  return [...new Set(verified)];
};

const sendReportEmail = async (
  detail: ReportRunDetail,
  confidence: number,
  recommendations: string[],
  monitor: NarrativeInput["monitor"]
): Promise<void> => {
  if (!detail.schedule || !detail.schedule.enabled || detail.schedule.recipients.length === 0) {
    return;
  }

  const sender = env.reportEmailSender || env.alertEmailSender;
  if (!sender) {
    console.warn("report_email_skipped_missing_sender", { report_run_id: detail.run.id });
    return;
  }

  const candidateRecipients = detail.schedule.recipients
    .map((value) => value.trim().toLowerCase())
    .filter((value) => EMAIL_REGEX.test(value));

  if (candidateRecipients.length === 0) {
    console.info("report_email_skipped_no_recipients", { report_run_id: detail.run.id });
    return;
  }

  const verifiedRecipients = await resolveVerifiedRecipients(candidateRecipients);
  if (verifiedRecipients.length === 0) {
    console.info("report_email_skipped_no_verified_recipients", {
      report_run_id: detail.run.id,
      recipients: candidateRecipients
    });
    return;
  }

  const subject = `[Claro Data] Reporte ${detail.template.name} (${detail.run.id})`;
  const lines = [
    `Plantilla: ${detail.template.name}`,
    `Corrida: ${detail.run.id}`,
    `Ventana: ${detail.run.windowStart.toISOString()} -> ${detail.run.windowEnd.toISOString()}`,
    `Confianza: ${(confidence * 100).toFixed(1)}%`,
    `BHS: ${monitor.totals.bhs.toFixed(2)} | Riesgo activo: ${monitor.totals.riesgoActivo.toFixed(2)} | SOV Claro: ${monitor.totals.sovClaro.toFixed(2)}`,
    "",
    "Recomendaciones:",
    ...recommendations.map((item) => `- ${item}`),
    "",
    "Consulta el detalle en /app/reports/center"
  ];

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
                Data: lines.join("\n"),
                Charset: "UTF-8"
              }
            }
          }
        }
      })
      .promise();
  } catch (error) {
    console.error("report_email_send_failed", {
      report_run_id: detail.run.id,
      message: (error as Error).message,
      recipients: verifiedRecipients
    });
  }
};

const processReportRun = async (reportRunId: string) => {
  const reportStore = createReportStore();
  const appStore = createAppStore();
  const incidentStore = createIncidentStore();

  if (!reportStore || !appStore || !incidentStore) {
    throw new Error("Database runtime is not configured");
  }

  if (!env.exportQueueUrl) {
    throw new Error("Missing EXPORT_QUEUE_URL");
  }

  const claimed = await reportStore.claimReportRun(reportRunId);
  if (!claimed) {
    return;
  }

  const detail = await reportStore.getReportRun(reportRunId);
  if (!detail) {
    await reportStore.failReportRun(reportRunId, "report_run_not_found_after_claim");
    return;
  }

  try {
    const contentFilters = toContentFilters(detail);
    const [monitor, incidentsPage, topContentPage] = await Promise.all([
      appStore.getMonitorOverview(),
      incidentStore.listIncidents(120, {}, undefined),
      appStore.listContent(12, contentFilters)
    ]);

    const activeIncidents = incidentsPage.items.filter((item) => ACTIVE_INCIDENT_STATUSES.has(item.status));
    const topContent = topContentPage.items;

    const fallbackThreshold = env.reportConfidenceThreshold ?? 0.65;
    const threshold = detail.template.confidenceThreshold > 0 ? detail.template.confidenceThreshold : fallbackThreshold;
    const confidence = computeConfidence(monitor, activeIncidents.length, topContent.length);

    const narrativeInput: NarrativeInput = {
      detail,
      confidence,
      threshold,
      monitor,
      activeIncidents,
      topContent
    };

    const summary = buildSummary(narrativeInput);
    const recommendations = buildRecommendations(narrativeInput);

    const exportJob = await appStore.createExportJob({
      requestedByUserId: detail.run.requestedByUserId,
      filters: toExportFilters(detail)
    });

    await sqs
      .sendMessage({
        QueueUrl: env.exportQueueUrl,
        MessageBody: JSON.stringify({
          export_id: exportJob.id,
          report_run_id: detail.run.id,
          requested_at: new Date().toISOString()
        })
      })
      .promise();

    const status = confidence < threshold ? "pending_review" : "completed";
    const blockedReason = status === "pending_review" ? "confidence_below_threshold" : null;

    await reportStore.completeReportRun({
      reportRunId: detail.run.id,
      status,
      confidence,
      summary,
      recommendations,
      blockedReason,
      exportJobId: exportJob.id
    });

    if (status === "completed") {
      await sendReportEmail(detail, confidence, recommendations, monitor);
    }

    console.log(
      JSON.stringify({
        level: "info",
        message: "report_run_processed",
        report_run_id: detail.run.id,
        template_id: detail.template.id,
        schedule_id: detail.run.scheduleId,
        status,
        confidence,
        threshold,
        export_job_id: exportJob.id
      })
    );
  } catch (error) {
    await reportStore.failReportRun(reportRunId, (error as Error).message);
    console.error("report_run_failed", {
      report_run_id: reportRunId,
      message: (error as Error).message
    });
  }
};

export const main = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const payload = parseMessage(record.body);
    const reportRunId = payload.report_run_id;

    if (!reportRunId || !UUID_REGEX.test(reportRunId)) {
      console.error("invalid_report_run_message", {
        message_id: record.messageId,
        body: record.body
      });
      continue;
    }

    await processReportRun(reportRunId);
  }
};
