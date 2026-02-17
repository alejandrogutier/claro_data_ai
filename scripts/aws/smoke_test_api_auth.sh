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
ADMIN_USER="${TEST_ADMIN_USER:-admin-test@claro.local}"

./scripts/aws/seed_cognito_test_user.sh "$VIEWER_USER" "$TEST_PASSWORD" Viewer >/dev/null
./scripts/aws/seed_cognito_test_user.sh "$ADMIN_USER" "$TEST_PASSWORD" Admin >/dev/null

VIEWER_TOKEN="$(./scripts/aws/get_cognito_id_token.sh "$VIEWER_USER" "$TEST_PASSWORD")"
ADMIN_TOKEN="$(./scripts/aws/get_cognito_id_token.sh "$ADMIN_USER" "$TEST_PASSWORD")"

echo "[1] Public health (expect 200)"
curl -s -o /tmp/health.json -w "%{http_code}\n" "$API_BASE/v1/health"
cat /tmp/health.json

echo "[2] Private route without token (expect 401 from gateway)"
curl -s -o /tmp/meta-no-token.json -w "%{http_code}\n" "$API_BASE/v1/meta"
cat /tmp/meta-no-token.json

echo "[3] Viewer on viewer route GET /v1/meta (expect 501 until implementation)"
curl -s -o /tmp/meta-viewer.json -w "%{http_code}\n" -H "Authorization: Bearer $VIEWER_TOKEN" "$API_BASE/v1/meta"
cat /tmp/meta-viewer.json

echo "[4] Viewer on admin route POST /v1/terms (expect 403)"
curl -s -o /tmp/terms-viewer.json -w "%{http_code}\n" -X POST -H "Authorization: Bearer $VIEWER_TOKEN" -H "Content-Type: application/json" -d '{"name":"test"}' "$API_BASE/v1/terms"
cat /tmp/terms-viewer.json

echo "[5] Admin on admin route POST /v1/terms (expect 501 until implementation)"
curl -s -o /tmp/terms-admin.json -w "%{http_code}\n" -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"name":"test"}' "$API_BASE/v1/terms"
cat /tmp/terms-admin.json
