#!/usr/bin/env bash
# Cloudflare Workers Static Assets への初回デプロイ＋ OGP 更新＋ GitHub Pages 停止
# 要: Cloudflare ログイン or CLOUDFLARE_API_TOKEN
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/prepare-cf-assets.sh

echo "==> Deploy Worker + Static Assets (kimi-grok-fps)"
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  if ! npx --yes wrangler@4 whoami >/dev/null 2>&1; then
    echo "未ログインです。ブラウザで Authorize してください…"
    npx --yes wrangler@4 login
  else
    echo "wrangler ログイン済み"
  fi
fi

DEPLOY_LOG="$(mktemp)"
npx --yes wrangler@4 deploy 2>&1 | tee "$DEPLOY_LOG"
URL="$(rg -o 'https://[A-Za-z0-9.-]+\.workers\.dev' "$DEPLOY_LOG" | head -1 || true)"
rm -f "$DEPLOY_LOG"

if [[ -z "${URL}" ]]; then
  echo "workers.dev URL をデプロイログから取得できませんでした。ダッシュボードで確認してください。"
  exit 1
fi

# 末尾スラッシュなしに正規化
URL="${URL%/}"

echo "==> Verify ${URL}/"
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" "${URL}/"
curl -fsS "${URL}/" | grep -q 'KIMI GROK FPS'
curl -fsS -o /dev/null -w "og.jpg %{http_code}\n" "${URL}/og.jpg"

echo "==> Patch OGP / README → ${URL}"
python3 - <<PY
from pathlib import Path
url = "${URL}"
replacements = [
    ("https://kimi-grok-fps.pages.dev", url),
    ("https://hayashiii-ghub.github.io/fps-game", url),
]
for rel in ("index.html", "README.md", "AGENTS.md"):
    p = Path(rel)
    text = p.read_text()
    orig = text
    for old, new in replacements:
        text = text.replace(old, new)
    if "workers.dev" not in text and rel == "README.md":
        text = text.replace(
            "**▶ プレイ:** Cloudflare Workers（`npx wrangler deploy` 後の `*.workers.dev` URL）",
            f"**▶ プレイ: {url}/**",
        )
        text = text.replace(
            "- 上記 Workers の URL（初回デプロイ後に確定）、または",
            "- 上記 Cloudflare Workers の URL、または",
        )
    if text != orig:
        p.write_text(text)
        print(f"updated {rel}")
    else:
        print(f"no change {rel}")
PY

# 配信物も OGP 差し替え後に再準備（次回以降用）
./scripts/prepare-cf-assets.sh
npx --yes wrangler@4 deploy >/dev/null
echo "Redeployed with updated OGP."

echo "==> Disable GitHub Pages"
if gh api -X DELETE repos/hayashiii-ghub/fps-game/pages 2>/dev/null; then
  echo "GitHub Pages delete requested."
else
  echo "API で止められませんでした。Settings → Pages → Source = None を手で設定してください。"
fi
echo "==> Check old URL"
curl -sI https://hayashiii-ghub.github.io/fps-game/ | head -5 || true

echo ""
echo "Done. Public URL: ${URL}/"
echo "変更を commit / push してください（index.html / README / AGENTS）。"
