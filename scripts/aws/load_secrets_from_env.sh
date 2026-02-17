#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env file in $ROOT_DIR"
  exit 1
fi

set -a
source .env
set +a

: "${AWS_REGION:=us-west-2}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required"
  exit 1
fi

PROVIDER_SECRET_NAME="${PROVIDER_SECRET_NAME:-claro-data-prod/provider-api-keys}"
APP_CONFIG_SECRET_NAME="${APP_CONFIG_SECRET_NAME:-claro-data-prod/app-config}"
AWS_CREDENTIALS_SECRET_NAME="${AWS_CREDENTIALS_SECRET_NAME:-claro-data-prod/aws-credentials}"

provider_payload="$(jq -n \
  --arg news_api_key "${NEWS_API_KEY:-}" \
  --arg gnews_api_key "${GNEWS_API_KEY:-}" \
  --arg newsdata_api_key "${NEWSDATA_API_KEY:-}" \
  --arg worldnews_api_key "${WORLDNEWS_API_KEY:-}" \
  --arg guardian_api_key "${GUARDIAN_API_KEY:-}" \
  --arg nyt_api_key "${NYT_API_KEY:-}" \
  --arg gnews_api_url "${GNEWS_API_URL:-}" \
  --arg newsdata_api_url "${NEWSDATA_API_URL:-}" \
  --arg worldnews_api_url "${WORLDNEWS_API_URL:-}" \
  --arg guardian_api_url "${GUARDIAN_API_URL:-}" \
  --arg nyt_api_url "${NYT_API_URL:-}" \
  '{
    NEWS_API_KEY: $news_api_key,
    GNEWS_API_KEY: $gnews_api_key,
    NEWSDATA_API_KEY: $newsdata_api_key,
    WORLDNEWS_API_KEY: $worldnews_api_key,
    GUARDIAN_API_KEY: $guardian_api_key,
    NYT_API_KEY: $nyt_api_key,
    GNEWS_API_URL: $gnews_api_url,
    NEWSDATA_API_URL: $newsdata_api_url,
    WORLDNEWS_API_URL: $worldnews_api_url,
    GUARDIAN_API_URL: $guardian_api_url,
    NYT_API_URL: $nyt_api_url
  }')"

app_config_payload="$(jq -n \
  --arg aws_region "${AWS_REGION:-us-west-2}" \
  --arg bedrock_model_id "${BEDROCK_MODEL_ID:-anthropic.claude-haiku-4-5-20251001-v1:0}" \
  --arg news_db_path "${NEWS_DB_PATH:-}" \
  '{
    AWS_REGION: $aws_region,
    BEDROCK_MODEL_ID: $bedrock_model_id,
    NEWS_DB_PATH: $news_db_path
  }')"

aws_credentials_payload="$(jq -n \
  --arg aws_access_key_id "${AWS_ACCESS_KEY_ID:-}" \
  --arg aws_secret_access_key "${AWS_SECRET_ACCESS_KEY:-}" \
  '{
    AWS_ACCESS_KEY_ID: $aws_access_key_id,
    AWS_SECRET_ACCESS_KEY: $aws_secret_access_key
  }')"

upsert_secret() {
  local name="$1"
  local payload="$2"

  if aws secretsmanager describe-secret --region "$AWS_REGION" --secret-id "$name" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value \
      --region "$AWS_REGION" \
      --secret-id "$name" \
      --secret-string "$payload" >/dev/null
    echo "updated secret: $name"
  else
    aws secretsmanager create-secret \
      --region "$AWS_REGION" \
      --name "$name" \
      --secret-string "$payload" >/dev/null
    echo "created secret: $name"
  fi
}

echo "Loading secrets into Secrets Manager (region: $AWS_REGION)"
upsert_secret "$PROVIDER_SECRET_NAME" "$provider_payload"
upsert_secret "$APP_CONFIG_SECRET_NAME" "$app_config_payload"
upsert_secret "$AWS_CREDENTIALS_SECRET_NAME" "$aws_credentials_payload"
echo "Done"
