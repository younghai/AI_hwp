# 프로젝트 종합 감사 보고서
> 시니어 개발자 & 시니어 디자이너 관점의 수정 제안

| 항목 | 내용 |
|------|------|
| **프로젝트** | HWP/HWPX AI 문서 생성 데모 서비스 (v1 + v2) |
| **감사일** | 2026-04-20 |
| **대상 범위** | 전체 저장소 (루트 v1, v2 client/server, scripts, docs) |

---

## 1. Executive Summary (Executive 요약)

현재 프로젝트는 **로컬 데모 수준에서는 우수**하지만, **프로덕션 격상 또는 팀 확장을 위해서는 구조적 개선이 필수**입니다. 

- **가장 큰 리스크**: `.env` 파일이 Git에 노출될 위험이 있고, API 키가 클라이언트→서버로 평문 전송됩니다.
- **가장 큰 기술 부채**: 다이어그램 렌더링 로직이 Python/JS에 중복되어 있고, v1/v2가 공존하며 폴터 구조가 혼란스럽습니다.
- **가장 큰 UX 이슈**: 에러 발생 시 복구 경로가 불명확하고, 로딩/스켈레톤 상태가 미흡합니다.

---

## 2. 시니어 개발자 관점 🔧

### 2.1 아키텍처 & 설계

#### ✅ 잘된 점
- **3-Tier 분리** (React ↔ Express ↔ Python)가 명확하고, 각 계층의 책임이 적절합니다.
- **npm workspaces**로 client/server를 통합 관리하는 것은 훌륭한 선택입니다.
- **`shared/` 폴터**를 통한 클라이언트/서버 코드 공유는 DRY 원칙을 잘 따르고 있습니다.
- **Optimistic UI** 패턴과 **WASM 브라우저 파싱**은 기술적으로 훌륭한 결정입니다.

#### ⚠️ 문제점

| 심각도 | 문제 | 근거 |
|--------|------|------|
| 🔴 높음 | **v1/v2 공존** | 루트의 `app.js`, `index.html`, `styles.css`, `generate.php`가 v2와 함께 존재하며, 신규 기여자가 혼란을 겪습니다. |
| 🔴 높음 | **Python spawn 의존성** | `child_process.spawn`으로 Python을 호출하는 방식은 환경에 민감하고, 향후 컨테이너화/배포 시 가장 큰 장애 요인이 됩니다. |
| 🟡 중간 | **Monorepo 구조 미흡** | v2 낸부에 `client/`, `server/`가 있지만, 루트에는 v1 코드가 있어 전체가 workspaces로 관리되지 않습니다. `package-lock.json`이 루트와 v2에 분리되어 있습니다. |
| 🟡 중간 | **상태 관리 미흡** | `App.jsx`가 10개 이상의 상태를 직접 관리하며, 복잡도가 증가하고 있습니다. Context API나 Zustand 도입을 검토해야 합니다. |
| 🟢 낮음 | **WASM 버전 고정** | `@rhwp/core`를 Vite optimize exclude에 넣은 것은 좋지만, 버전이 고정되어 업데이트가 어렵습니다. |

#### 🛠️ 수정 제안

1. **v1 코드 아카이브** (`P0`)
   ```bash
   # 제안: v1 코드를 archive/v1/ 폴터로 이동하거나 별도 브랜치 분리
   mkdir -p archive/v1
   git mv app.js index.html styles.css generate.php archive/v1/
   ```

2. **Python 빌드 엔진 컨테이너화** (`P1`)
   - `scripts/`를 독립적인 Docker 이미지로 패키징하여 Node.js 서버가 HTTP API로 호출하도록 변경.
   - 또는 `node-python-bridge` 라이브러리를 사용해 spawn 대신 in-process 통신 검토.

3. **Zustand 또는 Jotai 도입** (`P1`)
   - `App.jsx`의 상태를 전역 스토어로 분리하여 prop drilling 제거.

4. **Workspace 통합** (`P2`)
   - 루트 `package.json`을 v2 중심으로 재구성하거나, v2를 루트로 승격.

---

### 2.2 코드 품질 & 기술 부채

