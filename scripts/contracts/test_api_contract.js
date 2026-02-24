#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require("child_process");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const ENV_PATH = path.join(ROOT, ".env");
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_WAIT_ATTEMPTS = 12;
const FEED_WAIT_ATTEMPTS = 12;
const WAIT_INTERVAL_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadEnv = () => {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`Missing .env at ${ENV_PATH}`);
  }

  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

const sh = (cmd) => {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  }).trim();
};

const assertCondition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertStatus = (actual, expected, label) => {
  assertCondition(actual === expected, `${label}: expected ${expected}, got ${actual}`);
  console.log(`[OK] ${label} -> ${actual}`);
};

const request = async ({ method, url, token, body }) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const raw = await response.text();
  let json = null;
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
  }

  return {
    status: response.status,
    json,
    raw
  };
};

const decodeJwtPayload = (token) => {
  const [, payload] = token.split(".");
  if (!payload) return {};
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const decoded = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(decoded);
};

const ensureTokens = () => {
  const testPassword = process.env.TEST_USER_PASSWORD || "ClaroData!2026";
  const viewerUser = process.env.TEST_VIEWER_USER || "viewer-test@claro.local";
  const analystUser = process.env.TEST_ANALYST_USER || "analyst-test@claro.local";
  const adminUser = process.env.TEST_ADMIN_USER || "admin-test@claro.local";

  sh(`./scripts/aws/seed_cognito_test_user.sh ${viewerUser} ${testPassword} Viewer >/dev/null`);
  sh(`./scripts/aws/seed_cognito_test_user.sh ${analystUser} ${testPassword} Analyst >/dev/null`);
  sh(`./scripts/aws/seed_cognito_test_user.sh ${adminUser} ${testPassword} Admin >/dev/null`);

  return {
    viewerToken: sh(`./scripts/aws/get_cognito_id_token.sh ${viewerUser} ${testPassword}`),
    analystToken: sh(`./scripts/aws/get_cognito_id_token.sh ${analystUser} ${testPassword}`),
    adminToken: sh(`./scripts/aws/get_cognito_id_token.sh ${adminUser} ${testPassword}`)
  };
};

const ensureTerm = async (apiBase, adminToken, scope = "claro") => {
  const termName = `claro-feed-contract-${scope}`;
  const createResponse = await request({
    method: "POST",
    url: `${apiBase}/v1/terms`,
    token: adminToken,
    body: {
      name: termName,
      language: "es",
      scope,
      max_articles_per_run: 2
    }
  });
  assertCondition(createResponse.status === 201 || createResponse.status === 409, `POST /v1/terms expected 201/409, got ${createResponse.status}`);

  const listResponse = await request({
    method: "GET",
    url: `${apiBase}/v1/terms?limit=100&scope=${scope}`,
    token: adminToken
  });
  assertStatus(listResponse.status, 200, "GET /v1/terms");
  const items = listResponse.json?.items || [];
  assertCondition(items.every((item) => item.scope === scope), `GET /v1/terms?scope=${scope} must return homogeneous scope`);
  const term = items.find((item) => item.name === termName);
  assertCondition(term && typeof term.id === "string" && UUID_REGEX.test(term.id), "term not found after create/list");
  return term;
};

const ensureContentItem = async (apiBase, analystToken, viewerToken, term) => {
  const ingestionRunId = randomUUID();
  const ingestionResponse = await request({
    method: "POST",
    url: `${apiBase}/v1/ingestion/runs`,
    token: analystToken,
    body: {
      run_id: ingestionRunId,
      term_ids: [term.id],
      terms: [term.name],
      language: "es",
      max_articles_per_term: 50
    }
  });

  assertStatus(ingestionResponse.status, 202, "POST /v1/ingestion/runs");
  assertCondition(ingestionResponse.json && ingestionResponse.json.run_id, "ingestion response missing run_id");

  for (let attempt = 1; attempt <= CONTENT_WAIT_ATTEMPTS; attempt += 1) {
    const contentResponse = await request({
      method: "GET",
      url: `${apiBase}/v1/content?limit=1&term_id=${term.id}&source_type=news`,
      token: viewerToken
    });

    assertStatus(contentResponse.status, 200, "GET /v1/content");
    const items = contentResponse.json?.items;
    if (Array.isArray(items) && items.length > 0) {
      const item = items[0];
      assertCondition(typeof item.id === "string", "content item missing id");
      assertCondition(typeof item.state === "string", "content item missing state");
      return item;
    }

    await sleep(WAIT_INTERVAL_MS);
    if (attempt === CONTENT_WAIT_ATTEMPTS) break;
  }

  const fallbackContent = await request({
    method: "GET",
    url: `${apiBase}/v1/content?limit=1`,
    token: viewerToken
  });
  assertStatus(fallbackContent.status, 200, "GET /v1/content fallback");
  const fallbackItems = fallbackContent.json?.items;
  if (Array.isArray(fallbackItems) && fallbackItems.length > 0) {
    return fallbackItems[0];
  }

  throw new Error("No content item available after waiting for ingestion and fallback");
};

const waitNewsFeed = async (apiBase, viewerToken, termId) => {
  let lastItems = [];
  for (let attempt = 1; attempt <= FEED_WAIT_ATTEMPTS; attempt += 1) {
    const feedResponse = await request({
      method: "GET",
      url: `${apiBase}/v1/feed/news?term_id=${termId}`,
      token: viewerToken
    });
    assertStatus(feedResponse.status, 200, "GET /v1/feed/news");
    assertCondition(Array.isArray(feedResponse.json?.items), "feed.items must be an array");
    assertCondition(feedResponse.json.items.length <= 2, "feed must return at most 2 items");
    lastItems = feedResponse.json.items;

    if (feedResponse.json.items.length > 0) {
      const rank = feedResponse.json.items.map((item) => {
        const ts = item.published_at || item.created_at;
        return Number.isFinite(Date.parse(ts)) ? Date.parse(ts) : 0;
      });
      for (let i = 1; i < rank.length; i += 1) {
        assertCondition(rank[i - 1] >= rank[i], "feed items must be ordered by recency desc");
      }
      return feedResponse.json.items;
    }

    await sleep(WAIT_INTERVAL_MS);
  }

  return lastItems;
};

const pickDifferentState = (state) => {
  if (state === "active") return "archived";
  return "active";
};

