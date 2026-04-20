# AI HWPX Demo — v2 업데이트 문서

> 최종 업데이트: 2026-04-20 · 커밋 `cd3ec7c`

---

## 목차

1. [구조 변경 개요](#1-구조-변경-개요)
2. [디렉토리 구조](#2-디렉토리-구조)
3. [v2 신규 추가 기능](#3-v2-신규-추가-기능)
4. [버그 수정](#4-버그-수정)
5. [UI/UX 개선](#5-uiux-개선)
6. [실행 방법](#6-실행-방법)

---

## 1. 구조 변경 개요

기존 단일 파일 데모(`app.js`, `index.html`)에서 **클라이언트/서버 분리 구조**의 `v2/`로 개편되었습니다.

| 항목 | 기존 (v1) | v2 |
|---|---|---|
| 구조 | 단일 HTML + 바닐라 JS | React (Vite) + Express 분리 |
| HWP 파싱 | 서버 사이드 | 브라우저 WASM (`@rhwp/core`) |
| AI 프로바이더 | Anthropic 단일 | Anthropic / OpenAI / Kimi / xAI 멀티 |
| AI 인증 | API 키 직접 입력 | API 키 + OAuth 2.0 |
| 다이어그램 | 없음 | SVG 다이어그램 (웹 미리보기 + HWPX 삽입) |
| HWPX 본문 | 템플릿 고정 문장 | AI 생성 내용 실제 반영 |
| 포트 설정 | 하드코딩 | 환경변수(`PORT`, `CLIENT_ORIGIN`) |

---

## 2. 디렉토리 구조

```
AI_hwp/
├── scripts/
│   ├── build_hwpx.py          # HWPX 빌드 스크립트 (Python)
│   ├── diagram_templates.py   # SVG 다이어그램 생성기 (신규)
│   └── office/
│       └── hwpx_utils.py      # HWPX pack/unpack 유틸
├── templates/
│   └── gonmun.hwpx            # 기본 공문서 템플릿
├── docs/
│   └── v2-update.md           # 이 문서
├── v2/
│   ├── client/                # React + Vite 프론트엔드
│   │   ├── src/
│   │   │   ├── App.jsx        # 메인 애플리케이션
│   │   │   ├── styles.css     # 디자인 시스템
│   │   │   └── main.jsx
│   │   ├── index.html
│   │   └── vite.config.js
│   └── server/
│       ├── index.js           # Express API 서버
│       └── package.json
├── app.js                     # v1 랜딩 페이지 (유지)
└── index.html                 # v1 랜딩 페이지 (유지)
```

---

## 3. v2 신규 추가 기능

### 3-1. 브라우저 HWP/HWPX 파싱 (WASM)

`@rhwp/core` WebAssembly 모듈로 서버 전송 없이 브라우저에서 직접 HWP 문서를 파싱합니다.

- HWP → SVG 페이지 렌더링 및 텍스트 추출
- HWPX → 양식 파일로 인식, 결과 문서 템플릿으로 재사용
- Vite `optimizeDeps.exclude: ['@rhwp/core']` 설정으로 WASM 번들링 오류 해결

### 3-2. 멀티 AI 프로바이더

설정 모달에서 프로바이더를 선택하고 연결할 수 있습니다.

| 프로바이더 | 기본 모델 | API 키 | OAuth |
|---|---|---|---|
| Anthropic Claude | claude-opus-4-6 | ✅ | ❌ |
| OpenAI | gpt-4o | ✅ | ✅ |
| Kimi (Moonshot) | moonshot-v1-8k | ✅ | ✅ |
| xAI (Grok) | grok-3-mini | ✅ | ❌ |

OAuth 인증은 팝업 창 + `postMessage` 방식으로 구현되며, 인증 완료 시 서버 `.env`에 자동 저장됩니다.

### 3-3. SVG 다이어그램 자동 생성

AI 초안 생성 시 문서 내용에 맞는 다이어그램 스펙을 함께 생성합니다.

**지원 다이어그램 타입:**

| 타입 | 설명 | 최대 항목 |
|---|---|---|
| `flowchart` | 수평 플로우차트 | 5 노드 |
| `timeline` | 수평 타임라인 | 6 항목 |
| `comparison` | 2열 비교표 | 5 행 |

- `scripts/diagram_templates.py`: Python SVG 생성 (HWPX 삽입용)
- `v2/client/src/App.jsx` 내 JS 포팅: 웹 미리보기에 인라인 SVG 렌더링
- 각 섹션 아래에 해당 다이어그램이 자동 표시됨 (`afterSection` 매핑)

**디자인 팔레트 (stone 계열):**

```
PAPER  #faf7f2   배경
INK    #1c1917   텍스트
ACCENT #b5523a   강조 (첫 노드/항목)
MUTED  #78716c   보조 텍스트
```

### 3-4. 환경변수 기반 포트/URL 설정

하드코딩 제거. `v2/server/.env` 파일로 관리:

```env
PORT=8788
CLIENT_ORIGIN=http://127.0.0.1:5188
OAUTH_REDIRECT_BASE=http://127.0.0.1:8788
ANTHROPIC_API_KEY=sk-ant-...
```

### 3-5. 최적화 AI 모델 및 프롬프트

- 기본 모델: `claude-opus-4-6`
- 초안 생성 프롬프트에 다이어그램 스펙 요청 포함
- 프로세스 타임아웃: 60초

---

## 4. 버그 수정

### 4-1. HWPX 본문에 AI 내용 미반영 (주요 수정)

**문제:** 다운로드한 HWPX 파일에 AI가 생성한 섹션 내용이 적용되지 않고, 제목만 바뀐 원본 템플릿이 그대로 출력됨.

**원인:** `build_hwpx.py`의 본문 단락 조건 오류.

```python
# 수정 전 — styleIDRef="0"(바탕글)을 본문으로 인식하지 않음
if style_id != "0" and current_section >= 0:

# 수정 후 — 헤딩 스타일이 아닌 모든 단락을 본문으로 처리
if current_section >= 0 and style_id not in heading_ids:
```

HWP의 기본 본문 스타일 `styleIDRef="0"(바탕글)`이 본문이 아닌 "기타(푸터 등)"로 분류되어 AI 내용이 스킵됨. 업로드된 임의 HWPX 템플릿의 본문 단락 대부분이 이 스타일이므로 내용이 전혀 반영되지 않았음.

### 4-2. WASM 로딩 오류

**문제:** HWP 파일 선택 시 `WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 64 6f` 오류.

**원인:** Vite가 `@rhwp/core`를 pre-bundle 시 `import.meta.url`이 `.vite/deps/`를 참조, WASM 파일 미존재로 HTML 404 응답 반환.

**수정:** `vite.config.js`에 `optimizeDeps: { exclude: ['@rhwp/core'] }` 및 `server.fs.allow: ['..']` 추가.

### 4-3. 한국어 텍스트 깨짐 (NFD→NFC)

**문제:** HWPX 내 한국어 제목·섹션명이 깨져서 출력.

**원인:** macOS가 파일명을 NFD로 인코딩하여 Python으로 전달.

**수정:** `build_hwpx.py` `main()`에서 제목·목차·원본문서명에 `unicodedata.normalize('NFC', ...)` 적용.

### 4-4. OAuth 팝업 stale closure

**문제:** OAuth 팝업이 닫혔을 때 "창이 닫혔습니다" 메시지가 인증 성공 후에도 표시됨.

**수정:** `popupHandled` 플래그를 `let`으로 선언하여 `message` 이벤트 핸들러와 `setInterval` 콜백 간 공유.

---

## 5. UI/UX 개선

### 문서 미리보기 패널

- **동일 높이 고정:** 왼쪽(SVG 미리보기)·오른쪽(문서 내용) 패널 모두 `height: 500px` 고정으로 높이 불일치 해결
- **그리드 레이아웃:** `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)` + `align-items: stretch`
- **문서 내용 패널:** 다크 배경 → 화이트 톤으로 변경
- **텍스트 표시:** 줄바꿈 기준 단락 분리, `text-align: justify`로 왼쪽 쏠림 방지
- **레이블 수정:** `추출 내용` → `문서 내용`

### 디자인 시스템 정리

CSS 커스텀 토큰 정리 및 불필요한 셀렉터 제거:

```css
/* 추가된 반경 토큰 */
--radius-sm: 14px
--radius-md: 24px
--radius-lg: 34px
--radius-pill: 999px
```

제거된 데드 셀렉터: `.text-preview`, `.oauth-steps`, `.oauth-step*`, `.oauth-open-btn`

---

## 6. 실행 방법

### 서버 시작

```bash
cd v2
npm install
node server/index.js
# → http://127.0.0.1:8788
```

### 클라이언트 시작 (별도 터미널)

```bash
cd v2/client
npm install
npm run dev
# → http://127.0.0.1:5188
```

### Python 의존성 (HWPX 빌드)

```bash
pip3 install cairosvg   # SVG→PNG 변환 (다이어그램 HWPX 삽입)
```

> **참고:** macOS에서 cairosvg를 사용하려면 Homebrew로 cairo 설치 필요: `brew install cairo`
