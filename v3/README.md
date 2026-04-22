# v3 — AI Document Studio (HWP / HWPX Automation)

v2 의 **preview ≠ download** 이슈를 근본 해결한 자립형 버전. `v3/` 만 있으면 실행 가능 (`scripts/`, `templates/` 모두 내부).

> 🧭 **작업 시작 전 반드시 읽을 것**: [`CLAUDE.md`](./CLAUDE.md) — 절대 규칙(R1~R8), 실수 이력, 아키텍처 제약
> 📚 **의사결정 배경**: [`docs/adr/`](./docs/adr/)
> 📘 **실수 레지스트리**: [`docs/lessons-learned.md`](./docs/lessons-learned.md)

---

## 🆕 v3 추가 개선 (vs v2)

| 개선 | 내용 |
| --- | --- |
| **P0 — AI 미커버 body 자동 비우기** | AI가 N섹션만 주면 템플릿의 나머지 섹션 body 까지 **모두 비운다**. v2 에서 남았던 `시장 내 경쟁력 강화...` 같은 템플릿 샘플 문장 수십 회 반복 완전 제거. |
| **P1 — AI 프롬프트 강화** | 섹션 5개 이상, body 3~5문장 완결, 섹션 간 중복 금지, 빈 body 금지 강제. `templateBodySlots` 전달 시 해당 수에 맞춰 섹션 구성. |
| **P2 — `fix_namespaces` 후처리** | `ElementTree` 가 자동 부여한 `ns0:/ns1:` 프리픽스를 한컴 표준 `hh/hc/hp/hs` 로 교체 + `header.xml itemCnt` 자동 동기화. 한컴 뷰어(macOS) 에서 빈 페이지 / 폰트 폴백 방지. |
| **P2 — `clone_form.py` CLI** | 선택적 대안 빌더. 원본 HWPX 를 ZIP-level 문자열 치환만으로 복제 → **표/이미지/병합셀 100% 보존**. |
| **자립형 구조** | `v3/scripts/`, `v3/templates/` 내부화 — 외부 경로 의존 0 |

## 🚀 Quick Start

```bash
cd v3
npm install                                # workspace 설치 (client + server)
cp server/.env.example server/.env         # API 키 채우기
npm run dev                                # client(5190) + server(8790) 동시 실행
```

- 클라이언트: http://127.0.0.1:5190
- 서버 API : http://127.0.0.1:8790
- 자동 로그인 모드: `npm run dev:auto` (client 5191 + server 8791)

## 📂 폴더 구조

```
v3/
├── CLAUDE.md                   # 🧭 절대 규칙 + 실수 이력 (작업 시작점)
├── shared/                     # client+server 공용 (escape, validate, docTypes)
│
├── server/                     # Express (Node.js)
│   ├── index.js                # 부트스트랩 (~30줄)
│   ├── lib/                    # errors, env, oauth, upload, providers-config, utils
│   ├── services/               # ai, draft, hwpxBuilder
│   └── routes/                 # health, providers, auth, draft, export
│
├── client/                     # React + Vite
│   ├── src/
│   │   ├── App.jsx             # 조합만 (~135줄)
│   │   ├── lib/                # diagrams, helpers
│   │   ├── hooks/              # useRhwp, useDraft, useProviders
│   │   └── components/         # TopBar, ProviderSettings, ControlPanel,
│   │                           # PreviewPanel, Uploader
│   └── vite.config.js
│
├── docs/
│   ├── adr/                    # Architecture Decision Records
│   │   ├── 0001-rhwp-version-pinning.md
│   │   ├── 0002-preview-download-byte-identity.md
│   │   └── 0003-ai-content-integrity.md
│   └── lessons-learned.md      # 실제 실수 레지스트리
│
├── skills/                     # 🛠 재사용 워크플로우 (markdown)
│   ├── verify-preview-equals-download.md
│   ├── dev-server-restart.md
│   └── dependency-upgrade.md
│
├── hooks/                      # ⚙ 자동화 가드레일 (shell)
│   ├── pre-completion-checklist.sh    # 완료 선언 전 강제 실행
│   └── post-deps-change.sh            # package.json 변경 후 cleanup
│
└── tools/                      # 🔍 검증 스크립트
    ├── smoke-test.sh                  # 6단계 E2E
    └── verify-hwpx-markers.py         # HWPX 바이트 내 마커 검증
```

상위 repo의 `scripts/build_hwpx.py` (Python 워커) 가 서버에서 spawn 되어 최종 HWPX 를 생성합니다.

## 🧪 검증 명령

| 목적 | 명령 |
|------|------|
| **완료 선언 전 필수 검증** | `bash v3/hooks/pre-completion-checklist.sh` |
| 단독 E2E 스모크 테스트 | `bash v3/tools/smoke-test.sh` |
| HWPX 마커 검증 | `python3 v3/tools/verify-hwpx-markers.py <hwpx_path> MARKER1 ...` |
| 클라이언트 프로덕션 빌드 | `cd v3/client && npm run build` |
| 서버 syntax 체크 | `cd v3/server && for f in index.js lib/*.js services/*.js routes/*.js; do node --check "$f"; done` |

## 🔁 의존성 변경 후 필수 절차

`package.json` 수정, `npm install`, 또는 "이상한 캐시 문제" 체감 시:

```bash
bash v3/hooks/post-deps-change.sh   # 프로세스 kill + Vite cache 삭제
cd v3 && npm run dev                # dev 서버 재시작
# 브라우저에서 Cmd+Shift+R (하드 리프레시)
bash v3/tools/smoke-test.sh         # 정상성 재검증
```

## 🎨 기능

- **HWP/HWPX 업로드** — 드래그앤드롭 + 클릭, 파일 크기/페이지 수/형식 표시
- **rhwp 로컬 파싱** — 첫 페이지 SVG 렌더, 본문 텍스트 추출
- **AI 초안 생성** — Anthropic / OpenAI / Kimi / xAI (API 키 저장 + OAuth 지원)
- **다이어그램 자동 삽입** — flowchart / timeline / comparison (cairo 설치 시)
- **HWPX 내보내기** — 양식 유지 + AI 본문 치환, rhwp로 렌더 후 다운로드

## 📜 Self-Learning Protocol

프로젝트는 사용 중 **스스로 학습**하도록 설계:

1. **실수 발생** → `docs/lessons-learned.md` 맨 위 항목 추가 + `CLAUDE.md` 관련 규칙에 이력 업데이트
2. **같은 작업 반복** → `skills/<workflow>.md` 추가
3. **망가지는 케이스** → `hooks/*.sh` 에 가드 + `tools/*` 에 검증 도구 추가

자세한 사용법은 [`CLAUDE.md`](./CLAUDE.md) 참고.

## 🔗 참고

- 문서 파싱/렌더링: [`rhwp`](https://github.com/edwardkim/rhwp) (0.7.2 pinned)
- HWPX 빌더: 상위 폴더의 [`scripts/build_hwpx.py`](../scripts/build_hwpx.py)