const ensureStateChange = async (apiBase, analystToken, contentId, currentState) => {
  let targetState = pickDifferentState(currentState);

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await request({
      method: "PATCH",
      url: `${apiBase}/v1/content/${contentId}/state`,
      token: analystToken,
      body: {
        target_state: targetState,
        reason: "contract test state change"
      }
    });

    if (response.status === 200) {
      assertCondition(response.json?.next_state === targetState, "state response next_state mismatch");
      return targetState;
    }

    if (response.status !== 409) {
      throw new Error(`PATCH /v1/content/{id}/state expected 200/409, got ${response.status}`);
    }

    targetState = targetState === "active" ? "archived" : "active";
  }

  throw new Error("Could not apply state change after retries");
};

const waitExportCompleted = async (apiBase, analystToken, exportId) => {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const response = await request({
      method: "GET",
      url: `${apiBase}/v1/exports/${exportId}`,
      token: analystToken
    });

    assertStatus(response.status, 200, "GET /v1/exports/{id}");
    const status = response.json?.status;
    if (status === "completed") {
      assertCondition(typeof response.json.download_url === "string" && response.json.download_url.startsWith("https://"), "completed export missing download_url");
      return;
    }

    if (status === "failed") {
      throw new Error(`export job failed for id=${exportId}`);
    }

    await sleep(5000);
  }

  throw new Error(`export job did not complete in expected time: ${exportId}`);
};

const ensureConfigSurface = async (apiBase, viewerToken, analystToken, adminToken) => {
  const connectors = await request({
    method: "GET",
    url: `${apiBase}/v1/connectors?limit=20`,
    token: viewerToken
  });
  assertStatus(connectors.status, 200, "GET /v1/connectors");
  assertCondition(Array.isArray(connectors.json?.items), "connectors.items must be array");

  const firstConnector = connectors.json.items[0];
  if (firstConnector?.id) {
    const sync = await request({
      method: "POST",
      url: `${apiBase}/v1/connectors/${firstConnector.id}/sync`,
      token: analystToken
    });
    assertStatus(sync.status, 202, "POST /v1/connectors/{id}/sync");

    const runs = await request({
      method: "GET",
      url: `${apiBase}/v1/connectors/${firstConnector.id}/runs?limit=5`,
      token: viewerToken
    });
    assertStatus(runs.status, 200, "GET /v1/connectors/{id}/runs");
    assertCondition(Array.isArray(runs.json?.items), "connector runs must be array");
  }

  const accountHandle = `claro-contract-${Date.now()}`;
  const accountCreate = await request({
    method: "POST",
    url: `${apiBase}/v1/config/accounts`,
    token: adminToken,
    body: {
      platform: "x",
      handle: accountHandle,
      account_name: "Claro Contract",
      status: "active",
      campaign_tags: ["contract"]
    }
  });
  assertStatus(accountCreate.status, 201, "POST /v1/config/accounts");

  const accounts = await request({
    method: "GET",
    url: `${apiBase}/v1/config/accounts?limit=20`,
    token: viewerToken
  });
  assertStatus(accounts.status, 200, "GET /v1/config/accounts");
  assertCondition(Array.isArray(accounts.json?.items), "accounts.items must be array");

  const awarioProfilesList = await request({
    method: "GET",
    url: `${apiBase}/v1/config/awario/profiles?limit=20`,
    token: viewerToken
  });
  assertStatus(awarioProfilesList.status, 200, "GET /v1/config/awario/profiles");
  assertCondition(Array.isArray(awarioProfilesList.json?.items), "awario profiles must return items[]");

  const createdProfileResponse = await request({
    method: "POST",
    url: `${apiBase}/v1/config/awario/profiles`,
    token: adminToken,
    body: {
      name: `contract-awario-profile-${Date.now()}`,
      query_text: '("claro" OR "claro colombia")',
      status: "active"
    }
  });
  assertStatus(createdProfileResponse.status, 201, "POST /v1/config/awario/profiles");
  const awarioProfileId = createdProfileResponse.json?.id;
  assertCondition(typeof awarioProfileId === "string" && UUID_REGEX.test(awarioProfileId), "awario profile id invalid");

  const patchedProfileResponse = await request({
    method: "PATCH",
    url: `${apiBase}/v1/config/awario/profiles/${awarioProfileId}`,
    token: adminToken,
    body: {
      status: "paused"
    }
  });
  assertStatus(patchedProfileResponse.status, 200, "PATCH /v1/config/awario/profiles/{id}");
  assertCondition(patchedProfileResponse.json?.status === "paused", "awario profile status patch mismatch");

  const awarioBindingsList = await request({
    method: "GET",
    url: `${apiBase}/v1/config/awario/bindings?limit=20`,
    token: viewerToken
  });
  assertStatus(awarioBindingsList.status, 200, "GET /v1/config/awario/bindings");
  assertCondition(Array.isArray(awarioBindingsList.json?.items), "awario bindings must return items[]");

  const createdBindingResponse = await request({
    method: "POST",
    url: `${apiBase}/v1/config/awario/bindings`,
    token: adminToken,
    body: {
      profile_id: awarioProfileId,
      awario_alert_id: `contract-alert-${Date.now()}`,
      status: "active"
    }
  });
  assertCondition(
    createdBindingResponse.status === 201 || createdBindingResponse.status === 409,
    `POST /v1/config/awario/bindings expected 201/409, got ${createdBindingResponse.status}`
  );

  const awarioBindingId =
    createdBindingResponse.status === 201
      ? createdBindingResponse.json?.id
      : awarioBindingsList.json?.items?.[0]?.id;

  if (typeof awarioBindingId === "string" && UUID_REGEX.test(awarioBindingId)) {
    const patchedBindingResponse = await request({
      method: "PATCH",
      url: `${apiBase}/v1/config/awario/bindings/${awarioBindingId}`,
      token: adminToken,
      body: {
        status: "paused"
      }
    });
    assertStatus(patchedBindingResponse.status, 200, "PATCH /v1/config/awario/bindings/{id}");
    assertCondition(patchedBindingResponse.json?.status === "paused", "awario binding status patch mismatch");
  }

  const competitorName = `competitor-contract-${Date.now()}`;
  const competitorCreate = await request({
    method: "POST",
    url: `${apiBase}/v1/config/competitors`,
    token: adminToken,
    body: {
      brand_name: competitorName,
      aliases: ["contract-brand"],
      priority: 5,
      status: "active"
    }
  });
  assertStatus(competitorCreate.status, 201, "POST /v1/config/competitors");

  const competitors = await request({
    method: "GET",
    url: `${apiBase}/v1/config/competitors?limit=20`,
    token: viewerToken
  });
  assertStatus(competitors.status, 200, "GET /v1/config/competitors");
  assertCondition(Array.isArray(competitors.json?.items), "competitors.items must be array");

  const taxonomyKey = `contract_${Date.now()}`;
  const taxonomyCreate = await request({
    method: "POST",
    url: `${apiBase}/v1/config/taxonomies/categories`,
    token: adminToken,
    body: {
      key: taxonomyKey,
      label: "Contract Category",
      is_active: true,
      sort_order: 120
    }
  });
  assertStatus(taxonomyCreate.status, 201, "POST /v1/config/taxonomies/{kind}");

  const taxonomyList = await request({
    method: "GET",
    url: `${apiBase}/v1/config/taxonomies/categories`,
    token: viewerToken
  });
  assertStatus(taxonomyList.status, 200, "GET /v1/config/taxonomies/{kind}");
  assertCondition(Array.isArray(taxonomyList.json?.items), "taxonomy.items must be array");

  const auditList = await request({
    method: "GET",
    url: `${apiBase}/v1/config/audit?limit=20`,
    token: viewerToken
  });
  assertStatus(auditList.status, 200, "GET /v1/config/audit");
  assertCondition(Array.isArray(auditList.json?.items), "audit.items must be array");

  const auditExport = await request({
    method: "POST",
    url: `${apiBase}/v1/config/audit/export`,
    token: analystToken,
    body: {
      limit: 200
    }
  });
  assertStatus(auditExport.status, 202, "POST /v1/config/audit/export");
  assertCondition(
    typeof auditExport.json?.download_url === "string" && auditExport.json.download_url.startsWith("https://"),
    "audit export must return signed download_url"
  );
};

