#!/usr/bin/env bash
# ローカル ONLINE 開発: 配信用アセットを更新して wrangler dev
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/prepare-cf-assets.sh
exec npx --yes wrangler@4 dev --ip 127.0.0.1 --port 8787 "$@"
