import type { components } from "./generated/openapi-types";

export type Term = components["schemas"]["Term"];
export type TermListResponse = components["schemas"]["TermListResponse"];
export type CreateTermRequest = components["schemas"]["CreateTermRequest"];
export type UpdateTermRequest = components["schemas"]["UpdateTermRequest"];
export type NewsFeedResponse = components["schemas"]["NewsFeedResponse"];
export type MonitorOverviewResponse = components["schemas"]["MonitorOverviewResponse"];
export type SocialChannel = components["schemas"]["SocialChannel"];
export type SocialSentiment = components["schemas"]["SocialSentiment"];
export type SocialDatePreset = components["schemas"]["SocialDatePreset"];
export type SocialPostSort = components["schemas"]["SocialPostSort"];
export type SocialAccountsSort = components["schemas"]["SocialAccountsSort"];
export type OriginType = components["schemas"]["OriginType"];
export type MonitorSocialOverviewResponse = components["schemas"]["MonitorSocialOverviewResponse"];
export type MonitorSocialFacetsResponse = components["schemas"]["MonitorSocialFacetsResponse"];
export type MonitorSocialAccountsResponse = components["schemas"]["MonitorSocialAccountsResponse"];
export type MonitorSocialPostsResponse = components["schemas"]["MonitorSocialPostsResponse"];
export type MonitorSocialComment = components["schemas"]["MonitorSocialCommentItem"];
export type MonitorSocialPostCommentsResponse = components["schemas"]["MonitorSocialPostCommentsResponse"];
export type PatchMonitorSocialCommentRequest = components["schemas"]["PatchMonitorSocialCommentRequest"];
export type MonitorSocialRiskResponse = components["schemas"]["MonitorSocialRiskResponse"];
export type MonitorSocialRunItem = components["schemas"]["MonitorSocialRunItem"];
export type MonitorSocialRunsResponse = components["schemas"]["MonitorSocialRunsResponse"];
export type MonitorSocialEtlQualityResponse = components["schemas"]["MonitorSocialEtlQualityResponse"];
export type MonitorSocialSettings = components["schemas"]["MonitorSocialSettings"];
export type CreateMonitorSocialRunRequest = components["schemas"]["CreateMonitorSocialRunRequest"];
export type MonitorSocialRunAccepted = components["schemas"]["MonitorSocialRunAccepted"];
export type PatchMonitorSocialSettingsRequest = components["schemas"]["PatchMonitorSocialSettingsRequest"];
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
export type AwarioQueryProfile = components["schemas"]["AwarioQueryProfile"];
export type AwarioQueryProfileListResponse = components["schemas"]["AwarioQueryProfileListResponse"];
export type CreateAwarioQueryProfileRequest = components["schemas"]["CreateAwarioQueryProfileRequest"];
export type UpdateAwarioQueryProfileRequest = components["schemas"]["UpdateAwarioQueryProfileRequest"];
export type AwarioSyncState = components["schemas"]["AwarioSyncState"];
export type AwarioAlertBinding = components["schemas"]["AwarioAlertBinding"];
export type AwarioAlertBindingListResponse = components["schemas"]["AwarioAlertBindingListResponse"];
export type CreateAwarioAlertBindingRequest = components["schemas"]["CreateAwarioAlertBindingRequest"];
export type UpdateAwarioAlertBindingRequest = components["schemas"]["UpdateAwarioAlertBindingRequest"];
export type AwarioRemoteAlert = components["schemas"]["AwarioRemoteAlert"];
export type AwarioRemoteAlertListResponse = components["schemas"]["AwarioRemoteAlertListResponse"];
export type LinkAwarioAlertRequest = components["schemas"]["LinkAwarioAlertRequest"];
export type AwarioBackfillQueued = components["schemas"]["AwarioBackfillQueued"];
export type LinkAwarioAlertResponse = components["schemas"]["LinkAwarioAlertResponse"];
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

export type SocialComparisonMode = "weekday_aligned_week" | "exact_days" | "same_period_last_year";
export type SocialHeatmapMetric = "er" | "engagement_total" | "likes" | "comments" | "shares" | "views" | "view_rate";
export type SocialScatterDimension = "post_type" | "channel" | "account" | "campaign" | "strategy" | "hashtag";
export type SocialErBreakdownDimension = "hashtag" | "word" | "post_type" | "publish_frequency" | "weekday";

