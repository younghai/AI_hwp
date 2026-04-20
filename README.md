# AI HWPX Demo

HWPX 원본 문서를 업로드하면 AI가 내용을 분석하고, 기존 문서의 스타일·구조를 유지한 채 새 문서를 생성하는 로컬 데모 서비스입니다.

---

## 주요 기능

- **브라우저 WASM 파싱** — `@rhwp/core`로 서버 전송 없이 HWP/HWPX를 브라우저에서 직접 파싱 및 SVG 미리보기
- **멀티 AI 프로바이더** — Anthropic Claude (opus-4-6) / OpenAI / Kimi / xAI, API 키 및 OAuth 인증
- **AI 초안 생성** — 업로드 문서 내용 기반으로 제목·목차·섹션 본문을 AI가 재구성
- **SVG 다이어그램** — 플로우차트·타임라인·비교표 자동 생성 (웹 미리보기 + HWPX 내 PNG 삽입)
- **HWPX 내보내기** — AI 생성 내용이 실제 반영된 `.hwpx` 파일 다운로드

---

## 실행

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

### Python 의존성 (다이어그램 HWPX 삽입)

```bash
brew install cairo        # macOS
pip3 install cairosvg
```

### 환경 설정

`v2/server/.env` 파일 생성:

```env
PORT=8788
CLIENT_ORIGIN=http://127.0.0.1:5188
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 구조

```text
.
├── v2/
│   ├── client/src/App.jsx      # React 앱 (WASM 파싱, 다이어그램 렌더러)
│   ├── client/src/styles.css
│   └── server/index.js         # Express API (AI 초안 생성, HWPX 내보내기)
├── scripts/
│   ├── build_hwpx.py           # HWPX 빌드
│   └── diagram_templates.py    # SVG 다이어그램 생성기
└── templates/
    └── gonmun.hwpx             # 기본 공문서 템플릿
```

---

## 문서

- [v2 업데이트 상세](./docs/v2-update.md) — 변경 내역, 버그 수정, UI 개선 전체 내역

---

> **이전 버전 (v1):** PHP 기반 단일 페이지 데모 → [v1 문서 보기](./docs/v2-update.md#1-구조-변경-개요)

---

## English

AI HWPX Demo generates a new HWPX document while preserving the original document's style and structure.

### Quick Start

```bash
cd v2 && npm install && node server/index.js
cd v2/client && npm install && npm run dev
# Open http://127.0.0.1:5188
```

### Key Features

- Browser-side WASM parsing via `@rhwp/core`
- Multi-provider AI: Anthropic Claude (opus-4-6), OpenAI, Kimi, xAI
- AI-generated content written into exported HWPX
- SVG diagrams (flowchart / timeline / comparison) in preview and HWPX

→ [v2 Update Details](./docs/v2-update.md)
