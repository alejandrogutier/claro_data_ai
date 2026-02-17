#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

API_BASE="$(terraform -chdir=infra/terraform output -raw http_api_endpoint)"
TEST_PASSWORD="${TEST_USER_PASSWORD:-ClaroData!2026}"
VIEWER_USER="${TEST_VIEWER_USER:-viewer-test@claro.local}"
ANALYST_USER="${TEST_ANALYST_USER:-analyst-test@claro.local}"
ADMIN_USER="${TEST_ADMIN_USER:-admin-test@claro.local}"
DB_NAME="${DB_NAME:-clarodata}"

./scripts/aws/seed_cognito_test_user.sh "$VIEWER_USER" "$TEST_PASSWORD" Viewer >/dev/null
./scripts/aws/seed_cognito_test_user.sh "$ANALYST_USER" "$TEST_PASSWORD" Analyst >/dev/null
./scripts/aws/seed_cognito_test_user.sh "$ADMIN_USER" "$TEST_PASSWORD" Admin >/dev/null

VIEWER_TOKEN="$(./scripts/aws/get_cognito_id_token.sh "$VIEWER_USER" "$TEST_PASSWORD")"
ANALYST_TOKEN="$(./scripts/aws/get_cognito_id_token.sh "$ANALYST_USER" "$TEST_PASSWORD")"
ADMIN_TOKEN="$(./scripts/aws/get_cognito_id_token.sh "$ADMIN_USER" "$TEST_PASSWORD")"

assert_code() {
  local got="$1"
  local expected="$2"
  local label="$3"

  if [[ "$got" != "$expected" ]]; then
    echo "[FAIL] $label expected=$expected got=$got"
    exit 1
  fi
  echo "[OK] $label -> $got"
}

assert_code_in() {
  local got="$1"
  local expected_a="$2"
  local expected_b="$3"
  local label="$4"

  if [[ "$got" != "$expected_a" && "$got" != "$expected_b" ]]; then
    echo "[FAIL] $label expected=$expected_a|$expected_b got=$got"
    exit 1
  fi
  echo "[OK] $label -> $got"
}

wait_execution() {
  local execution_arn="$1"
  for i in {1..40}; do
    local status
    status="$(aws stepfunctions describe-execution --region "$AWS_REGION" --execution-arn "$execution_arn" --query 'status' --output text)"
    if [[ "$status" == "SUCCEEDED" ]]; then
      echo "[OK] execution succeeded: $execution_arn"
      return 0
    fi
    if [[ "$status" == "FAILED" || "$status" == "TIMED_OUT" || "$status" == "ABORTED" ]]; then
      echo "[FAIL] execution status=$status arn=$execution_arn"
      aws stepfunctions describe-execution --region "$AWS_REGION" --execution-arn "$execution_arn" --output json
      exit 1
    fi
    sleep 5
  done

  echo "[FAIL] execution timeout arn=$execution_arn"
  exit 1
}

count_run_links() {
  local run_id="$1"
  local cluster_arn="$2"
  local db_secret_arn="$3"

  aws rds-data execute-statement \
    --region "$AWS_REGION" \
    --resource-arn "$cluster_arn" \
    --secret-arn "$db_secret_arn" \
    --database "$DB_NAME" \
    --sql "SELECT COUNT(*)::int FROM \"public\".\"IngestionRunContentLink\" WHERE \"ingestionRunId\"='${run_id}'" \
    --query 'records[0][0].longValue' \
    --output text
}

get_run_status() {
  local run_id="$1"
  local cluster_arn="$2"
  local db_secret_arn="$3"

  aws rds-data execute-statement \
    --region "$AWS_REGION" \
    --resource-arn "$cluster_arn" \
    --secret-arn "$db_secret_arn" \
    --database "$DB_NAME" \
    --sql "SELECT \"status\"::text FROM \"public\".\"IngestionRun\" WHERE \"id\"='${run_id}' LIMIT 1" \
    --query 'records[0][0].stringValue' \
    --output text
}

wait_run_terminal() {
  local run_id="$1"
  local cluster_arn="$2"
  local db_secret_arn="$3"

  for i in {1..40}; do
    local status
    status="$(get_run_status "$run_id" "$cluster_arn" "$db_secret_arn")"
    if [[ "$status" == "completed" || "$status" == "failed" ]]; then
      echo "$status"
      return 0
    fi
    sleep 3
  done

  echo "timeout"
  return 1
}