export type MonitorSocialHeatmapResponse = {
  generated_at: string;
  metric: SocialHeatmapMetric;
  items: Array<{ month: number; weekday: number; value: number; posts: number }>;
};

export type MonitorSocialScatterResponse = {
  generated_at: string;
  dimension: SocialScatterDimension;
  items: Array<{ label: string; exposure_total: number; engagement_total: number; er_global: number; posts: number }>;
};

export type MonitorSocialErBreakdownResponse = {
  generated_at: string;
  dimension: SocialErBreakdownDimension;
  items: Array<{ label: string; posts: number; exposure_total: number; engagement_total: number; er_global: number }>;
};

export type MonitorSocialErTargetsResponse = {
  generated_at: string;
  last_etl_at: string | null;
  year: number;
  items: Array<{
    channel: SocialChannel;
    baseline_2025_er: number;
    target_2026_er: number;
    current_er: number;
    gap: number;
    progress_pct: number;
    source: "auto" | "manual";
  }>;
};

export type PatchMonitorSocialErTargetsRequest = {
  year?: number;
  targets: Array<{
    channel: SocialChannel;
    source: "auto" | "manual";
    target_2026_er?: number;
    override_reason?: string;
  }>;
};

type MonitorSocialQuery = {
  preset?: SocialDatePreset;
  window_days?: 7 | 30 | 90;
  from?: string;
  to?: string;
  channel?: SocialChannel | string;
  account?: string;
  post_type?: string;
  campaign?: string;
  strategy?: string;
  hashtag?: string;
  origin?: OriginType;
  medium?: string;
  tag?: string;
  sentiment?: SocialSentiment;
  trend_granularity?: "auto" | "day" | "week" | "month";
  comparison_mode?: SocialComparisonMode;
  comparison_days?: number;
};

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: HttpMethod;
  token?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
};

export type TermScope = "claro" | "competencia";
export type TaxonomyKind = "categories" | "business_lines" | "macro_regions" | "campaigns" | "strategies";

export type CreateIngestionRunRequest = {
  run_id?: string;
  term_ids?: string[];
  terms?: string[];
  language?: string;
  max_articles_per_term?: number;
};

export type IngestionRunAccepted = {
  run_id: string;
  status: string;
  execution_arn?: string | null;
  start_date?: string | null;
  skip_reason?: string | null;
  input?: Record<string, unknown>;
};

export type QueryScope = "claro" | "competencia";

export type QueryRuleGroup = {
  kind: "group";
  op: "AND" | "OR";
  rules: QueryRule[];
};

export type QueryKeywordRule = {
  kind: "keyword";
  field: "any" | "title" | "summary" | "content";
  match: "contains" | "phrase";
  value: string;
  not?: boolean;
};

export type QueryFacetRule = {
  kind: "provider" | "language" | "country" | "domain";
  op: "in" | "not_in";
  values: string[];
};

export type QueryRule = QueryRuleGroup | QueryKeywordRule | QueryFacetRule;
export type QueryDefinition = QueryRuleGroup;

export type QueryExecutionConfig = {
  providers_allow: string[];
  providers_deny: string[];
  countries_allow: string[];
  countries_deny: string[];
  domains_allow: string[];
  domains_deny: string[];
};