const waitReportRunTerminal = async (apiBase, viewerToken, reportRunId) => {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const response = await request({
      method: "GET",
      url: `${apiBase}/v1/reports/runs/${reportRunId}`,
      token: viewerToken
    });
    assertStatus(response.status, 200, "GET /v1/reports/runs/{id}");

    const status = response.json?.run?.status;
    if (status === "completed" || status === "pending_review") {
      return response.json;
    }
    if (status === "failed") {
      throw new Error(`report run failed id=${reportRunId}`);
    }

    await sleep(5000);
  }

  throw new Error(`report run timeout id=${reportRunId}`);
};

const waitAnalysisRunTerminal = async (apiBase, viewerToken, analysisRunId) => {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    const response = await request({
      method: "GET",
      url: `${apiBase}/v1/analysis/runs/${analysisRunId}`,
      token: viewerToken
    });
    assertStatus(response.status, 200, "GET /v1/analysis/runs/{id}");

    const status = response.json?.run?.status;
    if (status === "completed" || status === "failed") {
      return response.json;
    }

    await sleep(4000);
  }

  throw new Error(`analysis run timeout id=${analysisRunId}`);
};

const ensureReportsSurface = async (apiBase, viewerToken, analystToken, adminToken) => {
  const viewerCreateTemplateDenied = await request({
    method: "POST",
    url: `${apiBase}/v1/reports/templates`,
    token: viewerToken,
    body: {
      name: "viewer-denied-template"
    }
  });
  assertStatus(viewerCreateTemplateDenied.status, 403, "POST /v1/reports/templates viewer denied");

  const templateName = `report-template-contract-${Date.now()}`;
  const createTemplate = await request({
    method: "POST",
    url: `${apiBase}/v1/reports/templates`,
    token: adminToken,
    body: {
      name: templateName,
      description: "Contract generated template",
      is_active: true,
      confidence_threshold: 0.65,
      sections: {
        blocks: ["kpi", "incidents", "top_content"]
      },
      filters: {}
    }
  });
  assertStatus(createTemplate.status, 201, "POST /v1/reports/templates admin");
  const templateId = createTemplate.json?.id;
  assertCondition(typeof templateId === "string" && UUID_REGEX.test(templateId), "report template id invalid");

  const listTemplates = await request({
    method: "GET",
    url: `${apiBase}/v1/reports/templates?limit=50`,
    token: viewerToken
  });
  assertStatus(listTemplates.status, 200, "GET /v1/reports/templates viewer");
  assertCondition(Array.isArray(listTemplates.json?.items), "report templates items must be array");

  const patchTemplate = await request({
    method: "PATCH",
    url: `${apiBase}/v1/reports/templates/${templateId}`,
    token: adminToken,
    body: {
      description: "Contract updated template",
      confidence_threshold: 0.67
    }
  });
  assertStatus(patchTemplate.status, 200, "PATCH /v1/reports/templates/{id} admin");

  const createSchedule = await request({
    method: "POST",
    url: `${apiBase}/v1/reports/schedules`,
    token: analystToken,
    body: {
      template_id: templateId,
      name: `contract-schedule-${Date.now()}`,
      enabled: true,
      frequency: "daily",
      day_of_week: null,
      time_local: "08:00",
      timezone: "America/Bogota",
      recipients: []
    }
  });
  assertStatus(createSchedule.status, 201, "POST /v1/reports/schedules analyst");
  const scheduleId = createSchedule.json?.id;
  assertCondition(typeof scheduleId === "string" && UUID_REGEX.test(scheduleId), "report schedule id invalid");

  const listSchedules = await request({
    method: "GET",
    url: `${apiBase}/v1/reports/schedules?limit=50`,
    token: viewerToken
  });
  assertStatus(listSchedules.status, 200, "GET /v1/reports/schedules viewer");
  assertCondition(Array.isArray(listSchedules.json?.items), "report schedules items must be array");

  const patchSchedule = await request({
    method: "PATCH",
    url: `${apiBase}/v1/reports/schedules/${scheduleId}`,
    token: analystToken,
    body: {
      enabled: true,
      frequency: "weekly",
      day_of_week: 1,
      time_local: "09:30"
    }
  });
  assertStatus(patchSchedule.status, 200, "PATCH /v1/reports/schedules/{id} analyst");

  const createRun = await request({
    method: "POST",
    url: `${apiBase}/v1/reports/runs`,
    token: analystToken,
    body: {
      template_id: templateId
    }
  });
  assertStatus(createRun.status, 202, "POST /v1/reports/runs analyst");
  const reportRunId = createRun.json?.report_run_id;
  assertCondition(typeof reportRunId === "string" && UUID_REGEX.test(reportRunId), "report_run_id invalid");

  const triggerScheduleRun = await request({
    method: "POST",
    url: `${apiBase}/v1/reports/schedules/${scheduleId}/run`,
    token: analystToken,
    body: {}
  });
  assertStatus(triggerScheduleRun.status, 202, "POST /v1/reports/schedules/{id}/run analyst");
  const scheduledRunId = triggerScheduleRun.json?.report_run_id;
  assertCondition(typeof scheduledRunId === "string" && UUID_REGEX.test(scheduledRunId), "scheduled report_run_id invalid");

  const center = await request({
    method: "GET",
    url: `${apiBase}/v1/reports/center?limit=30`,
    token: viewerToken
  });
  assertStatus(center.status, 200, "GET /v1/reports/center viewer");
  assertCondition(Array.isArray(center.json?.items), "reports center items must be array");

  const terminal = await waitReportRunTerminal(apiBase, viewerToken, reportRunId);
  assertCondition(
    terminal?.run?.status === "completed" || terminal?.run?.status === "pending_review",
    "report run terminal status invalid"
  );

  if (terminal?.run?.export_job_id) {
    await waitExportCompleted(apiBase, analystToken, terminal.run.export_job_id);
  }
};

