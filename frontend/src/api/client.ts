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
export type AuditItem = components["schemas"]["AuditItem"];
export type AuditListResponse = components["schemas"]["AuditListResponse"];
export type CreateAuditExportRequest = components["schemas"]["CreateAuditExportRequest"];
export type AuditExportResponse = components["schemas"]["AuditExportResponse"];

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