#### ✅ 잘된 점
- **Custom Hooks** (`useRhwp`, `useDraft`, `useProviders`)가 단일 책임을 잘 지키고 있습니다.
- **`_normalize_paragraph`의 linesegarray 리셋**은 HWPX 렌더링 버그를 해결하는 세련된 도메인 로직입니다.
- **`tryExtractJson`**의 fenced code block + brace extraction 이중 전략은 AI 응답 불안정성에 대한 실전 대응입니다.

#### ⚠️ 문제점

| 심각도 | 문제 | 위치 |
|--------|------|------|
| 🔴 높음 | **다이어그램 로직 중복** | `scripts/diagram_templates.py`와 `client/src/lib/diagrams.js`가 거의 동일한 SVG 생성 로직을 각각 구현하고 있습니다. |
| 🔴 높음 | **Magic Number 산재** | `MM=283.46`, `D.W=605`, `D.H=302`, `3mb`, `20MB` 등이 코드 전반에 하드코딩되어 있습니다. |
| 🟡 중간 | **`dangerouslySetInnerHTML` 남용** | `PreviewPanel.jsx`에서 SVG를 직접 주입하고 있습니다. XSS 가능성은 낮지만, CSP 우회 및 React의 보호막을 벗어납니다. |
| 🟡 중간 | **비동기 경쟁 조건** | `useRhwp.js`의 `parseJobRef.current !== jobId` 패턴은 취소 토큰 대신 ref 비교를 사용하여 직관성이 떨어집니다. |
| 🟢 낮음 | **하드코딩된 한국어 문장** | `_BODY_SENTENCES` 풀이 `build_hwpx.py`에 고정되어 있어, 다국어 지환이나 커스텀 템플릿 확장이 어렵습니다. |

#### 🛠️ 수정 제안

1. **다이어그램 로직 통일** (`P0`)
   - Python이 SVG 문자열을 생성하고, 클라이언트는 이를 단순 렌더링만 담당하도록 수정.
   - 또는 WASM 환경에서 Python 로직을 실행할 수 없으므로, 공통 JSON 스펙을 정의하고 각각 구현하되, 테스트로 동기화 검증.

2. **상수 집중화** (`P0`)
   ```javascript
   // shared/constants.js
   export const CONFIG = {
     MAX_UPLOAD_SIZE: 3 * 1024 * 1024,
     MAX_MULTER_SIZE: 20 * 1024 * 1024,
     HWP_MM: 283.46,
     DIAGRAM_WIDTH: 605,
     DIAGRAM_HEIGHT: 302,
   };
   ```

3. **SVG Sanitization** (`P1`)
   - `dangerouslySetInnerHTML` 대신 `dompurify`로 SVG sanitize 후 주입.
   ```jsx
   import DOMPurify from 'dompurify';
   <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svgString) }} />
   ```

---

### 2.3 보안 (Security)

#### 🔴 Critical (즉시 조치 필요)

| ID | 취약점 | 위치 | 공격 시나리오 | 대응 |
|----|--------|------|--------------|------|
| SEC-001 | `.env` 파일 Git 추적 가능성 | `v2/server/.env` | API 키, OAuth 토큰 유출 | `v2/server/.env`를 `git rm --cached` 후 `.gitignore` 강화 |
| SEC-002 | API 키 클라이언트 평문 전송 | `ProviderSettings.jsx` → `/api/settings` | 로컬 네트워크 스니핑 시 키 노출 | HTTPS 강제 또는 키를 서버에서만 입력하도록 UI 변경 |
| SEC-003 | `.env` 임의 쓰기 | `/api/settings` | `knownEnvKeys` 우회 시 임의 파일 쓰기 가능 | 키 화이트리스트 엄격화, path traversal 방지 |

#### 🟡 Medium (단기 대응)