const ensureMonitorOverview = async (apiBase, viewerToken) => {
  const unauthorized = await request({
    method: "GET",
    url: `${apiBase}/v1/monitor/overview`
  });
  assertStatus(unauthorized.status, 401, "GET /v1/monitor/overview without token");

  const response = await request({
    method: "GET",
    url: `${apiBase}/v1/monitor/overview`,
    token: viewerToken
  });
  assertStatus(response.status, 200, "GET /v1/monitor/overview");

  assertCondition(Number.isFinite(Date.parse(response.json?.generated_at || "")), "overview.generated_at must be ISO datetime");
  assertCondition(response.json?.window_days === 7, "overview.window_days must be 7");
  assertCondition(response.json?.source_type === "news", "overview.source_type must be news");
  assertCondition(response.json?.formula_version === "kpi-v1", "overview.formula_version must be kpi-v1");

  const totals = response.json?.totals;
  assertCondition(totals && typeof totals === "object", "overview.totals must be object");
  assertCondition(typeof totals.items === "number", "overview.totals.items must be number");
  assertCondition(typeof totals.classified_items === "number", "overview.totals.classified_items must be number");
  assertCondition(typeof totals.sentimiento_neto === "number", "overview.totals.sentimiento_neto must be number");
  assertCondition(typeof totals.bhs === "number", "overview.totals.bhs must be number");
  assertCondition(typeof totals.riesgo_activo === "number", "overview.totals.riesgo_activo must be number");
  assertCondition(["SEV1", "SEV2", "SEV3", "SEV4"].includes(totals.severidad), "overview.totals.severidad invalid");
  assertCondition(typeof totals.sov_claro === "number", "overview.totals.sov_claro must be number");
  assertCondition(typeof totals.sov_competencia === "number", "overview.totals.sov_competencia must be number");
  assertCondition(typeof totals.insufficient_data === "boolean", "overview.totals.insufficient_data must be boolean");

  const byScope = response.json?.by_scope;
  assertCondition(byScope && typeof byScope === "object", "overview.by_scope must be object");
  for (const scope of ["claro", "competencia"]) {
    const bucket = byScope[scope];
    assertCondition(bucket && typeof bucket === "object", `overview.by_scope.${scope} must be object`);
    assertCondition(typeof bucket.items === "number", `overview.by_scope.${scope}.items must be number`);
    assertCondition(typeof bucket.classified_items === "number", `overview.by_scope.${scope}.classified_items must be number`);
    assertCondition(typeof bucket.sentimiento_neto === "number", `overview.by_scope.${scope}.sentimiento_neto must be number`);
    assertCondition(typeof bucket.riesgo_activo === "number", `overview.by_scope.${scope}.riesgo_activo must be number`);
    assertCondition(typeof bucket.bhs === "number", `overview.by_scope.${scope}.bhs must be number`);
    assertCondition(typeof bucket.sov === "number", `overview.by_scope.${scope}.sov must be number`);
  }

  const diagnostics = response.json?.diagnostics;
  assertCondition(diagnostics && typeof diagnostics === "object", "overview.diagnostics must be object");
  assertCondition(typeof diagnostics.unscoped_items === "number", "overview.diagnostics.unscoped_items must be number");
  assertCondition(typeof diagnostics.unknown_sentiment_items === "number", "overview.diagnostics.unknown_sentiment_items must be number");
};

const ensureAnalyzeSurface = async (apiBase, viewerToken) => {
  const unauthorizedOverview = await request({
    method: "GET",
    url: `${apiBase}/v1/analyze/overview`
  });
  assertStatus(unauthorizedOverview.status, 401, "GET /v1/analyze/overview without token");

  const overview = await request({
    method: "GET",
    url: `${apiBase}/v1/analyze/overview`,
    token: viewerToken
  });
  assertStatus(overview.status, 200, "GET /v1/analyze/overview");
  assertCondition(overview.json?.window_days === 7, "analyze.overview window_days must be 7");
  assertCondition(overview.json?.source_type === "news", "analyze.overview source_type must be news");
  assertCondition(overview.json?.formula_version === "analysis-v1", "analyze.overview formula_version must be analysis-v1");
  assertCondition(overview.json?.totals && typeof overview.json.totals === "object", "analyze.overview totals must be object");
  assertCondition(
    overview.json?.previous_totals && typeof overview.json.previous_totals === "object",
    "analyze.overview previous_totals must be object"
  );
  assertCondition(overview.json?.delta && typeof overview.json.delta === "object", "analyze.overview delta must be object");

  const channel = await request({
    method: "GET",
    url: `${apiBase}/v1/analyze/channel?limit=20`,
    token: viewerToken
  });
  assertStatus(channel.status, 200, "GET /v1/analyze/channel");
  assertCondition(Array.isArray(channel.json?.items), "analyze.channel items must be array");
  assertCondition(channel.json?.totals && typeof channel.json.totals === "object", "analyze.channel totals must be object");
  for (const row of channel.json.items ?? []) {
    assertCondition(typeof row.provider === "string" && row.provider.length > 0, "analyze.channel item.provider invalid");
    assertCondition(typeof row.items === "number", "analyze.channel item.items must be number");
    assertCondition(typeof row.riesgo_activo === "number", "analyze.channel item.riesgo_activo must be number");
    assertCondition(Array.isArray(row.top_categories), "analyze.channel item.top_categories must be array");
  }

  const competitors = await request({
    method: "GET",
    url: `${apiBase}/v1/analyze/competitors?limit=20`,
    token: viewerToken
  });
  assertStatus(competitors.status, 200, "GET /v1/analyze/competitors");
  assertCondition(
    competitors.json?.baseline_claro && typeof competitors.json.baseline_claro === "object",
    "analyze.competitors baseline_claro must be object"
  );
  assertCondition(Array.isArray(competitors.json?.competitors), "analyze.competitors competitors must be array");
  assertCondition(
    competitors.json?.totals && typeof competitors.json.totals === "object",
    "analyze.competitors totals must be object"
  );
  for (const row of competitors.json.competitors ?? []) {
    assertCondition(typeof row.term_id === "string" && UUID_REGEX.test(row.term_id), "analyze.competitors term_id invalid");
    assertCondition(typeof row.term_name === "string" && row.term_name.length > 0, "analyze.competitors term_name invalid");
    assertCondition(typeof row.sov === "number", "analyze.competitors row.sov must be number");
  }
};

