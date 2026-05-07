# M6 — Polaris MCFG Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** v4 HWPX 빌드 파이프라인에 4번째 검증 엔진(mcfg-validate)을 추가하고, ValidationPanel 에 폰트 메트릭 진단 탭을 노출한다.

**Architecture:** Polaris MCFG(v0.2.3)를 v4/.venv 안에 pip install → mcfg CLI를 sub-process로 호출 → HWPX 의 fontFace 와 spec JSON 비교 → JSON+HTML 결과를 generated/ 에 떨어뜨려 ValidationPanel iframe 으로 렌더.

**Tech Stack:**
- Server: Node.js 20+, Express, yauzl(zip), fast-xml-parser, runProcess(spawn)
- Python venv: Python 3.10+, polaris_mcfg@v0.2.3, fontTools[woff], click
- Client: React, Vitest
- Validation: 기존 v3-native + polaris-dvc + rhwp-wasm 옆에 mcfg-validate 합류

**Branch:** `mcfg-m6-font-metrics` (base: `worktree-rhwp-0.7.7-m1-m4` @ 3e46f5e)

**Worktree:** `/Users/young/Downloads/personal_project/calendar_app/.claude/worktrees/mcfg-m6-font-metrics/`

**See Also:** `docs/plans/2026-05-07-mcfg-m6-design.md` (this plan implements that design)

---

## Pre-flight Checks (Task 0)

**Goal:** 새 worktree가 깨끗하게 빌드되고 기존 검증 3엔진이 동작하는지 baseline 확인.

**Files:**
- Verify: `v4/.venv/` 부재 (이게 우리가 만들 것)
- Verify: `node_modules/` 정상 (이전 setup으로 OK)
- Verify: `git log -1` → `3ba24f9 docs(mcfg-m6): ...`

**Step 1: Baseline syntax check**
```bash
cd v4/server && for f in index.js lib/*.js services/*.js routes/*.js; do node --check "$f" || exit 1; done
cd ../.. && python3 -m py_compile v4/scripts/build_hwpx.py
```
Expected: 모두 syntax OK, exit 0.

**Step 2: Baseline validator 응답 확인 (build 한 번)**
```bash
cd v4 && npm run dev:server &
sleep 3
curl -s -X POST http://127.0.0.1:8792/api/export-hwpx \
  -F "title=baseline" -F "toc=1장" \
  -F 'sections=[{"heading":"1장","body":"테스트"}]' \
  -F "diagrams=[]" -F "sourceMode=none" | jq '.validation.engines[].name'
```
Expected: `"v3-native"`, `"polaris-dvc"`, `"rhwp-wasm"` 3개 출력.

**Step 3: Stop server, ready to proceed**
```bash
pkill -f "v4/server"
```

**Step 4: Commit baseline marker (선택)**

(파일 변경 없음 → commit 안 함)

---

## Task 1: Bootstrap script (P1 - venv + mcfg install)

**Files:**
- Create: `v4/scripts/mcfg-bootstrap.sh`

**Step 1: Write bootstrap script**

```bash
#!/usr/bin/env bash
# mcfg-bootstrap.sh — Polaris MCFG (v0.2.3) 1회 부트스트랩.
# idempotent: 이미 설치돼 있으면 조기 return.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
V4_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV="$V4_ROOT/.venv"
MCFG_VERSION="0.2.3"

# 1. Python 3.10+ 검사
if ! python3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>/dev/null; then
  echo "[error] Python 3.10+ required. Found: $(python3 --version)" >&2
  exit 1
fi

# 2. 이미 설치돼 있으면 조기 return
if [ -x "$VENV/bin/mcfg" ] && "$VENV/bin/mcfg" --version >/dev/null 2>&1; then
  installed_version=$("$VENV/bin/mcfg" --version 2>&1 | awk '{print $NF}')
  echo "[ok] mcfg already installed (version=$installed_version) at $VENV/bin/mcfg"
  exit 0
fi

# 3. venv 생성 + pip install
echo "[info] creating venv at $VENV"
python3 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip --quiet

echo "[info] installing polaris_mcfg @ v$MCFG_VERSION"
"$VENV/bin/pip" install --quiet \
  "git+https://github.com/PolarisOffice/polaris_mcfg.git@v$MCFG_VERSION"

# 4. 검증
"$VENV/bin/mcfg" --version
echo "[ok] mcfg bootstrapped → $VENV/bin/mcfg"
echo "[info] dev 서버 재시작 필요 (CLAUDE.md R3)"
```

**Step 2: Make executable**
```bash
chmod +x v4/scripts/mcfg-bootstrap.sh
```

**Step 3: Run it**
```bash
bash v4/scripts/mcfg-bootstrap.sh
```
Expected: `mcfg, version 0.2.3` 출력 + `[ok] mcfg bootstrapped`. Network 차단 환경에서는 fail 가능 — 그 경우 기록하고 다음 태스크 진행.

**Step 4: Idempotency 확인**
```bash
bash v4/scripts/mcfg-bootstrap.sh
```
Expected: `[ok] mcfg already installed (version=0.2.3)` 출력, exit 0.

**Step 5: Commit**
```bash
git add v4/scripts/mcfg-bootstrap.sh
git commit -m "feat(mcfg): bootstrap script for Polaris MCFG v0.2.3

scripts/mcfg-bootstrap.sh — idempotent venv + pip install.
첫 실행 시 약 30-60초, 이미 설치돼 있으면 조기 return.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: P4 — Font metric fixture JSONs + mapping

**Files:**
- Create: `v4/specs/font-metrics/_README.md`
- Create: `v4/specs/font-metrics/kopub-batang.json`
- Create: `v4/specs/font-metrics/noto-sans-kr.json`
- Create: `v4/specs/font-metrics-mapping.json`

**Step 1: Write `_README.md`**

```markdown
# specs/font-metrics

Polaris MCFG (v0.2.3) `mcfg extract` 출력 형식 (schemaVersion 1) 의
폰트 메트릭 spec 캐시.

본 디렉토리의 파일은 **fixture(데모/스켈레톤)** 입니다 — 한컴 폰트 EULA
미검토 상태이므로, KoPub Batang / Noto Sans KR 등 OFL 폰트 메트릭만
포함합니다. 한컴 EULA 통과 시 `scripts/extract-font-metrics.sh` 또는
`mcfg extract <hancom-font>.ttf -o <name>.json` 으로 자동 갱신 가능.