| ID | 취약점 | 위치 | 대응 |
|----|--------|------|------|
| SEC-004 | Rate Limiting 없음 | `/api/generate-draft`, `/api/export-hwpx` | `express-rate-limit` 도입 (분당 10회) |
| SEC-005 | CORS 단순 문자열 매칭 | `server/index.js` | origin 배열 허용 + 정규화 (new URL) |
| SEC-006 | OAuth state TTL 미효율 | `lib/oauth.js` | Map sweep interval이 10분이나, state가 쌓이면 메모리 누수 가능. `WeakRef` 또는 Redis 도입 |
| SEC-007 | 파일 확장자만 검증 | `lib/upload.js` | Magic bytes 검증은 있으나, MIME 타입 스푸핑 가능. 파일 시그니처 + 확장자 이중 검증 유지 |

#### 🟢 Low (장기 대응)

| ID | 취약점 | 위치 | 대응 |
|----|--------|------|------|
| SEC-008 | CSP 미설정 | `index.html`, Express | `helmet` + CSP 헤더 도입 |
| SEC-009 | `generated/` 정적 파일 노출 | `server/index.js` | 파일명에 무작위성(tiemstamp)은 있으나, 인덱싱 방지 필요. `express.static`에 `index: false` |

---

### 2.4 DX (Developer Experience)

#### ✅ 잘된 점
- **`CLAUDE.md`**와 **`lessons-learned.md`**는 훌륭한 지식 관리 문화입니다.
- **ADR 폴터**가 있어 아키텍처 결정의 맥락을 추적할 수 있습니다.
- **`smoke-test.sh`**로 E2E 검증이 자동화되어 있습니다.

#### ⚠️ 문제점

| 문제 | 현상 | 제안 |
|------|------|------|
| 타입스크립트 미사용 | v2 전체가 JavaScript로 작성됨 | JSDoc이라도 적극 활용하거나, TS 마이그레이션 로드맵 수립 |
| Prettier/ESLint 미설정 | 코드 스타일 불일치 가능 | `eslint-config-airbnb` + `prettier` 도입 |
| 테스트 커버리지 부족 | 단위 테스트 없음 | Vitest(client) + node:test(server) 도입 |
| 환경별 설정 분리 없음 | dev/prod 구분 없음 | `.env.development`, `.env.production` 분리 |

#### 🛠️ 수정 제안