const ensureSourceScoringSurface = async (apiBase, viewerToken, adminToken) => {
  const listEmpty = await request({
    method: "GET",
    url: `${apiBase}/v1/config/source-scoring/weights`,
    token: viewerToken
  });
  assertStatus(listEmpty.status, 200, "GET /v1/config/source-scoring/weights");
  assertCondition(Array.isArray(listEmpty.json?.items), "source-scoring weights must return items[]");

  const viewerCreateDenied = await request({
    method: "POST",
    url: `${apiBase}/v1/config/source-scoring/weights`,
    token: viewerToken,
    body: {
      provider: "viewer-denied",
      weight: 0.55
    }
  });
  assertStatus(viewerCreateDenied.status, 403, "POST /v1/config/source-scoring/weights viewer denied");

  const analyzeChannel = await request({
    method: "GET",
    url: `${apiBase}/v1/analyze/channel?limit=20`,
    token: viewerToken
  });
  assertStatus(analyzeChannel.status, 200, "GET /v1/analyze/channel for source-scoring");
  assertCondition(Array.isArray(analyzeChannel.json?.items), "analyze channel items must be array for source-scoring");

  if ((analyzeChannel.json?.items ?? []).length === 0) {
    console.log("[WARN] source-scoring metric impact check skipped: no channel rows available");
    return;
  }

  const targetProvider = analyzeChannel.json.items[0].provider;
  assertCondition(typeof targetProvider === "string" && targetProvider.length > 0, "source-scoring provider candidate invalid");

  const createWeight = await request({
    method: "POST",
    url: `${apiBase}/v1/config/source-scoring/weights`,
    token: adminToken,
    body: {
      provider: targetProvider,
      source_name: null,
      weight: 0.95,
      is_active: true
    }
  });
  assertCondition(createWeight.status === 201 || createWeight.status === 409, `source-scoring create expected 201/409, got ${createWeight.status}`);

  let weightId = createWeight.json?.id;
  if (!weightId) {
    const listByProvider = await request({
      method: "GET",
      url: `${apiBase}/v1/config/source-scoring/weights?provider=${encodeURIComponent(targetProvider)}&include_inactive=true`,
      token: viewerToken
    });
    assertStatus(listByProvider.status, 200, "GET /v1/config/source-scoring/weights by provider");
    const fallback = (listByProvider.json?.items ?? []).find((item) => item.source_name === null);
    weightId = fallback?.id;
  }

  assertCondition(typeof weightId === "string" && UUID_REGEX.test(weightId), "source-scoring weight id invalid");

  const patchHigh = await request({
    method: "PATCH",
    url: `${apiBase}/v1/config/source-scoring/weights/${weightId}`,
    token: adminToken,
    body: {
      weight: 0.95,
      is_active: true
    }
  });
  assertStatus(patchHigh.status, 200, "PATCH /v1/config/source-scoring/weights/{id} high");

  const highChannel = await request({
    method: "GET",
    url: `${apiBase}/v1/analyze/channel?limit=40`,
    token: viewerToken
  });
  assertStatus(highChannel.status, 200, "GET /v1/analyze/channel after high weight");
  const highRow = (highChannel.json?.items ?? []).find((row) => row.provider === targetProvider);
  assertCondition(highRow && typeof highRow.quality_score === "number", "missing high weight channel row");

  const patchLow = await request({
    method: "PATCH",
    url: `${apiBase}/v1/config/source-scoring/weights/${weightId}`,
    token: adminToken,
    body: {
      weight: 0.10,
      is_active: true
    }
  });
  assertStatus(patchLow.status, 200, "PATCH /v1/config/source-scoring/weights/{id} low");

  const lowChannel = await request({
    method: "GET",
    url: `${apiBase}/v1/analyze/channel?limit=40`,
    token: viewerToken
  });
  assertStatus(lowChannel.status, 200, "GET /v1/analyze/channel after low weight");
  const lowRow = (lowChannel.json?.items ?? []).find((row) => row.provider === targetProvider);
  assertCondition(lowRow && typeof lowRow.quality_score === "number", "missing low weight channel row");

  const qualityDelta = Math.abs(highRow.quality_score - lowRow.quality_score);
  assertCondition(qualityDelta >= 1, "source-scoring did not produce expected KPI quality_score delta");

  const auditForSourceWeight = await request({
    method: "GET",
    url: `${apiBase}/v1/config/audit?limit=30&resource_type=SourceWeight`,
    token: viewerToken
  });
  assertStatus(auditForSourceWeight.status, 200, "GET /v1/config/audit?resource_type=SourceWeight");
  assertCondition(Array.isArray(auditForSourceWeight.json?.items), "source-scoring audit filter should return items");
};