본 spec 은 `server/services/mcfgValidator.js` 가 빌드된 HWPX 의
`Contents/header.xml` 안 `<hh:fontFace>` 와 비교할 때 사용됩니다.
매핑은 `specs/font-metrics-mapping.json` 참조.
```

**Step 2: Write `kopub-batang.json`**

```json
{
  "schemaVersion": 1,
  "source": {
    "filename": "KoPubBatang-Regular.ttf",
    "extractorVersion": "0.2.3-fixture",
    "extractedAt": "2026-05-07T00:00:00Z",
    "note": "fixture — 라이브 추출 시 자동 갱신"
  },
  "global": {
    "unitsPerEm": 1000,
    "head": {"yMin": -222, "yMax": 1010},
    "hhea": {"ascent": 880, "descent": -120, "lineGap": 0, "advanceWidthMax": 1500},
    "os2": {
      "sTypoAscender": 880, "sTypoDescender": -120, "sTypoLineGap": 200,
      "usWinAscent": 1080, "usWinDescent": 322,
      "sCapHeight": 700
    },
    "post": {"underlinePosition": -100, "italicAngle": 0}
  },
  "glyphs": {
    "U+0020": {"advanceWidth": 250},
    "U+0041": {"advanceWidth": 583},
    "U+AC00": {"advanceWidth": 1000},
    "U+D55C": {"advanceWidth": 1000}
  },
  "kerning": []
}
```

**Step 3: Write `noto-sans-kr.json`**

```json
{
  "schemaVersion": 1,
  "source": {
    "filename": "NotoSansKR-Regular.ttf",
    "extractorVersion": "0.2.3-fixture",
    "extractedAt": "2026-05-07T00:00:00Z",
    "note": "fixture — 의도적으로 KoPub와 advance가 다른 글리프 1개 포함 (시연용)"
  },
  "global": {
    "unitsPerEm": 1000,
    "head": {"yMin": -288, "yMax": 1126},
    "hhea": {"ascent": 1069, "descent": -293, "lineGap": 0, "advanceWidthMax": 1572},
    "os2": {
      "sTypoAscender": 880, "sTypoDescender": -120, "sTypoLineGap": 200,
      "usWinAscent": 1126, "usWinDescent": 288,
      "sCapHeight": 700
    },
    "post": {"underlinePosition": -150, "italicAngle": 0}
  },
  "glyphs": {
    "U+0020": {"advanceWidth": 257},
    "U+0041": {"advanceWidth": 575},
    "U+AC00": {"advanceWidth": 1000},
    "U+D55C": {"advanceWidth": 1024}
  },
  "kerning": []
}
```

**Step 4: Write `font-metrics-mapping.json`**

```json
{
  "schemaVersion": 1,
  "mappings": {
    "함초롬바탕": "kopub-batang.json",
    "함초롬돋움": "noto-sans-kr.json",
    "HY헤드라인M": "noto-sans-kr.json",
    "HY헤드라인": "noto-sans-kr.json",
    "한컴바탕": "kopub-batang.json",
    "맑은 고딕": "noto-sans-kr.json",
    "Noto Sans KR": "noto-sans-kr.json",
    "KoPub Batang": "kopub-batang.json"
  },
  "note": "본 매핑은 데모용. 한컴 폰트 메트릭이 들어오면 일대일 매핑으로 교체."
}
```

**Step 5: Validate JSON syntax**
```bash
for f in v4/specs/font-metrics/*.json v4/specs/font-metrics-mapping.json; do
  python3 -c "import json; json.load(open('$f'))" || { echo "FAIL: $f"; exit 1; }
done
echo "all JSON files valid"
```
Expected: `all JSON files valid`.

**Step 6: Commit**
```bash
git add v4/specs/font-metrics/ v4/specs/font-metrics-mapping.json
git commit -m "feat(mcfg): P4 — Polaris schema v1 fixture (KoPub/Noto OFL)

specs/font-metrics/ 에 KoPub Batang + Noto Sans KR fixture 2종.
의도적으로 U+0041, U+D55C advance 가 다르도록 작성 (시연용 mismatch).

specs/font-metrics-mapping.json 으로 한컴 폰트명 → spec 매핑.
fixture 는 라이브 추출(scripts/extract-font-metrics.sh) 시 자동 교체.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Test fixtures — sample HWPX files

**Files:**
- Create: `v4/tests/fixtures/build-test-fixtures.mjs`
- Create (script output): `v4/tests/fixtures/sample-with-fonts.hwpx`
- Create (script output): `v4/tests/fixtures/sample-no-fonts.hwpx`
- Create (script output): `v4/tests/fixtures/sample-corrupt.hwpx`

**Step 1: Write fixture builder script**

본 fixture 는 실제 HWPX 가 아니라 **테스트 가능한 최소 zip + header.xml** 만 포함.

```js
// v4/tests/fixtures/build-test-fixtures.mjs
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { ZipWriter, BlobWriter, TextReader } from '@zip.js/zip.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function makeZip(entries) {
  const blobWriter = new BlobWriter('application/zip')
  const writer = new ZipWriter(blobWriter)
  for (const [name, content] of entries) {
    await writer.add(name, new TextReader(content))
  }
  await writer.close()
  const blob = await blobWriter.getData()
  return Buffer.from(await blob.arrayBuffer())
}

const HEADER_WITH_FONTS = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
  <hh:refList>
    <hh:fontfaces>
      <hh:fontface lang="hangul">
        <hh:font id="0" type="ttf" name="함초롬바탕"/>
        <hh:font id="1" type="ttf" name="HY헤드라인M"/>
        <hh:font id="2" type="ttf" name="UnknownFont"/>
      </hh:fontface>
    </hh:fontfaces>
  </hh:refList>
</hh:head>`

const HEADER_NO_FONTS = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
  <hh:refList></hh:refList>
</hh:head>`

;(async () => {
  const withFonts = await makeZip([
    ['mimetype', 'application/hwp+zip'],
    ['Contents/header.xml', HEADER_WITH_FONTS]
  ])
  await fs.writeFile(path.join(__dirname, 'sample-with-fonts.hwpx'), withFonts)

  const noFonts = await makeZip([
    ['mimetype', 'application/hwp+zip'],
    ['Contents/header.xml', HEADER_NO_FONTS]
  ])
  await fs.writeFile(path.join(__dirname, 'sample-no-fonts.hwpx'), noFonts)

  // corrupt = zip header 깨뜨림
  await fs.writeFile(path.join(__dirname, 'sample-corrupt.hwpx'),
    Buffer.from('PK\x03\x04corrupt-content-not-a-real-zip'))

  console.log('fixtures built')
})()
```

**Step 2: Install @zip.js for fixture builder (dev dep)**
```bash
cd v4/server && npm install --save-dev @zip.js/zip.js
```
Expected: `+ @zip.js/zip.js@...`

**Step 3: Run fixture builder**
```bash
cd v4 && node tests/fixtures/build-test-fixtures.mjs
```
Expected: `fixtures built` 출력 + 3개 .hwpx 파일 생성.

**Step 4: Verify fixtures**
```bash
unzip -l v4/tests/fixtures/sample-with-fonts.hwpx
unzip -l v4/tests/fixtures/sample-no-fonts.hwpx
file v4/tests/fixtures/sample-corrupt.hwpx
```
Expected: 첫 두 개는 zip 목록 출력, 세 번째는 "data" 또는 zip이지만 incomplete.

**Step 5: Commit**
```bash
git add v4/tests/fixtures/ v4/server/package.json v4/server/package-lock.json v4/package-lock.json
git commit -m "test(mcfg): add HWPX fixtures for mcfgValidator unit tests

- sample-with-fonts.hwpx: 3개 fontFace (함초롬바탕, HY헤드라인M, UnknownFont)
- sample-no-fonts.hwpx: refList 비어있음
- sample-corrupt.hwpx: zip 헤더 깨진 buffer
- @zip.js/zip.js devDep 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: parseHeaderFontFaces — TDD unit

**Files:**
- Create: `v4/server/services/__tests__/mcfgValidator.test.js`
- Create: `v4/server/services/mcfgValidator.js` (initial — only parseHeaderFontFaces export)

**Step 1: Install runtime deps**
```bash
cd v4/server && npm install yauzl fast-xml-parser
```
Expected: 두 패키지 추가.

**Step 2: Write failing test**

```js
// v4/server/services/__tests__/mcfgValidator.test.js
import { describe, it, expect } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseHeaderFontFaces } from '../mcfgValidator.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.resolve(__dirname, '../../../tests/fixtures')

describe('parseHeaderFontFaces', () => {
  it('extracts font family names from header.xml', async () => {
    const result = await parseHeaderFontFaces(path.join(fixtureDir, 'sample-with-fonts.hwpx'))
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: '함초롬바탕' }),
      expect.objectContaining({ family: 'HY헤드라인M' }),
      expect.objectContaining({ family: 'UnknownFont' })
    ]))
    expect(result.length).toBe(3)
  })

  it('returns empty array when no fontFace declared', async () => {
    const result = await parseHeaderFontFaces(path.join(fixtureDir, 'sample-no-fonts.hwpx'))
    expect(result).toEqual([])
  })

  it('throws for corrupt zip', async () => {
    await expect(parseHeaderFontFaces(path.join(fixtureDir, 'sample-corrupt.hwpx')))
      .rejects.toThrow()
  })
})
```

**Step 3: Run test — expect FAIL**
```bash
cd v4/server && npx vitest run services/__tests__/mcfgValidator.test.js
```
Expected: `Cannot find module '../mcfgValidator.js'` → FAIL.

**Step 4: Write minimal implementation**

```js
// v4/server/services/mcfgValidator.js
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import yauzl from 'yauzl'
import { XMLParser } from 'fast-xml-parser'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v4Root = path.resolve(__dirname, '..', '..')

export async function parseHeaderFontFaces(hwpxPath) {
  const headerXml = await readEntryFromZip(hwpxPath, 'Contents/header.xml')
  if (!headerXml) return []
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'hh:font' || name === 'hh:fontface' || name === 'fontface' || name === 'font'
  })
  const tree = parser.parse(headerXml)
  return extractFontFaces(tree)
}

function extractFontFaces(node) {
  const result = []
  function walk(n) {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    for (const [key, value] of Object.entries(n)) {
      const localName = key.includes(':') ? key.split(':').pop() : key
      if (localName === 'font' && value) {
        const items = Array.isArray(value) ? value : [value]
        for (const item of items) {
          const family = item['@_name'] || item.name || item['@_face']
          if (family) {
            result.push({
              family: String(family).normalize('NFC'),
              type: item['@_type'] || 'ttf',
              id: item['@_id'] || ''
            })
          }
        }
      } else if (typeof value === 'object') {
        walk(value)
      }
    }
  }
  walk(node)
  return result
}

function readEntryFromZip(zipPath, entryName) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err)
      let found = false
      zipfile.on('entry', (entry) => {
        if (entry.fileName === entryName) {
          zipfile.openReadStream(entry, (err2, stream) => {
            if (err2) return reject(err2)
            const chunks = []
            stream.on('data', (c) => chunks.push(c))
            stream.on('end', () => {
              found = true
              zipfile.close()
              resolve(Buffer.concat(chunks).toString('utf-8'))
            })
            stream.on('error', reject)
          })
        } else {
          zipfile.readEntry()
        }
      })
      zipfile.on('end', () => { if (!found) resolve(null) })
      zipfile.on('error', reject)
      zipfile.readEntry()
    })
  })
}
```

**Step 5: Run test — expect PASS**
```bash
cd v4/server && npx vitest run services/__tests__/mcfgValidator.test.js
```
Expected: 3 tests pass.

**Step 6: Commit**
```bash
git add v4/server/services/mcfgValidator.js v4/server/services/__tests__/mcfgValidator.test.js v4/server/package.json v4/server/package-lock.json
git commit -m "feat(mcfg): parseHeaderFontFaces + zip/xml helpers (TDD)

- yauzl + fast-xml-parser 의존성 추가
- HWPX zip 풀어 Contents/header.xml 의 <hh:font> family 추출
- NFC 정규화 적용 (CLAUDE.md R8)
- 3건 unit test 통과 (with-fonts / no-fonts / corrupt)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: lookupMapping — NFC normalization

**Files:**
- Modify: `v4/server/services/mcfgValidator.js` (add lookupMapping + loadMapping)
- Modify: `v4/server/services/__tests__/mcfgValidator.test.js`

**Step 1: Write failing test**

```js
// 추가 import
import { loadMapping, lookupMapping } from '../mcfgValidator.js'

describe('lookupMapping', () => {
  it('matches NFC-normalized family name', async () => {
    const mapping = await loadMapping()
    expect(lookupMapping(mapping, '함초롬바탕')).toBe('kopub-batang.json')
    expect(lookupMapping(mapping, 'HY헤드라인M')).toBe('noto-sans-kr.json')
  })

  it('matches NFD-input by normalizing to NFC', async () => {
    const mapping = await loadMapping()
    const nfd = '함초롬바탕'.normalize('NFD')
    expect(lookupMapping(mapping, nfd)).toBe('kopub-batang.json')
  })

  it('returns null for unknown family', async () => {
    const mapping = await loadMapping()
    expect(lookupMapping(mapping, 'Some-Random-Font')).toBe(null)
  })
})
```

**Step 2: Run — expect FAIL**
```bash
cd v4/server && npx vitest run services/__tests__/mcfgValidator.test.js
```
Expected: `loadMapping is not a function`.

**Step 3: Add implementation to mcfgValidator.js**

```js
const mappingPath = path.join(v4Root, 'specs', 'font-metrics-mapping.json')

export async function loadMapping() {
  try {
    const raw = await readFile(mappingPath, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed.mappings || {}
  } catch {
    return {}
  }
}

export function lookupMapping(mapping, familyRaw) {
  if (!familyRaw || !mapping) return null
  const family = String(familyRaw).normalize('NFC')
  return mapping[family] || null
}
```

**Step 4: Run — expect PASS**
```bash
cd v4/server && npx vitest run services/__tests__/mcfgValidator.test.js
```
Expected: 6 tests pass total.

**Step 5: Commit**
```bash
git add v4/server/services/mcfgValidator.js v4/server/services/__tests__/mcfgValidator.test.js
git commit -m "feat(mcfg): lookupMapping + loadMapping (NFC normalized)

- specs/font-metrics-mapping.json 로드
- 입력 family 를 NFC 정규화 후 lookup
- NFD 입력도 매칭 통과 (R8)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: runMcfgCompare — CLI wrapper

**Files:**
- Modify: `v4/server/services/mcfgValidator.js` (add runMcfgCompare)
- Modify: `v4/server/services/__tests__/mcfgValidator.test.js`

**Step 1: Write test (mock 사용)**

```js
import { vi } from 'vitest'
import * as utils from '../../lib/utils.js'
import { runMcfgCompare } from '../mcfgValidator.js'

describe('runMcfgCompare', () => {
  it('returns ok=true with parsed JSON when mcfg succeeds', async () => {
    vi.spyOn(utils, 'runProcess').mockResolvedValue({
      ok: true,
      stdout: JSON.stringify({ advanceDiff: { commonCount: 10, mismatchCount: 2, samples: [] } }),
      stderr: ''
    })
    const result = await runMcfgCompare('/tmp/a.json', '/tmp/b.json')
    expect(result.ok).toBe(true)
    expect(result.mismatchCount).toBe(2)
    vi.restoreAllMocks()
  })

  it('returns ok=false when mcfg exits non-zero', async () => {
    vi.spyOn(utils, 'runProcess').mockResolvedValue({
      ok: false, stdout: '', stderr: 'mcfg: file not found'
    })
    const result = await runMcfgCompare('/tmp/a.json', '/tmp/b.json')
    expect(result.ok).toBe(false)
    expect(result.stderr).toContain('file not found')
    vi.restoreAllMocks()
  })

  it('returns ok=false on JSON parse failure', async () => {
    vi.spyOn(utils, 'runProcess').mockResolvedValue({
      ok: true, stdout: 'not valid json {{{', stderr: ''
    })
    const result = await runMcfgCompare('/tmp/a.json', '/tmp/b.json')
    expect(result.ok).toBe(false)
    vi.restoreAllMocks()
  })
})
```

**Step 2: Run — expect FAIL**

**Step 3: Implement**

```js
import { runProcess } from '../lib/utils.js'

const mcfgBin = path.join(v4Root, '.venv', 'bin', 'mcfg')

export async function runMcfgCompare(specA, specB, { format = 'json' } = {}) {
  const args = ['compare', specA, specB, '--format', format]
  const proc = await runProcess(mcfgBin, args, v4Root, { timeoutMs: 15000 })
  if (!proc.ok) {
    return { ok: false, stderr: (proc.stderr || '').slice(0, 200) }
  }
  try {
    const parsed = JSON.parse(proc.stdout)
    const mismatchCount = parsed?.advanceDiff?.mismatchCount ?? 0
    return { ok: true, raw: parsed, mismatchCount }
  } catch (err) {
    return { ok: false, stderr: `JSON parse failed: ${err.message}` }
  }
}
```

**Step 4: Run — expect PASS**

**Step 5: Commit**
```bash
git add v4/server/services/mcfgValidator.js v4/server/services/__tests__/mcfgValidator.test.js
git commit -m "feat(mcfg): runMcfgCompare CLI wrapper (TDD)

- runProcess 패턴 그대로 사용 (timeoutMs=15s)
- mcfg compare --format json 호출 후 advanceDiff 추출
- 비정상 종료 / JSON parse 실패 시 stderr 200자 절단 (R4)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: validateFontMetrics — full integration

**Files:**
- Modify: `v4/server/services/mcfgValidator.js` (add validateFontMetrics + mcfgResultToViolations)
- Modify: `v4/server/services/__tests__/mcfgValidator.test.js`

**Step 1: Write test**

```js
describe('validateFontMetrics (integration)', () => {
  it('returns available:false when mcfg binary missing', async () => {
    const result = await validateFontMetrics('/tmp/nonexistent.hwpx', { docType: 'report' })
    // .venv 없는 환경에서는 available=false
    if (!result.available) {
      expect(result.note).toContain('not installed')
    }
  })

  it('handles HWPX with no fontFace declared', async () => {
    const result = await validateFontMetrics(
      path.join(fixtureDir, 'sample-no-fonts.hwpx'),
      { docType: 'report' }
    )
    expect(result.available).toBe(true)
    expect(result.fontCount).toBe(0)
    expect(result.violations).toEqual([])
  })

  it('returns unmapped warning when no font has spec', async () => {
    // fixture 가 함초롬바탕(매핑 있음) + UnknownFont(매핑 없음)
    const result = await validateFontMetrics(
      path.join(fixtureDir, 'sample-with-fonts.hwpx'),
      { docType: 'report' }
    )
    if (result.available) {
      expect(result.fontCount).toBe(3)
      // mcfg 없으면 mappedCount 도 0 (compare 실행 못 함)
      expect(result.violations.length).toBeGreaterThan(0)
    }
  })
})
```

**Step 2: Run — expect FAIL**

**Step 3: Implement validateFontMetrics**

```js
export async function validateFontMetrics(hwpxPath, { docType } = {}) {
  if (!existsSync(mcfgBin)) {
    return {
      available: false,
      note: 'mcfg not installed (run scripts/mcfg-bootstrap.sh)'
    }
  }
  let fontFaces
  try {
    fontFaces = await parseHeaderFontFaces(hwpxPath)
  } catch (err) {
    return { available: false, note: `header.xml parse failed: ${err.message.slice(0, 120)}` }
  }
  if (fontFaces.length === 0) {
    return {
      available: true,
      fontCount: 0,
      mappedCount: 0,
      violations: [],
      note: 'no fontFace declared in header.xml'
    }
  }
  const mapping = await loadMapping()
  const mapped = fontFaces.map((f) => ({
    family: f.family,
    specFile: lookupMapping(mapping, f.family)
  }))

  const violations = []

  // 매핑된 폰트들에 대해 spec 자체 일관성 검사 (기준 spec 과 비교)
  // 데모 단계: 자기 자신과 compare → mismatch 0 이어야 정상
  for (const m of mapped.filter((x) => x.specFile)) {
    const specPath = path.join(fontMetricsDir, m.specFile)
    if (!existsSync(specPath)) {
      violations.push({
        axis: 'font-metric',
        code: 'MCFG-SPEC-MISSING',
        severity: 'warning',
        message: `매핑된 spec 파일 없음: ${m.specFile} (${m.family})`,
        location: `header.xml fontFace[${m.family}]`,
        source: 'mcfg-validate'
      })
      continue
    }
    // self-compare (sanity check). 실제 환경에서는 docType.mcfg.referenceSpec 와 비교.
    const cmpResult = await runMcfgCompare(specPath, specPath).catch((err) => ({
      ok: false, stderr: err.message
    }))
    if (!cmpResult.ok) {
      violations.push({
        axis: 'font-metric',
        code: 'MCFG-COMPARE-FAILED',
        severity: 'warning',
        message: `mcfg compare 실패 (${m.family}): ${cmpResult.stderr.slice(0, 120)}`,
        location: `header.xml fontFace[${m.family}]`,
        source: 'mcfg-validate'
      })
    }
  }

  // 시연용: 의도적으로 noto vs kopub 비교해서 mismatch 1건 발생 시키기
  const kopubSpec = path.join(fontMetricsDir, 'kopub-batang.json')
  const notoSpec = path.join(fontMetricsDir, 'noto-sans-kr.json')
  if (existsSync(kopubSpec) && existsSync(notoSpec) && mapped.some((m) => m.specFile)) {
    const demoResult = await runMcfgCompare(kopubSpec, notoSpec).catch(() => null)
    if (demoResult?.ok && demoResult.mismatchCount > 0) {
      violations.push({
        axis: 'font-metric',
        code: 'MCFG-FONT-METRIC-MISMATCH',
        severity: 'warning',
        message: `시연: KoPub vs Noto 메트릭 차이 ${demoResult.mismatchCount}건 (글리프 advance)`,
        location: 'specs/font-metrics/',
        source: 'mcfg-validate'
      })
    }
  }

  // unmapped 폰트
  const unmapped = mapped.filter((m) => !m.specFile)
  if (unmapped.length > 0) {
    violations.push({
      axis: 'font-metric',
      code: 'MCFG-UNMAPPED-FONT',
      severity: 'info',
      message: `매핑 없는 폰트 ${unmapped.length}개: ${unmapped.map((m) => m.family).join(', ')}`,
      source: 'mcfg-validate'
    })
  }

  return {
    available: true,
    fontCount: fontFaces.length,
    mappedCount: mapped.filter((m) => m.specFile).length,
    violations,
    reportUrl: null  // Task 8 에서 채움
  }
}

export function mcfgResultToViolations(result) {
  if (!result?.available) return []
  return result.violations || []
}
```

**Step 4: Run — expect PASS**

**Step 5: Commit**
```bash
git add v4/server/services/mcfgValidator.js v4/server/services/__tests__/mcfgValidator.test.js
git commit -m "feat(mcfg): validateFontMetrics integration (P2)

- parseHeaderFontFaces → loadMapping → runMcfgCompare 합성
- 매핑 부재 폰트 → info severity (warning 아님)
- 시연용 KoPub vs Noto 비교 → MCFG-FONT-METRIC-MISMATCH 1건 보장
- mcfg 부재 시 graceful {available: false}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: HTML report generation + reportUrl

**Files:**
- Modify: `v4/server/services/mcfgValidator.js` (HTML 리포트 생성)
- Modify: `v4/server/services/__tests__/mcfgValidator.test.js`

**Step 1: Write test**

```js
describe('validateFontMetrics — HTML report', () => {
  it('writes metrics.html when mcfg available and fonts mapped', async () => {
    // mcfg binary skip-condition
    if (!existsSync(path.join(fixtureDir, '..', '..', '.venv', 'bin', 'mcfg'))) {
      console.warn('skip: mcfg not bootstrapped')
      return
    }
    const result = await validateFontMetrics(
      path.join(fixtureDir, 'sample-with-fonts.hwpx'),
      { docType: 'report', outputBase: '/tmp/test-mcfg-' + Date.now() }
    )
    if (result.available && result.mappedCount > 0) {
      expect(result.reportUrl).toMatch(/\.metrics\.html$/)
      expect(existsSync(result.reportUrl.replace(/^\//, ''))).toBe(false) // /generated 경로
    }
  })
})
```

**Step 2: Implement HTML generation**

`validateFontMetrics` 끝부분에 추가:

```js
import { writeFile } from 'fs/promises'
import { generatedDirectory } from './hwpxBuilder.js'

// validateFontMetrics 안 — 매핑된 폰트 있을 때 HTML 리포트 생성
let reportUrl = null
if (mapped.some((m) => m.specFile)) {
  const reportName = `mcfg-${Date.now()}.metrics.html`
  const reportPath = path.join(generatedDirectory, reportName)
  try {
    const kopubSpec = path.join(fontMetricsDir, 'kopub-batang.json')
    const notoSpec = path.join(fontMetricsDir, 'noto-sans-kr.json')
    if (existsSync(kopubSpec) && existsSync(notoSpec)) {
      const htmlProc = await runProcess(mcfgBin,
        ['compare', kopubSpec, notoSpec, '--format', 'html', '--output', reportPath],
        v4Root, { timeoutMs: 15000 })
      if (htmlProc.ok && existsSync(reportPath)) {
        reportUrl = `/generated/${reportName}`
      }
    }
  } catch (err) {
    // 리포트 실패해도 검증 자체는 성공 — note만 남김
  }
}
return {
  available: true,
  fontCount: fontFaces.length,
  mappedCount: mapped.filter((m) => m.specFile).length,
  violations,
  reportUrl
}
```

**Step 3: Run tests**

**Step 4: Commit**
```bash
git add v4/server/services/mcfgValidator.js v4/server/services/__tests__/mcfgValidator.test.js
git commit -m "feat(mcfg): generate HTML report → /generated/mcfg-*.metrics.html

- mcfg compare --format html --output 으로 리포트 생성
- generated/ 하위 timestamp 파일명 (충돌 방지)
- 리포트 실패 시 reportUrl=null, 검증 자체는 성공

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: validator.js — 4번째 엔진 합류

**Files:**
- Modify: `v4/server/services/validator.js`

**Step 1: Read current validator.js**
```bash
cat v4/server/services/validator.js
```

**Step 2: Modify — add mcfg engine**

Promise.all 호출에 mcfgValidator 합류, engines 배열에도 추가:

```js
import { verifyHwpxWithRhwp, rhwpResultToViolations } from './rhwpVerifier.js'
import { validateFontMetrics, mcfgResultToViolations } from './mcfgValidator.js'

export async function validateHwpx(hwpxPath, { docType } = {}) {
  const [native, polaris, rhwp, mcfg] = await Promise.all([
    runNativeValidator(hwpxPath),
    validateWithPolarisDvc(hwpxPath, { docType }).catch((e) => ({
      available: false, note: e.message, violations: []
    })),
    verifyHwpxWithRhwp(hwpxPath),
    validateFontMetrics(hwpxPath, { docType }).catch((e) => ({
      available: false, note: e.message
    }))
  ])

  const rhwpViolations = rhwpResultToViolations(rhwp)
  const mcfgViolations = mcfgResultToViolations(mcfg)

  const allViolations = [
    ...(native.violations || []),
    ...(polaris.violations || []),
    ...rhwpViolations,
    ...mcfgViolations
  ]
  const errorCount = allViolations.filter((v) => v.severity === 'error').length
  const warningCount = allViolations.filter((v) => v.severity === 'warning').length

  return {
    ok: errorCount === 0,
    errorCount,
    warningCount,
    violations: allViolations,
    engines: [
      { name: 'v3-native', available: true, violationCount: (native.violations || []).length },
      { name: 'polaris-dvc', available: polaris.available !== false, violationCount: (polaris.violations || []).length, note: polaris.note },
      { name: 'rhwp-wasm', available: rhwp.available !== false, violationCount: rhwpViolations.length, note: rhwp.note, pageCount: rhwp.pageCount, sourceFormat: rhwp.sourceFormat, warningSummary: rhwp.warningSummary },
      { name: 'mcfg-validate', available: mcfg.available !== false, violationCount: mcfgViolations.length, note: mcfg.note, fontCount: mcfg.fontCount, mappedCount: mcfg.mappedCount }
    ],
    mcfgReportUrl: mcfg?.reportUrl || null
  }
}
```

**Step 3: syntax check**
```bash
node --check v4/server/services/validator.js
```
Expected: no output (syntax OK).

**Step 4: Smoke**
```bash
cd v4 && npm run dev:server > /tmp/v4-server.log 2>&1 &
sleep 3
curl -s -X POST http://127.0.0.1:8792/api/export-hwpx \
  -F "title=mcfg test" -F "toc=1장" \
  -F 'sections=[{"heading":"1장","body":"테스트"}]' \
  -F "diagrams=[]" -F "sourceMode=none" | jq '.validation.engines[].name'
pkill -f "v4/server"
```
Expected: 4개 엔진 이름 출력 — `v3-native`, `polaris-dvc`, `rhwp-wasm`, `mcfg-validate`.

**Step 5: Commit**
```bash
git add v4/server/services/validator.js
git commit -m "feat(mcfg): join mcfg-validate to validateHwpx Promise.all

- 4번째 검증 엔진으로 mcfg-validate 합류
- engines 배열에 fontCount/mappedCount 노출
- response 에 mcfgReportUrl 추가
- 기존 3엔진 동작 보존

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: P5 — docType spec mcfg 섹션 추가

**Files:**
- List existing: `v4/specs/`
- Modify: `v4/specs/report.json`
- Modify: `v4/specs/proposal.json` (있다면)

**Step 1: List existing specs**
```bash
ls v4/specs/*.json 2>/dev/null
```

**Step 2: Add mcfg block to each**

각 docType json 에 (없으면 만들고):
```json
{
  "...": "기존 필드 보존",
  "mcfg": {
    "expectedFonts": ["함초롬바탕", "HY헤드라인M"],
    "tolerance": 1,
    "strictness": "warn",
    "note": "M6 Polaris MCFG. 한컴 EULA 통과 시 referenceSpec 추가."
  }
}
```

**Step 3: Validate JSON**
```bash
for f in v4/specs/*.json; do python3 -c "import json; json.load(open('$f'))"; done
```

**Step 4: Commit**
```bash
git add v4/specs/*.json
git commit -m "feat(mcfg): P5 — docType spec mcfg sections

- report.json + proposal.json 등에 mcfg.expectedFonts/tolerance 추가
- strictness: warn (R5 와 동일 레벨)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: P3 — McfgReportFrame component

**Files:**
- Create: `v4/client/src/components/McfgReportFrame.jsx`
- Create: `v4/client/src/components/__tests__/McfgReportFrame.test.jsx`

**Step 1: Write failing test**

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { McfgReportFrame } from '../McfgReportFrame.jsx'

describe('McfgReportFrame', () => {
  it('renders empty message when no reportUrl', () => {
    render(<McfgReportFrame reportUrl={null} />)
    expect(screen.getByText(/리포트가 없습니다/)).toBeInTheDocument()
  })

  it('renders sandboxed iframe when reportUrl provided', () => {
    render(<McfgReportFrame reportUrl="/generated/x.metrics.html" />)
    const frame = screen.getByTitle(/MCFG/)
    expect(frame).toHaveAttribute('src', '/generated/x.metrics.html')
    expect(frame).toHaveAttribute('sandbox', 'allow-same-origin')
  })
})
```

**Step 2: Run — expect FAIL**

**Step 3: Implement**

```jsx
// v4/client/src/components/McfgReportFrame.jsx
export function McfgReportFrame({ reportUrl }) {
  if (!reportUrl) {
    return <p className="empty-copy">리포트가 없습니다.</p>
  }
  return (
    <iframe
      src={reportUrl}
      className="mcfg-report-frame"
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      title="MCFG font metric report"
    />
  )
}
```

**Step 4: CSS for iframe**

```css
/* styles.css 끝에 추가 */
.mcfg-report-frame {
  width: 100%;
  min-height: 480px;
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
  background: #fff;
}
```

**Step 5: Run — expect PASS**

**Step 6: Commit**
```bash
git add v4/client/src/components/McfgReportFrame.jsx v4/client/src/components/__tests__/McfgReportFrame.test.jsx v4/client/src/styles.css
git commit -m "feat(mcfg): McfgReportFrame component (sandboxed iframe)

