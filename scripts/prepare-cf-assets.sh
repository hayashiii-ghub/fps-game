#!/usr/bin/env bash
# 配信用アセットを .cf-assets/ に集める（.git 等を上げない）
set -euo pipefail
cd "$(dirname "$0")/.."

DEST=".cf-assets"
rm -rf "$DEST"
mkdir -p "$DEST"

for f in \
  index.html \
  ai-steer.js \
  audio.js \
  effects.js \
  enemy.js \
  main.js \
  net.js \
  online.js \
  player.js \
  world.js \
  three.min.js \
  og.png \
  favicon.svg \
  favicon.png \
  favicon-32.png \
  favicon-180.png \
  _headers
do
  cp -a "$f" "$DEST/"
done

echo "Prepared $DEST ($(ls -1 "$DEST" | wc -l) files)"
