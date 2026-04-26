# Lessons Learned — v2

실제로 터진 문제만 기록. 추측, "~할 것 같다"는 금지. 각 항목은:
- **What happened** (현상)
- **Why** (근본 원인)
- **Fix** (실제 적용한 해결책)
- **Prevention** (다음 번 재발 방지 장치 — `skills/`, `hooks/`, `CLAUDE.md` 업데이트 경로)

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
