import type { components } from "./generated/openapi-types";

export type Term = components["schemas"]["Term"];
export type TermListResponse = components["schemas"]["TermListResponse"];
export type CreateTermRequest = components["schemas"]["CreateTermRequest"];
export type UpdateTermRequest = components["schemas"]["UpdateTermRequest"];
export type NewsFeedResponse = components["schemas"]["NewsFeedResponse"];
export type MonitorOverviewResponse = components["schemas"]["MonitorOverviewResponse"];
export type AnalyzeOverviewResponse = components["schemas"]["AnalyzeOverviewResponse"];
export type AnalyzeChannelResponse = components["schemas"]["AnalyzeChannelResponse"];
export type AnalyzeCompetitorsResponse = components["schemas"]["AnalyzeCompetitorsResponse"];
export type CreateAnalysisRunRequest = components["schemas"]["CreateAnalysisRunRequest"];
export type AnalysisRunAccepted = components["schemas"]["AnalysisRunAccepted"];
export type AnalysisRun = components["schemas"]["AnalysisRun"];
export type AnalysisRunStatus = components["schemas"]["AnalysisRunStatus"];
export type AnalysisRunScope = components["schemas"]["AnalysisRunScope"];
export type AnalysisSourceType = components["schemas"]["SourceType"];
export type AnalysisRunListResponse = components["schemas"]["AnalysisRunListResponse"];
export type AnalysisRunDetailResponse = components["schemas"]["AnalysisRunDetailResponse"];
export type IncidentStatus = components["schemas"]["IncidentStatus"];
export type IncidentSeverity = components["schemas"]["MonitorSeverity"];
export type Incident = components["schemas"]["Incident"];
export type IncidentListResponse = components["schemas"]["IncidentListResponse"];
export type PatchIncidentRequest = components["schemas"]["PatchIncidentRequest"];
export type PatchIncidentResponse = components["schemas"]["PatchIncidentResponse"];
export type IncidentNote = components["schemas"]["IncidentNote"];
export type IncidentNotesResponse = components["schemas"]["IncidentNotesResponse"];
export type CreateIncidentNoteRequest = components["schemas"]["CreateIncidentNoteRequest"];
export type IncidentEvaluationAccepted = components["schemas"]["IncidentEvaluationAccepted"];
export type MetaResponse = components["schemas"]["MetaResponse"];
export type Connector = components["schemas"]["Connector"];
export type ConnectorListResponse = components["schemas"]["ConnectorListResponse"];
export type PatchConnectorRequest = components["schemas"]["PatchConnectorRequest"];
export type ConnectorSyncRun = components["schemas"]["ConnectorSyncRun"];
export type ConnectorRunListResponse = components["schemas"]["ConnectorRunListResponse"];
export type OwnedAccount = components["schemas"]["OwnedAccount"];
export type OwnedAccountListResponse = components["schemas"]["OwnedAccountListResponse"];
export type CreateOwnedAccountRequest = components["schemas"]["CreateOwnedAccountRequest"];
export type UpdateOwnedAccountRequest = components["schemas"]["UpdateOwnedAccountRequest"];
export type Competitor = components["schemas"]["Competitor"];
export type CompetitorListResponse = components["schemas"]["CompetitorListResponse"];
export type CreateCompetitorRequest = components["schemas"]["CreateCompetitorRequest"];
export type UpdateCompetitorRequest = components["schemas"]["UpdateCompetitorRequest"];
export type TaxonomyEntry = components["schemas"]["TaxonomyEntry"];
export type TaxonomyListResponse = components["schemas"]["TaxonomyListResponse"];
export type CreateTaxonomyEntryRequest = components["schemas"]["CreateTaxonomyEntryRequest"];
export type UpdateTaxonomyEntryRequest = components["schemas"]["UpdateTaxonomyEntryRequest"];
export type SourceWeight = components["schemas"]["SourceWeight"];
export type SourceWeightListResponse = components["schemas"]["SourceWeightListResponse"];
export type CreateSourceWeightRequest = components["schemas"]["CreateSourceWeightRequest"];
export type UpdateSourceWeightRequest = components["schemas"]["UpdateSourceWeightRequest"];
export type NotificationRecipientKind = components["schemas"]["NotificationRecipientKind"];
export type NotificationRecipient = components["schemas"]["NotificationRecipient"];
export type NotificationRecipientListResponse = components["schemas"]["NotificationRecipientListResponse"];
export type CreateNotificationRecipientRequest = components["schemas"]["CreateNotificationRecipientRequest"];
export type UpdateNotificationRecipientRequest = components["schemas"]["UpdateNotificationRecipientRequest"];
export type NotificationEmailStatusResponse = components["schemas"]["NotificationEmailStatusResponse"];
export type AuditItem = components["schemas"]["AuditItem"];
export type AuditListResponse = components["schemas"]["AuditListResponse"];
export type CreateAuditExportRequest = components["schemas"]["CreateAuditExportRequest"];
export type AuditExportResponse = components["schemas"]["AuditExportResponse"];
export type ReportRunStatus = components["schemas"]["ReportRunStatus"];
export type ReportScheduleFrequency = components["schemas"]["ReportScheduleFrequency"];
export type ReportRun = components["schemas"]["ReportRun"];
export type ReportRunListResponse = components["schemas"]["ReportRunListResponse"];
export type ReportRunDetailResponse = components["schemas"]["ReportRunDetailResponse"];
export type CreateReportRunRequest = components["schemas"]["CreateReportRunRequest"];
export type ReportRunAccepted = components["schemas"]["ReportRunAccepted"];
export type ReportScheduleRunAccepted = components["schemas"]["ReportScheduleRunAccepted"];
export type ReportTemplate = components["schemas"]["ReportTemplate"];
export type ReportTemplatesResponse = components["schemas"]["ReportTemplatesResponse"];
export type CreateReportTemplateRequest = components["schemas"]["CreateReportTemplateRequest"];
export type UpdateReportTemplateRequest = components["schemas"]["UpdateReportTemplateRequest"];
export type ReportSchedule = components["schemas"]["ReportSchedule"];
export type ReportSchedulesResponse = components["schemas"]["ReportSchedulesResponse"];
export type CreateReportScheduleRequest = components["schemas"]["CreateReportScheduleRequest"];
export type UpdateReportScheduleRequest = components["schemas"]["UpdateReportScheduleRequest"];

