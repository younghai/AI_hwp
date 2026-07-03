# Lessons Learned — v4

실제로 터진 문제만 기록. 추측, "~할 것 같다"는 금지. 각 항목은:
- **What happened** (현상)
- **Why** (근본 원인)
- **Fix** (실제 적용한 해결책)
- **Prevention** (다음 번 재발 방지 장치 — `skills/`, `hooks/`, `CLAUDE.md` 업데이트 경로)

---

## 2026-07-02 — 다이어그램에 `&`/`<` 하나만 있어도 조용히 소실

### What happened
- 본문에 "R&D" 처럼 `&`, `<`, `"` 가 포함된 텍스트로 다이어그램을 생성하면 미리보기(JS)엔 보이는데 다운로드 HWPX엔 다이어그램이 없음

### Why
- `scripts/diagram_templates.py` 가 title/step/label 등을 f-string으로 SVG에 **미이스케이프** 삽입 → malformed SVG → `cairosvg.svg2png` 예외 → `except Exception: continue` 로 조용히 스킵
- `shared/escape.js` 의 `escapeXml` 은 클라이언트 미리보기 SVG에만 적용되고 Python 경로엔 대응 함수가 없었음 (R7이 있었지만 Python 쪽은 놓침)

### Fix
- `diagram_templates.py`에 `_esc()` (xml.sax.saxutils.escape 기반) 추가, title/step/label/date/a/b/header_* 전부 경유

### Prevention
- `CLAUDE.md` **R7**을 "JS/Python 양쪽 다이어그램 경로 모두" 로 명시 강화
- `scripts/tests/test_pipeline.py` — `R&D`, `<b>`, `"` 포함 텍스트로 well-formed SVG 검증 (3케이스)

---

## 2026-07-02 — macOS(NFD)에서 AI 본문이 빈 섹션으로 생성됨

### What happened
- 섹션 JSON의 한글 헤딩이 NFD(분해형)이면 NFC로 정규화된 toc와 매칭 실패 → 해당 섹션 body가 통째로 빈 문자열로 클리어됨

### Why
- `main()`은 `--title`/`--toc`/`--source-document`만 NFC 정규화하고, `load_sections_body()`는 JSON의 heading/body를 원본 그대로 사용

### Fix
- `load_sections_body`에서 heading/body를 로드 직후 `unicodedata.normalize('NFC', ...)`

### Prevention
- 사용자 텍스트가 여러 진입점(CLI 인자, JSON 파일)으로 들어오는 파이프라인은 **모든 진입점에서 동일하게 정규화**
- `scripts/tests/test_pipeline.py` — NFD 헤딩 → NFC 매핑 성공 검증

---

## 2026-07-03 — 빌드 타임아웃/크래시 시 손상된 .hwpx가 다운로드 경로에 잔존

### What happened
- 60초 타임아웃으로 강제 종료되거나 예외 발생 시, 부분적으로 쓰인 zip이 `generated/`에 그대로 남아 서빙될 수 있었음

### Why
- `pack_hwpx`가 최종 출력 경로에 **직접** `ZipFile(output_file, "w")` 로 씀 (원자성 없음)

### Fix
- tmp 파일(`.{name}.{pid}.tmp`)에 쓴 뒤 `os.replace()`로 원자적 교체. 실패 시 tmp 정리
- Node 측(`hwpxBuilder.js`)도 빌드 실패 시 `outputPath`를 명시적으로 unlink

### Prevention
- 외부에 서빙되는 파일을 생성하는 모든 경로는 **tmp write + atomic rename** 패턴 강제

---

## 2026-07-03 — Python traceback + 서버 절대경로가 사용자 응답에 그대로 노출 (R4 재발)

### What happened
- 손상된 업로드/입력으로 예외 발생 시 stderr의 전체 traceback(서버 파일시스템 절대경로 포함)이 500 에러 메시지로 그대로 API 응답에 실림

### Why
- `main()`에 최종 예외 핸들러가 없어 미처리 예외가 stderr로 나가고, Node의 `hwpxBuilder.js`가 `result.stderr`를 그대로 `createHttpError`에 전달

### Fix
- `main()`을 try/except로 감싸고 `HWPX_BUILD_ERROR {json}` 을 stdout으로 출력 (error_code + 사용자 메시지만, traceback은 stderr로만)
- Node가 `HWPX_BUILD_ERROR` 라인을 파싱해 사용자 메시지 매핑, stderr는 서버 로그에만 기록