```bash
# 제안: 개발 환경 표준화
npm install -D eslint prettier eslint-config-prettier eslint-plugin-react-hooks
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

---

## 3. 시니어 디자이너 관점 🎨

### 3.1 UX 흐름 & 정보 구조 (IA)

#### ✅ 잘된 점
- **4단계 파이프라인** (업로드 → 파싱 → 생성 → 납품)이 직관적입니다.
- **3단 미리보기** (원본/초안/최종)는 사용자의 멘탈 모델과 정확히 일치합니다.
- **Optimistic Draft**는 대기 시간 체감을 효과적으로 줄입니다.

#### ⚠️ 문제점

| 심각도 | 문제 | 근거 |
|--------|------|------|
| 🔴 높음 | **에러 복구 경로 부재** | AI 생성 실패 시 "다시 시도" 버튼 없이 텍스트 메시지만 표시됩니다. 사용자는 무엇을 해야 할지 모릅니다. |
| 🔴 높음 | **WASM 실패 = 앱 전체 실패** | `@rhwp/core` 로드 실패 시 fallback이 없어 앱이 완전히 죽습니다. |
| 🟡 중간 | **입력 폼의 시각적 계층 혼란** | ControlPanel에 파일 업로드, 드롭다운, 4개 텍스트 입력, 2개 버튼이 평면적으로 나염됩니다. |
| 🟡 중간 | **프리뷰 패널 스크롤 지옥** | 원본 SVG + 초안 + 최종 SVG가 세로로 길게 배치되어, 사용자가 현재 어떤 단계를 보고 있는지 인지하기 어렵습니다. |
| 🟢 낮음 | **Provider 설정 진입점 불명확** | 상단 바의 작은 "설정" 텍스트 버튼은 첫 사용자에게 노출도가 낮습니다. |

#### 🛠️ 수정 제안

1. **단계별 스텝퍼(Stepper) UI 도입** (`P0`)
   ```
   [1. 파일 업로드] → [2. 내용 확인] → [3. AI 생성] → [4. 다운로드]
   ```
   - 현재 단계를 상단에 고정하여 사용자의 위치를 명확히 합니다.
   - 완료된 단계는 체크 아이콘으로, 현재 단계는 강조로 표시.

2. **에러 상태 디자인 시스템화** (`P0`)
   - 에러 발생 시 해당 단계로 자동 스크롤.
   - "다시 시도" 버튼 + "설정 확인" 링크를 에러 카드 낸부에 배치.
   - 토스트(Toast) 알림으로 성공/실패 피드백 제공.

3. **ControlPanel 그룹화** (`P1`)
   ```
   ┌─ 📄 문서 정보 ─┐
   │  파일, 유형, 제목  │
   ├─ 🏢 작성 정보 ─┤
   │  회사명, 목표, 메모 │
   ├─ ⚙️ 생성 설정 ─┤
   │  Provider, 버튼    │
   └──────────────┘
   ```

---

### 3.2 UI 일관성 & 디자인 시스템

#### ✅ 잘된 점
- **CSS Custom Properties** (`--bg`, `--surface`, `--accent`)가 일관되게 사용됩니다.
- **Pretendard Variable** 폰트 스택은 한국어 UI에 탁월한 선택입니다.
- **Glassmorphism 카드** 스타일이 현대적입니다.

#### ⚠️ 문제점

| 심각도 | 문제 | 위치 |
|--------|------|------|
| 🟡 중간 | **v1/v2 디자인 시스템 불일치** | v1의 `styles.css`와 v2의 `styles.css`가 별개로 존재하며, 색상/그리드/타이포그래피가 다릅니다. |
| 🟡 중간 | **모달(ProviderSettings) z-index 미관리** | backdrop 클릭, ESC 키 처리는 있으나, focus trap이 없어 키보드 탐색 시 모달 밖으로 빠집니다. |
| 🟡 중간 | **버튼 상태 시각적 차이 미흡** | disabled 상태의 버튼이 너무 흐릿해서 클릭 가능한 것처럼 보일 수 있습니다. |
| 🟢 낮음 | **다크 모드 부재** | 개발자/디자이너가 야간에 사용할 경우 눈의 피로가 큽니다. |

#### 🛠️ 수정 제안

1. **디자인 토큰 공유** (`P1`)
   - `design-tokens.css`를 루트에 생성하고 v1/v2가 모두 임포트하도록 수정.
   ```css
   :root {
     --color-bg: #ffffff;
     --color-surface: rgba(255,255,255,0.8);
     --color-accent: #2563eb;
     --color-error: #dc2626;
     --color-success: #16a34a;
     --font-sans: "Pretendard Variable", system-ui, sans-serif;
     --radius-sm: 6px;
     --radius-md: 12px;
     --shadow-card: 0 4px 24px rgba(0,0,0,0.08);
   }
   ```

2. **Focus Trap & 접근성** (`P1`)
   - `ProviderSettings` 모달에 `react-focus-lock` 또는 직접 구현한 focus trap 추가.
   - 모든 상호작용 요소에 `:focus-visible` 스타일 적용.

3. **다크 모드 지원** (`P2`)
   ```css
   @media (prefers-color-scheme: dark) {
     :root { --color-bg: #0f172a; --color-surface: rgba(30,41,59,0.8); }
   }
   ```

---

### 3.3 마이크로 인터랙션 & 피드백

#### ⚠️ 문제점

| 심각도 | 문제 | 현상 |
|--------|------|------|
| 🟡 중간 | **파일 업로드 드래그 앤 드롭 미지원** | 사용자는 반드시 클릭해서 파일 탐색기를 열어야 합니다. |
| 🟡 중간 | **AI 생성 중 스피너 부재** | "AI 초안을 바탕으로 HWPX 파일을 생성하는 중입니다..." 텍스트만 있고, 시각적 진행 표시가 없습니다. |
| 🟡 중간 | **다운로드 완료 피드백 없음** | 파일이 다운로드되었는지 브라우저의 기본 동작에만 의존합니다. |
| 🟢 낮음 | **토스트/알림 시스템 없음** | 성공/실패 모두 `parseStatus` 텍스트로만 전달됩니다. |

#### 🛠️ 수정 제안

1. **드래그 앤 드롭 존** (`P1`)
   - `ControlPanel` 상단에 dashed border의 드롭존 추가.
   - `dragover` 시 파란색 강조, `drop` 시 즉시 파싱 시작.

2. **Circular Progress + 단계 텍스트** (`P1`)
   - AI 생성 중 Circular Progress Indicator 표시.
   - "프롬프트 작성 중... → AI 응답 대기 중... → JSON 파싱 중..." 등 세부 단계 표시.

3. **토스트 시스템** (`P1`)
   - `react-hot-toast` 또는 직접 구현한 Toast Stack 추가.
   - 성공(초록), 에러(빨강), 정보(파랑) 3가지 타입.

---

### 3.4 접근성 (a11y)

#### 현재 상태
- 기본적인 HTML 시맨틱 태그는 사용되고 있으나, **ARIA 속성이 거의 없습니다**.
- `ProviderSettings`는 ESC 키 핸들러가 있지만, 스크린 리더 사용자를 위한 `aria-modal`, `aria-labelledby`가 없습니다.
- SVG 미리보기에 `alt` 텍스트가 없어 시각 장애인은 문서 내용을 인식할 수 없습니다.

#### 🛠️ 수정 제안

1. **ARIA 속성 보강** (`P1`)
   ```jsx
   <div role="dialog" aria-modal="true" aria-labelledby="settings-title">
     <h2 id="settings-title">AI Provider 설정</h2>
   </div>
   ```

2. **SVG 접근성** (`P1`)
   - 각 SVG 미리보기를 `<figure>`로 감싸고 `<figcaption>`으로 문서 제목과 페이지 번호 제공.
   - 추출된 텍스트를 `aria-describedby`로 연결.

3. **색상 대비 검증** (`P2`)
   - `--color-accent: #2563eb`는 흰색 배경 대비 WCAG AA 통과.
   - 회색 상태 텍스트(`#9ca3af` 등)가 WCAG 기준을 충족하는지 검증 필요.

---

## 4. 통합 수정 로드맵

### Phase 1: 안전 및 안정성 (1주)
- [ ] `v2/server/.env` Git 캐시 제거 및 `.gitignore` 강화
- [ ] API 키 입력 UI를 서버 전용으로 변경 (클이언트 전송 차단)
- [ ] `express-rate-limit` 도입
- [ ] DOMPurify로 SVG sanitize
- [ ] v1 코드 `archive/` 폴터로 이동

### Phase 2: 구조 개선 (2주)
- [ ] 상수 집중화 (`shared/constants.js`)
- [ ] Zustand 전역 상태 도입
- [ ] ESLint + Prettier 설정
- [ ] Vitest 단위 테스트 작성 (hooks 중심)
- [ ] 다이어그램 로직 통일 방안 수립

### Phase 3: UX/UI 고도화 (2주)
- [ ] 상단 스텝퍼 UI 도입
- [ ] ControlPanel 그룹화 및 시각적 계층 개선
- [ ] 드래그 앤 드롭 업로드
- [ ] Circular Progress + 세부 단계 표시
- [ ] 토스트 알림 시스템
- [ ] 에러 상태 복구 경로 (재시도 버튼)

### Phase 4: 접근성 및 디자인 시스템 (1주)
- [ ] 디자인 토큰 공유 파일 생성
- [ ] ARIA 속성 보강
- [ ] Focus Trap 적용
- [ ] 다크 모드 지원
- [ ] WCAG 색상 대비 검증

---

## 5. 결론

현재 프로젝트는 **도메인 전문성(HWPX 조작)과 기술적 완성도(WASM 파싱, AI 다중 Provider)가 높은 우수한 데모**입니다. 다만, 다음의 3가지 축에서 개선이 필요합니다:

1. **보안**: `.env` 관리와 API 키 전송 방식을 즉시 개선해야 합니다.
2. **구조**: v1/v2 통합, 기술 부채(중복 로직, magic number)를 정리해야 합니다.
3. **UX**: 에러 복구, 진행 표시, 접근성을 보강하여 "데모"를 "도구"로 격상시켜야 합니다.

이 로드맵을 따를 경우, 6주 내에 프로덕션 PoC 수준으로 품질을 향상시킬 수 있습니다.
