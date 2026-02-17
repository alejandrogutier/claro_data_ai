#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[1/3] Installing dependencies"
npm install --silent

echo "[2/3] Building TypeScript"
npm run build --silent

echo "[3/3] Packaging Lambda artifact"
mkdir -p build
rm -f build/lambda-api.zip
(
  cd dist
  zip -qr ../build/lambda-api.zip .
)

echo "Lambda artifact created: $ROOT_DIR/build/lambda-api.zip"
