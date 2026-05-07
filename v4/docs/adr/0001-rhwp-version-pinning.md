# ADR 0001: `@rhwp/core` 버전 pin

**Status**: Static-Verified — 2026-04-27 (0.7.2 → 0.7.7 ramp-up). Earlier Accepted 2026-04-20 (0.7.2). Promotion to Accepted 0.7.7 requires interactive smoke pass (아래 PENDING 절 참조).
**Context**: `v4/client/package.json`

## Decision (현행)

`@rhwp/core` 는 `"0.7.7"` 으로 **exact pin** (caret `^` 금지).

> **0.7.2 → 0.7.7 업그레이드 사유**: 0.7.6+에서 v4 운영에 직결되는 신규 WASM API
> (`replaceOne`, `exportHwpx`, `exportHwpVerify`, `getValidationWarnings`,
> `getFieldList`, `setFieldValueByName`)가 노출되어 R5(단락 hp:run/linesegarray
> 잔존), R1(preview ≠ download 검증) 등 기존 비즈니스 규칙 충족 도구가 추가됨.
> 0.7.3에서 보고된 WASM instantiate 회귀(아래 "이력")는 0.7.7 정적 검증에서
> 재현되지 않음 — 단, **인터랙티브 검증은 사용자 손에 달려 있음**.

## Rationale

### 0.7.2 pin 도입 배경 (2026-04-20)

`^0.7.2` → 0.7.3 자동 설치 → Vite dev 환경에서 WASM instantiate 실패:

```
WebAssembly.instantiate(): Import #1 "./rhwp_bg.js"
  "__wbg_measureTextWidth_0962d94b80b2a16a": function import requires a callable
```

rhwp.js 글루와 WASM 바이너리 바인딩 해시 (0.7.3) 는 일치했지만, 파일시스템 / Vite 서버 레벨에서는 정상이었음에도 브라우저 인스턴스화에서 실패. 원인 심층 조사 결과 Vite의 모듈 캐시와 0.7.3의 wasm-bindgen 글루 간 상호작용 이슈로 추정 (재현 일관성 낮음).

롤백 (0.7.2) 후 즉시 정상 동작 복구.

### 0.7.7 으로 ramp-up (2026-04-27)

#### 정적 검증 (Static-Only Verification — 통과)

| 검증 | 결과 |
|---|---|
| `npm install @rhwp/core@0.7.7 --save-exact` | OK (`"@rhwp/core": "0.7.7"` in `client/package.json`) |
| Node 환경 WASM 초기화 (`init({ module_or_path: bytes })`) | OK |
| `HwpDocument.createEmpty().pageCount()` | 1 페이지 반환 |
| 신규 WASM API 노출 점검 | `replaceOne / replaceAll / replaceText / exportHwp / exportHwpx / exportHwpVerify / getValidationWarnings / getFieldList / setFieldValueByName / searchText` 모두 `function` |
| `templates/gonmun.hwpx` 로드 → `pageCount()` | 2 페이지 (정상) |
| `templates/gonmun.hwpx` → `getValidationWarnings()` | 1건 (LinesegTextRunReflow @ section 0 / paragraph 9) |
| `templates/gonmun.hwpx` → `getFieldList()` | `[]` (명명 필드 없음 — M5 진행 시 템플릿 재설계 필요) |
| `cd v4/client && npm run build` (Vite 5) | 성공 (50 modules, 368ms, exit 0) |
| `for f in v4/server/{index.js,lib,services,routes}/*.js; do node --check "$f"; done` | 모두 통과 |

#### 인터랙티브 검증 (PENDING — 사용자 확인 필요)

ADR가 요구하는 다음 절차는 인터랙티브 환경 외부에서 실행 불가하여 **이번 변경에서는 충족되지 않았다**. 사용자가 dev 환경에서 직접 통과시킨 후 본 ADR의 Status를 "Accepted (0.7.7)" 로 promote 해야 한다.

| 절차 | 상태 | 명령 |
|---|---|---|
| dev 서버 기동 후 smoke test | ⏳ pending | `cd v4 && npm run dev` 후 별 터미널에서 `bash v4/tools/smoke-test.sh` |
| 브라우저 수동 테스트 (업로드 → 미리보기 → AI → 다운로드 → 한컴에서 열기) | ⏳ pending | 사용자 |
| `docs/lessons-learned.md` 에 0.7.7 경험 1줄 기록 | ⏳ pending | 인터랙티브 결과 확정 후 |

> **0.7.3 회귀가 0.7.7에서 재현되지 않음을 보장하는 인터랙티브 증거가 아직 없다.** 0.7.3 사고는 "Vite + 브라우저 WASM instantiate" 인터페이스에서 발생했고, 정적 검증/Node 환경 probe는 이 경로를 커버하지 않는다. 사용자 인터랙티브 통과 전에는 main으로 머지 금지를 권장한다.

## Consequences

- **신규 기능 enable**: replaceOne, exportHwpVerify, getValidationWarnings 등 v4가 직접 활용 가능 (M2/M3 참조).
- **검증 부담 ↑**: 인터랙티브 smoke test 한 번이라도 실패하면 즉시 0.7.2로 revert + 본 ADR을 다시 Superseded 표기.
- **R3 적용 의무**: `package.json` 변경 후 `bash v4/hooks/post-deps-change.sh` (Vite cache + 프로세스 정리) → `npm run dev` 재기동 → 브라우저 하드 리프레시 강제.

## Upgrade Checklist (향후 시도 시 — 동일 적용)

1. `npm install @rhwp/core@<new> --save-exact` 를 임시 워크트리/브랜치에서
2. **Static**: `cd v4/client && npm run build` + `node --check` 전 서버 파일 + Node-side WASM probe (`module_or_path` 바이트 주입) → 신 API 노출 확인
3. **Interactive**: `bash v4/tools/smoke-test.sh` PASS
4. **Manual**: 브라우저 업로드 → 미리보기 → AI 생성 → 다운로드 → 한컴 macOS 뷰어 열기
5. 통과 시 `client/package.json` exact pin 확인 + 본 ADR 업데이트 + `docs/lessons-learned.md` 기록
