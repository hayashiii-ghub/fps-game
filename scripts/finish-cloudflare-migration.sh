#!/usr/bin/env bash
# Cloudflare Workers Static Assets への初回デプロイ＋ GitHub Pages 停止
# 要: Cloudflare ログイン or CLOUDFLARE_API_TOKEN
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/prepare-cf-assets.sh

echo "==> Deploy Worker + Static Assets (kimi-grok-fps)"
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN 未設定。wrangler login を試します…"
  npx --yes wrangler@4 login
fi

DEPLOY_LOG="$(mktemp)"
npx --yes wrangler@4 deploy 2>&1 | tee "$DEPLOY_LOG"
URL="$(rg -o 'https://[A-Za-z0-9.-]+\.workers\.dev' "$DEPLOY_LOG" | head -1 || true)"
rm -f "$DEPLOY_LOG"

if [[ -z "${URL}" ]]; then
  echo "workers.dev URL をデプロイログから取得できませんでした。ダッシュボードで確認してください。"
  exit 1
fi

echo "==> Verify ${URL}/"
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" "${URL}/"
curl -fsS "${URL}/" | grep -q 'KIMI GROK FPS'
curl -fsS -o /dev/null -w "og.png %{http_code}\n" "${URL}/og.png"

echo ""
echo "OGP / README の公開 URL を次に合わせてください:"
echo "  ${URL}/"
echo "  ${URL}/og.png"

echo "==> Disable GitHub Pages"
gh api -X DELETE repos/hayashiii-ghub/fps-game/pages
echo "GitHub Pages delete requested."
echo "==> Check old URL (expect non-200 or not our game)"
curl -sI https://hayashiii-ghub.github.io/fps-game/ | head -5 || true
echo "Done."
