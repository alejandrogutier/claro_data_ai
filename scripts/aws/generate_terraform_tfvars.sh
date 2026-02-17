#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

: "${AWS_REGION:=us-east-1}"

VPC_ID="$(aws ec2 describe-vpcs --region "$AWS_REGION" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "No default VPC found in $AWS_REGION"
  exit 1
fi

SUBNET_IDS_RAW="$(aws ec2 describe-subnets --region "$AWS_REGION" --filters "Name=vpc-id,Values=$VPC_ID" --query 'Subnets[*].SubnetId' --output text)"
read -r -a SUBNET_IDS <<<"$SUBNET_IDS_RAW"

if [[ "${#SUBNET_IDS[@]}" -lt 2 ]]; then
  echo "Need at least 2 subnets in VPC $VPC_ID"
  exit 1
fi

DB_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-28)"
OWNER="${OWNER:-claro-data-team}"
COST_CENTER="${COST_CENTER:-marketing-intelligence}"
BUDGET_EMAIL="${BUDGET_EMAIL:-ops@example.com}"
SES_SENDER_EMAIL="${SES_SENDER_EMAIL:-digest@example.com}"
ALERT_EMAIL_RECIPIENTS="${ALERT_EMAIL_RECIPIENTS:-}"
PROVIDER_KEYS_SECRET_NAME="${PROVIDER_KEYS_SECRET_NAME:-claro-data-prod/provider-api-keys}"
APP_CONFIG_SECRET_NAME="${APP_CONFIG_SECRET_NAME:-claro-data-prod/app-config}"
AWS_CREDENTIALS_SECRET_NAME="${AWS_CREDENTIALS_SECRET_NAME:-claro-data-prod/aws-credentials}"
DATABASE_SECRET_NAME="${DATABASE_SECRET_NAME:-claro-data-prod/database}"

TFVARS_PATH="$ROOT_DIR/infra/terraform/terraform.tfvars"
LAMBDA_PACKAGE_PATH="$ROOT_DIR/build/lambda-api.zip"

if [[ -f "$TFVARS_PATH" ]]; then
  EXISTING_DB_PASSWORD="$(grep -E '^db_master_password[[:space:]]*=' "$TFVARS_PATH" | head -n 1 | sed -E 's/.*\"([^\"]*)\".*/\\1/' || true)"
  if [[ -n "$EXISTING_DB_PASSWORD" ]]; then
    DB_PASSWORD="$EXISTING_DB_PASSWORD"
  fi
fi

if [[ -n "${DB_MASTER_PASSWORD:-}" ]]; then
  DB_PASSWORD="$DB_MASTER_PASSWORD"
fi

cat > "$TFVARS_PATH" <<VARS
owner                = "$OWNER"
cost_center          = "$COST_CENTER"
vpc_id               = "$VPC_ID"
private_subnet_ids   = ["${SUBNET_IDS[0]}", "${SUBNET_IDS[1]}"]
db_master_password   = "$DB_PASSWORD"
budget_email         = "$BUDGET_EMAIL"
ses_sender_email     = "$SES_SENDER_EMAIL"
alert_email_recipients = "$ALERT_EMAIL_RECIPIENTS"
lambda_package_path  = "$LAMBDA_PACKAGE_PATH"
provider_keys_secret_name = "$PROVIDER_KEYS_SECRET_NAME"
app_config_secret_name    = "$APP_CONFIG_SECRET_NAME"
aws_credentials_secret_name = "$AWS_CREDENTIALS_SECRET_NAME"
database_secret_name      = "$DATABASE_SECRET_NAME"
VARS

echo "Generated: $TFVARS_PATH"
echo "Using VPC: $VPC_ID"
echo "Using subnets: ${SUBNET_IDS[0]}, ${SUBNET_IDS[1]}"
