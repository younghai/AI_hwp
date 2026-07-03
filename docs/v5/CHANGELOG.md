# v5 Changelog

## 2026-07-03

`v4`(별도로 하드닝된 독립 작업본)에서 검증된 수정/기능을 `v5`의 세션 기반
아키텍처에 맞춰 이식. v4를 그대로 덮어쓰지 않고, 파일 단위로 diff를 비교해
v5 고유의 SQLite 세션/이미 더 진보한 부분(범용 provider OAuth state,
diagram 임베드 리포트 등)은 보존하면서 v5에 없던 수정만 적용했다.

**패키지 매니저 기반 수정**
- `pnpm-workspace.yaml` 추가 — 없으면 `pnpm install`이 client/server 의존성을
  에러 없이 조용히 설치하지 않는 문제
- `scripts/setup-rhwp-symlink.sh`를 pnpm/npm 겸용으로 수정

**데이터 무결성 (Python)**
- 다이어그램 SVG의 사용자/AI 입력 이스케이프(`diagram_templates.py`) —
  안 하면 `&`/`<`/`"` 포함 시 cairosvg가 malformed SVG로 실패해 다이어그램이
  미리보기엔 보이지만 다운로드엔 누락됨
- HWPX 원자적 쓰기 + zip-bomb/path-traversal 가드 (`office/hwpx_utils.py`)
- `build_hwpx.py`: defusedxml 기반 XXE 방어, NFC 정규화(NFD 입력 시 섹션
  본문이 빈 값으로 비워지는 문제 방지), 구조화 에러(`HWPX_BUILD_ERROR` 표준
  출력 센티널 — 이전엔 sections JSON 파싱 실패를 조용히 삼키고 빈 본문으로
  "성공" 처리했음), `--doc-date` 결정적 출력 옵션. v5 고유의 `--report-json`
  다이어그램 리포트 기능은 그대로 보존

**서버 보안**
- 레거시 `.hwp` OLE 매직바이트 검증 추가, 샘플 로더가 쓰는
  `application/hwp+zip` MIME 허용
- 워커 프로세스 동시 실행 세마포어 + SIGTERM 무응답 시 SIGKILL 유예 +
  동기/비동기 spawn 실패 모두 처리 (`runProcess`)
- helmet 보안 헤더 + 전역/AI-라우트별 rate limit
- `/api/health`를 세션 요구에서 제외 (로드밸런서/모니터링은 인증 불가)
- OAuth 결과 페이지의 반사형 XSS 수정 (`?error=` 쿼리 파라미터가 이스케이프
  없이 그대로 HTML에 삽입되던 실제 취약점) — `googleAuth.js`, `oauth.js`
- Google mock 로그인을 "development 모드 + 실제 자격증명 미설정" 두 조건
  모두 만족할 때만 허용하도록 강화 (이전엔 NODE_ENV만 확인해서, 실 자격증명이
  있는 채로 development로 잘못 배포되면 임의 이메일로 인증 우회 가능했음)
- `build_hwpx.py`의 구조화 에러를 실제로 파싱해 안전한 메시지만 클라이언트에
  노출하도록 `hwpxBuilder.js` 수정 — 이전엔 실패 시 Python stderr(절대경로
  포함 전체 traceback)를 그대로 HTTP 응답에 노출하고 있었음(구조가 깨진
  업로드 템플릿으로 실제 확인된 취약점)

**제품 기능**
- AI 모델 선택 + 실측 usage 기반 비용 표시 — 프로바이더당 모델 목록/단가
  추가, 프로바이더가 응답에 포함한 실제 토큰 수를 우선 사용(없으면 문자수
  추정으로 폴백)
- 초안 편집 루프 — 생성된 초안을 검토·수정(제목/섹션 편집, 추가·삭제·순서
  변경) 후 확정하는 2단계 흐름으로 전환(기존엔 생성 즉시 빌드).
  섹션 단위 AI 재생성(`/api/regenerate-section`) 추가
- 문서 유형별(보고서/제안서/회의록/공문서) AI 프롬프트 지침 + 전용 입력
  필드(회의록→회의일시/참석자 등)
- 디자인 토큰 확장(다크모드 서페이스 색상, Pretendard 폰트 스택) + 설정
  모달 포커스 트랩(접근성)

**관측성**
- pino 기반 구조화 JSON 로깅(요청/응답 자동 기록, secret 필드 redact),
  AI 초안/HWPX 빌드 성공률·응답시간을 집계하는 `/api/metrics` 추가

**CI / 문서**
- `.github/workflows/v5-checks.yml` 추가 (Node 22 — `node:sqlite` 요구사항,
  pnpm, Python 3.11): 문법 검사, 클라이언트 빌드/테스트, dev 서버 기동,
  smoke test, golden test, 샘플 HWPX 검증
- `tools/smoke-test.sh`, `testdata/run-golden.sh`가 세션 쿠키 없이
  `/api/providers`/`/api/export-hwpx`를 호출하고 있어 v5의 세션 모델 도입
  이후 계속 깨져 있던 문제를 발견 — 두 스크립트 모두 dev mock 로그인으로
  세션을 먼저 확보하도록 수정
- `client/package.json`에 누락돼 있던 `test` 스크립트(`vitest run`) 추가 —
  기존 `validate.test.js`의 실패 케이스 1건도 실제 구현(요약 누락 시 빈
  문자열로 폴백, 상위 호출부가 이미 이를 전제)에 맞춰 수정
- 누락돼 있던 `server/.env.example` 추가(`.gitignore`는 이 파일을 템플릿으로
  안내하고 있었지만 실제 파일이 없었음)
- `CLAUDE.md`, `SERVICE_OVERVIEW.md`, `ARCHITECTURE.md`, `SETUP.md`,
  `OPERATIONS.md`를 위 변경 사항 및 기존에 부정확했던 서술(Node 버전, "OAuth
  state는 전부 메모리 기반"이라는 잘못된 설명 — 실제로는 범용 provider
  OAuth는 이미 SQLite 기반이고 Google 로그인 전용 state만 메모리 기반)에
  맞춰 갱신

## 2026-04-30

- `v4` 기반으로 `v5/` 작업본 생성
- `v5/shared` 포함 복제
- 기본 실행 포트 분리
  - default: `5194 / 8794`
  - auto: `5195 / 8795`
- SQLite 기반 세션/생성 파일 구조 유지
- 루트 `docs/v5/` 문서 세트 추가
- `v5/server/.env` 복제본 제거