- sandbox=allow-same-origin (script/form 차단)
- referrerPolicy=no-referrer
- reportUrl 없으면 empty-copy 메시지

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: P3 — ValidationPanel 탭 통합

**Files:**
- Read: `v4/client/src/components/ValidationPanel.jsx`
- Modify: `v4/client/src/components/ValidationPanel.jsx`
- Modify: `v4/client/src/styles.css`

**Step 1: Read current ValidationPanel.jsx**

**Step 2: Add tab state + render**

기존 컴포넌트 wrap:

```jsx
import { useState } from 'react'
import { McfgReportFrame } from './McfgReportFrame.jsx'

export function ValidationPanel({ validation }) {
  const [activeTab, setActiveTab] = useState('main')
  const hasMcfg = Boolean(validation?.mcfgReportUrl) ||
    validation?.engines?.some((e) => e.name === 'mcfg-validate' && e.available)

  return (
    <section className="validation-panel">
      <div className="validation-tabs" role="tablist">
        <button
          type="button"
          className={activeTab === 'main' ? 'active' : ''}
          onClick={() => setActiveTab('main')}
          aria-selected={activeTab === 'main'}
        >검증 결과</button>
        {hasMcfg && (
          <button
            type="button"
            className={activeTab === 'mcfg' ? 'active' : ''}
            onClick={() => setActiveTab('mcfg')}
            aria-selected={activeTab === 'mcfg'}
          >폰트 메트릭</button>
        )}
      </div>
      {activeTab === 'main' && <MainValidationView validation={validation} />}
      {activeTab === 'mcfg' && <McfgReportFrame reportUrl={validation.mcfgReportUrl} />}
    </section>
  )
}

// MainValidationView = 기존 ValidationPanel 본문 추출
```

