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
  await ensureIncidentFlow(apiBase, viewerToken, analystToken);

  await ensureConfigSurface(apiBase, viewerToken, analystToken, adminToken);

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