wait_export_completed() {
  local export_id="$1"
  local token="$2"

  for i in {1..60}; do
    local code
    code="$(curl -s -o /tmp/claro-export-status.json -w "%{http_code}" -H "Authorization: Bearer $token" "$API_BASE/v1/exports/$export_id")"
    if [[ "$code" != "200" ]]; then
      echo "[FAIL] GET /v1/exports/$export_id expected 200 got=$code"
      cat /tmp/claro-export-status.json
      exit 1
    fi

    local status
    status="$(jq -r '.status // empty' /tmp/claro-export-status.json)"
    if [[ "$status" == "completed" ]]; then
      local download_url
      download_url="$(jq -r '.download_url // empty' /tmp/claro-export-status.json)"
      if [[ -z "$download_url" || "$download_url" == "null" ]]; then
        echo "[FAIL] completed export missing download_url"
        cat /tmp/claro-export-status.json
        exit 1
      fi
      echo "[OK] export completed with download_url"
      return 0
    fi

    if [[ "$status" == "failed" ]]; then
      echo "[FAIL] export failed for export_id=$export_id"
      cat /tmp/claro-export-status.json
      exit 1
    fi

    sleep 5
  done

  echo "[FAIL] export timeout export_id=$export_id"
  exit 1
}

echo "[1] Health and auth checks"
CODE="$(curl -s -o /tmp/claro-health.json -w "%{http_code}" "$API_BASE/v1/health")"
assert_code "$CODE" "200" "GET /v1/health"

CODE="$(curl -s -o /tmp/claro-meta-no-token.json -w "%{http_code}" "$API_BASE/v1/meta")"
assert_code "$CODE" "401" "GET /v1/meta without token"

CODE="$(curl -s -o /tmp/claro-meta-viewer.json -w "%{http_code}" -H "Authorization: Bearer $VIEWER_TOKEN" "$API_BASE/v1/meta")"
assert_code "$CODE" "200" "GET /v1/meta viewer"

CODE="$(curl -s -o /tmp/claro-content-viewer.json -w "%{http_code}" -H "Authorization: Bearer $VIEWER_TOKEN" "$API_BASE/v1/content?limit=5")"
assert_code "$CODE" "200" "GET /v1/content viewer"

CODE="$(curl -s -o /tmp/claro-terms-viewer.json -w "%{http_code}" -H "Authorization: Bearer $VIEWER_TOKEN" "$API_BASE/v1/terms?limit=5")"
assert_code "$CODE" "200" "GET /v1/terms viewer"

CODE="$(curl -s -o /tmp/claro-terms-create-viewer.json -w "%{http_code}" -X POST -H "Authorization: Bearer $VIEWER_TOKEN" -H "Content-Type: application/json" -d '{"name":"smoke-viewer-denied"}' "$API_BASE/v1/terms")"
assert_code "$CODE" "403" "POST /v1/terms viewer denied"

echo "[2] Terms create and list"
SMOKE_TERM_NAME="claro-feed-smoke"
CODE="$(curl -s -o /tmp/claro-terms-create-admin.json -w "%{http_code}" -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d "{\"name\":\"$SMOKE_TERM_NAME\",\"language\":\"es\",\"scope\":\"claro\",\"max_articles_per_run\":2}" "$API_BASE/v1/terms")"
assert_code_in "$CODE" "201" "409" "POST /v1/terms admin"

SMOKE_COMP_TERM_NAME="competencia-feed-smoke"
CODE="$(curl -s -o /tmp/claro-terms-create-comp-admin.json -w "%{http_code}" -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d "{\"name\":\"$SMOKE_COMP_TERM_NAME\",\"language\":\"es\",\"scope\":\"competencia\",\"max_articles_per_run\":2}" "$API_BASE/v1/terms")"
assert_code_in "$CODE" "201" "409" "POST /v1/terms competencia admin"

SMOKE_TERM_ID="$(jq -r '.id // empty' /tmp/claro-terms-create-admin.json)"
if [[ -z "$SMOKE_TERM_ID" || "$SMOKE_TERM_ID" == "null" ]]; then
  CODE="$(curl -s -o /tmp/claro-terms-list-admin.json -w "%{http_code}" -H "Authorization: Bearer $ADMIN_TOKEN" "$API_BASE/v1/terms?limit=200")"
  assert_code "$CODE" "200" "GET /v1/terms admin"
  SMOKE_TERM_ID="$(jq -r --arg NAME "$SMOKE_TERM_NAME" '.items[] | select(.name==$NAME) | .id' /tmp/claro-terms-list-admin.json | head -n 1)"