const ensureNotificationRecipientsSurface = async (apiBase, viewerToken, analystToken, adminToken) => {
  const viewerDenied = await request({
    method: "GET",
    url: `${apiBase}/v1/config/notifications/recipients?kind=digest`,
    token: viewerToken
  });
  assertStatus(viewerDenied.status, 403, "GET /v1/config/notifications/recipients viewer denied");

  const statusAsAnalyst = await request({
    method: "GET",
    url: `${apiBase}/v1/config/notifications/status`,
    token: analystToken
  });
  assertStatus(statusAsAnalyst.status, 200, "GET /v1/config/notifications/status analyst");
  assertCondition(typeof statusAsAnalyst.json?.production_access_enabled === "boolean", "notifications.status missing production_access_enabled");
  assertCondition(typeof statusAsAnalyst.json?.sending_enabled === "boolean", "notifications.status missing sending_enabled");
  assertCondition(statusAsAnalyst.json?.send_quota && typeof statusAsAnalyst.json.send_quota === "object", "notifications.status missing send_quota");

  const scope = `contract-${Date.now()}`;
  const email = `contract-recipient-${Date.now()}@claro.local`;

  const createRecipient = await request({
    method: "POST",
    url: `${apiBase}/v1/config/notifications/recipients`,
    token: adminToken,
    body: {
      kind: "digest",
      scope,
      email,
      is_active: true
    }
  });
  assertStatus(createRecipient.status, 201, "POST /v1/config/notifications/recipients admin");
  const recipientId = createRecipient.json?.id;
  assertCondition(typeof recipientId === "string" && UUID_REGEX.test(recipientId), "notification recipient id invalid");

  const patchRecipient = await request({
    method: "PATCH",
    url: `${apiBase}/v1/config/notifications/recipients/${recipientId}`,
    token: adminToken,
    body: {
      is_active: false
    }
  });
  assertStatus(patchRecipient.status, 200, "PATCH /v1/config/notifications/recipients/{id} admin");

  const listAsAnalyst = await request({
    method: "GET",
    url: `${apiBase}/v1/config/notifications/recipients?kind=digest&scope=${encodeURIComponent(scope)}&include_inactive=true&limit=50`,
    token: analystToken
  });
  assertStatus(listAsAnalyst.status, 200, "GET /v1/config/notifications/recipients analyst");
  assertCondition(Array.isArray(listAsAnalyst.json?.items), "notification recipients must return items[]");

  const found = (listAsAnalyst.json?.items ?? []).find((item) => item.id === recipientId);
  assertCondition(Boolean(found), "notification recipient not returned in analyst list");
  assertCondition(found.email === null, "analyst must see email as null");
  assertCondition(typeof found.email_masked === "string" && found.email_masked.includes("@"), "analyst must see email_masked");

  const auditForRecipients = await request({
    method: "GET",
    url: `${apiBase}/v1/config/audit?limit=50&resource_type=NotificationRecipient`,
    token: viewerToken
  });
  assertStatus(auditForRecipients.status, 200, "GET /v1/config/audit?resource_type=NotificationRecipient");
  assertCondition(Array.isArray(auditForRecipients.json?.items), "notification recipients audit filter should return items");
  assertCondition(
    auditForRecipients.json.items.some((item) => item.action === "notification_recipient_created"),
    "notification_recipient_created audit action missing"
  );
};

const ensureAnalysisAsyncSurface = async (apiBase, viewerToken, analystToken) => {
  const viewerDenied = await request({
    method: "POST",
    url: `${apiBase}/v1/analysis/runs`,
    token: viewerToken,
    body: {
      scope: "overview"
    }
  });
  assertStatus(viewerDenied.status, 403, "POST /v1/analysis/runs viewer denied");

  const idemKey = `contract-analysis-${Date.now()}`;
  const createRun = await request({
    method: "POST",
    url: `${apiBase}/v1/analysis/runs`,
    token: analystToken,
    body: {
      scope: "overview",
      source_type: "news",
      prompt_version: "analysis-v1",
      limit: 80,
      idempotency_key: idemKey,
      filters: {}
    }
  });
  assertStatus(createRun.status, 202, "POST /v1/analysis/runs analyst");
  assertCondition(typeof createRun.json?.analysis_run_id === "string", "analysis_run_id missing");
  assertCondition(typeof createRun.json?.reused === "boolean", "analysis reused flag missing");
  assertCondition(typeof createRun.json?.input_count === "number", "analysis input_count missing");

  const analysisRunId = createRun.json.analysis_run_id;

  const history = await request({
    method: "GET",
    url: `${apiBase}/v1/analysis/history?limit=30`,
    token: viewerToken
  });
  assertStatus(history.status, 200, "GET /v1/analysis/history");
  assertCondition(Array.isArray(history.json?.items), "analysis history items must be array");
  assertCondition(
    (history.json.items ?? []).some((item) => item.id === analysisRunId),
    "analysis history should contain created run"
  );

  const terminal = await waitAnalysisRunTerminal(apiBase, viewerToken, analysisRunId);
  assertCondition(terminal?.run?.status === "completed", "analysis run must complete successfully");
  assertCondition(terminal?.output && typeof terminal.output === "object", "analysis run output must be an object");

  const reused = await request({
    method: "POST",
    url: `${apiBase}/v1/analysis/runs`,
    token: analystToken,
    body: {
      scope: "overview",
      source_type: "news",
      prompt_version: "analysis-v1",
      limit: 80,
      idempotency_key: idemKey,
      filters: {}
    }
  });
  assertStatus(reused.status, 202, "POST /v1/analysis/runs idempotent");
  assertCondition(reused.json?.reused === true, "analysis idempotency must return reused=true");
};

const pickIncidentStatus = (currentStatus) => {
  if (currentStatus === "open") return "acknowledged";
  return "open";
};

