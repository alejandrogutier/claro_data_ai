#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[1/4] Installing dependencies"
npm install --silent

echo "[2/4] Building TypeScript"
npm run build --silent

echo "[3/4] Preparing Lambda artifact"
mkdir -p build
STAGING_DIR="$(mktemp -d "$ROOT_DIR/build/lambda-staging.XXXXXX")"
PACKAGE_TMP="$ROOT_DIR/build/lambda-api-$(date +%s).zip"

cp -R dist/* "$STAGING_DIR/"
cp package.json package-lock.json "$STAGING_DIR/"
mkdir -p "$STAGING_DIR/prisma"
cp -R prisma/migrations "$STAGING_DIR/prisma/"

echo "[4/4] Packaging Lambda artifact"

(
  cd "$STAGING_DIR"
  npm ci --omit=dev --silent
  zip -qr "$PACKAGE_TMP" .
)

cp "$PACKAGE_TMP" "$ROOT_DIR/build/lambda-api.zip"

echo "Lambda artifact created: $ROOT_DIR/build/lambda-api.zip"
