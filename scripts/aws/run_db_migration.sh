#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

FUNCTION_NAME="$(terraform -chdir=infra/terraform output -raw db_migration_lambda_name)"
TMP_OUT="/tmp/claro-db-migration-response.json"

aws lambda invoke \
  --cli-binary-format raw-in-base64-out \
  --region "$AWS_REGION" \
  --function-name "$FUNCTION_NAME" \
  --payload '{}' \
  "$TMP_OUT" >/tmp/claro-db-migration-meta.json

cat /tmp/claro-db-migration-meta.json
cat "$TMP_OUT"