fi

if [[ -z "$SMOKE_TERM_ID" ]]; then
  echo "[FAIL] no term id available for smoke feed checks"
  exit 1
fi

CODE="$(curl -s -o /tmp/claro-terms-competencia-list.json -w "%{http_code}" -H "Authorization: Bearer $VIEWER_TOKEN" "$API_BASE/v1/terms?limit=100&scope=competencia")"
assert_code "$CODE" "200" "GET /v1/terms?scope=competencia viewer"

ALL_COMP_SCOPE="$(jq -r '([.items[]?.scope == "competencia"] | all) | tostring' /tmp/claro-terms-competencia-list.json)"
if [[ "$ALL_COMP_SCOPE" != "true" ]]; then
  echo "[FAIL] scope filter competencia returned mixed scopes"
  cat /tmp/claro-terms-competencia-list.json
  exit 1
fi

echo "[3] Ingestion replay idempotency"
RUN_ID="$(node -e 'console.log(require("crypto").randomUUID())')"
BODY="{\"run_id\":\"$RUN_ID\",\"term_ids\":[\"$SMOKE_TERM_ID\"],\"terms\":[\"$SMOKE_TERM_NAME\"],\"language\":\"es\",\"max_articles_per_term\":20}"

RESP_1="$(curl -s -X POST "$API_BASE/v1/ingestion/runs" -H "Authorization: Bearer $ANALYST_TOKEN" -H "Content-Type: application/json" -d "$BODY")"
echo "$RESP_1" >/tmp/claro-ingestion-replay-1.json
CODE_1="$(jq -r '.status' /tmp/claro-ingestion-replay-1.json)"
if [[ "$CODE_1" != "accepted" ]]; then
  echo "[FAIL] first ingestion not accepted"
  cat /tmp/claro-ingestion-replay-1.json
  exit 1
fi
EXEC_1="$(jq -r '.execution_arn' /tmp/claro-ingestion-replay-1.json)"
if [[ -n "$EXEC_1" && "$EXEC_1" != "null" ]]; then
  wait_execution "$EXEC_1"
else
  echo "[INFO] first ingestion accepted without execution_arn (skip dispatch)"
fi

CLUSTER_ARN="$(aws rds describe-db-clusters --region "$AWS_REGION" --query 'DBClusters[?DBClusterIdentifier==`claro-data-prod-aurora`].DBClusterArn | [0]' --output text)"
if [[ -z "$CLUSTER_ARN" || "$CLUSTER_ARN" == "None" ]]; then
  echo "[FAIL] cluster arn not found"
  exit 1
fi

DB_SECRET_ARN="$(aws secretsmanager describe-secret --region "$AWS_REGION" --secret-id "${DATABASE_SECRET_NAME:-claro-data-prod/database}" --query 'ARN' --output text)"
if [[ -z "$DB_SECRET_ARN" || "$DB_SECRET_ARN" == "None" ]]; then
  echo "[FAIL] database secret arn not found"
  exit 1
fi

COUNT_1="$(count_run_links "$RUN_ID" "$CLUSTER_ARN" "$DB_SECRET_ARN")"
STATUS_1="$(get_run_status "$RUN_ID" "$CLUSTER_ARN" "$DB_SECRET_ARN")"
echo "[INFO] run status/count after first run: $STATUS_1 / $COUNT_1"

RESP_2="$(curl -s -X POST "$API_BASE/v1/ingestion/runs" -H "Authorization: Bearer $ANALYST_TOKEN" -H "Content-Type: application/json" -d "$BODY")"
echo "$RESP_2" >/tmp/claro-ingestion-replay-2.json
CODE_2="$(jq -r '.status' /tmp/claro-ingestion-replay-2.json)"
if [[ "$CODE_2" != "accepted" ]]; then
  echo "[FAIL] second ingestion not accepted"
  cat /tmp/claro-ingestion-replay-2.json
  exit 1
