#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <username> <password>"
  exit 1
fi

USERNAME="$1"
PASSWORD="$2"

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

POOL_ID="$(terraform -chdir=infra/terraform output -raw cognito_user_pool_id)"
CLIENT_ID="$(terraform -chdir=infra/terraform output -raw cognito_client_id)"

aws cognito-idp admin-initiate-auth \
  --region "$AWS_REGION" \
  --user-pool-id "$POOL_ID" \
  --client-id "$CLIENT_ID" \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters "USERNAME=$USERNAME,PASSWORD=$PASSWORD" \
  --query 'AuthenticationResult.IdToken' \
  --output text
