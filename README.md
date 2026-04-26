# AI HWPX Demo

HWPX 원본 문서를 업로드하면 AI가 내용을 분석하고, 기존 문서의 스타일·구조를 유지한 채 새 문서를 생성하는 로컬 데모 서비스입니다.

**현재 저장소는 v2 / v3 / v4 가 공존합니다.**  
권장 실행 버전은 **v4**이며, 각 버전의 차이는 아래를 참고하세요.

---

## 버전 개요

| 버전 | 폴터 | 권장 여부 | 핵심 특징 |
|------|------|-----------|-----------|
| **v4** | `v4/` | ✅ **권장** | 샘플 문서 체험, Toast 알림, HWPX 검증, `@rhwp/core ^0.7.2` |
| **v3** | `v3/` | 유지보수 모드 | v2의 preview≠download 해결, 자립형 구조, `@rhwp/core` exact pin |
| **v2** | `v2/` | 레거시 | 초기 모듈 분리 버전 (Google OAuth, 드래그앤드롭, WASM 파싱) |
| **v1** | `app.js`, `index.html` | 아카이브 | PHP 기반 단일 페이지 데모 |

> v4 실행 가이드는 [`v4/README.md`](./v4/README.md) 에 상세히 기술되어 있습니다.

---

## 🚀 v4 Quick Start (권장)

```bash
cd v4
npm install                                # workspace 설치 (client + server)
cp server/.env.example server/.env         # API 키 채우기
npm run dev                                # client(5192) + server(8792) 동시 실행
```

- 클라이언트: http://127.0.0.1:5192
- 서버 API : http://127.0.0.1:8792
- 자동 로그인 모드: `npm run dev:auto` (client 5193 + server 8793)

### v3 Quick Start

```bash
cd v3
npm install
cp server/.env.example server/.env
npm run dev                                # client(5190) + server(8790)
```

- 클라이언트: http://127.0.0.1:5190
- 자동 로그인 모드: `npm run dev:auto` (client 5191 + server 8791)

### v2 Quick Start (레거시)

```bash
cd v2
npm install
npm run dev                                # client(5188) + server(8788)
```

- 클라이언트: http://127.0.0.1:5188
- 자동 로그인 모드: `npm run dev:auto` (client 5189 + server 8789)

---

## 🆕 버전별 주요 변경사항

### v4 (최신)

| 기능 | 설명 |
|------|------|
| **샘플 문서 체험** | 업로드 없이 `공문서 기본 양식` 샘플로 즉시 체험 가능 (`EmptyState` 컴포넌트) |
| **Toast 알림** | 성공/오류/경료 토스트 메시지 (`useToast.js`) |
| **HWPX 검증 패널** | 생성된 문서의 규칙/구조/컨테이너/스키마 검증 결과 시각화 (`ValidationPanel`) |
| **`@rhwp/core` semver** | `^0.7.2` — 패치 업데이트 자동 수용 |
| **`setup-rhwp-symlink.sh`** | `postinstall`로 `@rhwp/core` WASM 파일 자동 연결 |

### v3 (vs v2)

| 기능 | 설명 |
|------|------|
| **AI 미커버 body 자동 비우기** | AI가 N섹션만 생성하면 나머지 템플릿 섹션 body를 모두 비움 |
| **AI 프롬프트 강화** | 섹션 5개 이상, body 3~5문장, 중복/빈 body 금지 |
| **`fix_namespaces` 후처리** | `ns0:/ns1:` → 한컴 표준 `hh/hc/hp/hs` 교체 |
| **`clone_form.py` CLI** | ZIP-level 문자열 치환으로 표/이미지/병합셀 100% 보존 |
| **자립형 구조** | `scripts/`, `templates/` 낸부화 — 외부 경로 의존 0 |
| **Google OAuth + Mock 폭백** | client_id 미설정 시 개발용 Mock 로그인 제공 |
| **버전 A/B 실행** | `dev` (수동 로그인) + `dev:auto` (자동 오버레이) 동시 지원 |

### v2 (vs v1)

- React + Vite 클라이언트 / Express 서버 / Python HWPX 빌더 분리
- `@rhwp/core` WASM 브라우저 파싱
- 멀티 AI 프로바이더 (Anthropic / OpenAI / Kimi / xAI)
- 드래그앤드롭 업로드 + 파일 해제
- SVG 다이어그램 자동 생성 + HWPX 내 PNG 삽입

---

## 📂 저장소 구조