const ensureIncidentFlow = async (apiBase, viewerToken, analystToken) => {
  const analystClaims = decodeJwtPayload(analystToken);
  const analystSub = typeof analystClaims.sub === "string" && UUID_REGEX.test(analystClaims.sub) ? analystClaims.sub : null;

  const unauthorized = await request({
    method: "GET",
    url: `${apiBase}/v1/monitor/incidents`
  });
  assertStatus(unauthorized.status, 401, "GET /v1/monitor/incidents without token");

  const listResponse = await request({
    method: "GET",
    url: `${apiBase}/v1/monitor/incidents?limit=80`,
    token: viewerToken
  });
  assertStatus(listResponse.status, 200, "GET /v1/monitor/incidents viewer");
  assertCondition(Array.isArray(listResponse.json?.items), "monitor incidents must return items[]");

  const evaluateResponse = await request({
    method: "POST",
    url: `${apiBase}/v1/monitor/incidents/evaluate`,
    token: analystToken,
    body: {}
  });
  assertStatus(evaluateResponse.status, 202, "POST /v1/monitor/incidents/evaluate analyst");

  await sleep(3000);

  const afterEvaluate = await request({
    method: "GET",
    url: `${apiBase}/v1/monitor/incidents?limit=80`,
    token: viewerToken
  });
  assertStatus(afterEvaluate.status, 200, "GET /v1/monitor/incidents after evaluate");
  assertCondition(Array.isArray(afterEvaluate.json?.items), "monitor incidents after evaluate must return items[]");

  const incident = afterEvaluate.json.items[0];
  if (!incident || !incident.id) {
    console.log("[WARN] incident flow skipped because no incidents were generated");
    return;
  }

  const viewerPatchDenied = await request({
    method: "PATCH",
    url: `${apiBase}/v1/monitor/incidents/${incident.id}`,
    token: viewerToken,
    body: { status: pickIncidentStatus(incident.status) }
  });
  assertStatus(viewerPatchDenied.status, 403, "PATCH /v1/monitor/incidents/{id} viewer denied");

  const patchPayload = {
    status: pickIncidentStatus(incident.status),
    note: "contract incident update",
    ...(analystSub ? { owner_user_id: analystSub } : {})
  };

  const patchResponse = await request({
    method: "PATCH",
    url: `${apiBase}/v1/monitor/incidents/${incident.id}`,
    token: analystToken,
    body: patchPayload
  });

  assertStatus(patchResponse.status, 200, "PATCH /v1/monitor/incidents/{id} analyst");
  assertCondition(patchResponse.json?.incident?.id === incident.id, "patched incident id mismatch");

  const createNoteResponse = await request({
    method: "POST",
    url: `${apiBase}/v1/monitor/incidents/${incident.id}/notes`,
    token: analystToken,
    body: {
      note: "contract incident note"
    }
  });
  assertStatus(createNoteResponse.status, 201, "POST /v1/monitor/incidents/{id}/notes analyst");

  const listNotesResponse = await request({
    method: "GET",
    url: `${apiBase}/v1/monitor/incidents/${incident.id}/notes?limit=20`,
    token: viewerToken
  });
  assertStatus(listNotesResponse.status, 200, "GET /v1/monitor/incidents/{id}/notes viewer");
  assertCondition(Array.isArray(listNotesResponse.json?.items), "incident notes must return items[]");
};

const ensureMonitorSocialSurface = async (apiBase, viewerToken, analystToken) => {
  const accountsResponse = await request({
    method: "GET",
    url: `${apiBase}/v1/monitor/social/accounts?limit=20&sort=riesgo_desc&min_posts=1&min_exposure=1`,
    token: viewerToken
  });
  if (accountsResponse.status === 404) {
    console.log("[WARN] social analytics endpoints disabled, skipping monitor social contract checks");
    return;
  }
  assertStatus(accountsResponse.status, 200, "GET /v1/monitor/social/accounts");
  assertCondition(Array.isArray(accountsResponse.json?.items), "monitor social accounts must return items[]");
  assertCondition(typeof accountsResponse.json?.sort_applied === "string", "monitor social accounts.sort_applied must be string");
  assertCondition(accountsResponse.json?.page_info && typeof accountsResponse.json.page_info === "object", "monitor social accounts.page_info must exist");
  assertCondition(typeof accountsResponse.json?.page_info?.has_next === "boolean", "monitor social accounts.page_info.has_next must be boolean");

  const riskResponse = await request({
    method: "GET",
    url: `${apiBase}/v1/monitor/social/risk`,
    token: viewerToken
  });
  assertStatus(riskResponse.status, 200, "GET /v1/monitor/social/risk");
  assertCondition(typeof riskResponse.json?.stale_data === "boolean", "monitor social risk.stale_data must be boolean");
  assertCondition(typeof riskResponse.json?.stale_after_minutes === "number", "monitor social risk.stale_after_minutes must be number");
  assertCondition(riskResponse.json?.thresholds && typeof riskResponse.json.thresholds === "object", "monitor social risk.thresholds must be object");
  assertCondition(typeof riskResponse.json?.thresholds?.risk_threshold === "number", "monitor social risk.thresholds.risk_threshold must be number");
  assertCondition(Array.isArray(riskResponse.json?.by_channel), "monitor social risk.by_channel must be array");
  assertCondition(Array.isArray(riskResponse.json?.by_account), "monitor social risk.by_account must be array");

  const facetsResponse = await request({
    method: "GET",
    url: `${apiBase}/v1/monitor/social/facets`,
    token: viewerToken
  });
  assertStatus(facetsResponse.status, 200, "GET /v1/monitor/social/facets");
  assertCondition(facetsResponse.json?.totals && typeof facetsResponse.json.totals === "object", "monitor social facets.totals must be object");
  assertCondition(typeof facetsResponse.json?.totals?.posts === "number", "monitor social facets.totals.posts must be number");
  assertCondition(Array.isArray(facetsResponse.json?.facets?.account), "monitor social facets.account must be array");
  assertCondition(Array.isArray(facetsResponse.json?.facets?.sentiment), "monitor social facets.sentiment must be array");

  const postsResponse = await request({
    method: "GET",
    url: `${apiBase}/v1/monitor/social/posts?limit=10`,
    token: viewerToken
  });

  assertStatus(postsResponse.status, 200, "GET /v1/monitor/social/posts");
  assertCondition(Array.isArray(postsResponse.json?.items), "monitor social posts must return items[]");
  assertCondition(postsResponse.json?.page_info && typeof postsResponse.json.page_info === "object", "monitor social posts.page_info must exist");
  assertCondition(typeof postsResponse.json?.page_info?.has_next === "boolean", "monitor social posts.page_info.has_next must be boolean");

  if (postsResponse.json?.page_info?.next_cursor) {
    const postsNext = await request({
      method: "GET",
      url: `${apiBase}/v1/monitor/social/posts?limit=10&cursor=${encodeURIComponent(postsResponse.json.page_info.next_cursor)}`,
      token: viewerToken
    });
    assertStatus(postsNext.status, 200, "GET /v1/monitor/social/posts cursor");
  }

  for (const item of postsResponse.json.items) {
    assertCondition(typeof item.awario_comments_count === "number", "monitor social post missing awario_comments_count");
  }

  const firstPost = postsResponse.json.items[0];
  if (!firstPost || typeof firstPost.id !== "string") {
    console.log("[WARN] monitor social comments checks skipped: no posts available");
    return;
  }

  const commentsResponse = await request({
    method: "GET",
    url: `${apiBase}/v1/monitor/social/posts/${firstPost.id}/comments?limit=20`,
    token: viewerToken
  });
  assertStatus(commentsResponse.status, 200, "GET /v1/monitor/social/posts/{post_id}/comments");
  assertCondition(Array.isArray(commentsResponse.json?.items), "monitor social comments must return items[]");
  assertCondition(commentsResponse.json?.page_info && typeof commentsResponse.json.page_info === "object", "monitor social comments.page_info must exist");
  assertCondition(typeof commentsResponse.json?.page_info?.has_next === "boolean", "monitor social comments.page_info.has_next must be boolean");

  if (commentsResponse.json?.page_info?.next_cursor) {
    const commentsNext = await request({
      method: "GET",
      url: `${apiBase}/v1/monitor/social/posts/${firstPost.id}/comments?limit=20&cursor=${encodeURIComponent(commentsResponse.json.page_info.next_cursor)}`,
      token: viewerToken
    });
    assertStatus(commentsNext.status, 200, "GET /v1/monitor/social/posts/{post_id}/comments cursor");
  }

  const firstComment = commentsResponse.json.items[0];
  if (!firstComment || typeof firstComment.id !== "string") {
    console.log("[WARN] monitor social comment patch skipped: no comments available");
    return;
  }

  const viewerDenied = await request({
    method: "PATCH",
    url: `${apiBase}/v1/monitor/social/comments/${firstComment.id}`,
    token: viewerToken,
    body: {
      is_spam: Boolean(firstComment.is_spam)
    }
  });
  assertStatus(viewerDenied.status, 403, "PATCH /v1/monitor/social/comments/{comment_id} viewer denied");

  const patchResponse = await request({
    method: "PATCH",
    url: `${apiBase}/v1/monitor/social/comments/${firstComment.id}`,
    token: analystToken,
    body: {
      is_spam: Boolean(firstComment.is_spam)
    }
  });
  assertStatus(patchResponse.status, 200, "PATCH /v1/monitor/social/comments/{comment_id} analyst");
  assertCondition(patchResponse.json?.id === firstComment.id, "monitor social comment patch returned unexpected id");
};

