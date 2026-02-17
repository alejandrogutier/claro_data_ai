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
CODE="$(curl -s -o /tmp/claro-terms-create-admin.json -w "%{http_code}" -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"name":"claro-smoke-term","language":"es","max_articles_per_run":50}' "$API_BASE/v1/terms")"
assert_code_in "$CODE" "201" "409" "POST /v1/terms admin"

echo "[3] Ingestion replay idempotency"
RUN_ID="$(node -e 'console.log(require("crypto").randomUUID())')"
BODY="{\"run_id\":\"$RUN_ID\",\"terms\":[\"claro\"],\"language\":\"es\",\"max_articles_per_term\":20}"

RESP_1="$(curl -s -X POST "$API_BASE/v1/ingestion/runs" -H "Authorization: Bearer $ANALYST_TOKEN" -H "Content-Type: application/json" -d "$BODY")"
echo "$RESP_1" >/tmp/claro-ingestion-replay-1.json
CODE_1="$(jq -r '.status' /tmp/claro-ingestion-replay-1.json)"
if [[ "$CODE_1" != "accepted" ]]; then
  echo "[FAIL] first ingestion not accepted"
  cat /tmp/claro-ingestion-replay-1.json
  exit 1
fi
EXEC_1="$(jq -r '.execution_arn' /tmp/claro-ingestion-replay-1.json)"
wait_execution "$EXEC_1"

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
wait_execution "$EXEC_2"

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
wait_execution "$EXEC_3"

COUNT_3="$(count_run_links "$RUN_ID" "$CLUSTER_ARN" "$DB_SECRET_ARN")"
STATUS_3="$(get_run_status "$RUN_ID" "$CLUSTER_ARN" "$DB_SECRET_ARN")"
echo "[INFO] run status/count after replay-on-completed: $STATUS_3 / $COUNT_3"

if [[ "$COUNT_2" != "$COUNT_3" ]]; then
  echo "[FAIL] replay on completed run changed link count ($COUNT_2 -> $COUNT_3)"
  exit 1
fi

echo "[OK] replay on completed run did not duplicate run-content links"

echo "Smoke business API completed"