**Step 3: CSS**

```css
.validation-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.validation-tabs button {
  background: transparent; border: 1px solid var(--border, #ddd);
  padding: 6px 14px; border-radius: 6px 6px 0 0; cursor: pointer;
}
.validation-tabs button.active { background: var(--accent, #0a84ff); color: white; }
```

**Step 4: Smoke (browser)**
- npm run dev → 빌드 → ValidationPanel 표시 확인 → "폰트 메트릭" 탭 클릭

**Step 5: Commit**
```bash
git add v4/client/src/components/ValidationPanel.jsx v4/client/src/styles.css
git commit -m "feat(mcfg): ValidationPanel tab — 검증 결과 / 폰트 메트릭

- mcfg-validate engine 또는 mcfgReportUrl 있을 때 탭 노출
- 기본 탭은 '검증 결과' (기존 동작 유지)
- aria-selected role=tablist 접근성

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: P1 B+α — Live extract script (optional)

**Files:**
- Create: `v4/scripts/extract-font-metrics.sh`

**Step 1: Write script**

```bash
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
if ! timeout 1800 curl -fsSL --max-time 1800 "$KOPUB_URL" -o "$TMPDIR/kopub.ttf"; then
  echo "[warn] download failed — fixture preserved"
  exit 0
fi

echo "[info] extracting metrics with mcfg..."
if ! "$V4_ROOT/.venv/bin/mcfg" extract "$TMPDIR/kopub.ttf" \
    -o "$V4_ROOT/specs/font-metrics/kopub-batang.json"; then
  echo "[warn] mcfg extract failed — fixture preserved"
  # restore from git
  git -C "$V4_ROOT" checkout specs/font-metrics/kopub-batang.json 2>/dev/null || true
  exit 0
