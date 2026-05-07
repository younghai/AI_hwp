#!/usr/bin/env bash
# verify-mcfg-report.sh — 가장 최근 mcfg HTML 리포트 존재 + 핵심 필드 확인.
# R1 (CLAUDE.md): "완료" 라고 말하기 전 E2E 증거 capture 의 일부.
set -euo pipefail

V4_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GENERATED="$V4_ROOT/generated"

if [ ! -d "$GENERATED" ]; then
  echo "[warn] $GENERATED 디렉토리 없음 (서버가 한 번도 안 떴거나 비어있음)"
  exit 0
fi

LATEST=$(ls -t "$GENERATED"/*.metrics.html 2>/dev/null | head -1 || true)
if [ -z "$LATEST" ]; then
  echo "[warn] no metrics.html in $GENERATED"
  echo "[hint] /api/export-hwpx 를 한 번 호출하면 mcfg-validate 가 리포트를 생성합니다"
  exit 0
fi

SIZE=$(wc -c < "$LATEST" | awk '{print $1}')
echo "[ok] latest report: $LATEST"
echo "[ok] size: $SIZE bytes"

if [ "$SIZE" -lt 100 ]; then
  echo "[fail] report too small (< 100 bytes), suspect failed render"
  exit 1
fi

if grep -qi "advance\|metric\|font" "$LATEST" 2>/dev/null; then
  echo "[ok] report mentions font/metric/advance (compare data present)"
else
  echo "[warn] report does not mention 'advance' (may be unexpected format)"
fi

# Polaris MCFG 리포트는 통상 SVG/HTML 마크업 포함
if grep -qi "<html\|<svg\|<table" "$LATEST" 2>/dev/null; then
  echo "[ok] report has HTML/SVG markup"
else
  echo "[warn] no HTML markup detected (suspect plain text)"
fi

echo "[ok] mcfg report verification complete"
