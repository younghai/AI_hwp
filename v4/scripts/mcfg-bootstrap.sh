#!/usr/bin/env bash
# mcfg-bootstrap.sh — Polaris MCFG (v0.2.3) 1회 부트스트랩.
# idempotent: 이미 설치돼 있으면 조기 return.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
V4_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV="$V4_ROOT/.venv"
MCFG_VERSION="0.2.3"

# 1. Python 3.10+ 검색 (macOS Homebrew + 시스템 Python 공존 환경)
PYTHON=""
for candidate in python3.14 python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>/dev/null; then
      PYTHON="$candidate"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  echo "[error] Python 3.10+ not found. Tried: python3.14 python3.13 python3.12 python3.11 python3.10 python3" >&2
  echo "[hint] install via: brew install python@3.11" >&2
  exit 1
fi
echo "[info] using $PYTHON ($($PYTHON --version))"

# 2. 이미 설치돼 있으면 조기 return
if [ -x "$VENV/bin/mcfg" ] && "$VENV/bin/mcfg" --version >/dev/null 2>&1; then
  installed_version=$("$VENV/bin/mcfg" --version 2>&1 | awk '{print $NF}')
  echo "[ok] mcfg already installed (version=$installed_version) at $VENV/bin/mcfg"
  exit 0
fi

# Atomic install: cleanup partial venv if install fails downstream.
trap 'rc=$?; if [ $rc -ne 0 ] && [ -d "$VENV" ] && [ ! -x "$VENV/bin/mcfg" ]; then echo "[warn] install aborted (rc=$rc), removing partial venv $VENV" >&2; rm -rf "$VENV"; fi; exit $rc' EXIT

# 3. venv 생성 + pip install
echo "[info] creating venv at $VENV"
"$PYTHON" -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip --quiet

echo "[info] this may take 30-60s on first run (downloading from GitHub)..."
echo "[info] installing polaris_mcfg @ v$MCFG_VERSION"
"$VENV/bin/pip" install --quiet \
  "git+https://github.com/PolarisOffice/polaris_mcfg.git@v$MCFG_VERSION"

# 4. 검증
"$VENV/bin/mcfg" --version
echo "[ok] mcfg bootstrapped → $VENV/bin/mcfg"
echo "[info] dev 서버 재시작 필요 (CLAUDE.md R3)"