### Prevention
- `CLAUDE.md` **R4**에 "구조화 에러 채널(stdout JSON) vs 진단 로그(stderr)를 항상 분리" 명시
- Python↔Node 경계를 넘는 모든 신규 워커는 이 패턴을 기본값으로

---

## 2026-07-03 — 다크모드에서 설정 모달을 읽을 수 없음 (대비 1.2:1)

### What happened
- macOS 다크모드에서 "AI 연결 관리" 모달의 제목·프로바이더명이 거의 안 보임 (실측 대비 1.2:1, WCAG AA 기준 4.5:1)

### Why
- `.modal-content`, `.toast`, `.parsed-text-panel` 등 8곳 이상이 `#fff`/라이트 rgba를 하드코딩. `:root`는 다크 변수를 선언했지만 컴포넌트 CSS가 토큰을 안 씀

### Fix
- `--surface`/`--surface-sunken`/`--surface-stage`/`--paper` 시맨틱 토큰 도입, 다크 값 정의. 문서 렌더 영역(`--paper`)만 양쪽 테마에서 흰색 유지

### Prevention
- 새 컴포넌트 배경/텍스트 색은 **hex/rgba 직접 지정 금지, 토큰만 사용**
- 다크모드 대비는 `preview_inspect`로 실측 후 커밋 (스크린샷만으론 판단 금지)

---

## 2026-07-03 — useProviders 무한 fetch 루프 (rate limiter 도입 후 발견)

### What happened
- rate limiting 도입 직후 `/api/health`까지 429가 뜸 — 알고 보니 `/api/providers`가 초당 수십 회 호출되고 있었음

### Why
- `useProviders(onError)`가 매 렌더마다 새 인라인 `onError`를 받음 → `refresh`(useCallback dep: `[onError]`)가 매번 재생성 → `useEffect(refresh, [refresh])` mount 이펙트가 계속 재실행 → `setProviders` → 재렌더 → 무한 루프

### Fix
- `onError`를 `useRef`로 안정화, `refresh`의 dep을 `[]`로 고정

### Prevention
- `useCallback`/`useEffect` dep에 **부모가 매번 새로 만드는 인라인 함수**를 직접 넣지 않는다 (ref로 감싸거나 부모에서 안정화)
- rate limit/메트릭 도입은 이런 종류의 숨은 루프를 드러내는 좋은 회귀 테스트이기도 하다

---

## 2026-04-26 — v4 문서에 v2/v3 버전 식별자 잔여

### What happened
- `v4/README.md` L1: `# v3 — AI Document Studio`
- `v4/CLAUDE.md` L1: `# v2 — AI Document Studio`
- 서비스기획서, SRS, lessons-learned 모두 v2/v3으로 표기

### Why
- v3에서 v4로 복사하면서 버전 식별자를 일괄 변경하지 않음

### Fix
- README.md, CLAUDE.md, 서비스기획서, SRS, lessons-learned의 모든 버전 식별자를 v4로 수정
- 포트 번호, 폴더 구조, 컴포넌트 목록을 v4 실제 코드에 맞게 업데이트

### Prevention
- 버전 업그레이드 시 `grep -rn "v2\|v3" v4/` 로 잔여 식별자 스캔 필수
- `hooks/pre-completion-checklist.sh`에 버전 식별자 일관성 체크 추가 고려

---

## 2026-04-26 — @rhwp/core ^0.7.2 사용으로 ADR-0001 위반

### What happened
- `v4/client/package.json`에서 `"@rhwp/core": "^0.7.2"` 사용
- ADR-0001은 exact pin만 허용, caret 금지

### Why
- v4 개발 시 ADR-0001 규칙을 인지하지 못한 상태에서 semver 범위 지정

### Fix
- `"@rhwp/core": "0.7.2"` (exact pin)으로 변경

### Prevention
- `hooks/post-deps-change.sh`에 `grep '"\^"' client/package.json` 체크 추가 고려

---

## 2026-04-26 — postinstall || true 로 설치 에러 음소거

### What happened
- `v4/package.json` postinstall에 `|| true` 추가
- setup-rhwp-symlink.sh 실패해도 npm install이 성공으로 표시됨

### Why
- 개발 중 빠른 설치를 위해 에러를 숨김

### Fix
- `|| true` 제거. 실패 시 명확하게 에러 노출

### Prevention
- postinstall 스크립트는 에러를 숨기지 않는다. 필요시 스크립트 내에서 graceful 처리

---

## 2026-04-26 — useDraft fetch 경쟁 조건 (race condition)

### What happened
- AI 초안 생성 버튼 연속 클릭 시 이전 응답이 최신 응답을 덮어씀
- AbortController 없이 fetch 호출

