#!/usr/bin/env bash
# 手動ステップ完了用（要: Cloudflare ログイン or CLOUDFLARE_API_TOKEN）
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Deploy to Cloudflare Pages (kimi-grok-fps)"
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN 未設定。wrangler login を試します…"
  npx --yes wrangler@4 login
fi
npx --yes wrangler@4 pages project list 2>/dev/null | grep -q kimi-grok-fps \
  || npx --yes wrangler@4 pages project create kimi-grok-fps --production-branch=main || true
npx --yes wrangler@4 pages deploy . --project-name=kimi-grok-fps --commit-dirty=true

echo "==> Verify https://kimi-grok-fps.pages.dev/"
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" https://kimi-grok-fps.pages.dev/
curl -fsS https://kimi-grok-fps.pages.dev/ | grep -q 'KIMI GROK FPS'
curl -fsS -o /dev/null -w "og.png %{http_code}\n" https://kimi-grok-fps.pages.dev/og.png

echo "==> Disable GitHub Pages"
gh api -X DELETE repos/hayashiii-ghub/fps-game/pages
echo "GitHub Pages delete requested."
echo "==> Check old URL (expect non-200 or not our game)"
curl -sI https://hayashiii-ghub.github.io/fps-game/ | head -5 || true
echo "Done."