const main = async () => {
  loadEnv();

  const apiBase = sh("terraform -chdir=infra/terraform output -raw http_api_endpoint");
  assertCondition(apiBase.startsWith("https://"), "Invalid API base URL");

  const { viewerToken, analystToken, adminToken } = ensureTokens();
  assertCondition(Boolean(adminToken), "admin token missing");

  const health = await request({ method: "GET", url: `${apiBase}/v1/health` });
  assertStatus(health.status, 200, "GET /v1/health");
  assertCondition(health.json?.status === "ok", "health contract mismatch");

  const metaUnauthorized = await request({ method: "GET", url: `${apiBase}/v1/meta` });
  assertStatus(metaUnauthorized.status, 401, "GET /v1/meta without token");

  const term = await ensureTerm(apiBase, adminToken, "claro");
  await ensureTerm(apiBase, adminToken, "competencia");

  const metaViewer = await request({ method: "GET", url: `${apiBase}/v1/meta`, token: viewerToken });
  assertStatus(metaViewer.status, 200, "GET /v1/meta viewer");
  assertCondition(Array.isArray(metaViewer.json?.providers), "meta.providers must be array");
  await ensureMonitorOverview(apiBase, viewerToken);
  await ensureMonitorSocialSurface(apiBase, viewerToken, analystToken);
  await ensureAnalyzeSurface(apiBase, viewerToken);
  await ensureIncidentFlow(apiBase, viewerToken, analystToken);
  await ensureReportsSurface(apiBase, viewerToken, analystToken, adminToken);

  await ensureConfigSurface(apiBase, viewerToken, analystToken, adminToken);
  await ensureSourceScoringSurface(apiBase, viewerToken, adminToken);
  await ensureNotificationRecipientsSurface(apiBase, viewerToken, analystToken, adminToken);
  await ensureAnalysisAsyncSurface(apiBase, viewerToken, analystToken);

  const contentItem = await ensureContentItem(apiBase, analystToken, viewerToken, term);
  await waitNewsFeed(apiBase, viewerToken, term.id);

  const newState = await ensureStateChange(apiBase, analystToken, contentItem.id, contentItem.state);

  const bulk = await request({
    method: "POST",
    url: `${apiBase}/v1/content/bulk/state`,
    token: analystToken,
    body: {
      ids: [contentItem.id, randomUUID()],
      target_state: pickDifferentState(newState),
      reason: "contract test bulk"
    }
  });
  assertStatus(bulk.status, 200, "POST /v1/content/bulk/state");
  assertCondition(typeof bulk.json?.processed === "number", "bulk.processed must be number");
  assertCondition(typeof bulk.json?.failed === "number", "bulk.failed must be number");
  assertCondition(Array.isArray(bulk.json?.failures), "bulk.failures must be array");

  const classification = await request({
    method: "PATCH",
    url: `${apiBase}/v1/content/${contentItem.id}/classification`,
    token: analystToken,
    body: {
      categoria: "contract-test",
      sentimiento: "neutral",
      etiquetas: ["contract", "api"],
      confidence_override: 0.88,
      reason: "contract test override"
    }
  });
  assertStatus(classification.status, 200, "PATCH /v1/content/{id}/classification");
  assertCondition(classification.json?.prompt_version === "manual-override-v1", "classification prompt_version mismatch");
  assertCondition(classification.json?.model_id === "manual", "classification model_id mismatch");

  const createExport = await request({
    method: "POST",
    url: `${apiBase}/v1/exports/csv`,
    token: analystToken,
    body: {
      filters: {
        q: "claro"
      }
    }
  });
  assertStatus(createExport.status, 202, "POST /v1/exports/csv");
  const exportId = createExport.json?.export_id;
  assertCondition(typeof exportId === "string" && UUID_REGEX.test(exportId), "export_id must be UUID");

  await waitExportCompleted(apiBase, analystToken, exportId);

  console.log("Contract API test completed");
};

main().catch((error) => {
  console.error("Contract API test failed", error);
  process.exit(1);
});
