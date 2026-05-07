# M6 — Polaris MCFG (Metric-Compatible Font Generator) 통합 Design

**작성일**: 2026-05-07
**브랜치**: `mcfg-m6-font-metrics` (base: `worktree-rhwp-0.7.7-m1-m4`)
**상태**: Approved (사용자 4단계 brainstorming 승인 완료)

## Mission / Non-Goals

### Mission
v4 HWPX 빌드 파이프라인에 **4번째 검증 엔진(폰트 메트릭)** 을 추가해, R1(미리보기 = 다운로드 바이트) 위반의 한 축인 "폰트 폴백으로 인한 advance width drift" 를 정량 진단할 수 있게 한다.

### Non-Goals
- 한컴 폰트(HY헤드라인M, 함초롱바탕) 메트릭의 실제 추출 — EULA 검토 미완. 본 작업은 **OFL 폰트(KoPub Batang, Noto Sans KR) 데모/스켈레톤** 만.
- 페이지 드리프트(2→3) 자체의 fix — 그건 R5(linesegarray)/build_hwpx.py 영역. 본 작업은 진단 도구만 제공.
- M5 (named field 슬롯 채우기) 와의 통합 — 직교한 작업, 별도 진행.

## Scope (P1-P5)

| ID | 무엇 | 깊이 |
|----|------|------|
| **P1** | 폰트 메트릭 부트스트랩 + (B+α) 라이브 추출 1회 시도 | 데모/스켈레톤 — OFL 폰트만 |
| **P2** | mcfgValidator.js — 4번째 검증 엔진 (HWPX header.xml ↔ spec JSON 비교) | 인프라 + fixture (실제 mcfg CLI 호출) |
| **P3** | ValidationPanel 폰트 메트릭 탭 + iframe HTML 리포트 | 작동하는 UI |
| **P4** | specs/font-metrics/*.json — Polaris schema v1 fixture | 2개 (KoPub/Noto) |
| **P5** | specs/<docType>.json 의 mcfg 섹션 확장 | report/proposal 2개 docType |

**구현 깊이 합의**: B+α — fixture로 인프라 검증, 마지막 30분 안에 KoPub OFL 한 번 라이브 추출 시도 (성공 시 fixture 1개 자동 갱신, 실패 시 fixture 보존).

---

## Section 1 — Architecture

### 디렉토리 변경 (새 worktree 기준)

```
v4/
├── vendor/                           (사용 안 함 — pip install git+ 로 대체)
├── .venv/                            신규 — Python 3.10+ venv (mcfg + fontTools + click)
├── specs/
│   ├── font-metrics/                 신규 — P4
│   │   ├── kopub-batang.json
│   │   ├── noto-sans-kr.json
│   │   └── _README.md
│   ├── font-metrics-mapping.json     신규 — 한컴 폰트명 ↔ spec 매핑
│   ├── report.json                   기존 — P5: mcfg 섹션 추가
│   └── proposal.json                 기존 — P5: mcfg 섹션 추가
├── server/
│   └── services/
│       ├── mcfgValidator.js          신규 — P2 (4번째 엔진)
│       └── validator.js              수정 — Promise.all 4번째 합류
├── client/
│   └── src/components/
│       ├── ValidationPanel.jsx       수정 — 탭 그룹 추가
│       └── McfgReportFrame.jsx       신규 — P3 iframe 임베드
├── scripts/
│   ├── mcfg-bootstrap.sh             신규 — venv + pip install (1회, idempotent)
│   └── extract-font-metrics.sh       신규 — B+α 라이브 추출 (1회 시도)
├── tests/
│   └── fixtures/
│       ├── sample-with-fonts.hwpx    신규 — 작은 HWPX (gonmun 축소)
│       ├── sample-no-fonts.hwpx
│       └── sample-corrupt.hwpx
└── docs/
    └── plans/
        └── 2026-05-07-mcfg-m6-design.md  이 문서
```

### 결정사항 (Section 1 Q&A 결과)

- **submodule X** → `pip install git+https://github.com/PolarisOffice/polaris_mcfg.git@v0.2.3` (간결, requirements.txt 한 줄)
- **.venv 위치**: `v4/.venv` 그대로 (기존 `pythonCmd` 검출 로직 재사용)
- **HTML 리포트**: ValidationPanel **탭** 임베드 (사용자 흐름 안 끊음)
- **mcfg 호출 방식**: CLI (sub-process), 우리 `runProcess` 패턴 그대로 — 라이브러리 import X
- **의존성 격리**: `v4/.venv` 안에서만, 시스템 Python 안 건드림

### 통합 지점 4곳

1. `validator.js` — 3개 → 4개 엔진 Promise.all 확장
2. `mcfgValidator.js` — HWPX zip 풀어 header.xml 파싱 + mcfg compare CLI 호출
3. `ValidationPanel.jsx` — "검증 결과" / "폰트 메트릭" 두 탭
4. `specs/<docType>.json` — `"mcfg": { expectedFonts, tolerance, strictness }` 섹션

---

## Section 2 — Components + Data Flow

### P1: 부트스트랩 + B+α

**`scripts/mcfg-bootstrap.sh`** (idempotent):
```bash
#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
V4_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

python3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" || {
  echo "[error] Python 3.10+ required"; exit 1; }

if [ -f "$V4_ROOT/.venv/bin/mcfg" ] && "$V4_ROOT/.venv/bin/mcfg" --version >/dev/null 2>&1; then
  echo "[ok] mcfg already installed"; exit 0
fi

python3 -m venv "$V4_ROOT/.venv"
"$V4_ROOT/.venv/bin/pip" install --upgrade pip
"$V4_ROOT/.venv/bin/pip" install "git+https://github.com/PolarisOffice/polaris_mcfg.git@v0.2.3"
"$V4_ROOT/.venv/bin/mcfg" --version
echo "[ok] mcfg bootstrapped → $V4_ROOT/.venv/bin/mcfg"
echo "[info] dev 서버 재시작 필요 (R3)"
```

**`scripts/extract-font-metrics.sh`** (B+α, 30분 timeout):
```bash
#!/bin/bash
set -euo pipefail
V4_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMPDIR=$(mktemp -d); trap "rm -rf $TMPDIR" EXIT

# KoPub Batang OFL — github.com/google/fonts mirror
curl -fsSL --max-time 1800 \
  "https://github.com/google/fonts/raw/main/ofl/kopubbatang/KoPubBatang-Regular.ttf" \
  -o "$TMPDIR/kopub.ttf" || { echo "[warn] download failed, fixture preserved"; exit 0; }

"$V4_ROOT/.venv/bin/mcfg" extract "$TMPDIR/kopub.ttf" \
  -o "$V4_ROOT/specs/font-metrics/kopub-batang.json" \
  || { echo "[warn] extract failed, fixture preserved"; exit 0; }

echo "[ok] kopub-batang.json refreshed via live extract"
git -C "$V4_ROOT" diff --stat specs/font-metrics/kopub-batang.json
```

### P4: Polaris schema v1 fixture

**`specs/font-metrics/kopub-batang.json`**:
```json
{
  "schemaVersion": 1,
  "source": {
    "filename": "KoPubBatang-Regular.ttf",
    "extractorVersion": "0.2.3-fixture",
    "extractedAt": "2026-05-07T00:00:00Z"
  },
  "global": {
    "unitsPerEm": 1000,
    "head": {"yMin": -222, "yMax": 1010},
    "hhea": {"ascent": 880, "descent": -120, "lineGap": 0},
    "os2": {"sTypoAscender": 880, "sTypoDescender": -120, "sTypoLineGap": 200,
            "usWinAscent": 1080, "usWinDescent": 322}
  },
  "glyphs": {
    "U+0041": {"advanceWidth": 583},
    "U+AC00": {"advanceWidth": 1000}
  },
  "kerning": []
}
```
2개 fixture: `kopub-batang.json`, `noto-sans-kr.json`. 사람이 손으로 작성, 라이브 추출 성공 시 자동 갱신.

### `specs/font-metrics-mapping.json`

```json
{
  "schemaVersion": 1,
  "mappings": {
    "함초롱바탕": "kopub-batang.json",
    "함초롱돋움": "noto-sans-kr.json",
    "HY헤드라인M": "noto-sans-kr.json",
    "한컴바탕": "kopub-batang.json"
  },
  "note": "본 매핑은 데모용. 실제 한컴 메트릭이 들어오면 일대일 매핑으로 교체."
}
```

### P2: `mcfgValidator.js` (server/services/)

```js
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import yauzl from 'yauzl'
import { XMLParser } from 'fast-xml-parser'
import { runProcess } from '../lib/utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v4Root = path.resolve(__dirname, '..', '..')
const mcfgBin = path.join(v4Root, '.venv', 'bin', 'mcfg')
const fontMetricsDir = path.join(v4Root, 'specs', 'font-metrics')
const mappingFile = path.join(v4Root, 'specs', 'font-metrics-mapping.json')

export async function validateFontMetrics(hwpxPath, { docType } = {}) {
  if (!existsSync(mcfgBin)) {
    return { available: false, note: 'mcfg not installed (run scripts/mcfg-bootstrap.sh)' }
  }
  try {
    const fontFaces = await parseHeaderFontFaces(hwpxPath)
    if (fontFaces.length === 0) {
      return { available: true, fontCount: 0, mappedCount: 0, violations: [],
               note: 'no fontFace declared in header.xml' }
    }
    const mapping = await loadMapping()
    const mapped = fontFaces.map((f) => ({
      family: f.family,
      specFile: lookupMapping(mapping, f.family)
    }))
    const violations = []
    let reportUrl = null
    for (const m of mapped.filter((m) => m.specFile)) {
      const specPath = path.join(fontMetricsDir, m.specFile)
      // mcfg compare 호출 (실제 폰트 파일이 없어도 spec 자체 일관성 검사)
      const cmpResult = await runMcfgCompare(specPath, m.family).catch((err) => ({
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
      } else {
        // 실제 mismatch 검출 — 시연용 fixture 가 의도적으로 advance 한 글리프 다르게 둠
        if (cmpResult.mismatchCount > 0) {
          violations.push({
            axis: 'font-metric',
            code: 'MCFG-FONT-METRIC-MISMATCH',
            severity: 'warning',
            message: `${m.family}: ${cmpResult.mismatchCount}개 글리프 advance 차이`,
            location: `header.xml fontFace[${m.family}]`,
            source: 'mcfg-validate'
          })
        }
      }
    }
    // unmapped 폰트 → info 1건
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
      reportUrl  // P3 단계에서 채움
    }
  } catch (err) {
    return { available: false, note: `mcfg-validate failed: ${err.message.slice(0, 120)}` }
  }
}

export function mcfgResultToViolations(result) {
  if (!result?.available) return []
  return result.violations || []
}

// helpers (parseHeaderFontFaces, loadMapping, lookupMapping, runMcfgCompare)
//   — 구현 세부는 implementation plan 단계에서
```

### `validator.js` 4번째 엔진 합류

```js
import { verifyHwpxWithRhwp, rhwpResultToViolations } from './rhwpVerifier.js'
import { validateFontMetrics, mcfgResultToViolations } from './mcfgValidator.js'

export async function validateHwpx(hwpxPath, { docType } = {}) {
  const [native, polaris, rhwp, mcfg] = await Promise.all([
    runNativeValidator(hwpxPath),
    validateWithPolarisDvc(hwpxPath, { docType }).catch((e) => ({...})),
    verifyHwpxWithRhwp(hwpxPath),
    validateFontMetrics(hwpxPath, { docType }).catch((e) => ({
      available: false, note: e.message
    }))
  ])
  // violations 병합 + engines 배열에 mcfg-validate 추가
  // ...
}
```

### P3: `ValidationPanel.jsx` 탭 + `McfgReportFrame.jsx`

```jsx
// ValidationPanel.jsx
const [activeTab, setActiveTab] = useState('main')
return (
  <section className="validation-panel">
    <div className="validation-tabs" role="tablist">
      <button onClick={() => setActiveTab('main')}
              aria-selected={activeTab === 'main'}>검증 결과</button>
      {validation.mcfgReportUrl && (
        <button onClick={() => setActiveTab('mcfg')}
                aria-selected={activeTab === 'mcfg'}>폰트 메트릭</button>
      )}
    </div>
    {activeTab === 'main' && <MainValidationContent ... />}
    {activeTab === 'mcfg' && <McfgReportFrame reportUrl={validation.mcfgReportUrl} />}
  </section>
)

// McfgReportFrame.jsx
export function McfgReportFrame({ reportUrl }) {
  if (!reportUrl) return <p className="empty">리포트가 없습니다.</p>
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

### P5: `specs/<docType>.json` mcfg 섹션

```json
{
  "rules": { "minPages": 1, "..." },
  "mcfg": {
    "expectedFonts": ["함초롱바탕", "HY헤드라인M"],
    "tolerance": 1,
    "strictness": "warn"
  }
}
```
mcfgValidator 가 docType 받아 `mcfg.expectedFonts` 와 실제 fontFace 비교, 누락 폰트는 워닝.

### Data Flow (E2E)

```
[Client] 빌드 버튼
   ↓
POST /api/export-hwpx
   ↓
buildHwpx() (Python build_hwpx.py)
   ↓
validateHwpx(outputPath, {docType})
   ├── runNativeValidator       (v3-native)
   ├── validateWithPolarisDvc   (polaris-dvc, ENOENT 폴백)
   ├── verifyHwpxWithRhwp       (rhwp-wasm)
   └── validateFontMetrics      ← 신규 (mcfg-validate)
         ├── unzip Contents/header.xml
         ├── parse <hh:fontFace> family 추출
         ├── NFC 정규화 후 mapping lookup
         ├── spec 있는 폰트마다 .venv/bin/mcfg compare 호출
         ├── HTML 리포트 생성 → generated/<id>.metrics.html
         └── return { violations, reportUrl }
   ↓
res.json({ ok, fileName, validation: { engines, violations, mcfgReportUrl } })
   ↓
[Client] ValidationPanel
   └── "폰트 메트릭" 탭 → iframe(mcfgReportUrl)
```

---

## Section 3 — Error Handling + Edge Cases

### Bootstrap 단계

| 시나리오 | 처리 |
|---|---|
| Python 3.10 미만 | bootstrap 스크립트 첫 줄에서 명확히 exit 1 |
| 네트워크 차단 / pip fail | stderr 그대로 노출, 빌드 자체는 안 막힘 (engine `available:false`) |
| uharfbuzz 컴파일 실패 | `[render]` 선택 의존성 — fail 무시, mcfg core 만 사용 |
| 이미 설치됨 | `mcfg --version` 으로 선검사 → 조기 return |

### 런타임 단계 (mcfgValidator.js)

| 예외 | 처리 |
|---|---|
| mcfg 바이너리 없음 | `{available:false, note:'mcfg not installed'}` |
| HWPX zip 손상 / header.xml 없음 | `{available:true, note:'no header.xml'}`, violations: [] |
| `<hh:fontFace>` 0개 | `{available:true, fontCount:0, note:'no fontFace declared'}` |
| 모든 폰트 unmapped | info severity 1건, warning 아님 |
| mcfg compare 비정상 종료 | stderr 첫 200자를 violation message 로 (R4) |
| HTML 리포트 생성 실패 | reportUrl: null, JSON 결과만, UI 탭 미표시 |
| 한글 폰트명 NFC/NFD | mapping lookup 시 양쪽 NFC 정규화 (R8 적용) |
| 동시 빌드 | 파일명에 빌드 timestamp prefix 포함 — 충돌 없음 |

### 보안 (R7 + iframe)

| 위험 | 완화 |
|---|---|
| mcfg HTML 출력 | mcfg 는 폰트 메트릭만 처리, 사용자 입력 미반영 → 직접 위험 없음 |
| iframe XSS | `sandbox="allow-same-origin"` (script/form 모두 차단) |
| reportUrl traversal | 서버에서 `/generated/<id>.metrics.html` 로만 발급, 클라이언트 변조 불가 |
| 큰 HTML 파일 | mcfg compare `--max-glyph-rows` 기본 제한 |

### B+α 라이브 추출

| 시나리오 | 처리 |
|---|---|
| KoPub URL 변경 / 404 | 스크립트 fail, fixture 보존 (Git fallback) |
| zip/ttf 손상 | mcfg extract fail, fixture 보존 |
| 30분 timeout | `timeout 1800` 래핑, 시간 초과 → fixture 보존 |
| 추출 성공 | `git diff specs/font-metrics/*.json` 변경 확인 후 commit 분리 |

### CLAUDE.md 룰 매핑

| 룰 | 적용 |
|---|---|
| R1 (E2E 증거) | smoke-test.sh 에 4번째 엔진 ping + 폰트 탭 표시 확인 |
| R2 (버전 pin) | `polaris_mcfg.git@v0.2.3` 정확 tag pin |
| R3 (서버 재시작) | bootstrap 스크립트 끝에 안내 |
| R4 (Python/Node 경계) | mcfg stderr 구조화된 violation 으로만, 200자 절단 |
| R7 (escape) | iframe sandbox + React 자동 escape |
| R8 (파일명/문자열) | spec/매핑 lookup NFC 정규화 |

---

## Section 4 — Testing Strategy

### 1. 단위 테스트 (Vitest, server/services/__tests__)

`mcfgValidator.test.js`:
- `parseHeaderFontFaces()`: 정상 / 손상 / fontFace 없음
- `lookupMapping()`: NFC vs NFD, 매핑 부재
- `mcfgResultToViolations()`: 모두 통과 / 부분 mismatch / 전체 fail
- mcfg 부재 mocking → `{available: false}` 반환

테스트 픽스처:
- `tests/fixtures/sample-with-fonts.hwpx` — 한컴 폰트 참조 (5KB)
- `tests/fixtures/sample-no-fonts.hwpx`
- `tests/fixtures/sample-corrupt.hwpx`

### 2. 통합 테스트 (실제 mcfg CLI)

`validator.integration.test.js`:
- 빌드된 HWPX → `validateHwpx()` → engines 4개 모두 포함
- mcfg 부트스트랩 안 된 환경 skip 조건

### 3. E2E smoke test (`tools/smoke-test.sh` 확장)

- `mcfg --version` 출력 확인
- `/api/export-hwpx` 응답에 `engines[name=mcfg-validate]` 포함
- `mcfgReportUrl` 필드 존재 (mapping 0개면 null OK)

### 4. 시각 검증 (수동, R1)

```
1. scripts/mcfg-bootstrap.sh 실행 → mcfg 0.2.3 출력
2. npm run dev 재시작
3. http://127.0.0.1:5192/ → 샘플 업로드 → 빌드
4. ValidationPanel "폰트 메트릭" 탭 → iframe 렌더 확인
5. 인위적 mismatch fixture → "MCFG-FONT-METRIC-MISMATCH" 워닝 1건 시연
```

증거 수집:
- `tools/verify-mcfg-report.sh` 추가 (verify-hwpx-markers.py 와 동급)
- 최근 빌드 metrics.json 존재 / violations 비어있지 않음 / reportUrl 가 generated/ 하위

### 5. CI 회귀

`.github/workflows/` 기존 워크플로 확장:
- `mcfg-bootstrap.sh` 호출 + `actions/cache@v4` 로 .venv 캐시
- 단위/통합/smoke 통과
- 캐시 키: `mcfg-{python}-{tag}-{requirements-hash}`

### 6. B+α 라이브 검증 (수동, 1회)

- `extract-font-metrics.sh` 실행
- `git diff specs/font-metrics/kopub-batang.json` 확인
- 검증 흐름 재실행 → 동일 통과
- 30분 안에 안 끝나면 abort + fixture 유지

### 7. R5 회귀 방지

`validation.warningCount` 가 본 작업 전후 동일하거나 감소.
mcfg 새 워닝은 `source: 'mcfg-validate'` 만 — 다른 엔진 영향 없음.

---

## Validation Commands (구현 완료 후)

```bash
# Python/Node syntax
python3 -m py_compile scripts/build_hwpx.py
node --check server/services/mcfgValidator.js
node --check server/services/validator.js

# 부트스트랩
bash scripts/mcfg-bootstrap.sh

# 단위 + 통합
cd server && npm test -- mcfgValidator
cd .. && npm test  # 전체

# E2E
bash tools/smoke-test.sh
bash tools/verify-mcfg-report.sh

# 시각 (사용자)
npm run dev; open http://127.0.0.1:5192/
```

---

## Risk Register

| 위험 | 영향도 | 완화 |
|---|---|---|
| 한컴 EULA — 메트릭 추출 권한 | 🔴 법적 | **본 작업 범위 외**. P1 데모는 OFL 폰트만 |
| mcfg star=1, v0.2.3 초기 단계 | 🟡 | CLI 호출만, library import X. 우리 코드와 디커플 |
| Python venv 추가 의존성 | 🟢 | 이미 build_hwpx.py 가 Python 사용. venv 격리 |
| uharfbuzz 컴파일 (선택) | 🟡 | render 의존성 — 본 작업 P2/P3 에는 불필요 |
| HWP fontFace ↔ TTF/OTF 매핑 갭 | 🟡 | mapping JSON 명시. 한컴 들어오면 일대일 교체 |

---

## Migration / Future Work

- 한컴 EULA 통과 시: `specs/font-metrics/*.json` 만 교체 (코드 무변경)
- 페이지 드리프트 fix: build_hwpx.py R5 (linesegarray 리셋) — 별도 PR
- M5 (named field 슬롯 채우기) 와 통합: 직교, 별도 진행

## Approval

본 design 은 brainstorming skill 4 sections (Architecture / Components+Flow / Error Handling / Testing) 모두 사용자 승인 완료. writing-plans skill 호출 후 단계별 implementation plan 작성 → executor 위임 → E2E 증거 수집 후 보고.