### Why
- useDraft hook에서 각 fetch에 signal 전달하지 않음

### Fix
- `useRef`로 AbortController 저장
- 각 fetch 호출 전 이전 요청 abort
- AbortError는 사용자에게 표시하지 않음

### Prevention
- 모든 async hook에서 AbortController 패턴 필수 적용

---

## 2026-04-26 — LoginOverlay 접근성 위반 (WCAG 2.4.3)

### What happened
- 로그인 오버레이 오픈 시 Tab 키가 오버레이 뒤 요소로 이동
- Escape 키로 닫기 불가
- role="dialog" 및 aria-modal 없음

### Fix
- focus trap: Tab/Shift+Tab을 오버레이 내부로 제한
- Escape 키 핸들링
- `role="dialog" aria-modal="true"` 추가
- 닫힐 때 이전 포커스 요소로 복귀

### Prevention
- 모달/오버레이 컴포넌트에는 항상 포커스 트랩 + Escape + role=dialog 적용

---

## 2026-04-20 — AI 초안이 HWPX 다운로드 파일에 반영되지 않음

### What happened
- 사용자: "AI 초안 내용이 미리보기에 보이는데 다운로드 파일은 전혀 다른 내용"
- 실제로는 AI content는 HWPX 에 들어있었지만, `normalize_toc` 가 `추가 섹션 4/5` 로 pad + AI 문장 수가 body 슬롯보다 적으면 마지막 문장 중복 복사 → 사용자 눈에는 "다른 내용" 으로 보임

### Why
- `scripts/build_hwpx.py` `normalize_toc` 가 하드코딩된 5개 슬롯을 강제 (과거 gonmun 기본 템플릿에만 맞춰짐)
- `apply_smart_replacements` 가 AI 문장 부족하면 `sentences[-1]` 중복으로 padding

### Fix
- `normalize_toc` → pad 제거. AI 가 준 개수 그대로 사용
- body 슬롯 > AI 문장이면 남은 슬롯을 빈 문자열로 비움 (중복 X)
- E2E 테스트로 `MARKER_A..F` 각각 정확히 1회 등장 확인

### Prevention
- `CLAUDE.md` **R6** 추가 — AI N섹션 ↔ 템플릿 body 슬롯 불일치 처리 규칙
- `tools/verify-hwpx-markers.py` — 마커 카운트 검증
- `tools/smoke-test.sh` — 매 변경마다 E2E 돌려 중복/누락 감지

---

## 2026-04-20 — `cairosvg` 로드 실패로 HWPX 빌드 전체 실패

### What happened
- 사용자가 다이어그램 포함 요청 시:
  ```
  OSError: no library called "cairo-2" was found
  ```
- 예외가 잡히지 않아 Python 프로세스 exit code 1, 서버가 "HWPX 생성 실패" 반환

### Why
- `embed_diagrams` 가 `except ImportError` 만 catch
- macOS 에 네이티브 `libcairo` 미설치 상태에서 `import cairosvg` 가 `OSError` 발생
- `ImportError` 는 못 잡음

### Fix
- `except (ImportError, OSError)` 로 변경
- 경고 메시지에 **OS별 설치 명령** (`brew install cairo`, `apt-get install libcairo2`) 안내
- 다이어그램만 스킵, 나머지 HWPX 는 정상 생성

### Prevention
- `CLAUDE.md` **R4** — Python/Node 경계에서 optional 네이티브 의존성은 graceful degrade
- 패턴: `except (ImportError, OSError, ModuleNotFoundError) as exc: ...` 로 넓게 catch

---

## 2026-04-20 — `@rhwp/core@0.7.3` 업그레이드 후 WASM init 실패

### What happened
- 사용자: "문서 분석에 실패했습니다: WebAssembly.instantiate(): Import #1 ./rhwp_bg.js __wbg_measureTextWidth_0962d94b80b2a16a: function import requires a callable"
- 파일 업로드 미리보기, 빌드 미리보기, 다운로드 버튼 모두 망가짐

### Why
- `package.json` `"^0.7.2"` → npm이 0.7.3 자동 설치
- 0.7.3 의 wasm-bindgen glue 또는 Vite dev 환경과의 호환성 이슈
- Vite dev 서버가 stale 0.7.3 모듈 그래프를 메모리에 유지

### Fix
- `"@rhwp/core": "0.7.2"` (exact pin, `^` 제거)
- `node_modules/.vite` cache 삭제
- dev 서버 완전 재시작 + 브라우저 하드 리프레시