```text
.
├── v4/                         # ✅ 최신 권장 버전
│   ├── client/                 # React 18 + Vite
│   ├── server/                 # Express + Node.js ESM
│   ├── shared/                 # client+server 공용 코드
│   ├── scripts/                # Python HWPX 빌더
│   ├── templates/              # HWPX 템플릿 + 샘플
│   ├── docs/adr/               # Architecture Decision Records
│   ├── skills/                 # 재사용 워크플로우
│   ├── hooks/                  # 자동화 가드레일 (shell)
│   ├── tools/                  # 검증 스크립트
│   └── README.md               # v4 상세 가이드
│
├── v3/                         # 자립형 안정 버전
│   ├── client/                 # React + Vite
│   ├── server/                 # Express
│   ├── shared/
│   ├── docs/
│   ├── skills/
│   ├── hooks/
│   ├── tools/
│   └── README.md               # v3 상세 가이드
│
├── v2/                         # 초기 모듈 분리 버전
│   ├── client/
│   ├── server/
│   ├── shared/
│   └── ...
│
├── docs/                       # 프로젝트 전체 문서
│   ├── waterfall-hwpx-demo/    # 폭포수 문서 (v2 기준 v1.3)
│   ├── v2-update.md            # v2 변경 내역
│   └── HWPX_FORMAT.md          # HWPX 포맷 참조
│
├── scripts/                    # 루트 레벨 Python 스크립트 (v1/v2 유산)
├── templates/                  # 루트 레벨 템플릿 (v1/v2 유산)
├── app.js                      # v1 레거시 (PHP 대체 Node.js)
├── index.html                  # v1 레거시
└── README.md                   # 이 파일
```

---

## 🧪 검증 명령 (v4 기준)

| 목적 | 명령 |
|------|------|
| **완료 선언 전 필수 검증** | `bash v4/hooks/pre-completion-checklist.sh` |
| 단독 E2E 스모크 테스트 | `bash v4/tools/smoke-test.sh` |
| HWPX 마커 검증 | `python3 v4/tools/verify-hwpx-markers.py <hwpx_path> MARKER1 ...` |
| 클라이언트 프로덕션 빌드 | `cd v4/client && npm run build` |

> v3 검증 명령은 `v4/` → `v3/` 로 경로만 변경하면 동일합니다.

---

## ⚙️ 환경 설정

`v4/server/.env` (또는 `v3/server/.env`, `v2/server/.env`) 파일 생성:

```env
PORT=8792
CLIENT_ORIGIN=http://127.0.0.1:5192
OAUTH_REDIRECT_BASE=http://127.0.0.1:8792

# AI Provider API Keys (최소 1개 필요)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
KIMI_API_KEY=...
XAI_API_KEY=...

# Google OAuth (선택 — 미설정 시 Mock 로그인 폭백)
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
```

### Python 의존성 (다이어그램 HWPX 삽입)

```bash
brew install cairo        # macOS
pip3 install cairosvg
```

---

## 📚 문서

| 문서 | 위치 | 설명 |
|------|------|------|
| v4 상세 가이드 | [`v4/README.md`](./v4/README.md) | v4 실행, 구조, Self-Learning Protocol |
| v3 상세 가이드 | [`v3/README.md`](./v3/README.md) | v3 실행, 구조, 자립형 기능 |
| v2 업데이트 상세 | [`docs/v2-update.md`](./docs/v2-update.md) | v2 변경 내역, 버그 수정, UI 개선 |
| 폭포수 문서 (v4 기준) | [`v4/docs/waterfall-hwpx-demo/`](./v4/docs/waterfall-hwpx-demo/) | 기획→검토 8단계 전체 산출물 |
| 폭포수 문서 (v3 기준) | [`v3/docs/waterfall-hwpx-demo/`](./v3/docs/waterfall-hwpx-demo/) | 기획→검토 8단계 전체 산출물 |
| HWPX 포맷 참조 | [`docs/HWPX_FORMAT.md`](./docs/HWPX_FORMAT.md) | 한글 문서 구조 기술 참조 |

---

## English

AI HWPX Demo generates a new HWPX document while preserving the original document's style and structure. This repository contains three active versions: **v4** (latest, recommended), **v3** (stable), and **v2** (legacy).

### Quick Start (v4)

```bash
cd v4 && npm install && cp server/.env.example server/.env
npm run dev
# Open http://127.0.0.1:5192
```

### Key Features (v4)

- Browser-side WASM parsing via `@rhwp/core`
- Sample document quick-start (no upload required)
- Toast notifications + HWPX validation panel
- Multi-provider AI: Anthropic Claude, OpenAI, Kimi, xAI
- SVG diagrams (flowchart / timeline / comparison) in preview and HWPX

→ [v4 Details](./v4/README.md) | [v3 Details](./v3/README.md) | [v2 Update Details](./docs/v2-update.md)
