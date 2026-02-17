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