fi
EXEC_2="$(jq -r '.execution_arn' /tmp/claro-ingestion-replay-2.json)"
if [[ -n "$EXEC_2" && "$EXEC_2" != "null" ]]; then
  wait_execution "$EXEC_2"
else
  echo "[INFO] second ingestion accepted without execution_arn (idempotent skip)"
fi

COUNT_2="$(count_run_links "$RUN_ID" "$CLUSTER_ARN" "$DB_SECRET_ARN")"
STATUS_2="$(get_run_status "$RUN_ID" "$CLUSTER_ARN" "$DB_SECRET_ARN")"
echo "[INFO] run status/count after second run: $STATUS_2 / $COUNT_2"

STATUS_2_TERMINAL="$(wait_run_terminal "$RUN_ID" "$CLUSTER_ARN" "$DB_SECRET_ARN")"
if [[ "$STATUS_2_TERMINAL" != "completed" ]]; then
  echo "[FAIL] expected run to be completed after stabilization replay, got status=$STATUS_2_TERMINAL"
  exit 1
fi
COUNT_2="$(count_run_links "$RUN_ID" "$CLUSTER_ARN" "$DB_SECRET_ARN")"
echo "[INFO] run terminal status/count after second run: $STATUS_2_TERMINAL / $COUNT_2"

RESP_3="$(curl -s -X POST "$API_BASE/v1/ingestion/runs" -H "Authorization: Bearer $ANALYST_TOKEN" -H "Content-Type: application/json" -d "$BODY")"
echo "$RESP_3" >/tmp/claro-ingestion-replay-3.json
CODE_3="$(jq -r '.status' /tmp/claro-ingestion-replay-3.json)"
if [[ "$CODE_3" != "accepted" ]]; then
  echo "[FAIL] third ingestion not accepted"
  cat /tmp/claro-ingestion-replay-3.json
  exit 1
fi
EXEC_3="$(jq -r '.execution_arn' /tmp/claro-ingestion-replay-3.json)"
if [[ -n "$EXEC_3" && "$EXEC_3" != "null" ]]; then
  wait_execution "$EXEC_3"
else
  echo "[INFO] replay-on-completed accepted without execution_arn (idempotent skip)"
fi

COUNT_3="$(count_run_links "$RUN_ID" "$CLUSTER_ARN" "$DB_SECRET_ARN")"
STATUS_3="$(get_run_status "$RUN_ID" "$CLUSTER_ARN" "$DB_SECRET_ARN")"
echo "[INFO] run status/count after replay-on-completed: $STATUS_3 / $COUNT_3"

if [[ "$COUNT_2" != "$COUNT_3" ]]; then
  echo "[FAIL] replay on completed run changed link count ($COUNT_2 -> $COUNT_3)"
  exit 1
fi

echo "[OK] replay on completed run did not duplicate run-content links"

echo "[3.1] News feed limit and order"
CODE="$(curl -s -o /tmp/claro-feed-news.json -w "%{http_code}" -H "Authorization: Bearer $VIEWER_TOKEN" "$API_BASE/v1/feed/news?term_id=$SMOKE_TERM_ID")"
assert_code "$CODE" "200" "GET /v1/feed/news viewer"

FEED_COUNT="$(jq -r '.items | length' /tmp/claro-feed-news.json)"
if [[ "$FEED_COUNT" -gt 2 ]]; then
  echo "[FAIL] /v1/feed/news returned more than 2 items: $FEED_COUNT"
  cat /tmp/claro-feed-news.json
  exit 1
fi

if [[ "$FEED_COUNT" -ge 2 ]]; then
  FEED_ORDER_OK="$(jq -r '((.items[0].published_at // .items[0].created_at) >= (.items[1].published_at // .items[1].created_at)) | tostring' /tmp/claro-feed-news.json)"
  if [[ "$FEED_ORDER_OK" != "true" ]]; then
    echo "[FAIL] /v1/feed/news not ordered by recency desc"
    cat /tmp/claro-feed-news.json
    exit 1
  fi
fi

echo "[4] Editorial operations (state, bulk, classification)"
CODE="$(curl -s -o /tmp/claro-content-for-state.json -w "%{http_code}" -H "Authorization: Bearer $VIEWER_TOKEN" "$API_BASE/v1/content?limit=1&term_id=$SMOKE_TERM_ID&source_type=news")"
assert_code "$CODE" "200" "GET /v1/content for editorial tests"