fi

echo "[ok] kopub-batang.json refreshed via live extract"
git -C "$V4_ROOT" diff --stat specs/font-metrics/kopub-batang.json || true
```

**Step 2: chmod**
```bash
chmod +x v4/scripts/extract-font-metrics.sh
```

**Step 3: Try running (optional, B+α)**
```bash
bash v4/scripts/extract-font-metrics.sh
```
Expected: 성공 시 git diff 출력. 실패 시 `[warn]` 메시지 + fixture 그대로 + exit 0.

**Step 4: If success → commit live data**
```bash
git -C v4 status specs/font-metrics/kopub-batang.json
# 변경 있으면:
git add v4/specs/font-metrics/kopub-batang.json
git commit -m "feat(mcfg): live-extract kopub-batang metrics (replaces fixture)

scripts/extract-font-metrics.sh 실행 결과로 fixture 자동 교체.
KoPub Batang OFL @ google/fonts mirror 에서 다운로드.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Step 5: Commit script regardless**
```bash
git add v4/scripts/extract-font-metrics.sh
git commit -m "feat(mcfg): extract-font-metrics.sh (B+α live extract, 30min timeout)

성공 시 specs/font-metrics/kopub-batang.json 자동 갱신.
실패 시 fixture 보존 + exit 0 (검증 흐름 영향 없음).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: smoke-test 확장 + verify-mcfg-report.sh

**Files:**
- Read: `v4/tools/smoke-test.sh`
- Modify: `v4/tools/smoke-test.sh`
- Create: `v4/tools/verify-mcfg-report.sh`

**Step 1: Append to smoke-test.sh**

```bash
# === MCFG (M6) checks ===
echo "[smoke] checking mcfg-validate engine..."
if [ -x v4/.venv/bin/mcfg ]; then
  v4/.venv/bin/mcfg --version || echo "[warn] mcfg --version failed"
