#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <username> <password> <role:Admin|Analyst|Viewer>"
  exit 1
fi

USERNAME="$1"
PASSWORD="$2"
ROLE="$3"

if [[ "$ROLE" != "Admin" && "$ROLE" != "Analyst" && "$ROLE" != "Viewer" ]]; then
  echo "Invalid role: $ROLE"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

POOL_ID="$(terraform -chdir=infra/terraform output -raw cognito_user_pool_id)"

if ! aws cognito-idp admin-get-user --region "$AWS_REGION" --user-pool-id "$POOL_ID" --username "$USERNAME" >/dev/null 2>&1; then
  CREATE_ARGS=(
    --region "$AWS_REGION"
    --user-pool-id "$POOL_ID"
    --username "$USERNAME"
    --temporary-password "$PASSWORD"
    --message-action SUPPRESS
  )

  if [[ "$USERNAME" == *"@"* ]]; then
    CREATE_ARGS+=(
      --user-attributes
      "Name=email,Value=$USERNAME"
      "Name=email_verified,Value=true"
    )
  fi

  aws cognito-idp admin-create-user "${CREATE_ARGS[@]}" >/dev/null
  echo "created user: $USERNAME"
else
  echo "user exists: $USERNAME"
fi

aws cognito-idp admin-set-user-password \
  --region "$AWS_REGION" \
  --user-pool-id "$POOL_ID" \
  --username "$USERNAME" \
  --password "$PASSWORD" \
  --permanent >/dev/null

for GROUP in Admin Analyst Viewer; do
  if [[ "$GROUP" != "$ROLE" ]]; then
    aws cognito-idp admin-remove-user-from-group \
      --region "$AWS_REGION" \
      --user-pool-id "$POOL_ID" \
      --username "$USERNAME" \
      --group-name "$GROUP" >/dev/null 2>&1 || true
  fi
done

aws cognito-idp admin-add-user-to-group \
  --region "$AWS_REGION" \
  --user-pool-id "$POOL_ID" \
  --username "$USERNAME" \
  --group-name "$ROLE" >/dev/null

echo "user ready: $USERNAME ($ROLE)"