### Prevention
- `CLAUDE.md` **R2** — 네이티브 바인딩 있는 deps 는 exact pin
- `CLAUDE.md` **R3** — `package.json` 변경 후 재시작 워크플로우
- `hooks/post-deps-change.sh` — cache clear + 재시작 안내 자동 출력
- `docs/adr/0001-rhwp-version-pinning.md` — 영구 기록

---

## 2026-04-20 — `.env` 저장 시 사용자 수정 항목 유실

### What happened
- `/api/settings` 호출마다 `.env` 전체 rewrite → 사용자가 손으로 추가한 항목들 사라짐

### Why
- `writeEnvFile(overrides)` 가 declared 키 목록만 출력하고, 기존 .env 내용 무시

### Fix
- 기존 `.env` 파싱 → overrides merge → 재작성
- declared 외 키는 `# User-defined` 섹션에 보존

### Prevention
- env 저장 함수는 **항상 read-merge-write** 패턴
- 테스트: `.env` 에 `CUSTOM_KEY=foo` 수동 추가 → /api/settings 호출 → `CUSTOM_KEY` 유지 확인

---

## 2026-04-20 — OAuth state Map 메모리 누수

### What happened
- `oauthStates` Map 에 TTL cleanup 없어 재시작 때까지 쌓임

### Why
- state 검증은 했지만 만료 항목 `oauthStates.delete()` 안 함

### Fix
- `setInterval(sweep, 60_000).unref()` 로 10분 TTL 넘은 항목 정리

### Prevention
- 모든 in-memory Map/Set 은 **TTL + sweep interval** 쌍으로 관리
- 또는 사용 직후 (consume-and-delete) 패턴

---

## 2026-04-20 — 한글 파일명 mojibake

### What happened
- `generated/` 에 `1776581...-áá¢áá£...hwpx` 깨진 이름 파일 다수

### Why
- multer 가 원본 파일명을 latin1 로 해석. 한글 UTF-8 bytes 가 latin1 로 잘못 디코딩됨

### Fix
- `decodeOriginalName(rawName)` — mojibake 패턴 감지 후 `Buffer.from(rawName, 'latin1').toString('utf8')` + NFC 정규화

### Prevention
- multer 파일 진입 직후 `decodeOriginalName` 필수 호출
- `assertValidUpload` 로 extension + MIME + magic 삼중 검증

---

## 2026-04-20 — HWPX 단락 내 글자 겹침

### What happened
- 다운로드한 HWPX 에서 제목 옆에 "폰트 HY헤드라인M, 크기 18" 같은 템플릿 보일러플레이트가 겹쳐 보임
- 각 섹션 첫 줄이 bold + 좁은 자간으로 이상하게 표시

### Why
- `t_nodes[0].text = new_text` 만 하고 나머지 `<hp:t>` 와 `<hp:run>` 의 stale 텍스트/스타일이 남음
- `<hp:linesegarray>` 가 원본 텍스트 길이 기준으로 계산되어 새 텍스트 위치가 깨짐

### Fix
- `_normalize_paragraph(p, text)` — first run 만 유지, 나머지 text-only run 제거, linesegarray 리셋
- 래퍼 단락 (테이블 포함) 은 skip (직접 텍스트 없음)

### Prevention
- `CLAUDE.md` **R5** — HWPX 템플릿 편집 시 항상 `_normalize_paragraph` 경유
- 직접 `.text = ` 금지 → lint rule 고려

---

## 2026-04-20 — "완료" 선언 후 사용자 실제 동작 실패 반복

### What happened
- 코드 변경 → 빌드 성공 → "완료" 선언 → 사용자 브라우저에서 실제로 돌려보니 실패 (여러 번 반복)

### Why
- `node --check` / `vite build` 는 syntax/bundling 검증일 뿐 런타임 동작 보장 안 함
- 브라우저 UI 는 내가 확인 불가
- 변경 영향 범위를 끝까지 추적하지 않음

### Fix (세션 중 적용)
- 사용자가 반복 지적 후 E2E 테스트 (실제 API 호출 → 다운로드 → 마커 검증) 습관화

### Prevention
- `CLAUDE.md` **R1** — "완료" 선언 금지. **evidence (E2E log) 먼저, 판단은 사용자가**
- `hooks/pre-completion-checklist.sh` — 완료 전 자동 smoke-test 강제
- `tools/smoke-test.sh` — 한 번에 돌릴 수 있는 스크립트

---

## 메모

새 실수 발생 시 이 파일 맨 위에 날짜 역순으로 추가할 것.
관련 규칙이 있으면 `CLAUDE.md` R# 링크로 연결.