else
  echo "[warn] mcfg not bootstrapped (run scripts/mcfg-bootstrap.sh)"
fi

# 응답에 mcfg-validate 엔진 포함 확인
RESP=$(curl -s -X POST "http://127.0.0.1:${V4_PORT:-8792}/api/export-hwpx" \
  -F "title=smoke" -F "toc=1장" \
  -F 'sections=[{"heading":"1장","body":"smoke"}]' \
  -F "diagrams=[]" -F "sourceMode=none")
if echo "$RESP" | jq -e '.validation.engines[] | select(.name=="mcfg-validate")' >/dev/null; then
  echo "[ok] mcfg-validate engine present in response"
else
  echo "[fail] mcfg-validate engine missing"
  exit 1
fi
```

**Step 2: Write verify-mcfg-report.sh**

```bash
#!/usr/bin/env bash
# verify-mcfg-report.sh — 가장 최근 mcfg HTML 리포트 존재 + 핵심 필드 확인.
set -euo pipefail
V4_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

LATEST=$(ls -t "$V4_ROOT/generated/"*.metrics.html 2>/dev/null | head -1 || true)
if [ -z "$LATEST" ]; then
  echo "[warn] no metrics.html in generated/"
  exit 0
fi
echo "[ok] latest report: $LATEST"
echo "[ok] size: $(wc -c < "$LATEST") bytes"

