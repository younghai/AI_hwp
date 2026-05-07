#!/usr/bin/env bash
# Smoke-test the v3 stack end-to-end.
#
# Pre-reqs: dev server must be running (`cd v3 && npm run dev`).
# Exits 0 if every critical path works, non-zero otherwise.
#
# Why this exists:
#   Rules R1, R3 (CLAUDE.md). "빌드 성공" ≠ "기능 동작". This is the minimum
#   evidence required before saying "완료".

set -e

CLIENT_URL="${CLIENT_URL:-http://127.0.0.1:5192}"
SERVER_URL="${SERVER_URL:-http://127.0.0.1:8792}"
V3_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="${TEMPLATE:-$V3_ROOT/templates/gonmun.hwpx}"

# Unique marker so we can distinguish this run from cached files
RUN_ID="SMOKE_$(date +%s)_$$"
OUT_DIR="$(mktemp -d)"
trap "rm -rf '$OUT_DIR'" EXIT

pass() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; FAILED=1; }

FAILED=0

echo "=== 1. Server health ==="
if curl -sf "$SERVER_URL/api/health" | grep -q '"ok":true'; then
  pass "$SERVER_URL/api/health"
else
  fail "$SERVER_URL/api/health (서버가 안 떠 있나?)"
fi

echo ""
echo "=== 2. Providers list ==="
if curl -sf "$SERVER_URL/api/providers" | grep -q '"providers"'; then
  pass "$SERVER_URL/api/providers"
else
  fail "$SERVER_URL/api/providers"
fi

echo ""
echo "=== 3. Client (Vite) HTML ==="
if curl -sf -o /dev/null -w "%{http_code}" "$CLIENT_URL/" | grep -q 200; then
  pass "$CLIENT_URL/"
else
  fail "$CLIENT_URL/ (vite dev 서버가 안 떠 있나?)"
fi

echo ""
echo "=== 4. rhwp.js glue served ==="
CONTENT_TYPE=$(curl -sIf "$CLIENT_URL/node_modules/@rhwp/core/rhwp.js" | grep -i '^content-type:' | head -1 || true)
if echo "$CONTENT_TYPE" | grep -qi 'javascript'; then
  pass "rhwp.js (${CONTENT_TYPE%$'\r'})"
else
  fail "rhwp.js 반환 content-type 이상: $CONTENT_TYPE"
fi

echo ""
echo "=== 5. rhwp_bg.wasm magic bytes ==="
MAGIC=$(curl -sf "$CLIENT_URL/node_modules/@rhwp/core/rhwp_bg.wasm" | head -c 4 | xxd -p)
if [ "$MAGIC" = "0061736d" ]; then
  pass "wasm magic \\0asm OK"
else
  fail "wasm magic 불일치: $MAGIC (expected 0061736d). vite cache stale 가능 — 재시작."
fi

echo ""
echo "=== 6. E2E: API → HWPX 빌드 → 마커 검증 ==="
RESP_JSON="$OUT_DIR/resp.json"
OUT_HWPX="$OUT_DIR/out.hwpx"

curl -sf -X POST "$SERVER_URL/api/export-hwpx" \
  -F "title=${RUN_ID}_TITLE" \
  -F "toc=배경 및 목적
현황 분석
핵심 제안" \
  -F "sections=[{\"heading\":\"배경 및 목적\",\"body\":\"${RUN_ID}_A 첫 문장. ${RUN_ID}_B 두 번째.\"},{\"heading\":\"현황 분석\",\"body\":\"${RUN_ID}_C 현황 내용.\"},{\"heading\":\"핵심 제안\",\"body\":\"${RUN_ID}_D 제안 내용.\"}]" \
  -F "diagrams=[]" \
  -F "sourceMode=hwpx-template" \
  -F "sourceFile=@${TEMPLATE}" > "$RESP_JSON"

DOWNLOAD_URL=$(python3 -c "import json; print(json.load(open('$RESP_JSON'))['downloadUrl'])" 2>/dev/null || echo "")
if [ -z "$DOWNLOAD_URL" ]; then
  fail "/api/export-hwpx 응답에 downloadUrl 없음: $(cat $RESP_JSON)"
else
  pass "/api/export-hwpx → $DOWNLOAD_URL"
  curl -sf "$SERVER_URL$DOWNLOAD_URL" -o "$OUT_HWPX"

  if python3 "$V3_ROOT/tools/verify-hwpx-markers.py" "$OUT_HWPX" \
     "${RUN_ID}_TITLE" "${RUN_ID}_A" "${RUN_ID}_B" "${RUN_ID}_C" "${RUN_ID}_D" \
     > "$OUT_DIR/verify.log" 2>&1; then
    pass "HWPX 내부에 모든 마커 존재 (preview = download 동일성 보장)"
  else
    fail "HWPX 내부 마커 누락:"
    sed 's/^/    /' "$OUT_DIR/verify.log"
  fi
fi

echo ""
echo "=== 7. MCFG (M6) ==="
if [ -x "$V3_ROOT/.venv/bin/mcfg" ]; then
  MCFG_VER=$("$V3_ROOT/.venv/bin/mcfg" --version 2>&1 || true)
  if [ -n "$MCFG_VER" ]; then
    pass "mcfg --version OK ($MCFG_VER)"
  else
    fail "mcfg binary present but --version failed"
  fi
else
  fail "mcfg not bootstrapped (run scripts/mcfg-bootstrap.sh)"
fi

# 응답에 mcfg-validate 엔진 + reportUrl 확인 (RESP_JSON 은 섹션 6 에서 생성됨)
if [ -s "$RESP_JSON" ] && command -v jq >/dev/null 2>&1; then
  if jq -e '.validation.engines[] | select(.name=="mcfg-validate")' "$RESP_JSON" >/dev/null 2>&1; then
    pass "mcfg-validate engine present in /api/export-hwpx response"
  else
    fail "mcfg-validate engine missing from response"
  fi
  if jq -e '.validation.mcfgReportUrl' "$RESP_JSON" >/dev/null 2>&1; then
    REPORT_URL=$(jq -r '.validation.mcfgReportUrl // empty' "$RESP_JSON")
    if [ -n "$REPORT_URL" ]; then
      pass "mcfgReportUrl present: $REPORT_URL"
    else
      pass "mcfgReportUrl null (no mapped fonts — informational)"
    fi
  else
    fail "mcfgReportUrl field missing from response"
  fi
elif [ ! -s "$RESP_JSON" ]; then
  fail "RESP_JSON empty — section 6 export failed, skipping MCFG response checks"
else
  fail "jq not found — cannot parse MCFG response fields"
fi

echo ""
if [ "${FAILED:-0}" = "0" ]; then
  echo -e "\033[32m=== PASS: 모든 smoke test 통과 ===\033[0m"
  exit 0
else
  echo -e "\033[31m=== FAIL: 일부 실패. 위 로그 확인. ===\033[0m"
  exit 1
fi
