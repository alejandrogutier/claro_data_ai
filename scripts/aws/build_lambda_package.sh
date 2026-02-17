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
rm -f build/lambda-api.zip
rm -rf build/lambda
mkdir -p build/lambda

cp -R dist/* build/lambda/
cp package.json package-lock.json build/lambda/
mkdir -p build/lambda/prisma
cp -R prisma/migrations build/lambda/prisma/

echo "[4/4] Packaging Lambda artifact"

(
  cd build/lambda
  npm ci --omit=dev --silent
  zip -qr ../lambda-api.zip .
)

echo "Lambda artifact created: $ROOT_DIR/build/lambda-api.zip"
