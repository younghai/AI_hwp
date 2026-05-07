#!/usr/bin/env bash
# extract-font-metrics.sh — KoPub Batang OFL 폰트를 라이브 추출해 fixture 갱신.
# 실패 시 fixture 보존 (exit 0). 30분 timeout.
set -euo pipefail

V4_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

KOPUB_URL="https://github.com/google/fonts/raw/main/ofl/kopubbatang/KoPubBatang-Regular.ttf"

if [ ! -x "$V4_ROOT/.venv/bin/mcfg" ]; then
  echo "[error] mcfg not bootstrapped. Run scripts/mcfg-bootstrap.sh first." >&2
  exit 1
fi

echo "[info] downloading KoPub Batang OFL..."
# macOS may not have GNU timeout; fall back to curl's own --max-time
if ! curl -fsSL --max-time 1800 "$KOPUB_URL" -o "$TMPDIR/kopub.ttf"; then
  echo "[warn] download failed — fixture preserved"
  exit 0
fi

echo "[info] extracting metrics with mcfg..."
if ! "$V4_ROOT/.venv/bin/mcfg" extract "$TMPDIR/kopub.ttf" \
    -o "$V4_ROOT/specs/font-metrics/kopub-batang.json" 2>/dev/null; then
  echo "[warn] mcfg extract failed — restoring fixture from git"
  git -C "$V4_ROOT" checkout specs/font-metrics/kopub-batang.json 2>/dev/null || true
  exit 0
fi

echo "[ok] kopub-batang.json refreshed via live extract"
git -C "$V4_ROOT" diff --stat specs/font-metrics/kopub-batang.json || true
echo "[info] review the diff and commit if desired"