type HttpMethod = "GET" | "POST" | "PATCH";

type RequestOptions = {
  method?: HttpMethod;
  token?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
};

export type TermScope = "claro" | "competencia";
export type TaxonomyKind = "categories" | "business_lines" | "macro_regions" | "campaigns";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const buildQueryString = (query?: Record<string, string | number | boolean | undefined | null>): string => {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
};

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string | null
  ) {}

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = options.token ?? this.getToken();
    const headers: Record<string, string> = {
      "content-type": "application/json"
    };

    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}${buildQueryString(options.query)}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    const raw = await response.text();
    const payload = raw ? (JSON.parse(raw) as unknown) : null;

    if (!response.ok) {
      const fallbackMessage = `API request failed (${response.status})`;
      const message =
        typeof payload === "object" && payload && "message" in payload && typeof (payload as { message?: unknown }).message === "string"
          ? (payload as { message: string }).message
          : fallbackMessage;
      throw new ApiError(response.status, payload, message);
    }

    return payload as T;
  }

  listTerms(limit = 100, cursor?: string, scope?: TermScope): Promise<TermListResponse> {
    return this.request<TermListResponse>("/v1/terms", {
      query: {
        limit,
        cursor,
        scope
      }
    });
  }

  createTerm(payload: CreateTermRequest): Promise<Term> {
    return this.request<Term>("/v1/terms", {
      method: "POST",
      body: payload
    });
  }

  updateTerm(id: string, payload: UpdateTermRequest): Promise<Term> {
    return this.request<Term>(`/v1/terms/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  listNewsFeed(termId: string): Promise<NewsFeedResponse> {
    return this.request<NewsFeedResponse>("/v1/feed/news", {
      query: {
        term_id: termId
      }
    });
  }

  getMonitorOverview(): Promise<MonitorOverviewResponse> {
    return this.request<MonitorOverviewResponse>("/v1/monitor/overview");
  }

  getAnalyzeOverview(): Promise<AnalyzeOverviewResponse> {
    return this.request<AnalyzeOverviewResponse>("/v1/analyze/overview");
  }

  getAnalyzeChannel(limit = 20): Promise<AnalyzeChannelResponse> {
    return this.request<AnalyzeChannelResponse>("/v1/analyze/channel", {
      query: { limit }
    });
  }

  getAnalyzeCompetitors(limit = 20): Promise<AnalyzeCompetitorsResponse> {
    return this.request<AnalyzeCompetitorsResponse>("/v1/analyze/competitors", {
      query: { limit }
    });
  }

  createAnalysisRun(payload: CreateAnalysisRunRequest): Promise<AnalysisRunAccepted> {
    return this.request<AnalysisRunAccepted>("/v1/analysis/runs", {
      method: "POST",
      body: payload
    });
  }

  listAnalysisHistory(query: {
    limit?: number;
    cursor?: string;
    status?: AnalysisRunStatus;
    scope?: AnalysisRunScope;
    from?: string;
    to?: string;
  }): Promise<AnalysisRunListResponse> {
    return this.request<AnalysisRunListResponse>("/v1/analysis/history", { query });
  }

  getAnalysisRun(id: string): Promise<AnalysisRunDetailResponse> {
    return this.request<AnalysisRunDetailResponse>(`/v1/analysis/runs/${id}`);
  }

  listMonitorIncidents(query: {
    limit?: number;
    cursor?: string;
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    scope?: TermScope;
    owner_user_id?: string;
  }): Promise<IncidentListResponse> {
    return this.request<IncidentListResponse>("/v1/monitor/incidents", { query });
  }

  patchMonitorIncident(id: string, payload: PatchIncidentRequest): Promise<PatchIncidentResponse> {
    return this.request<PatchIncidentResponse>(`/v1/monitor/incidents/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  listMonitorIncidentNotes(id: string, limit = 100): Promise<IncidentNotesResponse> {
    return this.request<IncidentNotesResponse>(`/v1/monitor/incidents/${id}/notes`, {
      query: { limit }
    });
  }

  createMonitorIncidentNote(id: string, payload: CreateIncidentNoteRequest): Promise<IncidentNote> {
    return this.request<IncidentNote>(`/v1/monitor/incidents/${id}/notes`, {
      method: "POST",
      body: payload
    });
  }

  evaluateMonitorIncidents(): Promise<IncidentEvaluationAccepted> {
    return this.request<IncidentEvaluationAccepted>("/v1/monitor/incidents/evaluate", {
      method: "POST",
      body: {}
    });
  }

  listReportsCenter(query: {
    limit?: number;
    cursor?: string;
    status?: ReportRunStatus;
    template_id?: string;
    from?: string;
    to?: string;
  }): Promise<ReportRunListResponse> {
    return this.request<ReportRunListResponse>("/v1/reports/center", { query });
  }

  getReportRun(id: string): Promise<ReportRunDetailResponse> {
    return this.request<ReportRunDetailResponse>(`/v1/reports/runs/${id}`);
  }

  createReportRun(payload: CreateReportRunRequest): Promise<ReportRunAccepted> {
    return this.request<ReportRunAccepted>("/v1/reports/runs", {
      method: "POST",
      body: payload
    });
  }

  listReportTemplates(limit = 100): Promise<ReportTemplatesResponse> {
    return this.request<ReportTemplatesResponse>("/v1/reports/templates", {
      query: { limit }
    });
  }

  createReportTemplate(payload: CreateReportTemplateRequest): Promise<ReportTemplate> {
    return this.request<ReportTemplate>("/v1/reports/templates", {
      method: "POST",
      body: payload
    });
  }

  patchReportTemplate(id: string, payload: UpdateReportTemplateRequest): Promise<ReportTemplate> {
    return this.request<ReportTemplate>(`/v1/reports/templates/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  listReportSchedules(limit = 100): Promise<ReportSchedulesResponse> {
    return this.request<ReportSchedulesResponse>("/v1/reports/schedules", {
      query: { limit }
    });
  }

  createReportSchedule(payload: CreateReportScheduleRequest): Promise<ReportSchedule> {
    return this.request<ReportSchedule>("/v1/reports/schedules", {
      method: "POST",
      body: payload
    });
  }

  patchReportSchedule(id: string, payload: UpdateReportScheduleRequest): Promise<ReportSchedule> {
    return this.request<ReportSchedule>(`/v1/reports/schedules/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  triggerReportScheduleRun(id: string): Promise<ReportScheduleRunAccepted> {
    return this.request<ReportScheduleRunAccepted>(`/v1/reports/schedules/${id}/run`, {
      method: "POST",
      body: {}
    });
  }

  getMeta(): Promise<MetaResponse> {
    return this.request<MetaResponse>("/v1/meta");
  }

  listConnectors(limit = 100): Promise<ConnectorListResponse> {
    return this.request<ConnectorListResponse>("/v1/connectors", {
      query: { limit }
    });
  }

  patchConnector(id: string, payload: PatchConnectorRequest): Promise<Connector> {
    return this.request<Connector>(`/v1/connectors/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  triggerConnectorSync(id: string): Promise<ConnectorSyncRun> {
    return this.request<ConnectorSyncRun>(`/v1/connectors/${id}/sync`, {
      method: "POST",
      body: {}
    });
  }

  listConnectorRuns(id: string, limit = 20): Promise<ConnectorRunListResponse> {
    return this.request<ConnectorRunListResponse>(`/v1/connectors/${id}/runs`, {
      query: { limit }
    });
  }

  listConfigAccounts(limit = 200): Promise<OwnedAccountListResponse> {
    return this.request<OwnedAccountListResponse>("/v1/config/accounts", {
      query: { limit }
    });
  }

  createConfigAccount(payload: CreateOwnedAccountRequest): Promise<OwnedAccount> {
    return this.request<OwnedAccount>("/v1/config/accounts", {
      method: "POST",
      body: payload
    });
  }

  patchConfigAccount(id: string, payload: UpdateOwnedAccountRequest): Promise<OwnedAccount> {
    return this.request<OwnedAccount>(`/v1/config/accounts/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  listConfigCompetitors(limit = 200): Promise<CompetitorListResponse> {
    return this.request<CompetitorListResponse>("/v1/config/competitors", {
      query: { limit }
    });
  }

  createConfigCompetitor(payload: CreateCompetitorRequest): Promise<Competitor> {
    return this.request<Competitor>("/v1/config/competitors", {
      method: "POST",
      body: payload
    });
  }

  patchConfigCompetitor(id: string, payload: UpdateCompetitorRequest): Promise<Competitor> {
    return this.request<Competitor>(`/v1/config/competitors/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  listTaxonomy(kind: TaxonomyKind, includeInactive = false): Promise<TaxonomyListResponse> {
    return this.request<TaxonomyListResponse>(`/v1/config/taxonomies/${kind}`, {
      query: {
        include_inactive: includeInactive ? "true" : undefined
      }
    });
  }

  createTaxonomyEntry(kind: TaxonomyKind, payload: CreateTaxonomyEntryRequest): Promise<TaxonomyEntry> {
    return this.request<TaxonomyEntry>(`/v1/config/taxonomies/${kind}`, {
      method: "POST",
      body: payload
    });
  }

  patchTaxonomyEntry(kind: TaxonomyKind, id: string, payload: UpdateTaxonomyEntryRequest): Promise<TaxonomyEntry> {
    return this.request<TaxonomyEntry>(`/v1/config/taxonomies/${kind}/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  listSourceWeights(provider?: string, includeInactive = false): Promise<SourceWeightListResponse> {
    return this.request<SourceWeightListResponse>("/v1/config/source-scoring/weights", {
      query: {
        provider,
        include_inactive: includeInactive ? "true" : undefined
      }
    });
  }

  createSourceWeight(payload: CreateSourceWeightRequest): Promise<SourceWeight> {
    return this.request<SourceWeight>("/v1/config/source-scoring/weights", {
      method: "POST",
      body: payload
    });
  }

  patchSourceWeight(id: string, payload: UpdateSourceWeightRequest): Promise<SourceWeight> {
    return this.request<SourceWeight>(`/v1/config/source-scoring/weights/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  listNotificationRecipients(query: {
    kind: NotificationRecipientKind;
    scope?: string;
    include_inactive?: boolean;
    limit?: number;
  }): Promise<NotificationRecipientListResponse> {
    return this.request<NotificationRecipientListResponse>("/v1/config/notifications/recipients", { query });
  }

  createNotificationRecipient(payload: CreateNotificationRecipientRequest): Promise<NotificationRecipient> {
    return this.request<NotificationRecipient>("/v1/config/notifications/recipients", {
      method: "POST",
      body: payload
    });
  }

  patchNotificationRecipient(id: string, payload: UpdateNotificationRecipientRequest): Promise<NotificationRecipient> {
    return this.request<NotificationRecipient>(`/v1/config/notifications/recipients/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  getNotificationEmailStatus(): Promise<NotificationEmailStatusResponse> {
    return this.request<NotificationEmailStatusResponse>("/v1/config/notifications/status");
  }

  listConfigAudit(query: {
    limit?: number;
    cursor?: string;
    resource_type?: string;
    action?: string;
    actor_user_id?: string;
    from?: string;
    to?: string;
  }): Promise<AuditListResponse> {
    return this.request<AuditListResponse>("/v1/config/audit", { query });
  }

  exportConfigAudit(payload: CreateAuditExportRequest): Promise<AuditExportResponse> {
    return this.request<AuditExportResponse>("/v1/config/audit/export", {
      method: "POST",
      body: payload
    });
  }
}