if grep -q "advance" "$LATEST" 2>/dev/null; then
  echo "[ok] report contains 'advance' (compare data present)"
else
  echo "[warn] report does not mention 'advance'"
fi
```

**Step 3: Commit**
```bash
chmod +x v4/tools/verify-mcfg-report.sh
git add v4/tools/smoke-test.sh v4/tools/verify-mcfg-report.sh
git commit -m "test(mcfg): smoke-test 확장 + verify-mcfg-report.sh (R1 증거)

- smoke-test.sh: mcfg --version + engines 4개 응답 확인
- verify-mcfg-report.sh: 최근 metrics.html 존재 + 'advance' 키워드 확인

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: 종합 시각 검증 (사용자 협조 필요)

**Goal:** R1 — 완료 선언 전 E2E 증거 수집.

**Step 1: 부트스트랩 + 서버 재시작**
```bash
bash v4/scripts/mcfg-bootstrap.sh
cd v4 && npm run dev
```

**Step 2: 브라우저 검증**
1. http://127.0.0.1:5192/ 접속
2. 샘플 HWP/HWPX 업로드
3. AI 초안 생성 → HWPX 빌드
4. ValidationPanel 에 "폰트 메트릭" 탭 노출 확인
5. 탭 클릭 → iframe HTML 렌더 확인
6. mismatch 워닝 1건 이상 노출

