#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

: "${AWS_REGION:=us-east-1}"

PROJECT_NAME="${PROJECT_NAME:-claro-data}"
ENVIRONMENT="${ENVIRONMENT:-prod}"
SECRET_PREFIX="${SECRET_PREFIX:-${PROJECT_NAME}-${ENVIRONMENT}}"
SECRET_NAME="${DATABASE_SECRET_NAME:-${SECRET_PREFIX}/database}"
TFVARS_PATH_DEFAULT="$ROOT_DIR/infra/terraform/terraform.tfvars"
if [[ "$ENVIRONMENT" != "prod" ]]; then
  TFVARS_PATH_DEFAULT="$ROOT_DIR/infra/terraform/terraform.${ENVIRONMENT}.tfvars"
fi
TFVARS_PATH="${TFVARS_PATH:-$TFVARS_PATH_DEFAULT}"
DB_ENDPOINT="$(terraform -chdir=infra/terraform output -raw aurora_endpoint)"

extract_tfvar() {
  local key="$1"
  local fallback="$2"
  local value
  value="$(awk -F'=' -v k="$key" '$1 ~ "^"k"[[:space:]]*$" {gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); gsub(/"/, "", $2); print $2}' "$TFVARS_PATH" | tail -n 1)"
  if [[ -z "$value" ]]; then
    echo "$fallback"
  else
    echo "$value"
  fi
}

DB_NAME="$(extract_tfvar db_name clarodata)"
DB_USER="$(extract_tfvar db_master_username claroadmin)"
DB_PASSWORD="$(extract_tfvar db_master_password '')"

if [[ -z "$DB_PASSWORD" ]]; then
  echo "db_master_password missing in $TFVARS_PATH"
  exit 1
fi

ENC_USER="$(printf '%s' "$DB_USER" | jq -sRr @uri)"
ENC_PASSWORD="$(printf '%s' "$DB_PASSWORD" | jq -sRr @uri)"
ENC_DB_NAME="$(printf '%s' "$DB_NAME" | jq -sRr @uri)"
DATABASE_URL="postgresql://${ENC_USER}:${ENC_PASSWORD}@${DB_ENDPOINT}:5432/${ENC_DB_NAME}?sslmode=require"

payload="$(jq -n \
  --arg database_url "$DATABASE_URL" \
  --arg host "$DB_ENDPOINT" \
  --arg port "5432" \
  --arg db_name "$DB_NAME" \
  --arg username "$DB_USER" \
  --arg password "$DB_PASSWORD" \
  '{DATABASE_URL:$database_url, host:$host, port:$port, db_name:$db_name, username:$username, password:$password}')"

if aws secretsmanager describe-secret --region "$AWS_REGION" --secret-id "$SECRET_NAME" >/dev/null 2>&1; then
  aws secretsmanager put-secret-value \
    --region "$AWS_REGION" \
    --secret-id "$SECRET_NAME" \
    --secret-string "$payload" >/dev/null
  echo "updated secret: $SECRET_NAME"
else
  aws secretsmanager create-secret \
    --region "$AWS_REGION" \
    --name "$SECRET_NAME" \
    --secret-string "$payload" >/dev/null
  echo "created secret: $SECRET_NAME"
fi

aws secretsmanager tag-resource \
  --region "$AWS_REGION" \
  --secret-id "$SECRET_NAME" \
  --tags \
    Key=claro,Value=true \
    Key=app,Value="${APP_TAG:-claro-data}" \
    Key=env,Value="${ENV_TAG:-$ENVIRONMENT}" \
    Key=owner,Value="${OWNER_TAG:-claro-data-team}" \
    Key=cost-center,Value="${COST_CENTER_TAG:-marketing-intelligence}" \
    Key=managed-by,Value=terraform >/dev/null
