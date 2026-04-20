# AI HWPX Demo

HWPX 원본 문서를 업로드하면 AI가 내용을 분석하고, 기존 문서의 스타일·구조를 유지한 채 새 문서를 생성하는 로컬 데모 서비스입니다.

---

## 버전

| 버전 | 설명 | 실행 방법 |
|---|---|---|
| **v2** (최신) | React + Express, 브라우저 WASM 파싱, 멀티 AI, 다이어그램 | [v2 실행](#v2-실행) |
| v1 | PHP 기반 단일 페이지 데모 | `php -S 127.0.0.1:8000` |

---

## v2 (최신)

### 주요 기능

- **브라우저 WASM 파싱** — `@rhwp/core`로 서버 전송 없이 HWP/HWPX를 브라우저에서 직접 파싱 및 SVG 미리보기
- **멀티 AI 프로바이더** — Anthropic Claude (opus-4-6) / OpenAI / Kimi / xAI 지원, API 키 및 OAuth 인증
- **AI 초안 생성** — 업로드 문서 내용 기반으로 제목·목차·섹션 본문을 AI가 재구성
- **SVG 다이어그램** — 플로우차트·타임라인·비교표 자동 생성 (웹 미리보기 + HWPX 내 PNG 삽입)
- **HWPX 내보내기** — AI 생성 내용이 실제 반영된 `.hwpx` 파일 다운로드

### v2 실행

```bash
# 서버
cd v2
npm install
node server/index.js
# → http://127.0.0.1:8788

# 클라이언트 (별도 터미널)
cd v2/client
npm install
npm run dev
# → http://127.0.0.1:5188
```

브라우저에서 `http://127.0.0.1:5188` 을 열면 됩니다.

#### Python 의존성 (다이어그램 HWPX 삽입)

```bash
brew install cairo        # macOS
pip3 install cairosvg
```

#### 환경 설정

`v2/server/.env` 파일을 생성하고 API 키를 입력합니다:

```env
PORT=8788
CLIENT_ORIGIN=http://127.0.0.1:5188
ANTHROPIC_API_KEY=sk-ant-...
```

### v2 구조

```text
v2/
├── client/
│   ├── src/
│   │   ├── App.jsx        # 메인 React 앱 (WASM 파싱, 다이어그램 렌더러 포함)
│   │   └── styles.css     # 디자인 시스템
│   └── vite.config.js
└── server/
    └── index.js           # Express API 서버 (AI 초안 생성, HWPX 내보내기)
```

### v2 주요 변경 내역

- HWPX 본문에 AI 내용 미반영 버그 수정 (`styleIDRef="0"` 바탕글 단락 처리)
- WASM 로딩 오류 수정 (`optimizeDeps.exclude: ['@rhwp/core']`)
- 한국어 NFD→NFC 정규화 적용
- 환경변수 기반 포트/URL 설정 (하드코딩 제거)
- OAuth 팝업 stale closure 수정

> 상세 내역: [docs/v2-update.md](./docs/v2-update.md)

---

## v1

PHP 기반 단일 페이지 데모. `.hwpx` 파일을 업로드하고 제목·목차를 입력하면 새 HWPX 문서를 생성합니다.

### v1 실행

```bash
php -S 127.0.0.1:8000
```

브라우저에서 `http://127.0.0.1:8000` 을 열면 됩니다.

### v1 주요 기능

- `.hwpx` 원본 문서 업로드
- 문서 유형 예시 버튼 (회의록 / 사업계획서 / 제안서 / RFP)
- 제목·목차 기반 결과물 미리보기 및 다운로드

---

## 공통 구조

```text
.
├── scripts/
│   ├── build_hwpx.py          # HWPX 빌드 (Python)
│   ├── diagram_templates.py   # SVG 다이어그램 생성기
│   └── office/
│       └── hwpx_utils.py      # HWPX pack/unpack 유틸
├── templates/
│   └── gonmun.hwpx            # 기본 공문서 템플릿
├── docs/
│   └── v2-update.md           # v2 업데이트 상세 문서
└── v2/                        # v2 앱
```

---

## English

AI HWPX Demo generates a new HWPX document while preserving the original document's style and structure. Upload an HWP/HWPX file, set generation options, and download the AI-rewritten document.

### Quick Start (v2)

```bash
# Server
cd v2 && npm install && node server/index.js

# Client (separate terminal)
cd v2/client && npm install && npm run dev
# Open http://127.0.0.1:5188
```

### Key Features (v2)

- Browser-side WASM parsing via `@rhwp/core` — no server upload needed for parsing
- Multi-provider AI: Anthropic Claude (opus-4-6), OpenAI, Kimi, xAI
- AI-generated sections actually written into the exported HWPX file
- Inline SVG diagrams (flowchart / timeline / comparison) in preview and HWPX export

### Documentation

- [v2 Update Details](./docs/v2-update.md)