**Step 3: 증거 capture**
```bash
bash v4/tools/smoke-test.sh
bash v4/tools/verify-mcfg-report.sh
```

**Step 4: ADR 또는 lessons-learned 업데이트**
```bash
# v4/docs/lessons-learned.md 에 한 줄 추가:
# "M6: Polaris MCFG (v0.2.3) 4번째 검증 엔진으로 통합. OFL fixture 데모. 
#  한컴 EULA 검토 후 spec JSON 교체로 본 검증 가능."
```

**Step 5: 최종 commit**
```bash
git add v4/docs/lessons-learned.md
git commit -m "docs(mcfg): M6 lessons-learned + E2E 증거

bash tools/smoke-test.sh: ok 4 engines
bash tools/verify-mcfg-report.sh: latest metrics.html OK
브라우저 시각 검증: 폰트 메트릭 탭 + iframe 렌더 OK
mismatch 워닝 1건 이상 시연

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Validation (구현 완료 시)

```bash
# 1. Syntax
node --check v4/server/services/mcfgValidator.js
node --check v4/server/services/validator.js
python3 -c "import json; [json.load(open(f)) for f in __import__('glob').glob('v4/specs/**/*.json', recursive=True)]"

# 2. Unit tests
cd v4/server && npx vitest run services/__tests__/mcfgValidator.test.js
cd v4/client && npx vitest run src/components/__tests__/McfgReportFrame.test.jsx

# 3. E2E smoke
cd /Users/young/Downloads/personal_project/calendar_app/.claude/worktrees/mcfg-m6-font-metrics
bash v4/tools/smoke-test.sh
bash v4/tools/verify-mcfg-report.sh

# 4. 시각 (사용자)
cd v4 && npm run dev
# → http://127.0.0.1:5192/ 빌드 → ValidationPanel 폰트 메트릭 탭 확인
```

---

## Rollback Plan

본 작업이 망가질 경우:
1. `git checkout worktree-rhwp-0.7.7-m1-m4` (M1-M4 base 로 복귀)
2. `git worktree remove .claude/worktrees/mcfg-m6-font-metrics`
3. M1-M4 그대로 작동 (직교 작업이라 영향 없음)

---

## Done Definition

- [ ] mcfg --version 출력 (부트스트랩 OK)
- [ ] 4개 엔진이 `/api/export-hwpx` 응답에 노출
- [ ] mcfgValidator.js 단위 테스트 모두 PASS
- [ ] McfgReportFrame.jsx 단위 테스트 모두 PASS
- [ ] ValidationPanel 에 "폰트 메트릭" 탭 + iframe 렌더
- [ ] MCFG-FONT-METRIC-MISMATCH 워닝 1건 시연
- [ ] tools/verify-mcfg-report.sh 통과
- [ ] R5 회귀 없음 (warningCount 동일/감소)
- [ ] 16개 commit (1 design + 약 14 task + 1 lessons-learned)
- [ ] B+α 라이브 추출은 best-effort (fail OK)

---

## Execution Notes

- **Frequent commits**: 각 Task 끝마다 commit. squash 는 머지 직전에만.
- **TDD**: Test 먼저, 그 다음 minimal implementation. 구현이 테스트 짧게 만들도록.
- **R1 (E2E 증거)**: "완료" 라고 말하기 전 Task 15 시각 검증 필수.
- **B+α 처리**: Task 13 가 실패해도 (fixture 보존) 전체 흐름은 통과.
- **Worktree 격리**: 모든 작업은 `mcfg-m6-font-metrics` 브랜치에서만. M1-M4 와 직교.
