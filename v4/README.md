# v4 — AI HWP: HWP 템플릿 기반 AI 문서 생성 서비스

HWP/HWPX 템플릿을 업로드하고 목차·내용을 입력하면, **기존 템플릿 양식을 그대로 유지한 채** AI가 회의록·사업계획서·제안서·공문서 등의 본문을 생성해 HWPX로 내려받는 자립형 서비스입니다.

- **미리보기 = 다운로드 파일** (바이트 동일성 보장 — 이 저장소의 절대 원칙)
- `v4/` 폴더 하나만 있으면 실행 가능 — `scripts/`, `templates/` 모두 내장, 외부 경로 의존 0
- 2026-07-01 이후 대규모 안정화·보안·기능 업데이트 완료 (아래 [업데이트 내역](#-업데이트-내역-2026-07-01-이후) 참고)

> 🧭 **작업 시작 전 반드시 읽을 것**: [`CLAUDE.md`](./CLAUDE.md) — 절대 규칙(R1~R9), 실수 이력, 아키텍처 제약
> 📚 **의사결정 배경**: [`docs/adr/`](./docs/adr/) · 📘 **실수 레지스트리**: [`docs/lessons-learned.md`](./docs/lessons-learned.md) · 🔍 **전문가 검토 원문**: [`docs/review/`](./docs/review/)

---

## 🚀 Quick Start

```bash
# 요구사항: Node 20+, npm 10+, Python 3.9+
cd v4
npm install                                # workspace 설치 (client + server)
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # 다이어그램/보안 검증용 (선택)

cp server/.env.example server/.env         # AI API 키 입력 (UI에서 입력해도 됨)
npm run dev                                # client(5192) + server(8792) 동시 실행
```

- **클라이언트**: http://127.0.0.1:5192
- **서버 API**: http://127.0.0.1:8792
- 자동 로그인 모드: `npm run dev:auto` (client 5193 + server 8793)

AI API 키는 두 가지 방법으로 설정:
1. `server/.env` 파일에 직접 입력 (`ANTHROPIC_API_KEY` 등 — 서버 재시작 필요)
2. UI 우측 상단 **프로바이더 설정**에서 입력 → `server/.env`에 자동 저장

> 💡 API 키 없이도 실행·업로드·미리보기·HWPX 내보내기는 동작합니다. AI 초안 생성만 키가 필요합니다.

### 🔐 외부 배포 (protected 모드)

로컬 기본값은 `AUTH_MODE=local`(인증 없음, 단일 사용자용)입니다. 외부/팀에 공개하려면 `server/.env`에서 아래를 설정하세요 (자세한 항목은 [`server/.env.example`](server/.env.example) 참고):

```bash
AUTH_MODE=protected          # 상태 변경·비용·다운로드 라우트에 Google 로그인 세션 강제
NODE_ENV=production          # mock 로그인 완전 비활성 + 쿠키 secure(HTTPS)
GOOGLE_CLIENT_ID=...         # protected 모드는 Google OAuth 필요
GOOGLE_CLIENT_SECRET=...
```

protected 모드에서는 인증 게이트·rate limit·helmet·산출물 격리·zip/XXE 방어가 모두 활성화됩니다. HTTPS 프록시 뒤에서 운영하세요.

## 🎨 기능

- **HWP/HWPX 업로드** — 드래그앤드롭 + 클릭, 파일 크기/페이지 수/형식 표시 (extension + MIME + magic bytes 3중 검증)
- **rhwp 로컬 파싱** — 전체 페이지 SVG 렌더 + 본문 텍스트 추출 (브라우저 내 WASM, 파일이 외부로 나가지 않음)
- **문서 타입** — 보고서 / 제안서 / 회의록 / 공문서 / 기본 문서 (타입별 목차 + 전용 입력 필드: 회의록 일시·참석자, 제안서 수신처 등)
- **AI 초안 생성 + 검토·수정 루프** — Anthropic Claude / OpenAI / Kimi / xAI 중 모델까지 선택, 생성된 초안을 섹션 단위로 편집·재생성·추가·삭제한 뒤 확정
- **다이어그램 자동 삽입** — flowchart / timeline / comparison (cairo 설치 시 PNG로 임베드)
- **HWPX 내보내기** — 양식 유지 + AI 본문 치환 + 구조 검증(validation) 후 다운로드
- **최근 생성 문서 히스토리** — 새로고침 후에도 과거 결과 재다운로드 가능
- **로컬 관측성** — `GET /api/metrics` 로 AI 호출/빌드 성공률·평균 지연 확인

### 다이어그램 사전 요건 (선택)

SVG → PNG 변환에 네이티브 `libcairo`가 필요합니다. 없으면 다이어그램만 생략되고 나머지는 정상 동작합니다.

```bash
brew install cairo          # macOS (서버가 /opt/homebrew/lib 을 자동 탐색)
apt-get install libcairo2   # Debian/Ubuntu
```

## 📂 폴더 구조

```
v4/
├── CLAUDE.md               # 🧭 절대 규칙 + 실수 이력 (작업 시작점)
├── shared/                 # client+server 공용 (escape, validate, docTypes)
│
├── server/                 # Express (Node.js) — port 8792
│   ├── index.js            # 부트스트랩 (로깅·rate limit·helmet·라우터 장착)
│   ├── lib/                # config, logger, metrics, authGuard, oauthTokens, cleanup,
│   │                       # errors, env, oauth, session, upload, providers-config, utils
│   ├── services/           # ai, draft, hwpxBuilder, validator, polarisValidator
│   ├── routes/             # health, providers, draft, export, auth, googleAuth, samples, history
│   └── test/                # vitest 단위 테스트
│
├── client/                 # React + Vite — port 5192
│   └── src/
│       ├── App.jsx         # 조합만
│       ├── lib/            # diagrams, helpers
│       ├── hooks/          # useRhwp, useDraft, useProviders, useToast, useFocusTrap
│       ├── components/     # TopBar, ProviderSettings, ControlPanel, PreviewPanel,
│       │                   # EditableDraft, ProgressStepper, HistoryPanel, …
│       └── test/           # vitest 단위 테스트
│
├── scripts/                # Python 워커 — Node가 spawn (build_hwpx.py 등)
│   └── tests/               # pytest 회귀 스위트 (R5/R6/NFC/escape/zip-bomb/XXE)
├── templates/              # HWPX 템플릿 + 샘플 문서
├── specs/                  # docType별 polaris 검증 규칙
│
├── docs/adr/               # Architecture Decision Records
├── docs/lessons-learned.md # 실수 레지스트리
├── docs/review/            # 역할별(개발/디자인/PO) 전문가 검토 + 단계별 수정계획서
├── skills/                 # 재사용 워크플로우 (markdown)
├── hooks/                  # 자동화 가드레일 (shell)
└── tools/                  # 검증 스크립트 (smoke-test, verify-hwpx-markers)
```

## 🧪 검증 명령

| 목적 | 명령 |
|------|------|
| **완료 선언 전 필수 검증** | `bash hooks/pre-completion-checklist.sh` |
| 단독 E2E 스모크 테스트 | `bash tools/smoke-test.sh` |
| 골든 테스트 | `bash testdata/run-golden.sh` |
| 서버 단위 테스트 | `npm test --workspace server` |
| 클라이언트 단위 테스트 + lint | `npm test --workspace client && npm run lint --workspace client` |
| Python 회귀 스위트 | `python3 -m pytest scripts/tests -q` |
| HWPX 마커 검증 | `python3 tools/verify-hwpx-markers.py <hwpx_path> MARKER1 ...` |
| 클라이언트 프로덕션 빌드 | `npm run build --workspace client` |
| 서버 syntax 체크 | `cd server && for f in index.js lib/*.js services/*.js routes/*.js; do node --check "$f"; done` |

CI(`.github/workflows/v4-checks.yml`)가 push/PR마다 위 항목 전체를 자동 실행합니다.

## 🔁 의존성 변경 후 필수 절차

`package.json` 수정, `npm install`, 또는 "이상한 캐시 문제" 체감 시:

```bash
bash hooks/post-deps-change.sh   # 프로세스 kill + Vite cache 삭제
npm run dev                      # dev 서버 재시작
# 브라우저에서 Cmd+Shift+R (하드 리프레시)
bash tools/smoke-test.sh         # 정상성 재검증
```

---

## 📜 업데이트 내역 (2026-07-01 이후)

이전 커밋(2026-06-27) 이후 v4를 독립 환경에서 시니어 개발자·디자이너·PO 3개 관점으로 전수 검토([`docs/review/`](./docs/review/) 참고)하고, 발견된 문제를 4단계로 나눠 전부 수정했습니다. 아래는 실제 사용자에게 의미 있는 변경 위주 요약입니다. (내부 검토 코드 BE-xx/PY-xx/UX-xx는 `docs/review/`에서 대응 항목 확인 가능)

### 🔴 Phase 0 — 데이터 무결성 + 온보딩 차단 수정 (가장 중요)

지금까지 조용히 발생하던 실제 데이터 손실 버그 3건을 수정했습니다:

- **다이어그램이 사라지는 버그** — 본문에 `&`, `<`, `"` 가 하나만 있어도(예: "R&D") 다이어그램이 미리보기엔 보이는데 다운로드 파일엔 빠지는 문제를 수정 (SVG 텍스트 escape 누락)
- **macOS에서 AI 본문이 빈 섹션으로 나오는 버그** — 한글 조합 방식(NFD) 차이로 섹션 매칭이 실패해 본문이 사라지던 문제를 수정 (NFC 정규화 일원화)
- **손상된 파일이 다운로드되는 문제** — 생성 중 타임아웃/오류가 나면 손상된 HWPX가 그대로 서빙될 수 있었던 것을 원자적 쓰기로 수정
- **에러 메시지에 서버 내부 정보 노출** — Python 오류 발생 시 스택 트레이스와 서버 파일 경로가 그대로 사용자에게 보이던 것을 정리된 메시지로 교체
- **다크모드에서 설정 화면을 읽을 수 없던 문제** — 텍스트 대비 1.2:1 → 12.35:1로 개선 (WCAG AA 기준 통과)
- 화면 흐름을 실제 사용 순서(업로드 → 생성 조건 → 결과)에 맞게 재배치, AI 연결 상태를 한눈에 보이는 배지로 변경, 생성 진행 단계 표시 + 취소 버튼 추가
- ESLint + GitHub Actions CI 도입 — 이번에 고친 종류의 버그(정의되지 않은 컴포넌트 참조)가 다음에는 자동으로 걸리도록 안전망 구축

### 🟠 Phase 1 — 외부 배포 보안

로컬 개인용으로만 쓰던 서비스를 팀/외부에 안전하게 공개할 수 있도록 보안을 추가했습니다. `AUTH_MODE=local`(기존 동작 그대로, 무료·무마찰)과 `AUTH_MODE=protected`(로그인 필수) 중 선택 가능합니다.

- 로그인 없이 API를 호출하거나 AI 키를 변경할 수 있던 문제 차단 (protected 모드)
- 개발용 "가짜 로그인" 기능이 실서비스에서도 열려 있어 인증을 우회할 수 있던 구멍 제거
- 무제한으로 AI를 호출해 비용을 소진시키거나 서버를 과부하시킬 수 있던 문제 → 요청 제한(rate limit) 추가
- 로그인 결과 화면에 악성 스크립트를 심을 수 있던 XSS 취약점 수정
- 압축 폭탄(zip bomb)·XML 외부 엔티티 공격에 대한 방어 추가
- 생성된 문서 파일명을 예측할 수 없도록 변경(추측을 통한 무단 다운로드 방지)
- OAuth 로그인 토큰을 API 키와 분리 저장 + 자동 갱신

### 🟢 Phase 2 — 제품 기능 확장

- **초안 검토·수정 기능 추가** — 지금까지는 AI가 한 번에 만든 내용을 그대로 다운로드할 수밖에 없었는데, 이제 섹션별로 직접 수정하거나 AI로 다시 생성하거나 순서를 바꾸거나 추가/삭제한 뒤 확정할 수 있습니다
- **원문을 3페이지가 아닌 전체를 읽고 초안 작성** — 긴 문서를 업로드해도 앞부분만 보고 AI가 작성하던 문제 개선
- **AI 모델 선택** — 품질/속도/비용에 따라 모델을 고를 수 있고, 실제 사용된 토큰 기준 비용이 표시됩니다
- **최근 생성 문서 히스토리** — 새로고침해도 이전에 만든 문서를 다시 받을 수 있습니다
- **문서 유형별 맞춤 입력** — 회의록엔 일시·참석자, 제안서엔 수신 기관 등 유형에 맞는 입력란 추가
- 업로드 직후 "양식을 그대로 유지하는지" "새 양식으로 만드는지" 명확한 안내 배너
- 검증 결과를 "한컴에서 정상적으로 열립니다" 같은 일반인이 이해할 수 있는 문장으로 우선 표시

### 🔵 Phase 3 — 품질 인프라

- 구조화된 로그 + `GET /api/metrics` 로 실패율·응답 속도 추적 가능
- 서버 단위 테스트 16개, Python 회귀 테스트 16개, 클라이언트 테스트 9개 신규 추가 (총 41개, CI에서 자동 실행)
- 동시 문서 생성 요청이 몰릴 때 서버가 과부하되지 않도록 처리량 제한
- 사용하지 않는 의존성·코드 정리, 설정값(포트 등) 불일치 해소
- 한글 웹폰트(Pretendard) 적용, 모달 키보드 접근성(포커스 트랩) 개선

### 배포 판단 요약

| 사용 형태 | 상태 |
|---|---|
| 로컬 개인용 | 가능 — 별도 설정 없이 `npm run dev` |
| 팀/외부 공개 | 가능(조건부) — `AUTH_MODE=protected` + `NODE_ENV=production` + Google OAuth + HTTPS 필요 |

자세한 발견 항목·근거·검증 방법은 [`docs/review/역할별-검토보고서-2026-07-02.md`](./docs/review/역할별-검토보고서-2026-07-02.md)와 [`docs/review/수정계획서-2026-07-02.md`](./docs/review/수정계획서-2026-07-02.md)에서 확인할 수 있습니다.

---

## 📜 Self-Learning Protocol

프로젝트는 사용 중 **스스로 학습**하도록 설계:

1. **실수 발생** → `docs/lessons-learned.md` 맨 위 항목 추가 + `CLAUDE.md` 관련 규칙에 이력 업데이트
2. **같은 작업 반복** → `skills/<workflow>.md` 추가
3. **망가지는 케이스** → `hooks/*.sh` 에 가드 + `tools/*` 에 검증 도구 추가

자세한 사용법은 [`CLAUDE.md`](./CLAUDE.md) 참고.

## 🔗 참고

- 문서 파싱/렌더링: [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core) (`0.7.17` exact pin — R2 규칙)
- HWPX 빌더: [`scripts/build_hwpx.py`](./scripts/build_hwpx.py) (repo 내장)
