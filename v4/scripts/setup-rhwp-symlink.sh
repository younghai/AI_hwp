#!/usr/bin/env bash
# v4 client/node_modules/@rhwp/core 가 hoist 되어 비어 있을 때 symlink 생성.
#
# 왜 필요?
#   - npm workspace 가 @rhwp/core 를 v4/node_modules/ 로 hoist 함
#   - vite dev 서버는 v4/client/ 를 root 로 보므로 /node_modules/@rhwp/core/...
#     URL 을 v4/client/node_modules/ 에서 찾는다 → 못 찾으면 SPA fallback (HTML)
#     반환 → wasm magic 불일치
#
# 사용:
#   bash v4/scripts/setup-rhwp-symlink.sh
#
# npm install 후 항상 실행 권장 (postinstall 후크에 등록되어 있음).

set -e
V4_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$V4_ROOT/node_modules/@rhwp/core"
DST_DIR="$V4_ROOT/client/node_modules/@rhwp"
DST="$DST_DIR/core"

if [ ! -d "$SRC" ]; then
  echo "✗ $SRC 가 없습니다. v4 root 에서 'npm install' 먼저 실행하세요."
  exit 1
fi

mkdir -p "$DST_DIR"
if [ -L "$DST" ] || [ -d "$DST" ]; then
  rm -rf "$DST"
fi
ln -s "$SRC" "$DST"
echo "✓ symlink: $DST → $SRC"