CONTENT_ID="$(jq -r '.items[0].id // empty' /tmp/claro-content-for-state.json)"
CURRENT_STATE="$(jq -r '.items[0].state // empty' /tmp/claro-content-for-state.json)"
if [[ -z "$CONTENT_ID" || -z "$CURRENT_STATE" ]]; then
  CODE="$(curl -s -o /tmp/claro-content-for-state.json -w "%{http_code}" -H "Authorization: Bearer $VIEWER_TOKEN" "$API_BASE/v1/content?limit=1")"
  assert_code "$CODE" "200" "GET /v1/content fallback for editorial tests"
  CONTENT_ID="$(jq -r '.items[0].id // empty' /tmp/claro-content-for-state.json)"
  CURRENT_STATE="$(jq -r '.items[0].state // empty' /tmp/claro-content-for-state.json)"
  if [[ -z "$CONTENT_ID" || -z "$CURRENT_STATE" ]]; then
    echo "[FAIL] no content available for editorial tests"
    cat /tmp/claro-content-for-state.json
    exit 1
  fi
fi

TARGET_STATE="active"
if [[ "$CURRENT_STATE" == "active" ]]; then
  TARGET_STATE="archived"
fi

CODE="$(curl -s -o /tmp/claro-content-state.json -w "%{http_code}" -X PATCH -H "Authorization: Bearer $ANALYST_TOKEN" -H "Content-Type: application/json" -d "{\"target_state\":\"$TARGET_STATE\",\"reason\":\"smoke state change\"}" "$API_BASE/v1/content/$CONTENT_ID/state")"
if [[ "$CODE" == "409" ]]; then
  if [[ "$TARGET_STATE" == "active" ]]; then TARGET_STATE="archived"; else TARGET_STATE="active"; fi
  CODE="$(curl -s -o /tmp/claro-content-state.json -w "%{http_code}" -X PATCH -H "Authorization: Bearer $ANALYST_TOKEN" -H "Content-Type: application/json" -d "{\"target_state\":\"$TARGET_STATE\",\"reason\":\"smoke state retry\"}" "$API_BASE/v1/content/$CONTENT_ID/state")"
fi
assert_code "$CODE" "200" "PATCH /v1/content/{id}/state analyst"

BULK_TARGET="active"
if [[ "$TARGET_STATE" == "active" ]]; then BULK_TARGET="hidden"; fi
RANDOM_ID="$(node -e 'console.log(require("crypto").randomUUID())')"
CODE="$(curl -s -o /tmp/claro-content-bulk-state.json -w "%{http_code}" -X POST -H "Authorization: Bearer $ANALYST_TOKEN" -H "Content-Type: application/json" -d "{\"ids\":[\"$CONTENT_ID\",\"$RANDOM_ID\"],\"target_state\":\"$BULK_TARGET\",\"reason\":\"smoke bulk state\"}" "$API_BASE/v1/content/bulk/state")"
assert_code "$CODE" "200" "POST /v1/content/bulk/state analyst"

CODE="$(curl -s -o /tmp/claro-content-classification.json -w "%{http_code}" -X PATCH -H "Authorization: Bearer $ANALYST_TOKEN" -H "Content-Type: application/json" -d '{"categoria":"smoke-test","sentimiento":"neutral","etiquetas":["smoke","contract"],"confidence_override":0.87,"reason":"smoke classification override"}' "$API_BASE/v1/content/$CONTENT_ID/classification")"
assert_code "$CODE" "200" "PATCH /v1/content/{id}/classification analyst"

echo "[5] Export async"
CODE="$(curl -s -o /tmp/claro-export-create.json -w "%{http_code}" -X POST -H "Authorization: Bearer $ANALYST_TOKEN" -H "Content-Type: application/json" -d '{"filters":{"q":"claro"}}' "$API_BASE/v1/exports/csv")"
assert_code "$CODE" "202" "POST /v1/exports/csv analyst"

EXPORT_ID="$(jq -r '.export_id // empty' /tmp/claro-export-create.json)"
if [[ -z "$EXPORT_ID" ]]; then
  echo "[FAIL] export_id missing in create response"
  cat /tmp/claro-export-create.json
  exit 1
fi

wait_export_completed "$EXPORT_ID" "$ANALYST_TOKEN"

echo "Smoke business API completed"