export type ConfigQuery = {
  id: string;
  name: string;
  description: string | null;
  language: string;
  scope: QueryScope;
  is_active: boolean;
  priority: number;
  max_articles_per_run: number;
  definition: QueryDefinition;
  execution: QueryExecutionConfig;
  compiled_definition: Record<string, unknown>;
  current_revision: number;
  awario_binding_id: string | null;
  awario_alert_id: string | null;
  awario_link_status: "linked" | "missing_awario";
  awario_sync_state: "pending_backfill" | "backfilling" | "active" | "error" | "paused" | "archived" | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ConfigQueryListResponse = {
  items: ConfigQuery[];
  page_info: {
    next_cursor: string | null;
    has_next: boolean;
  };
};

export type QueryRevision = {
  id: string;
  query_id: string;
  revision: number;
  definition: QueryDefinition;
  execution: QueryExecutionConfig;
  compiled_definition: Record<string, unknown>;
  changed_by_user_id: string | null;
  change_reason: string | null;
  created_at: string;
};

export type QueryRevisionListResponse = {
  query_id: string;
  items: QueryRevision[];
};

export type CreateConfigQueryRequest = {
  name: string;
  awario_alert_id: string;
  description?: string | null;
  language?: string;
  scope?: QueryScope;
  is_active?: boolean;
  priority?: number;
  max_articles_per_run?: number;
  definition?: QueryDefinition;
  execution?: QueryExecutionConfig;
  change_reason?: string;
};

export type UpdateConfigQueryRequest = Partial<Omit<CreateConfigQueryRequest, "awario_alert_id">> & {
  awario_alert_id?: string;
};

export type QueryPreviewResponse = {
  matched_count: number;
  candidates_count: number;
  sample: Array<{
    content_item_id: string;
    origin: OriginType;
    medium: string | null;
    tags: string[];
    provider: string;
    title: string;
    canonical_url: string;
    published_at: string | null;
  }>;
  provider_breakdown: Array<{ provider: string; count: number }>;
};

export type QueryDryRunResponse = {
  run_id: string;
  query_id: string;
  providers_used: string[];
  query_text: string;
  requested_max_articles_per_term: number;
  effective_max_articles_per_term: number;
  providers: Array<{
    provider: string;
    request_url?: string;
    raw_count: number;
    fetched_count: number;
    matched_count: number;
    duration_ms: number;
    error_type?: string;
    error?: string;
  }>;
  totals: {
    raw_count: number;
    fetched_count: number;
    matched_count: number;
    origin_breakdown: Record<string, number>;
  };
  sample: Array<{
    origin: OriginType;
    medium: string | null;
    tags: string[];
    provider: string;
    title: string;
    canonical_url: string;
    published_at?: string;
  }>;
};

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
    const headers: Record<string, string> = { ...(options.headers ?? {}) };

    if (options.body !== undefined && !headers["content-type"]) {
      headers["content-type"] = "application/json";
    }

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

  private async requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
    const token = options.token ?? this.getToken();
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}${buildQueryString(options.query)}`, {
      method: options.method ?? "GET",
      headers
    });

    if (!response.ok) {
      let message = `API request failed (${response.status})`;
      try {
        const payload = (await response.json()) as unknown;
        if (typeof payload === "object" && payload && "message" in payload && typeof (payload as { message?: unknown }).message === "string") {
          message = (payload as { message: string }).message;
        }
      } catch {
        // noop
      }
      throw new ApiError(response.status, null, message);
    }

    return response.blob();
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

  createIngestionRun(payload: CreateIngestionRunRequest): Promise<IngestionRunAccepted> {
    return this.request<IngestionRunAccepted>("/v1/ingestion/runs", {
      method: "POST",
      body: payload
    });
  }

  listConfigQueries(query: {
    limit?: number;
    cursor?: string;
    scope?: QueryScope;
    is_active?: boolean;
    language?: string;
    q?: string;
  } = {}): Promise<ConfigQueryListResponse> {
    return this.request<ConfigQueryListResponse>("/v1/config/queries", { query });
  }

  getConfigQuery(id: string): Promise<ConfigQuery> {
    return this.request<ConfigQuery>(`/v1/config/queries/${id}`);
  }

  createConfigQuery(payload: CreateConfigQueryRequest): Promise<ConfigQuery> {
    return this.request<ConfigQuery>("/v1/config/queries", {
      method: "POST",
      body: payload
    });
  }

  patchConfigQuery(id: string, payload: UpdateConfigQueryRequest): Promise<ConfigQuery> {
    return this.request<ConfigQuery>(`/v1/config/queries/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  deleteConfigQuery(id: string): Promise<{ ok: boolean; id: string }> {
    return this.request<{ ok: boolean; id: string }>(`/v1/config/queries/${id}`, {
      method: "DELETE"
    });
  }

  listConfigQueryRevisions(id: string, limit = 100): Promise<QueryRevisionListResponse> {
    return this.request<QueryRevisionListResponse>(`/v1/config/queries/${id}/revisions`, {
      query: { limit }
    });
  }

  rollbackConfigQuery(id: string, revision: number, changeReason?: string): Promise<ConfigQuery> {
    return this.request<ConfigQuery>(`/v1/config/queries/${id}/rollback`, {
      method: "POST",
      body: {
        revision,
        change_reason: changeReason
      }
    });
  }

  previewConfigQuery(payload: {
    definition: QueryDefinition;
    execution?: QueryExecutionConfig;
    limit?: number;
    candidate_limit?: number;
  }): Promise<QueryPreviewResponse> {
    return this.request<QueryPreviewResponse>("/v1/config/queries/preview", {
      method: "POST",
      body: payload
    });
  }

  dryRunConfigQuery(id: string, payload: { max_articles_per_term?: number } = {}): Promise<QueryDryRunResponse> {
    return this.request<QueryDryRunResponse>(`/v1/config/queries/${id}/dry-run`, {
      method: "POST",
      body: payload
    });
  }

  listNewsFeed(
    termId: string,
    query: {
      limit?: number;
      cursor?: string;
      origin?: OriginType;
      medium?: string;
      tag?: string;
    } = {}
  ): Promise<NewsFeedResponse> {
    return this.request<NewsFeedResponse>("/v1/feed/news", {
      query: {
        term_id: termId,
        ...query
      }
    });
  }

  getMonitorOverview(): Promise<MonitorOverviewResponse> {
    return this.request<MonitorOverviewResponse>("/v1/monitor/overview");
  }

  getMonitorSocialOverview(query: MonitorSocialQuery = {}): Promise<MonitorSocialOverviewResponse> {
    return this.request<MonitorSocialOverviewResponse>("/v1/monitor/social/overview", { query });
  }

  listMonitorSocialPosts(query: MonitorSocialQuery & {
    sort?: SocialPostSort;
    limit?: number;
    cursor?: string;
  } = {}): Promise<MonitorSocialPostsResponse> {
    return this.request<MonitorSocialPostsResponse>("/v1/monitor/social/posts", { query });
  }

  listMonitorSocialPostComments(
    postId: string,
    query: {
      limit?: number;
      cursor?: string;
      sentiment?: SocialSentiment;
      is_spam?: boolean;
      related_to_post_text?: boolean;
      origin?: OriginType;
      medium?: string;
      tag?: string;
    } = {}
  ): Promise<MonitorSocialPostCommentsResponse> {
    return this.request<MonitorSocialPostCommentsResponse>(`/v1/monitor/social/posts/${postId}/comments`, { query });
  }

  patchMonitorSocialComment(commentId: string, payload: PatchMonitorSocialCommentRequest): Promise<MonitorSocialComment> {
    return this.request<MonitorSocialComment>(`/v1/monitor/social/comments/${commentId}`, {
      method: "PATCH",
      body: payload
    });
  }

  getMonitorSocialAccounts(query: MonitorSocialQuery & {
    min_posts?: number;
    min_exposure?: number;
    sort?: SocialAccountsSort;
    limit?: number;
    cursor?: string;
  } = {}): Promise<MonitorSocialAccountsResponse> {
    return this.request<MonitorSocialAccountsResponse>("/v1/monitor/social/accounts", { query });
  }

  getMonitorSocialFacets(query: MonitorSocialQuery = {}): Promise<MonitorSocialFacetsResponse> {
    return this.request<MonitorSocialFacetsResponse>("/v1/monitor/social/facets", { query });
  }

  getMonitorSocialRisk(query: MonitorSocialQuery = {}): Promise<MonitorSocialRiskResponse> {
    return this.request<MonitorSocialRiskResponse>("/v1/monitor/social/risk", { query });
  }

  getMonitorSocialEtlQuality(limit = 20): Promise<MonitorSocialEtlQualityResponse> {
    return this.request<MonitorSocialEtlQualityResponse>("/v1/monitor/social/etl-quality", {
      query: { limit }
    });
  }

  downloadMonitorSocialExcel(query: MonitorSocialQuery & {
    sort?: SocialPostSort;
    min_posts?: number;
    min_exposure?: number;
  } = {}): Promise<Blob> {
    return this.requestBlob("/v1/monitor/social/export.xlsx", {
      query,
      headers: {
        accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
    });
  }

  getMonitorSocialHeatmap(query: MonitorSocialQuery & { metric?: SocialHeatmapMetric } = {}): Promise<MonitorSocialHeatmapResponse> {
    return this.request<MonitorSocialHeatmapResponse>("/v1/monitor/social/charts/heatmap", { query });
  }

  getMonitorSocialScatter(query: MonitorSocialQuery & { dimension?: SocialScatterDimension } = {}): Promise<MonitorSocialScatterResponse> {
    return this.request<MonitorSocialScatterResponse>("/v1/monitor/social/charts/scatter", { query });
  }

  getMonitorSocialErBreakdown(
    query: MonitorSocialQuery & { dimension?: SocialErBreakdownDimension } = {}
  ): Promise<MonitorSocialErBreakdownResponse> {
    return this.request<MonitorSocialErBreakdownResponse>("/v1/monitor/social/charts/er-breakdown", { query });
  }

  getMonitorSocialErTargets(query: MonitorSocialQuery & { year?: number } = {}): Promise<MonitorSocialErTargetsResponse> {
    return this.request<MonitorSocialErTargetsResponse>("/v1/monitor/social/targets/er", { query });
  }

  patchMonitorSocialErTargets(payload: PatchMonitorSocialErTargetsRequest): Promise<MonitorSocialErTargetsResponse> {
    return this.request<MonitorSocialErTargetsResponse>("/v1/monitor/social/targets/er", {
      method: "PATCH",
      body: payload
    });
  }

  createMonitorSocialRun(payload: CreateMonitorSocialRunRequest = { force: false }): Promise<MonitorSocialRunAccepted> {
    return this.request<MonitorSocialRunAccepted>("/v1/monitor/social/runs", {
      method: "POST",
      body: payload
    });
  }

  listMonitorSocialRuns(limit = 50, cursor?: string): Promise<MonitorSocialRunsResponse> {
    return this.request<MonitorSocialRunsResponse>("/v1/monitor/social/runs", {
      query: { limit, cursor }
    });
  }

  getMonitorSocialSettings(): Promise<MonitorSocialSettings> {
    return this.request<MonitorSocialSettings>("/v1/monitor/social/settings");
  }

  patchMonitorSocialSettings(payload: PatchMonitorSocialSettingsRequest): Promise<MonitorSocialSettings> {
    return this.request<MonitorSocialSettings>("/v1/monitor/social/settings", {
      method: "PATCH",
      body: payload
    });
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

  listAwarioProfiles(limit = 200): Promise<AwarioQueryProfileListResponse> {
    return this.request<AwarioQueryProfileListResponse>("/v1/config/awario/profiles", {
      query: { limit }
    });
  }

  createAwarioProfile(payload: CreateAwarioQueryProfileRequest): Promise<AwarioQueryProfile> {
    return this.request<AwarioQueryProfile>("/v1/config/awario/profiles", {
      method: "POST",
      body: payload
    });
  }

  patchAwarioProfile(id: string, payload: UpdateAwarioQueryProfileRequest): Promise<AwarioQueryProfile> {
    return this.request<AwarioQueryProfile>(`/v1/config/awario/profiles/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  listAwarioBindings(limit = 200): Promise<AwarioAlertBindingListResponse> {
    return this.request<AwarioAlertBindingListResponse>("/v1/config/awario/bindings", {
      query: { limit }
    });
  }

  listAwarioAlerts(options: { limit?: number; q?: string; include_inactive?: boolean } = {}): Promise<AwarioRemoteAlertListResponse> {
    const query = {
      limit: options.limit ?? 100,
      q: options.q,
      include_inactive: options.include_inactive ? "true" : undefined
    };
    return this.request<AwarioRemoteAlertListResponse>("/v1/config/awario/alerts", {
      query
    });
  }

  linkAwarioAlert(alertId: string, payload: LinkAwarioAlertRequest = {}): Promise<LinkAwarioAlertResponse> {
    return this.request<LinkAwarioAlertResponse>(`/v1/config/awario/alerts/${encodeURIComponent(alertId)}/link`, {
      method: "POST",
      body: payload
    });
  }

  createAwarioBinding(payload: CreateAwarioAlertBindingRequest): Promise<AwarioAlertBinding> {
    return this.request<AwarioAlertBinding>("/v1/config/awario/bindings", {
      method: "POST",
      body: payload
    });
  }

  patchAwarioBinding(id: string, payload: UpdateAwarioAlertBindingRequest): Promise<AwarioAlertBinding> {
    return this.request<AwarioAlertBinding>(`/v1/config/awario/bindings/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  retryAwarioBindingBackfill(id: string): Promise<LinkAwarioAlertResponse> {
    return this.request<LinkAwarioAlertResponse>(`/v1/config/awario/bindings/${id}/backfill/retry`, {
      method: "POST",
      body: {}
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
